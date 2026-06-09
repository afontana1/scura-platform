from app.db.session import SessionLocal
from app.repositories.scenario_repository import ScenarioRepository
from app.repositories.simulation_repository import SimulationRepository
from app.services.simulation_service import SimulationService
from app.services.validation_service import ValidationService


def execute_simulation_run(run_id: str) -> None:
    """Queue/worker entry point for SCURA simulation jobs."""
    db = SessionLocal()
    try:
        service = SimulationService(
            ScenarioRepository(db),
            SimulationRepository(db),
            ValidationService(),
        )
        service.execute_queued_run(run_id)
    finally:
        db.close()
