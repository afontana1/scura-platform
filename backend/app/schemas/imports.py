from uuid import UUID

from pydantic import BaseModel

from app.schemas.validation import ValidationResponse


class ImportPreview(BaseModel):
    import_id: UUID
    filename: str
    dataset_json: dict
    validation: ValidationResponse
    sheet_row_counts: dict[str, int]


class ImportCommitRequest(BaseModel):
    scenario_id: UUID
    replace_existing: bool = True
