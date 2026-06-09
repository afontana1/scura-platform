# QA Checklist

Use this checklist before handing off or deploying a build.

## Backend

- Python files compile successfully.
- Pytest suite passes.
- `/health` returns healthy.
- `/health/queue` confirms Redis queue connectivity.
- Project/scenario CRUD works.
- Dataset save/load works.
- Validation catches missing references, invalid ranges, circular schedule logic, and bad probabilities.
- Excel import preview works with `templates/scura_import_template.xlsx`.
- Imported datasets validate before commit.
- Simulation run transitions through queued/running/completed or failed.
- Artifact download endpoints work after a completed run.
- Report endpoints return PDF, XLSX, HTML, JSON, and CSV.

## Frontend

- App loads at `http://localhost:5173`.
- Project and scenario selectors populate.
- Editable SCURA tables display and save changes.
- Validation panel shows row and field errors.
- Import wizard previews and commits a workbook.
- Run configuration submits successfully.
- Dashboard renders summary cards and charts.
- Report and artifact download buttons work.
- Scenario duplication and comparison work.
- Audit trail refreshes.

## Data integrity

- Activity IDs are unique.
- Relationship predecessor/successor IDs exist.
- Cost mappings reference valid activities and costs.
- Risk impacts reference valid risks, activities, and/or costs.
- Minimum values are less than or equal to most likely values, which are less than or equal to maximum values.
- Completed activities are not incorrectly re-simulated as uncertain remaining work.

## Windows Command Prompt smoke test

```cmd
docker compose down -v
docker builder prune -f
docker compose up --build
scriptsun_backend_tests.cmd
```
