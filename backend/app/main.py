from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import health, imports, projects, scenarios, schemas, validation, simulations, reports
from app.core.config import settings
from app.db.base import Base
from app.db.session import engine


def create_app() -> FastAPI:
    app = FastAPI(
        title="SCURA Platform API",
        version="0.1.0",
        description="Backend API for Schedule Cost Uncertainty Risk Analysis modeling.",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.on_event("startup")
    def on_startup() -> None:
        # Local-dev convenience remains enabled by default.
        # Production deployments should run Alembic migrations and set USE_AUTO_CREATE_TABLES=false.
        if settings.use_auto_create_tables:
            Base.metadata.create_all(bind=engine)

    app.include_router(health.router)
    app.include_router(projects.router, prefix="/api", tags=["projects"])
    app.include_router(scenarios.router, prefix="/api", tags=["scenarios"])
    app.include_router(schemas.router, prefix="/api", tags=["schemas"])
    app.include_router(validation.router, prefix="/api", tags=["validation"])
    app.include_router(imports.router, prefix="/api", tags=["imports"])
    app.include_router(simulations.router, prefix="/api", tags=["simulations"])
    app.include_router(reports.router, prefix="/api", tags=["reports"])
    return app


app = create_app()
