# Orvelle backend — FastAPI + Playwright.
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

# Playwright Chromium + its system libraries for the screenshot service.
# Costs roughly 700MB-1GB of image size — required for on-demand captures.
RUN playwright install --with-deps chromium \
    && rm -rf /var/lib/apt/lists/*

COPY . .

EXPOSE 8000

# Apply migrations, then start the API.
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000"]
