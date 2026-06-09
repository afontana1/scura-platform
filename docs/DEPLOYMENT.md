# Deployment Guide

## Local development

```cmd
copy .env.example .env
docker compose up --build
```

## Production-style Compose

```cmd
docker compose -f docker-compose.prod.yml up --build
```

The production-style configuration removes development bind mounts, disables API auto-reload, uses the built frontend container, and expects environment variables to be provided securely.

## Required services

- PostgreSQL
- Redis
- FastAPI backend
- RQ worker
- React frontend web container

## Environment variables

Set these in the deployment environment:

```text
POSTGRES_USER
POSTGRES_PASSWORD
POSTGRES_DB
DATABASE_URL
BACKEND_CORS_ORIGINS
VITE_API_BASE_URL
USE_AUTO_CREATE_TABLES=false
SIMULATION_EXECUTION_MODE=queue
REDIS_URL
SIMULATION_QUEUE_NAME
SIMULATION_ARTIFACT_DIR
```

## Migrations

For production, prefer migrations over automatic table creation:

```cmd
set USE_AUTO_CREATE_TABLES=false
scriptsun_migrations.cmd
```

In containerized environments, run Alembic before starting backend workers.

## Persistent storage

Persist these volumes or equivalent managed services:

- PostgreSQL data
- Redis data if configured for persistence
- Simulation artifact directory

## Health checks

Useful endpoints:

```http
GET /health
GET /health/queue
```

## Operational notes

- Keep API and worker images built from the same backend source revision.
- Do not store large iteration payloads in the main results JSON.
- Back up database and artifact storage together.
- Use a fixed random seed for audit runs that must be reproducible.
- Restrict CORS to the deployed frontend origin.
