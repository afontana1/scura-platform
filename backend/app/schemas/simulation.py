from datetime import datetime
from uuid import UUID
from pydantic import BaseModel

from app.schemas.scura_dataset import SimulationConfig


class SimulationRunCreate(BaseModel):
    config: SimulationConfig


class SimulationRunRead(BaseModel):
    id: UUID
    scenario_id: UUID
    run_name: str
    config_json: dict
    status: str
    worker_job_id: str | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None
    error_message: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class SimulationResultRead(BaseModel):
    run_id: UUID
    summary: dict
    charts: dict
    driver_analysis: dict
    artifacts: dict = {}


class SimulationRunWithResult(BaseModel):
    run: SimulationRunRead
    result: SimulationResultRead | None = None
