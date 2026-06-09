from uuid import UUID

from fastapi import HTTPException, status

from app.repositories.project_repository import ProjectRepository
from app.schemas.project import ProjectCreate, ProjectUpdate


class ProjectService:
    def __init__(self, repo: ProjectRepository):
        self.repo = repo

    def list_projects(self):
        return self.repo.list()

    def get_project(self, project_id: UUID):
        project = self.repo.get(project_id)
        if not project:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
        return project

    def create_project(self, payload: ProjectCreate):
        return self.repo.create(name=payload.name, description=payload.description)

    def update_project(self, project_id: UUID, payload: ProjectUpdate):
        project = self.get_project(project_id)
        return self.repo.update(project, **payload.model_dump(exclude_unset=True))
