import csv
import json
from datetime import datetime
from pathlib import Path
from uuid import UUID

from fastapi import HTTPException

from app.core.config import settings
from app.domain.simulation.engine import SimulationEngine
from app.models.simulation import SimulationResult, SimulationRun
from app.repositories.scenario_repository import ScenarioRepository
from app.repositories.simulation_repository import SimulationRepository
from app.schemas.scura_dataset import ScuraDataset
from app.schemas.simulation import SimulationResultRead, SimulationRunCreate, SimulationRunWithResult
from app.services.validation_service import ValidationService


class SimulationService:
    def __init__(
        self,
        scenario_repo: ScenarioRepository,
        simulation_repo: SimulationRepository,
        validation_service: ValidationService,
        engine: SimulationEngine | None = None,
    ):
        self.scenario_repo = scenario_repo
        self.simulation_repo = simulation_repo
        self.validation_service = validation_service
        self.engine = engine or SimulationEngine()

    def list_runs(self, scenario_id: UUID) -> list[SimulationRun]:
        self._ensure_scenario(scenario_id)
        return self.simulation_repo.list_runs_for_scenario(scenario_id)

    def get_run_with_result(self, run_id: UUID) -> SimulationRunWithResult:
        run = self.simulation_repo.get_run(run_id)
        if not run:
            raise HTTPException(status_code=404, detail="Simulation run not found")
        result = self.simulation_repo.get_result_for_run(run_id)
        return SimulationRunWithResult(
            run=run,
            result=SimulationResultRead(
                run_id=run.id,
                summary=result.summary_json,
                charts=result.charts_json,
                driver_analysis=result.driver_analysis_json,
                artifacts=result.artifact_metadata_json or {},
            ) if result else None,
        )

    def create_queued_run(self, scenario_id: UUID, payload: SimulationRunCreate) -> SimulationRunWithResult:
        """Create a run record quickly so the API can hand it to a worker."""
        scenario = self._ensure_scenario(scenario_id)
        dataset_record = self.scenario_repo.get_dataset(scenario_id)
        if not dataset_record:
            raise HTTPException(status_code=400, detail="Scenario has no dataset to simulate")

        dataset = ScuraDataset.model_validate(dataset_record.dataset_json)
        validation = self.validation_service.validate_dataset_payload(dataset.model_dump(mode="json"))
        if not validation.valid:
            raise HTTPException(status_code=422, detail={"message": "Dataset is not valid for simulation", "validation": validation.model_dump()})

        config = payload.config
        config.scenario_id = str(scenario_id)
        run = SimulationRun(
            scenario_id=scenario.id,
            run_name=config.run_name,
            config_json=config.model_dump(mode="json"),
            status="queued",
        )
        run = self.simulation_repo.create_run(run)
        self.scenario_repo.create_audit_event(scenario_id, "simulation_queued", "simulation_run", str(run.id), {"run_name": run.run_name, "iterations": config.iterations})
        return self.get_run_with_result(run.id)

    def set_worker_job_id(self, run_id: UUID, worker_job_id: str) -> None:
        self.simulation_repo.set_worker_job_id(run_id, worker_job_id)

    def execute_queued_run(self, run_id: UUID | str) -> SimulationRunWithResult:
        run_uuid = UUID(str(run_id))
        run = self.simulation_repo.get_run(run_uuid)
        if not run:
            raise HTTPException(status_code=404, detail="Simulation run not found")
        if run.status == "completed":
            return self.get_run_with_result(run_uuid)

        self._ensure_scenario(run.scenario_id)
        dataset_record = self.scenario_repo.get_dataset(run.scenario_id)
        if not dataset_record:
            raise HTTPException(status_code=400, detail="Scenario has no dataset to simulate")

        dataset = ScuraDataset.model_validate(dataset_record.dataset_json)
        from app.schemas.scura_dataset import SimulationConfig
        config = SimulationConfig.model_validate(run.config_json)
        config.scenario_id = str(run.scenario_id)

        validation = self.validation_service.validate_dataset_payload(dataset.model_dump(mode="json"))
        if not validation.valid:
            run.status = "failed"
            run.completed_at = datetime.utcnow()
            run.error_message = "Dataset is not valid for simulation"
            self.simulation_repo.update_run(run)
            self.scenario_repo.create_audit_event(run.scenario_id, "simulation_failed", "simulation_run", str(run.id), {"run_name": run.run_name, "error": run.error_message})
            return self.get_run_with_result(run_uuid)

        run.status = "running"
        run.started_at = datetime.utcnow()
        run.error_message = None
        self.simulation_repo.update_run(run)

        try:
            output = self.engine.run(dataset, config)
            artifact_metadata = self._write_artifacts(run.id, output)
            charts = {**output["charts"], "iterations_preview": output.get("iterations_preview", [])}
            if artifact_metadata:
                charts["iteration_artifact"] = artifact_metadata

            run.status = "completed"
            run.completed_at = datetime.utcnow()
            result = SimulationResult(
                run_id=run.id,
                summary_json=output["summary"],
                charts_json=charts,
                driver_analysis_json=output["driver_analysis"],
                artifact_metadata_json=artifact_metadata,
            )
            self.simulation_repo.upsert_result(result)
            self.simulation_repo.update_run(run)
            self.scenario_repo.create_audit_event(
                run.scenario_id,
                "simulation_completed",
                "simulation_run",
                str(run.id),
                {"run_name": run.run_name, "iterations": config.iterations, "artifact_files": list(artifact_metadata.keys())},
            )
        except Exception as exc:
            run.status = "failed"
            run.completed_at = datetime.utcnow()
            run.error_message = str(exc)
            self.simulation_repo.update_run(run)
            self.scenario_repo.create_audit_event(run.scenario_id, "simulation_failed", "simulation_run", str(run.id), {"run_name": run.run_name, "error": str(exc)})
            return self.get_run_with_result(run_uuid)

        return self.get_run_with_result(run_uuid)

    def create_and_run(self, scenario_id: UUID, payload: SimulationRunCreate) -> SimulationRunWithResult:
        queued = self.create_queued_run(scenario_id, payload)
        return self.execute_queued_run(queued.run.id)

    def artifact_path(self, run_id: UUID | str, artifact_name: str) -> Path:
        safe_names = {"iterations_csv": "iterations.csv", "iterations_jsonl": "iterations.jsonl"}
        if artifact_name not in safe_names:
            raise HTTPException(status_code=404, detail="Artifact not found")
        path = Path(settings.simulation_artifact_dir) / str(run_id) / safe_names[artifact_name]
        if not path.exists():
            raise HTTPException(status_code=404, detail="Artifact file not found")
        return path

    def _write_artifacts(self, run_id: UUID, output: dict) -> dict:
        rows = output.get("iterations_artifact_rows") or []
        if not rows:
            return {}
        run_dir = Path(settings.simulation_artifact_dir) / str(run_id)
        run_dir.mkdir(parents=True, exist_ok=True)

        csv_path = run_dir / "iterations.csv"
        jsonl_path = run_dir / "iterations.jsonl"

        with csv_path.open("w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=["iteration", "project_duration_days", "total_cost", "occurred_risks", "critical_path"])
            writer.writeheader()
            for row in rows:
                writer.writerow({
                    "iteration": row.get("iteration"),
                    "project_duration_days": row.get("project_duration_days"),
                    "total_cost": row.get("total_cost"),
                    "occurred_risks": ";".join(row.get("occurred_risks") or []),
                    "critical_path": ";".join(row.get("critical_path") or []),
                })

        with jsonl_path.open("w", encoding="utf-8") as f:
            for row in rows:
                f.write(json.dumps(row) + "\n")

        return {
            "iterations_csv": {"filename": "iterations.csv", "bytes": csv_path.stat().st_size},
            "iterations_jsonl": {"filename": "iterations.jsonl", "bytes": jsonl_path.stat().st_size},
        }

    def _ensure_scenario(self, scenario_id: UUID):
        scenario = self.scenario_repo.get(scenario_id)
        if not scenario:
            raise HTTPException(status_code=404, detail="Scenario not found")
        return scenario
