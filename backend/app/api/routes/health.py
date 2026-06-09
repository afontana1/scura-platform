from datetime import datetime

from fastapi import APIRouter

from app.infrastructure.queue import get_redis_connection, get_simulation_queue

router = APIRouter()


@router.get("/health")
def health_check():
    return {"status": "ok", "service": "scura-platform-api", "timestamp": datetime.utcnow().isoformat()}


@router.get("/health/queue")
def queue_health_check():
    redis = get_redis_connection()
    redis.ping()
    queue = get_simulation_queue()
    return {
        "status": "ok",
        "queue": queue.name,
        "queued_jobs": queue.count,
        "timestamp": datetime.utcnow().isoformat(),
    }
