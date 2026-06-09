from fastapi import APIRouter

from app.schemas.scura_dataset import ScuraDataset, SimulationConfig
from app.schemas.validation import ValidationResponse

router = APIRouter()


@router.get("/schemas/scura-dataset")
def get_scura_dataset_schema():
    return ScuraDataset.model_json_schema()


@router.get("/schemas/simulation-config")
def get_simulation_config_schema():
    return SimulationConfig.model_json_schema()


@router.get("/schemas/validation-response")
def get_validation_response_schema():
    return ValidationResponse.model_json_schema()
