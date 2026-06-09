from typing import Annotated

from fastapi import Depends
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.repositories.project_repository import ProjectRepository
from app.repositories.scenario_repository import ScenarioRepository
from app.repositories.simulation_repository import SimulationRepository
from app.services.project_service import ProjectService
from app.services.scenario_service import ScenarioService
from app.services.validation_service import ValidationService
from app.services.import_service import ImportService
from app.services.simulation_service import SimulationService
from app.services.report_service import ReportService

DbSession = Annotated[Session, Depends(get_db)]


def get_project_service(db: DbSession) -> ProjectService:
    return ProjectService(ProjectRepository(db))


def get_scenario_service(db: DbSession) -> ScenarioService:
    return ScenarioService(ScenarioRepository(db), ProjectRepository(db), SimulationRepository(db))


def get_validation_service() -> ValidationService:
    return ValidationService()


def get_import_service() -> ImportService:
    return ImportService(ValidationService())


def get_simulation_service(db: DbSession) -> SimulationService:
    return SimulationService(ScenarioRepository(db), SimulationRepository(db), ValidationService())


def get_report_service(db: DbSession) -> ReportService:
    return ReportService(ScenarioRepository(db), SimulationRepository(db))
