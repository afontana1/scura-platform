from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from app.api.dependencies import get_import_service, get_scenario_service
from app.schemas.imports import ImportCommitRequest, ImportPreview
from app.schemas.scenario import ScenarioDatasetRead
from app.services.import_service import ImportService
from app.services.scenario_service import ScenarioService

router = APIRouter()


@router.post("/imports/excel", response_model=ImportPreview, status_code=201)
async def upload_excel_import(
    file: Annotated[UploadFile, File(...)],
    service: Annotated[ImportService, Depends(get_import_service)],
):
    if not file.filename or not file.filename.lower().endswith((".xlsx", ".xlsm")):
        raise HTTPException(status_code=400, detail="Upload an .xlsx or .xlsm workbook.")
    content = await file.read()
    try:
        return service.parse_excel(file.filename, content)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Could not parse workbook: {exc}") from exc


@router.get("/imports/{import_id}", response_model=ImportPreview)
def get_import_preview(import_id: UUID, service: Annotated[ImportService, Depends(get_import_service)]):
    try:
        return service.get_preview(import_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/imports/{import_id}/commit", response_model=ScenarioDatasetRead)
def commit_import(
    import_id: UUID,
    payload: ImportCommitRequest,
    import_service: Annotated[ImportService, Depends(get_import_service)],
    scenario_service: Annotated[ScenarioService, Depends(get_scenario_service)],
):
    try:
        return import_service.commit(import_id, scenario_service, payload.scenario_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
