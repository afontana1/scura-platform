from datetime import date, datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.common import ORMModel


class ScenarioCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    status_date: date | None = None


class ScenarioUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    status_date: date | None = None


class ScenarioDuplicateCreate(BaseModel):
    name: str | None = Field(default=None, max_length=255)
    description: str | None = None
    include_dataset: bool = True


class ScenarioCompareRequest(BaseModel):
    scenario_ids: list[UUID] = Field(..., min_length=2, max_length=6)


class ScenarioRead(ORMModel):
    id: UUID
    project_id: UUID
    name: str
    description: str | None
    status_date: date | None
    version: int
    created_at: datetime
    updated_at: datetime


class ScenarioDatasetUpsert(BaseModel):
    dataset_json: dict[str, Any]
    schema_version: str = "0.1.0"
    is_valid: bool = False


class ScenarioDatasetRead(ORMModel):
    id: UUID
    scenario_id: UUID
    dataset_json: dict[str, Any]
    schema_version: str
    is_valid: bool
    created_at: datetime
    updated_at: datetime


class ScenarioAuditEventRead(ORMModel):
    id: UUID
    scenario_id: UUID
    action: str
    entity_type: str
    entity_id: str | None
    actor: str
    details_json: dict[str, Any]
    created_at: datetime


class ScenarioComparisonItem(BaseModel):
    scenario: ScenarioRead
    dataset_stats: dict[str, int]
    latest_completed_run: dict[str, Any] | None = None


class ScenarioComparisonRead(BaseModel):
    project_id: UUID
    items: list[ScenarioComparisonItem]
