from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends

from app.api.dependencies import get_scenario_service
from app.schemas.scenario import (
    ScenarioAuditEventRead,
    ScenarioCompareRequest,
    ScenarioComparisonRead,
    ScenarioCreate,
    ScenarioDatasetRead,
    ScenarioDatasetUpsert,
    ScenarioDuplicateCreate,
    ScenarioRead,
    ScenarioUpdate,
)
from app.services.scenario_service import ScenarioService

router = APIRouter()


@router.get("/projects/{project_id}/scenarios", response_model=list[ScenarioRead])
def list_scenarios(project_id: UUID, service: Annotated[ScenarioService, Depends(get_scenario_service)]):
    return service.list_for_project(project_id)


@router.post("/projects/{project_id}/scenarios", response_model=ScenarioRead, status_code=201)
def create_scenario(project_id: UUID, payload: ScenarioCreate, service: Annotated[ScenarioService, Depends(get_scenario_service)]):
    return service.create_scenario(project_id, payload)


@router.post("/projects/{project_id}/scenarios/compare", response_model=ScenarioComparisonRead)
def compare_scenarios(project_id: UUID, payload: ScenarioCompareRequest, service: Annotated[ScenarioService, Depends(get_scenario_service)]):
    return service.compare_scenarios(project_id, payload)


@router.get("/scenarios/{scenario_id}", response_model=ScenarioRead)
def get_scenario(scenario_id: UUID, service: Annotated[ScenarioService, Depends(get_scenario_service)]):
    return service.get_scenario(scenario_id)


@router.patch("/scenarios/{scenario_id}", response_model=ScenarioRead)
def update_scenario(scenario_id: UUID, payload: ScenarioUpdate, service: Annotated[ScenarioService, Depends(get_scenario_service)]):
    return service.update_scenario(scenario_id, payload)


@router.post("/scenarios/{scenario_id}/duplicate", response_model=ScenarioRead, status_code=201)
def duplicate_scenario(scenario_id: UUID, payload: ScenarioDuplicateCreate, service: Annotated[ScenarioService, Depends(get_scenario_service)]):
    return service.duplicate_scenario(scenario_id, payload)


@router.get("/scenarios/{scenario_id}/dataset", response_model=ScenarioDatasetRead)
def get_dataset(scenario_id: UUID, service: Annotated[ScenarioService, Depends(get_scenario_service)]):
    return service.get_dataset(scenario_id)


@router.put("/scenarios/{scenario_id}/dataset", response_model=ScenarioDatasetRead)
def upsert_dataset(scenario_id: UUID, payload: ScenarioDatasetUpsert, service: Annotated[ScenarioService, Depends(get_scenario_service)]):
    return service.upsert_dataset(scenario_id, payload)


@router.get("/scenarios/{scenario_id}/audit-events", response_model=list[ScenarioAuditEventRead])
def list_audit_events(scenario_id: UUID, service: Annotated[ScenarioService, Depends(get_scenario_service)]):
    return service.list_audit_events(scenario_id)
