from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.project import Project


class ProjectRepository:
    def __init__(self, db: Session):
        self.db = db

    def list(self) -> list[Project]:
        return list(self.db.scalars(select(Project).order_by(Project.created_at.desc())).all())

    def get(self, project_id: UUID) -> Project | None:
        return self.db.get(Project, project_id)

    def create(self, name: str, description: str | None = None) -> Project:
        project = Project(name=name, description=description)
        self.db.add(project)
        self.db.commit()
        self.db.refresh(project)
        return project

    def update(self, project: Project, **values) -> Project:
        for key, value in values.items():
            if value is not None:
                setattr(project, key, value)
        self.db.commit()
        self.db.refresh(project)
        return project
