from __future__ import annotations

from collections import defaultdict, deque
from typing import Any

from app.schemas.scura_dataset import ScuraDataset


class ScheduleNetwork:
    """Forward/backward pass schedule engine.

    Supports FS/SS/FF/SF relationships with lags for the forward pass and
    provides an approximate total-float calculation for criticality analytics.
    This remains intentionally independent of FastAPI, persistence, and imports.
    """

    def __init__(self, dataset: ScuraDataset):
        self.dataset = dataset
        self.activity_ids = [a.activity_id for a in dataset.schedule.activities]
        self.relationships = dataset.schedule.relationships
        self.predecessors: dict[str, list[tuple[str, str, float]]] = defaultdict(list)
        self.successors: dict[str, list[tuple[str, str, float]]] = defaultdict(list)
        self.indegree: dict[str, int] = {activity_id: 0 for activity_id in self.activity_ids}
        for rel in self.relationships:
            self.predecessors[rel.successor_activity_id].append((rel.predecessor_activity_id, rel.relationship_type.value, rel.lag_days))
            self.successors[rel.predecessor_activity_id].append((rel.successor_activity_id, rel.relationship_type.value, rel.lag_days))
            self.indegree[rel.successor_activity_id] = self.indegree.get(rel.successor_activity_id, 0) + 1

    def topological_order(self) -> list[str]:
        indegree = dict(self.indegree)
        queue = deque([a for a in self.activity_ids if indegree.get(a, 0) == 0])
        order: list[str] = []
        while queue:
            activity_id = queue.popleft()
            order.append(activity_id)
            for successor, _, _ in self.successors.get(activity_id, []):
                indegree[successor] -= 1
                if indegree[successor] == 0:
                    queue.append(successor)
        if len(order) != len(self.activity_ids):
            raise ValueError("Schedule contains circular logic or unresolved relationships.")
        return order

    def calculate(self, durations: dict[str, float]) -> tuple[dict[str, float], dict[str, float], float]:
        metrics = self.calculate_with_metrics(durations)
        return metrics["early_start"], metrics["early_finish"], metrics["project_duration"]

    def calculate_with_metrics(self, durations: dict[str, float]) -> dict[str, Any]:
        order = self.topological_order()
        early_start: dict[str, float] = {}
        early_finish: dict[str, float] = {}

        for activity_id in order:
            duration = durations.get(activity_id, 0.0)
            start_candidates = [0.0]
            for pred_id, rel_type, lag in self.predecessors.get(activity_id, []):
                pred_start = early_start[pred_id]
                pred_finish = early_finish[pred_id]
                if rel_type == "SS":
                    start_candidates.append(pred_start + lag)
                elif rel_type == "FF":
                    start_candidates.append(pred_finish + lag - duration)
                elif rel_type == "SF":
                    start_candidates.append(pred_start + lag - duration)
                else:
                    start_candidates.append(pred_finish + lag)
            early_start[activity_id] = max(start_candidates)
            early_finish[activity_id] = early_start[activity_id] + duration

        project_duration = max(early_finish.values()) if early_finish else 0.0
        late_start = {activity_id: project_duration - durations.get(activity_id, 0.0) for activity_id in self.activity_ids}
        late_finish = {activity_id: project_duration for activity_id in self.activity_ids}

        # Approximate backward pass. FS is exact for simple networks; SS/FF/SF are
        # handled conservatively for analytics rather than contract-grade CPM.
        for activity_id in reversed(order):
            duration = durations.get(activity_id, 0.0)
            successor_constraints: list[float] = []
            for successor_id, rel_type, lag in self.successors.get(activity_id, []):
                succ_ls = late_start[successor_id]
                succ_lf = late_finish[successor_id]
                if rel_type == "SS":
                    successor_constraints.append(succ_ls - lag)
                elif rel_type == "FF":
                    successor_constraints.append(succ_lf - lag - duration)
                elif rel_type == "SF":
                    successor_constraints.append(succ_lf - lag)
                else:
                    successor_constraints.append(succ_ls - lag - duration)
            if successor_constraints:
                late_start[activity_id] = min(successor_constraints)
                late_finish[activity_id] = late_start[activity_id] + duration

        total_float = {activity_id: late_start[activity_id] - early_start.get(activity_id, 0.0) for activity_id in self.activity_ids}
        critical_path = [activity_id for activity_id, float_value in total_float.items() if float_value <= 1e-6]

        return {
            "early_start": early_start,
            "early_finish": early_finish,
            "late_start": late_start,
            "late_finish": late_finish,
            "total_float": total_float,
            "critical_path": critical_path,
            "project_duration": project_duration,
        }
