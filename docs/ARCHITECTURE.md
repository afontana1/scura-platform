# Architecture

SCURA Platform is organized around a strict separation of concerns.

## Frontend

The React frontend owns visualization, editing, configuration, import previews, validation display, run monitoring, scenario comparison, and report downloads. It does not execute SCURA business logic.

## Backend API

The FastAPI backend owns orchestration, validation, persistence, import adapters, simulation submission, result retrieval, and report generation. API route handlers should remain thin and delegate to service classes.

## Domain engine

The simulation engine is pure Python domain logic. It consumes canonical SCURA dataset objects and simulation configuration objects. It does not depend on FastAPI, SQLAlchemy, Redis, Excel, or frontend types.

## Database

PostgreSQL stores projects, scenarios, versioned scenario datasets, audit events, simulation runs, summaries, result metadata, and report/result references. Large raw iteration artifacts are stored outside the relational result JSON and exposed by download endpoints.

## Queue and worker

Redis/RQ decouples simulation execution from API requests. The API creates a queued run, the worker executes the model, and the frontend polls for run status and results.

## Import boundary

Excel is an adapter format only. Uploads are parsed into canonical SCURA JSON, validated, previewed, and then committed to a scenario dataset. The simulation engine never works directly with Excel files.

## Primary service boundaries

- ProjectService: project lifecycle
- ScenarioService: scenario lifecycle, dataset versions, comparisons, audit events
- ImportService: spreadsheet parsing and canonical JSON mapping
- ValidationService: schema, cross-reference, and business-rule validation
- SimulationService: run creation, queue submission, status, and result persistence
- ReportService: PDF, Excel, HTML, CSV, and JSON exports
