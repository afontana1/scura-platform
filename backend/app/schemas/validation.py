from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class ValidationSeverity(str, Enum):
    error = "error"
    warning = "warning"


class ValidationIssue(BaseModel):
    severity: ValidationSeverity
    table: str
    row_id: str | None = None
    field: str | None = None
    message: str
    code: str


class ValidationRequest(BaseModel):
    dataset_json: dict[str, Any]


class ValidationResponse(BaseModel):
    valid: bool
    error_count: int
    warning_count: int
    issues: list[ValidationIssue] = Field(default_factory=list)
