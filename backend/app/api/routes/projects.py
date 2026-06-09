from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends

from app.api.dependencies import get_project_service
from app.schemas.project import ProjectCreate, ProjectRead, ProjectUpdate
from app.services.project_service import ProjectService

router = APIRouter()


@router.get("/projects", response_model=list[ProjectRead])
def list_projects(service: Annotated[ProjectService, Depends(get_project_service)]):
    return service.list_projects()


@router.post("/projects", response_model=ProjectRead, status_code=201)
def create_project(payload: ProjectCreate, service: Annotated[ProjectService, Depends(get_project_service)]):
    return service.create_project(payload)


@router.get("/projects/{project_id}", response_model=ProjectRead)
def get_project(project_id: UUID, service: Annotated[ProjectService, Depends(get_project_service)]):
    return service.get_project(project_id)


@router.patch("/projects/{project_id}", response_model=ProjectRead)
def update_project(project_id: UUID, payload: ProjectUpdate, service: Annotated[ProjectService, Depends(get_project_service)]):
    return service.update_project(project_id, payload)
