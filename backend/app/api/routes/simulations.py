from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from fastapi.responses import FileResponse
from redis.exceptions import RedisError

from app.api.dependencies import get_simulation_service
from app.core.config import settings
from app.infrastructure.queue import get_simulation_queue
from app.schemas.simulation import SimulationRunCreate, SimulationRunRead, SimulationRunWithResult
from app.services.simulation_service import SimulationService
from app.workers.simulation_tasks import execute_simulation_run

router = APIRouter()


@router.get("/scenarios/{scenario_id}/simulation-runs", response_model=list[SimulationRunRead])
def list_runs(scenario_id: UUID, service: Annotated[SimulationService, Depends(get_simulation_service)]):
    return service.list_runs(scenario_id)


@router.post("/scenarios/{scenario_id}/simulation-runs", response_model=SimulationRunWithResult, status_code=201)
def create_run(
    scenario_id: UUID,
    payload: SimulationRunCreate,
    background_tasks: BackgroundTasks,
    service: Annotated[SimulationService, Depends(get_simulation_service)],
):
    queued = service.create_queued_run(scenario_id, payload)
    mode = settings.simulation_execution_mode.lower()

    if mode == "queue":
        try:
            queue = get_simulation_queue()
            job = queue.enqueue("app.workers.simulation_tasks.execute_simulation_run", str(queued.run.id), job_timeout="2h", result_ttl=86400, failure_ttl=604800)
            service.set_worker_job_id(queued.run.id, job.id)
        except RedisError as exc:
            raise HTTPException(status_code=503, detail=f"Simulation queue is unavailable: {exc}") from exc
    elif mode == "background":
        background_tasks.add_task(execute_simulation_run, str(queued.run.id))
    elif mode == "local_sync":
        return service.execute_queued_run(queued.run.id)
    else:
        raise HTTPException(status_code=500, detail=f"Unsupported SIMULATION_EXECUTION_MODE: {settings.simulation_execution_mode}")

    return service.get_run_with_result(queued.run.id)


@router.get("/simulation-runs/{run_id}", response_model=SimulationRunWithResult)
def get_run(run_id: UUID, service: Annotated[SimulationService, Depends(get_simulation_service)]):
    return service.get_run_with_result(run_id)


@router.get("/simulation-runs/{run_id}/artifacts/{artifact_name}")
def download_artifact(run_id: UUID, artifact_name: str, service: Annotated[SimulationService, Depends(get_simulation_service)]):
    path = service.artifact_path(run_id, artifact_name)
    media_type = "text/csv" if artifact_name == "iterations_csv" else "application/x-ndjson"
    return FileResponse(path, media_type=media_type, filename=path.name)
