# SCURA Platform

Full-stack SCURA modeling application with a React frontend, FastAPI backend, PostgreSQL persistence, Redis/RQ simulation workers, reporting exports, and a canonical SCURA JSON dataset format.

The application supports schedule-cost uncertainty and risk analysis using editable project scenarios, validated canonical JSON data, queue-backed Monte Carlo simulation, scenario comparison, audit history, charts, and downloadable report packages.

## Stack

- React + TypeScript frontend
- FastAPI backend
- PostgreSQL database
- Redis queue
- RQ worker container
- Docker Compose local infrastructure
- Canonical SCURA JSON dataset format
- Excel import as an adapter only
- Alembic migration scaffold
- Pytest backend test suite

## Capabilities

- Project and scenario CRUD
- Scenario dataset save/load
- Editable SCURA input tables
- Backend validation service with row/field-level issues
- Excel import wizard that converts spreadsheets into canonical SCURA JSON
- Scenario duplication, comparison, versioning, and audit trail
- Advanced SCURA Monte Carlo simulation engine
- Results dashboard with charts and downloadable outputs
- FS / SS / FF / SF relationship handling with lags
- Calendar-aware elapsed day conversion
- Completed and in-progress activity remaining-work handling
- Cost uncertainty sampling
- Correlation group support
- Milestone confidence analytics
- Criticality index
- Activity sensitivity analytics
- Redis/RQ queue-backed simulation jobs
- Separate worker container
- Durable statuses: queued, running, completed, failed
- Worker job ID tracking
- Downloadable raw iteration artifacts as CSV and JSONL
- Server-generated PDF, Excel, HTML, CSV, and JSON report exports

## Run from Windows Command Prompt

```cmd
unzip scura-platform.zip
cd scura-platform
copy .env.example .env
docker compose down -v
docker builder prune -f
docker compose up --build
```

Then open:

- Frontend: http://localhost:5173
- Backend docs: http://localhost:8000/docs

## Restart the app

Use these commands from the repo root when code changes do not seem to be picked up, especially after backend model or worker changes.

### Restart only backend and worker

This is usually enough after Python code changes that affect API routes, services, SQLAlchemy models, or RQ worker execution.

```cmd
docker compose restart backend worker
```

### Rebuild and restart backend and worker

Use this when you changed Python dependencies, Dockerfiles, or want to force fresh backend and worker containers.

```cmd
docker compose up --build -d backend worker
```

### Rebuild and restart the full app

Use this when you want to refresh frontend, backend, and worker together.

```cmd
docker compose up --build -d
```

### Full clean restart

Use this when the stack is in a bad state and you want to recreate containers from scratch. This keeps your named volumes unless you add `-v`.

```cmd
docker compose down
docker compose up --build -d
```

### Full clean restart with database reset

Use this only if you intentionally want to delete local PostgreSQL data and start over from an empty database.

```cmd
docker compose down -v
docker compose up --build -d
```

### Watch logs after restart

These are the most useful services to watch when debugging simulation jobs.

```cmd
docker compose logs -f backend worker frontend
```

### Example: fix worker not picking up a backend model change

If the worker throws a SQLAlchemy mapper error or keeps running old backend code:

```cmd
docker compose restart backend worker
```

If that is not enough:

```cmd
docker compose up --build -d backend worker
```

## Run from PowerShell

```powershell
Expand-Archive .\scura-platform.zip -DestinationPath .
cd scura-platform
Copy-Item .env.example .env
docker compose down -v
docker builder prune -f
docker compose up --build
```

PowerShell restart examples:

```powershell
docker compose restart backend worker
docker compose up --build -d backend worker
docker compose up --build -d
docker compose logs -f backend worker frontend
```

## Typical workflow

1. Create a project.
2. Create a scenario.
3. Use the starter dataset or import `templates/scura_import_template.xlsx`.
4. Edit activities, relationships, calendars, milestones, costs, risks, and correlations.
5. Validate and save the dataset.
6. Configure iterations, target duration, target budget, random seed, calendar mode, and correlation toggle.
7. Run the SCURA simulation.
8. The API queues the run and the worker executes it.
9. Review P50/P80 cost and duration, target probabilities, joint probability, risk drivers, criticality, activity sensitivity, and milestone confidence.
10. Download summary CSV, result JSON, full iteration CSV, full iteration JSONL, PDF report, Excel audit workbook, or HTML report.

## Simulation execution modes

Set `SIMULATION_EXECUTION_MODE` in `.env`:

```text
queue       # default; uses Redis/RQ worker container
background  # uses FastAPI BackgroundTasks
local_sync  # executes inside the API request; useful for tests only
```

For normal Docker Compose use, keep:

```text
SIMULATION_EXECUTION_MODE=queue
REDIS_URL=redis://redis:6379/0
SIMULATION_QUEUE_NAME=scura-simulations
SIMULATION_ARTIFACT_DIR=/app/storage/simulation_runs
```

## Development architecture

The backend separates concerns by service boundary:

- `ProjectService`
- `ScenarioService`
- `ImportService`
- `ValidationService`
- `SimulationService`
- `ReportService`

The simulation engine lives in `backend/app/domain/simulation` and does not depend on FastAPI, Excel, Redis, or database APIs. It consumes canonical SCURA JSON and a simulation config.

The queue adapter lives in `backend/app/infrastructure/queue.py`, and the worker entry point lives in `backend/app/workers/simulation_tasks.py`.

## Run tests

```cmd
scriptsun_backend_tests.cmd
```

## Run migrations manually

```cmd
scriptsun_migrations.cmd
```

## Production-style local run

The default `docker-compose.yml` is optimized for local development. A production-style Compose file is included:

```cmd
docker compose -f docker-compose.prod.yml up --build
```

Production deployment should set strong database credentials, lock CORS to the deployed frontend origin, run migrations before app start, and persist PostgreSQL and simulation artifact volumes.

## Report exports

Completed simulation runs include server-generated report packages:

```http
GET /api/simulation-runs/{run_id}/reports/pdf
GET /api/simulation-runs/{run_id}/reports/xlsx
GET /api/simulation-runs/{run_id}/reports/html
GET /api/simulation-runs/{run_id}/reports/json
GET /api/simulation-runs/{run_id}/reports/csv
```

The frontend results dashboard includes buttons for the executive PDF, audit Excel workbook, HTML report, CSV summary, JSON report, and raw iteration artifacts.

## Documentation

- `docs/ARCHITECTURE.md`
- `docs/DEPLOYMENT.md`
- `docs/QA_CHECKLIST.md`
- `docs/RELEASE_NOTES.md`
