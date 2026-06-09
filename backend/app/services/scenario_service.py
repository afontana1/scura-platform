from uuid import UUID

from fastapi import HTTPException, status

from app.repositories.project_repository import ProjectRepository
from app.repositories.scenario_repository import ScenarioRepository
from app.repositories.simulation_repository import SimulationRepository
from app.schemas.scenario import (
    ScenarioCompareRequest,
    ScenarioComparisonItem,
    ScenarioComparisonRead,
    ScenarioCreate,
    ScenarioDatasetUpsert,
    ScenarioDuplicateCreate,
    ScenarioRead,
    ScenarioUpdate,
)
from app.schemas.scura_dataset import ScuraDataset


def empty_dataset(project_id: UUID, scenario_id: UUID, scenario_name: str) -> dict:
    dataset = ScuraDataset(
        project={"project_id": str(project_id)},
        scenario={"scenario_id": str(scenario_id), "name": scenario_name},
    )
    return dataset.model_dump(mode="json")


def dataset_stats(dataset_json: dict) -> dict[str, int]:
    schedule = dataset_json.get("schedule", {})
    cost = dataset_json.get("cost", {})
    risks = dataset_json.get("risks", {})
    return {
        "activities": len(schedule.get("activities", [])),
        "relationships": len(schedule.get("relationships", [])),
        "duration_uncertainties": len(schedule.get("duration_uncertainties", [])),
        "cost_items": len(cost.get("cost_items", [])),
        "cost_uncertainties": len(cost.get("cost_uncertainties", [])),
        "cost_schedule_mappings": len(cost.get("cost_schedule_mappings", [])),
        "risk_events": len(risks.get("risk_events", [])),
        "risk_impacts": len(risks.get("risk_impacts", [])),
    }


class ScenarioService:
    def __init__(
        self,
        scenario_repo: ScenarioRepository,
        project_repo: ProjectRepository,
        simulation_repo: SimulationRepository | None = None,
    ):
        self.scenario_repo = scenario_repo
        self.project_repo = project_repo
        self.simulation_repo = simulation_repo

    def list_for_project(self, project_id: UUID):
        if not self.project_repo.get(project_id):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
        return self.scenario_repo.list_for_project(project_id)

    def get_scenario(self, scenario_id: UUID):
        scenario = self.scenario_repo.get(scenario_id)
        if not scenario:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Scenario not found")
        return scenario

    def create_scenario(self, project_id: UUID, payload: ScenarioCreate):
        if not self.project_repo.get(project_id):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
        scenario = self.scenario_repo.create(project_id, payload.name, payload.description, payload.status_date)
        self.scenario_repo.upsert_dataset(
            scenario.id,
            empty_dataset(project_id, scenario.id, scenario.name),
            schema_version="0.6.0",
            is_valid=False,
            bump_version=False,
        )
        return scenario

    def update_scenario(self, scenario_id: UUID, payload: ScenarioUpdate):
        scenario = self.get_scenario(scenario_id)
        return self.scenario_repo.update(scenario, **payload.model_dump(exclude_unset=True))

    def duplicate_scenario(self, scenario_id: UUID, payload: ScenarioDuplicateCreate):
        source = self.get_scenario(scenario_id)
        name = payload.name or f"{source.name} Copy"
        duplicate = self.scenario_repo.duplicate(source, name=name, description=payload.description, include_dataset=payload.include_dataset)
        return duplicate

    def get_dataset(self, scenario_id: UUID):
        self.get_scenario(scenario_id)
        dataset = self.scenario_repo.get_dataset(scenario_id)
        if not dataset:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Scenario dataset not found")
        return dataset

    def upsert_dataset(self, scenario_id: UUID, payload: ScenarioDatasetUpsert):
        self.get_scenario(scenario_id)
        return self.scenario_repo.upsert_dataset(
            scenario_id=scenario_id,
            dataset_json=payload.dataset_json,
            schema_version=payload.schema_version,
            is_valid=payload.is_valid,
        )

    def list_audit_events(self, scenario_id: UUID):
        self.get_scenario(scenario_id)
        return self.scenario_repo.list_audit_events(scenario_id)

    def compare_scenarios(self, project_id: UUID, payload: ScenarioCompareRequest) -> ScenarioComparisonRead:
        project = self.project_repo.get(project_id)
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")

        items: list[ScenarioComparisonItem] = []
        for scenario_id in payload.scenario_ids:
            scenario = self.get_scenario(scenario_id)
            if scenario.project_id != project_id:
                raise HTTPException(status_code=400, detail="All compared scenarios must belong to the selected project")
            dataset = self.scenario_repo.get_dataset(scenario_id)
            latest_run_summary = self._latest_completed_run_summary(scenario_id)
            items.append(
                ScenarioComparisonItem(
                    scenario=ScenarioRead.model_validate(scenario),
                    dataset_stats=dataset_stats(dataset.dataset_json if dataset else {}),
                    latest_completed_run=latest_run_summary,
                )
            )
        return ScenarioComparisonRead(project_id=project_id, items=items)

    def _latest_completed_run_summary(self, scenario_id: UUID):
        if not self.simulation_repo:
            return None
        for run in self.simulation_repo.list_runs_for_scenario(scenario_id):
            if run.status != "completed":
                continue
            result = self.simulation_repo.get_result_for_run(run.id)
            if not result:
                continue
            summary = result.summary_json or {}
            return {
                "run_id": str(run.id),
                "run_name": run.run_name,
                "created_at": run.created_at.isoformat(),
                "duration_p50": summary.get("duration_p50"),
                "duration_p80": summary.get("duration_p80"),
                "cost_p50": summary.get("cost_p50"),
                "cost_p80": summary.get("cost_p80"),
                "joint_probability": summary.get("joint_probability"),
            }
        return None
