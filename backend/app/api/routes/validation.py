from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends

from app.api.dependencies import get_scenario_service, get_validation_service
from app.schemas.validation import ValidationRequest, ValidationResponse
from app.services.scenario_service import ScenarioService
from app.services.validation_service import ValidationService

router = APIRouter()


@router.post("/validation/scura-dataset", response_model=ValidationResponse)
def validate_dataset(payload: ValidationRequest, service: Annotated[ValidationService, Depends(get_validation_service)]):
    return service.validate_dataset_payload(payload.dataset_json)


@router.post("/scenarios/{scenario_id}/validate", response_model=ValidationResponse)
def validate_scenario_dataset(
    scenario_id: UUID,
    scenario_service: Annotated[ScenarioService, Depends(get_scenario_service)],
    validation_service: Annotated[ValidationService, Depends(get_validation_service)],
):
    dataset = scenario_service.get_dataset(scenario_id)
    return validation_service.validate_dataset_payload(dataset.dataset_json)
