from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.simulation import SimulationResult, SimulationRun


class SimulationRepository:
    def __init__(self, db: Session):
        self.db = db

    def list_runs_for_scenario(self, scenario_id: UUID) -> list[SimulationRun]:
        return list(self.db.scalars(select(SimulationRun).where(SimulationRun.scenario_id == scenario_id).order_by(SimulationRun.created_at.desc())))

    def get_run(self, run_id: UUID) -> SimulationRun | None:
        return self.db.get(SimulationRun, run_id)

    def create_run(self, run: SimulationRun) -> SimulationRun:
        self.db.add(run)
        self.db.commit()
        self.db.refresh(run)
        return run

    def update_run(self, run: SimulationRun) -> SimulationRun:
        self.db.add(run)
        self.db.commit()
        self.db.refresh(run)
        return run

    def set_worker_job_id(self, run_id: UUID, worker_job_id: str) -> None:
        run = self.get_run(run_id)
        if run:
            run.worker_job_id = worker_job_id
            self.update_run(run)

    def create_result(self, result: SimulationResult) -> SimulationResult:
        self.db.add(result)
        self.db.commit()
        self.db.refresh(result)
        return result

    def get_result_for_run(self, run_id: UUID) -> SimulationResult | None:
        return self.db.scalar(select(SimulationResult).where(SimulationResult.run_id == run_id))

    def delete_result_for_run(self, run_id: UUID) -> None:
        result = self.get_result_for_run(run_id)
        if result:
            self.db.delete(result)
            self.db.commit()

    def upsert_result(self, result: SimulationResult) -> SimulationResult:
        existing = self.get_result_for_run(result.run_id)
        if existing:
            existing.summary_json = result.summary_json
            existing.charts_json = result.charts_json
            existing.driver_analysis_json = result.driver_analysis_json
            existing.artifact_metadata_json = result.artifact_metadata_json or {}
            self.db.add(existing)
            self.db.commit()
            self.db.refresh(existing)
            return existing
        return self.create_result(result)
