from copy import deepcopy
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.audit import ScenarioAuditEvent
from app.models.scenario import Scenario, ScenarioDataset


class ScenarioRepository:
    def __init__(self, db: Session):
        self.db = db

    def list_for_project(self, project_id: UUID) -> list[Scenario]:
        stmt = select(Scenario).where(Scenario.project_id == project_id).order_by(Scenario.created_at.desc())
        return list(self.db.scalars(stmt).all())

    def get(self, scenario_id: UUID) -> Scenario | None:
        return self.db.get(Scenario, scenario_id)

    def create(self, project_id: UUID, name: str, description: str | None, status_date) -> Scenario:
        scenario = Scenario(project_id=project_id, name=name, description=description, status_date=status_date)
        self.db.add(scenario)
        self.db.commit()
        self.db.refresh(scenario)
        self.create_audit_event(scenario.id, "created", "scenario", str(scenario.id), {"name": scenario.name, "version": scenario.version})
        return scenario

    def update(self, scenario: Scenario, **values) -> Scenario:
        changed = {}
        for key, value in values.items():
            if value is not None and getattr(scenario, key) != value:
                changed[key] = {"from": str(getattr(scenario, key)), "to": str(value)}
                setattr(scenario, key, value)
        if changed:
            self.db.commit()
            self.db.refresh(scenario)
            self.create_audit_event(scenario.id, "updated", "scenario", str(scenario.id), {"changes": changed, "version": scenario.version})
        return scenario

    def duplicate(self, source: Scenario, name: str, description: str | None, include_dataset: bool = True) -> Scenario:
        duplicate = Scenario(
            project_id=source.project_id,
            name=name,
            description=description if description is not None else source.description,
            status_date=source.status_date,
            version=1,
        )
        self.db.add(duplicate)
        self.db.commit()
        self.db.refresh(duplicate)

        if include_dataset:
            source_dataset = self.get_dataset(source.id)
            if source_dataset:
                dataset_json = deepcopy(source_dataset.dataset_json)
                dataset_json.setdefault("scenario", {})["scenario_id"] = str(duplicate.id)
                dataset_json.setdefault("scenario", {})["name"] = duplicate.name
                self.upsert_dataset(
                    duplicate.id,
                    dataset_json=dataset_json,
                    schema_version=source_dataset.schema_version,
                    is_valid=source_dataset.is_valid,
                    bump_version=False,
                    audit=False,
                )
        self.create_audit_event(duplicate.id, "duplicated_from", "scenario", str(source.id), {"source_scenario_id": str(source.id), "source_name": source.name})
        self.create_audit_event(source.id, "duplicated_to", "scenario", str(duplicate.id), {"duplicate_scenario_id": str(duplicate.id), "duplicate_name": duplicate.name})
        return duplicate

    def get_dataset(self, scenario_id: UUID) -> ScenarioDataset | None:
        stmt = select(ScenarioDataset).where(ScenarioDataset.scenario_id == scenario_id)
        return self.db.scalars(stmt).first()

    def upsert_dataset(
        self,
        scenario_id: UUID,
        dataset_json: dict,
        schema_version: str,
        is_valid: bool,
        bump_version: bool = True,
        audit: bool = True,
    ) -> ScenarioDataset:
        dataset = self.get_dataset(scenario_id)
        created = dataset is None
        if dataset is None:
            dataset = ScenarioDataset(
                scenario_id=scenario_id,
                dataset_json=dataset_json,
                schema_version=schema_version,
                is_valid=is_valid,
            )
            self.db.add(dataset)
        else:
            dataset.dataset_json = dataset_json
            dataset.schema_version = schema_version
            dataset.is_valid = is_valid

        scenario = self.get(scenario_id)
        if scenario and bump_version:
            scenario.version += 1

        self.db.commit()
        self.db.refresh(dataset)
        if scenario:
            self.db.refresh(scenario)

        if audit:
            self.create_audit_event(
                scenario_id,
                "dataset_created" if created else "dataset_updated",
                "scenario_dataset",
                str(dataset.id),
                {"schema_version": schema_version, "is_valid": is_valid, "scenario_version": scenario.version if scenario else None},
            )
        return dataset

    def create_audit_event(self, scenario_id: UUID, action: str, entity_type: str, entity_id: str | None, details: dict | None = None) -> ScenarioAuditEvent:
        event = ScenarioAuditEvent(
            scenario_id=scenario_id,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            details_json=details or {},
        )
        self.db.add(event)
        self.db.commit()
        self.db.refresh(event)
        return event

    def list_audit_events(self, scenario_id: UUID) -> list[ScenarioAuditEvent]:
        stmt = select(ScenarioAuditEvent).where(ScenarioAuditEvent.scenario_id == scenario_id).order_by(ScenarioAuditEvent.created_at.desc())
        return list(self.db.scalars(stmt).all())
