"""Project CRUD routes (CLAUDE.md Sections 7, 8, 9).

All routes are owner-scoped (a user only ever sees/touches their own,
non-deleted projects) and DELETE is a soft delete. The free-plan active-project
limit (Section 9) is enforced here, not just in the UI.
"""

import uuid
from datetime import datetime, timezone

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    HTTPException,
    Response,
    status,
)
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db
from app.models.project import Project
from app.models.user import User
from app.schemas.project import ProjectCreate, ProjectRead, ProjectUpdate
from app.services.screenshot_service import capture_project_thumbnail

router = APIRouter(prefix="/projects", tags=["projects"])

FREE_ACTIVE_PROJECT_LIMIT = 2  # CLAUDE.md Section 9 (plan limits)


async def _get_owned_project(
    db: AsyncSession, user: User, project_id: uuid.UUID
) -> Project:
    result = await db.execute(
        select(Project).where(
            Project.id == project_id,
            Project.user_id == user.id,
            Project.deleted_at.is_(None),
        )
    )
    project = result.scalar_one_or_none()
    if project is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Project not found"
        )
    return project


async def _active_project_count(db: AsyncSession, user: User) -> int:
    count = await db.scalar(
        select(func.count())
        .select_from(Project)
        .where(
            Project.user_id == user.id,
            Project.deleted_at.is_(None),
            Project.status == "active",
        )
    )
    return count or 0


def _enforce_active_limit(plan: str, active_count: int) -> None:
    if plan == "free" and active_count >= FREE_ACTIVE_PROJECT_LIMIT:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Free plan is limited to 2 active projects. "
                "Archive one or upgrade to add more."
            ),
        )


@router.get("", response_model=list[ProjectRead])
async def list_projects(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[Project]:
    result = await db.execute(
        select(Project)
        .where(Project.user_id == current_user.id, Project.deleted_at.is_(None))
        .order_by(Project.created_at.desc())
    )
    return list(result.scalars().all())


@router.post("", response_model=ProjectRead, status_code=status.HTTP_201_CREATED)
async def create_project(
    data: ProjectCreate,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Project:
    _enforce_active_limit(
        current_user.plan, await _active_project_count(db, current_user)
    )
    project = Project(
        user_id=current_user.id,
        name=data.name,
        url=data.url,
        client_name=data.client_name,
    )
    db.add(project)
    await db.commit()
    await db.refresh(project)
    # Thumbnail capture is best-effort and must never delay or break creation
    # (Section 5: always capture a screenshot on project creation as fallback).
    background_tasks.add_task(capture_project_thumbnail, project.id, project.url)
    return project


@router.get("/{project_id}", response_model=ProjectRead)
async def get_project(
    project_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Project:
    return await _get_owned_project(db, current_user, project_id)


@router.patch("/{project_id}", response_model=ProjectRead)
async def update_project(
    project_id: uuid.UUID,
    data: ProjectUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Project:
    project = await _get_owned_project(db, current_user, project_id)
    updates = data.model_dump(exclude_unset=True)
    # Re-activating an archived project counts against the active-project limit.
    if updates.get("status") == "active" and project.status != "active":
        _enforce_active_limit(
            current_user.plan, await _active_project_count(db, current_user)
        )
    for key, value in updates.items():
        setattr(project, key, value)
    await db.commit()
    await db.refresh(project)
    return project


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    project_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    project = await _get_owned_project(db, current_user, project_id)
    project.deleted_at = datetime.now(timezone.utc)  # soft delete only
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
