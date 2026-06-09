# Release Notes

This final package consolidates the SCURA Platform into a stable release build without incremental milestone naming.

## Included capabilities

- Full-stack React/FastAPI/PostgreSQL application
- Canonical SCURA JSON dataset model
- Spreadsheet import adapter and validation preview
- Editable input tables
- Validation service with row/field issue mapping
- Queue-backed advanced simulation engine
- Scenario versioning, duplication, comparison, and audit trail
- Results dashboard and downloadable raw artifacts
- PDF, Excel, HTML, CSV, and JSON report exports
- Production-style Docker Compose file
- Backend test suite and QA checklist
- Deployment documentation

## Known limitations

- Authentication and multi-user permissions are intentionally not included.
- The frontend chart components are lightweight custom components; they can be replaced by a charting library later.
- External P6/MS Project imports are not included; Excel import is the supported adapter format.
- Highly detailed resource-constrained scheduling is not implemented.
- Database migrations are scaffolded; production teams should continue evolving them as the schema changes.
