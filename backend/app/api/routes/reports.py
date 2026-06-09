from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends
from fastapi.responses import FileResponse

from app.api.dependencies import get_report_service
from app.services.report_service import ReportService

router = APIRouter()


@router.get("/simulation-runs/{run_id}/reports")
def report_manifest(run_id: UUID, service: Annotated[ReportService, Depends(get_report_service)]):
    return service.get_report_manifest(run_id)


@router.get("/simulation-runs/{run_id}/reports/{report_format}")
def download_report(run_id: UUID, report_format: str, service: Annotated[ReportService, Depends(get_report_service)]):
    path = service.build_report_package(run_id, report_format)
    media_types = {
        "pdf": "application/pdf",
        "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "html": "text/html",
        "json": "application/json",
        "csv": "text/csv",
    }
    return FileResponse(path, media_type=media_types.get(report_format.lower(), "application/octet-stream"), filename=path.name)
