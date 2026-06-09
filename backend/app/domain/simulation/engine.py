from __future__ import annotations

import math
import random
from collections import defaultdict
from statistics import mean
from typing import Any

from app.domain.simulation.distributions import sample_uncertainty
from app.domain.simulation.schedule_network import ScheduleNetwork
from app.schemas.scura_dataset import ScuraDataset, SimulationConfig


class SimulationEngine:
    """Advanced SCURA engine.

    Adds relationship types/lags, calendar-aware duration conversion,
    remaining-work handling, cost uncertainty, correlation groups, milestone
    confidence, criticality index, and activity sensitivity analytics.
    """

    def run(self, dataset: ScuraDataset, config: SimulationConfig) -> dict[str, Any]:
        rng = random.Random(config.random_seed)
        network = ScheduleNetwork(dataset)

        activities = {a.activity_id: a for a in dataset.schedule.activities}
        calendars = {c.calendar_id: c for c in dataset.schedule.calendars}
        duration_unc = {u.activity_id: u for u in dataset.schedule.duration_uncertainties}
        cost_items = {c.cost_id: c for c in dataset.cost.cost_items}
        cost_unc = {u.cost_id: u for u in dataset.cost.cost_uncertainties}
        mappings_by_cost: dict[str, list[Any]] = defaultdict(list)
        for mapping in dataset.cost.cost_schedule_mappings:
            mappings_by_cost[mapping.cost_id].append(mapping)
        risk_events = {r.risk_id: r for r in dataset.risks.risk_events if r.status != "retired"}
        impacts_by_risk: dict[str, list[Any]] = defaultdict(list)
        for impact in dataset.risks.risk_impacts:
            impacts_by_risk[impact.risk_id].append(impact)

        correlation_map = self._build_correlation_map(dataset, config, rng)

        baseline_work_durations = {
            activity_id: self._remaining_or_baseline(activity)
            for activity_id, activity in activities.items()
        }
        baseline_durations = {
            activity_id: self._calendar_adjust_duration(activity_id, duration, activities, calendars, config)
            for activity_id, duration in baseline_work_durations.items()
        }
        baseline_project_duration = network.calculate(baseline_durations)[2]
        baseline_cost = self._baseline_cost(cost_items, baseline_project_duration)

        iterations: list[dict[str, Any]] = []
        risk_tracker: dict[str, list[dict[str, float]]] = defaultdict(list)
        critical_counts: dict[str, int] = defaultdict(int)
        activity_samples: dict[str, list[float]] = defaultdict(list)
        milestone_samples: dict[str, list[float]] = defaultdict(list)

        for i in range(config.iterations):
            work_durations: dict[str, float] = {}
            for activity_id, activity in activities.items():
                base_duration = self._remaining_or_baseline(activity)
                if activity.status.value == "complete":
                    duration = 0.0
                elif config.include_schedule_uncertainty and activity_id in duration_unc:
                    duration = max(0.0, self._sample_with_correlation(duration_unc[activity_id], "activity_duration", activity_id, correlation_map, rng))
                else:
                    duration = max(0.0, base_duration)
                work_durations[activity_id] = duration

            occurred_risks: list[str] = []
            risk_cost_by_cost_id: dict[str, float] = defaultdict(float)
            if config.include_risk_events:
                for risk_id, risk in risk_events.items():
                    if rng.random() <= float(risk.probability):
                        occurred_risks.append(risk_id)
                        for impact in impacts_by_risk.get(risk_id, []):
                            if impact.activity_id and impact.schedule_impact:
                                work_durations[impact.activity_id] = work_durations.get(impact.activity_id, 0.0) + max(
                                    0.0, sample_uncertainty(impact.schedule_impact, rng)
                                )
                            if impact.cost_id and impact.cost_impact:
                                risk_cost_by_cost_id[impact.cost_id] += max(0.0, sample_uncertainty(impact.cost_impact, rng))

            durations = {
                activity_id: self._calendar_adjust_duration(activity_id, duration, activities, calendars, config)
                for activity_id, duration in work_durations.items()
            }
            schedule_metrics = network.calculate_with_metrics(durations)
            starts = schedule_metrics["early_start"]
            finishes = schedule_metrics["early_finish"]
            project_duration = schedule_metrics["project_duration"]
            total_float = schedule_metrics["total_float"]
            critical_path = schedule_metrics["critical_path"]

            for activity_id in critical_path:
                critical_counts[activity_id] += 1
            for activity_id, duration in durations.items():
                activity_samples[activity_id].append(duration)

            for milestone in dataset.schedule.milestones:
                if milestone.activity_id in finishes:
                    milestone_samples[milestone.milestone_id].append(finishes[milestone.activity_id])

            total_cost, cost_breakdown = self._calculate_costs(
                cost_items=cost_items,
                cost_unc=cost_unc,
                mappings_by_cost=mappings_by_cost,
                durations=durations,
                baseline_durations=baseline_durations,
                project_duration=project_duration,
                risk_cost_by_cost_id=risk_cost_by_cost_id,
                config=config,
                correlation_map=correlation_map,
                rng=rng,
            )

            iteration = {
                "iteration": i + 1,
                "project_duration_days": project_duration,
                "total_cost": total_cost,
                "occurred_risks": occurred_risks,
                "start_by_activity": starts,
                "finish_by_activity": finishes,
                "total_float_by_activity": total_float,
                "critical_path": critical_path,
                "activity_durations": durations,
                "cost_breakdown": cost_breakdown,
            }
            iterations.append(iteration)
            occurred_set = set(occurred_risks)
            for risk_id in risk_events:
                risk_tracker[risk_id].append({
                    "occurred": 1.0 if risk_id in occurred_set else 0.0,
                    "duration": project_duration,
                    "cost": total_cost,
                })

        durations_result = [r["project_duration_days"] for r in iterations]
        costs_result = [r["total_cost"] for r in iterations]
        confidence_levels = sorted(set(config.confidence_levels or [10, 50, 70, 80, 90]))
        duration_percentiles = {f"p{p}": self._percentile(durations_result, p) for p in confidence_levels}
        cost_percentiles = {f"p{p}": self._percentile(costs_result, p) for p in confidence_levels}
        milestone_confidence = self._milestone_confidence(dataset, milestone_samples, confidence_levels, config)
        criticality_index = {
            activity_id: critical_counts.get(activity_id, 0) / max(1, config.iterations)
            for activity_id in activities
        }

        summary = {
            "engine_version": "9.0",
            "iterations": config.iterations,
            "baseline_duration_days": baseline_project_duration,
            "baseline_cost": baseline_cost,
            "duration_percentiles": duration_percentiles,
            "cost_percentiles": cost_percentiles,
            "mean_duration_days": mean(durations_result) if durations_result else 0.0,
            "mean_total_cost": mean(costs_result) if costs_result else 0.0,
            "target_duration_days": config.target_duration_days,
            "target_budget": config.target_budget,
            "probability_meet_target_duration": self._prob_le(durations_result, config.target_duration_days),
            "probability_meet_target_budget": self._prob_le(costs_result, config.target_budget),
            "joint_probability": self._joint_probability(iterations, config.target_duration_days, config.target_budget),
            "schedule_contingency_p80": duration_percentiles.get("p80", 0.0) - baseline_project_duration,
            "cost_contingency_p80": cost_percentiles.get("p80", 0.0) - baseline_cost,
            "relationship_types_supported": ["FS", "SS", "FF", "SF"],
            "calendar_mode": config.calendar_mode,
        }
        charts = {
            "duration_histogram": self._histogram(durations_result),
            "cost_histogram": self._histogram(costs_result),
            "duration_s_curve": self._s_curve(durations_result),
            "cost_s_curve": self._s_curve(costs_result),
            "cost_schedule_scatter": [
                {"duration": r["project_duration_days"], "cost": r["total_cost"]}
                for r in iterations[: min(len(iterations), 1000)]
            ],
        }
        driver_analysis = {
            "risk_drivers": self._risk_drivers(risk_tracker),
            "activity_sensitivity": self._activity_sensitivity(activity_samples, durations_result, costs_result),
            "criticality_index": sorted(
                [{"activity_id": activity_id, "criticality": value} for activity_id, value in criticality_index.items()],
                key=lambda row: row["criticality"],
                reverse=True,
            ),
            "milestone_confidence": milestone_confidence,
        }
        slim_iterations = [
            {
                "iteration": row["iteration"],
                "project_duration_days": row["project_duration_days"],
                "total_cost": row["total_cost"],
                "occurred_risks": row["occurred_risks"],
                "critical_path": row["critical_path"],
            }
            for row in iterations
        ]
        return {
            "summary": summary,
            "charts": charts,
            "driver_analysis": driver_analysis,
            "iterations_preview": slim_iterations[:100],
            "iterations_artifact_rows": slim_iterations,
        }

    def _remaining_or_baseline(self, activity: Any) -> float:
        return float(activity.remaining_duration_days if activity.remaining_duration_days is not None else activity.baseline_duration_days)

    def _calendar_adjust_duration(self, activity_id: str, duration: float, activities: dict[str, Any], calendars: dict[str, Any], config: SimulationConfig) -> float:
        if config.calendar_mode != "calendar_aware":
            return duration
        activity = activities[activity_id]
        calendar = calendars.get(activity.calendar_id or "standard_5_day")
        if not calendar:
            return duration
        # Converts working-day effort to elapsed calendar days. A 5-day calendar
        # turns 10 workdays into roughly 14 elapsed days; a 7-day calendar leaves it unchanged.
        return duration * (7.0 / max(0.1, float(calendar.workdays_per_week)))

    def _baseline_cost(self, cost_items: dict[str, Any], baseline_project_duration: float) -> float:
        baseline_cost = sum(float(item.baseline_cost) for item in cost_items.values() if item.cost_type.value != "monthly_burn")
        for item in cost_items.values():
            if item.cost_type.value == "monthly_burn":
                baseline_cost += float(item.baseline_cost) * (baseline_project_duration / 30.0)
        return baseline_cost

    def _build_correlation_map(self, dataset: ScuraDataset, config: SimulationConfig, rng: random.Random) -> dict[tuple[str, str], dict[str, Any]]:
        if not config.include_correlations:
            return {}
        result: dict[tuple[str, str], dict[str, Any]] = {}
        for group in dataset.correlations:
            shared_rng = random.Random(rng.randint(0, 2_147_483_647))
            for target_id in group.target_ids:
                result[(group.target_type.value, target_id)] = {"strength": group.strength, "rng": shared_rng}
        return result

    def _sample_with_correlation(self, uncertainty: Any, target_type: str, target_id: str, correlation_map: dict[tuple[str, str], dict[str, Any]], rng: random.Random) -> float:
        correlation = correlation_map.get((target_type, target_id))
        independent = sample_uncertainty(uncertainty, rng)
        if not correlation:
            return independent
        shared = sample_uncertainty(uncertainty, correlation["rng"])
        strength = float(correlation["strength"])
        return (1.0 - strength) * independent + strength * shared

    def _calculate_costs(self, cost_items: dict[str, Any], cost_unc: dict[str, Any], mappings_by_cost: dict[str, list[Any]], durations: dict[str, float], baseline_durations: dict[str, float], project_duration: float, risk_cost_by_cost_id: dict[str, float], config: SimulationConfig, correlation_map: dict[tuple[str, str], dict[str, Any]], rng: random.Random) -> tuple[float, dict[str, float]]:
        total_cost = 0.0
        cost_breakdown: dict[str, float] = {}
        for cost_id, item in cost_items.items():
            cost_type = item.cost_type.value
            baseline_item_cost = float(item.baseline_cost)
            sampled_cost = baseline_item_cost
            if config.include_cost_uncertainty and cost_id in cost_unc:
                sampled_cost = max(0.0, self._sample_with_correlation(cost_unc[cost_id], "cost_item", cost_id, correlation_map, rng))

            if cost_type == "fixed":
                calculated = sampled_cost
            elif cost_type == "risk_only":
                calculated = 0.0
            elif cost_type == "monthly_burn":
                calculated = sampled_cost * (project_duration / 30.0)
            elif cost_type in {"duration_dependent", "quantity_dependent"}:
                mapped = mappings_by_cost.get(cost_id, [])
                mapped_ids = [m.activity_id for m in mapped if m.behavior.value in {"scale_with_duration", "project_burn"}]
                base_duration_sum = sum(baseline_durations.get(a, 0.0) for a in mapped_ids)
                sampled_duration_sum = sum(durations.get(a, 0.0) for a in mapped_ids)
                calculated = sampled_cost * sampled_duration_sum / base_duration_sum if base_duration_sum > 0 else sampled_cost
            else:
                calculated = sampled_cost

            calculated += risk_cost_by_cost_id.get(cost_id, 0.0)
            cost_breakdown[cost_id] = calculated
            total_cost += calculated
        return total_cost, cost_breakdown

    def _percentile(self, values: list[float], p: int | float) -> float:
        if not values:
            return 0.0
        ordered = sorted(values)
        k = (len(ordered) - 1) * (float(p) / 100.0)
        f = math.floor(k)
        c = math.ceil(k)
        if f == c:
            return ordered[int(k)]
        return ordered[f] * (c - k) + ordered[c] * (k - f)

    def _prob_le(self, values: list[float], target: float | None) -> float | None:
        if target is None or not values:
            return None
        return sum(1 for value in values if value <= target) / len(values)

    def _joint_probability(self, iterations: list[dict[str, Any]], target_duration: float | None, target_budget: float | None) -> float | None:
        if target_duration is None or target_budget is None or not iterations:
            return None
        return sum(1 for row in iterations if row["project_duration_days"] <= target_duration and row["total_cost"] <= target_budget) / len(iterations)

    def _histogram(self, values: list[float], bins: int = 20) -> dict[str, list[float]]:
        if not values:
            return {"bins": [], "counts": []}
        low, high = min(values), max(values)
        if low == high:
            return {"bins": [low, high], "counts": [len(values)]}
        width = (high - low) / bins
        counts = [0 for _ in range(bins)]
        edges = [low + i * width for i in range(bins + 1)]
        for value in values:
            idx = min(bins - 1, int((value - low) / width))
            counts[idx] += 1
        return {"bins": edges, "counts": counts}

    def _s_curve(self, values: list[float], points: int = 25) -> list[dict[str, float]]:
        if not values:
            return []
        ordered = sorted(values)
        result = []
        for i in range(points):
            p = i / (points - 1) if points > 1 else 1
            idx = min(len(ordered) - 1, round(p * (len(ordered) - 1)))
            result.append({"value": ordered[idx], "confidence": p})
        return result

    def _risk_drivers(self, tracker: dict[str, list[dict[str, float]]]) -> list[dict[str, float | str]]:
        rows = []
        for risk_id, values in tracker.items():
            occurred = [v for v in values if v["occurred"] == 1.0]
            not_occurred = [v for v in values if v["occurred"] == 0.0]
            if not occurred or not not_occurred:
                continue
            duration_delta = mean(v["duration"] for v in occurred) - mean(v["duration"] for v in not_occurred)
            cost_delta = mean(v["cost"] for v in occurred) - mean(v["cost"] for v in not_occurred)
            rows.append({"risk_id": risk_id, "occurrence_count": len(occurred), "duration_delta": duration_delta, "cost_delta": cost_delta})
        return sorted(rows, key=lambda r: (float(r["cost_delta"]), float(r["duration_delta"])), reverse=True)

    def _activity_sensitivity(self, activity_samples: dict[str, list[float]], durations_result: list[float], costs_result: list[float]) -> list[dict[str, float | str]]:
        rows: list[dict[str, float | str]] = []
        for activity_id, samples in activity_samples.items():
            rows.append({
                "activity_id": activity_id,
                "duration_correlation": self._correlation(samples, durations_result),
                "cost_correlation": self._correlation(samples, costs_result),
            })
        return sorted(rows, key=lambda row: abs(float(row["duration_correlation"])), reverse=True)

    def _correlation(self, x: list[float], y: list[float]) -> float:
        if len(x) != len(y) or len(x) < 2:
            return 0.0
        mean_x = mean(x)
        mean_y = mean(y)
        numerator = sum((a - mean_x) * (b - mean_y) for a, b in zip(x, y))
        denom_x = math.sqrt(sum((a - mean_x) ** 2 for a in x))
        denom_y = math.sqrt(sum((b - mean_y) ** 2 for b in y))
        if denom_x == 0 or denom_y == 0:
            return 0.0
        return numerator / (denom_x * denom_y)

    def _milestone_confidence(self, dataset: ScuraDataset, milestone_samples: dict[str, list[float]], confidence_levels: list[int], config: SimulationConfig) -> list[dict[str, Any]]:
        if not config.include_milestone_confidence:
            return []
        rows = []
        for milestone in dataset.schedule.milestones:
            samples = milestone_samples.get(milestone.milestone_id, [])
            percentiles = {f"p{p}": self._percentile(samples, p) for p in confidence_levels}
            rows.append({
                "milestone_id": milestone.milestone_id,
                "name": milestone.name,
                "activity_id": milestone.activity_id,
                "target_day": milestone.target_day,
                "probability_meet_target": self._prob_le(samples, milestone.target_day),
                "percentiles": percentiles,
            })
        return rows
