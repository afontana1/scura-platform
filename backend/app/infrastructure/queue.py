from redis import Redis
from rq import Queue

from app.core.config import settings


def get_redis_connection() -> Redis:
    return Redis.from_url(settings.redis_url)


def get_simulation_queue() -> Queue:
    return Queue(settings.simulation_queue_name, connection=get_redis_connection())
