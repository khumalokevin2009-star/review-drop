# ReviewDrop backend — FastAPI + Playwright.
# Render target needs ~2GB RAM for Playwright (CLAUDE.md Section 5).
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# System deps needed by asyncpg/playwright build steps.
RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --upgrade pip && pip install -r requirements.txt

# Playwright browser binaries are needed by the screenshot service (Phase 2).
# Enable in that phase to keep the Phase 1 image lean:
#   RUN playwright install --with-deps chromium

COPY . .

EXPOSE 8000

# Apply migrations, then start the API.
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000"]
