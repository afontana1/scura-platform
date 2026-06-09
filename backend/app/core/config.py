from functools import cached_property
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = "postgresql+psycopg://scura:scura@localhost:5432/scura"
    backend_cors_origins: str = "http://localhost:5173"
    use_auto_create_tables: bool = True
    # local_sync is useful for tests; background uses FastAPI BackgroundTasks; queue uses Redis/RQ.
    simulation_execution_mode: str = "queue"
    redis_url: str = "redis://localhost:6379/0"
    simulation_queue_name: str = "scura-simulations"
    simulation_artifact_dir: str = "/app/storage/simulation_runs"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @cached_property
    def cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.backend_cors_origins.split(",") if origin.strip()]


settings = Settings()
