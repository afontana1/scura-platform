# Implementation Roadmap

The current package is a consolidated SCURA Platform release. The roadmap below describes the major capability areas already present and possible future enhancements.

## Included capability areas

### Foundation

- React + TypeScript frontend
- FastAPI backend
- PostgreSQL persistence
- Redis/RQ worker infrastructure
- Docker Compose local development

### Data model and validation

- Canonical SCURA JSON schema
- Editable schedule, cost, risk, mapping, calendar, milestone, and correlation data
- Backend validation service
- Row/field-level validation issue format

### Imports

- Excel workbook import adapter
- Staged import preview
- Validation before scenario commit
- Canonical JSON conversion boundary

### Simulation engine

- Monte Carlo SCURA modeling
- Schedule uncertainty
- Cost uncertainty
- Risk event sampling
- FS/SS/FF/SF relationships with lags
- Calendar-aware duration handling
- Remaining-work handling for in-progress and completed activities
- Correlation groups
- Milestone confidence
- Criticality and sensitivity analytics

### Results and reporting

- Results dashboard
- Histogram and S-curve data
- Scenario comparison
- Audit trail
- Raw iteration artifact downloads
- PDF, Excel, HTML, CSV, and JSON reports

### Deployment and QA

- Production-style Docker Compose
- Alembic migration scaffold
- Backend pytest suite
- CI workflow
- Deployment guide
- QA checklist

## Future enhancement candidates

- P6 XER import
- Microsoft Project XML import
- Resource-constrained scheduling
- More detailed cost phasing and cash-flow curves
- Portfolio-level dashboards
- Enterprise authentication/SSO if needed later
- Managed object storage for simulation artifacts
- Richer charting library integration
