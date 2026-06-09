from collections import Counter, defaultdict, deque
from typing import Any

from pydantic import ValidationError

from app.schemas.scura_dataset import ScuraDataset
from app.schemas.validation import ValidationIssue, ValidationResponse, ValidationSeverity


class ValidationService:
    """Validates canonical SCURA datasets at schema, reference, and business-rule levels."""

    def validate_dataset_payload(self, payload: dict[str, Any]) -> ValidationResponse:
        issues: list[ValidationIssue] = []

        try:
            dataset = ScuraDataset.model_validate(payload)
        except ValidationError as exc:
            issues.extend(self._pydantic_errors_to_issues(exc))
            return self._response(issues)

        issues.extend(self._validate_unique_ids(dataset))
        issues.extend(self._validate_distribution_ranges(dataset))
        issues.extend(self._validate_references(dataset))
        issues.extend(self._validate_schedule_network(dataset))
        issues.extend(self._validate_business_rules(dataset))

        return self._response(issues)

    def _pydantic_errors_to_issues(self, exc: ValidationError) -> list[ValidationIssue]:
        issues: list[ValidationIssue] = []
        for err in exc.errors():
            loc = list(err.get("loc", []))
            table = self._table_from_location(loc)
            row_id = None
            field = loc[-1] if loc else None
            if len(loc) >= 3 and isinstance(loc[-2], int):
                row_id = str(loc[-2] + 1)

            issues.append(
                ValidationIssue(
                    severity=ValidationSeverity.error,
                    table=table,
                    row_id=row_id,
                    field=str(field) if field is not None else None,
                    message=str(err.get("msg", "Invalid value.")),
                    code="schema_error",
                )
            )
        return issues

    def _table_from_location(self, loc: list[Any]) -> str:
        joined = ".".join(str(part) for part in loc)
        table_map = {
            "schedule.activities": "activities",
            "schedule.relationships": "relationships",
            "schedule.duration_uncertainties": "duration_uncertainties",
            "cost.cost_items": "cost_items",
            "cost.cost_uncertainties": "cost_uncertainties",
            "cost.cost_schedule_mappings": "cost_schedule_mappings",
            "risks.risk_events": "risk_events",
            "risks.risk_impacts": "risk_impacts",
            "schedule.calendars": "calendars",
            "schedule.milestones": "milestones",
            "correlations": "correlations",
        }
        for prefix, table in table_map.items():
            if joined.startswith(prefix):
                return table
        return str(loc[0]) if loc else "dataset"

    def _validate_unique_ids(self, dataset: ScuraDataset) -> list[ValidationIssue]:
        checks = [
            ("activities", "activity_id", [a.activity_id for a in dataset.schedule.activities]),
            ("relationships", "relationship_id", [r.relationship_id for r in dataset.schedule.relationships]),
            ("duration_uncertainties", "activity_id", [u.activity_id for u in dataset.schedule.duration_uncertainties]),
            ("cost_items", "cost_id", [c.cost_id for c in dataset.cost.cost_items]),
            ("cost_uncertainties", "cost_id", [c.cost_id for c in dataset.cost.cost_uncertainties]),
            ("cost_schedule_mappings", "mapping_id", [m.mapping_id for m in dataset.cost.cost_schedule_mappings]),
            ("risk_events", "risk_id", [r.risk_id for r in dataset.risks.risk_events]),
            ("risk_impacts", "impact_id", [i.impact_id for i in dataset.risks.risk_impacts]),
            ("calendars", "calendar_id", [c.calendar_id for c in dataset.schedule.calendars]),
            ("milestones", "milestone_id", [m.milestone_id for m in dataset.schedule.milestones]),
            ("correlations", "correlation_id", [c.correlation_id for c in dataset.correlations]),
        ]
        issues: list[ValidationIssue] = []
        for table, field, values in checks:
            counts = Counter(values)
            for value, count in counts.items():
                if count > 1:
                    issues.append(
                        ValidationIssue(
                            severity=ValidationSeverity.error,
                            table=table,
                            row_id=value,
                            field=field,
                            message=f"Duplicate {field} '{value}' appears {count} times.",
                            code="duplicate_id",
                        )
                    )
        return issues

    def _validate_distribution_ranges(self, dataset: ScuraDataset) -> list[ValidationIssue]:
        rows: list[tuple[str, str, str | None, Any]] = []
        rows.extend(("duration_uncertainties", "activity_id", u.activity_id, u) for u in dataset.schedule.duration_uncertainties)
        rows.extend(("cost_uncertainties", "cost_id", c.cost_id, c) for c in dataset.cost.cost_uncertainties)
        for impact in dataset.risks.risk_impacts:
            if impact.schedule_impact:
                rows.append(("risk_impacts", "schedule_impact", impact.impact_id, impact.schedule_impact))
            if impact.cost_impact:
                rows.append(("risk_impacts", "cost_impact", impact.impact_id, impact.cost_impact))

        issues: list[ValidationIssue] = []
        for table, field, row_id, dist in rows:
            if dist.minimum > dist.most_likely or dist.most_likely > dist.maximum:
                issues.append(
                    ValidationIssue(
                        severity=ValidationSeverity.error,
                        table=table,
                        row_id=row_id,
                        field=field,
                        message="Distribution range must satisfy minimum <= most_likely <= maximum.",
                        code="invalid_distribution_range",
                    )
                )
        return issues

    def _validate_references(self, dataset: ScuraDataset) -> list[ValidationIssue]:
        issues: list[ValidationIssue] = []
        activity_ids = {a.activity_id for a in dataset.schedule.activities}
        cost_ids = {c.cost_id for c in dataset.cost.cost_items}
        risk_ids = {r.risk_id for r in dataset.risks.risk_events}
        calendar_ids = {c.calendar_id for c in dataset.schedule.calendars}

        for activity in dataset.schedule.activities:
            if activity.calendar_id and activity.calendar_id not in calendar_ids:
                issues.append(self._unknown_ref("activities", activity.activity_id, "calendar_id", activity.calendar_id, "calendar"))

        for milestone in dataset.schedule.milestones:
            if milestone.activity_id not in activity_ids:
                issues.append(self._unknown_ref("milestones", milestone.milestone_id, "activity_id", milestone.activity_id, "activity"))

        for group in dataset.correlations:
            if group.target_type.value == "activity_duration":
                valid_targets = activity_ids
                target_name = "activity"
            elif group.target_type.value == "cost_item":
                valid_targets = cost_ids
                target_name = "cost item"
            else:
                valid_targets = risk_ids
                target_name = "risk event"
            for target_id in group.target_ids:
                if target_id not in valid_targets:
                    issues.append(self._unknown_ref("correlations", group.correlation_id, "target_ids", target_id, target_name))

        for rel in dataset.schedule.relationships:
            if rel.predecessor_activity_id not in activity_ids:
                issues.append(self._unknown_ref("relationships", rel.relationship_id, "predecessor_activity_id", rel.predecessor_activity_id, "activity"))
            if rel.successor_activity_id not in activity_ids:
                issues.append(self._unknown_ref("relationships", rel.relationship_id, "successor_activity_id", rel.successor_activity_id, "activity"))
            if rel.predecessor_activity_id == rel.successor_activity_id:
                issues.append(
                    ValidationIssue(
                        severity=ValidationSeverity.error,
                        table="relationships",
                        row_id=rel.relationship_id,
                        field="successor_activity_id",
                        message="An activity cannot be its own successor.",
                        code="self_relationship",
                    )
                )

        for unc in dataset.schedule.duration_uncertainties:
            if unc.activity_id not in activity_ids:
                issues.append(self._unknown_ref("duration_uncertainties", unc.activity_id, "activity_id", unc.activity_id, "activity"))

        for unc in dataset.cost.cost_uncertainties:
            if unc.cost_id not in cost_ids:
                issues.append(self._unknown_ref("cost_uncertainties", unc.cost_id, "cost_id", unc.cost_id, "cost item"))

        for mapping in dataset.cost.cost_schedule_mappings:
            if mapping.cost_id not in cost_ids:
                issues.append(self._unknown_ref("cost_schedule_mappings", mapping.mapping_id, "cost_id", mapping.cost_id, "cost item"))
            if mapping.activity_id not in activity_ids:
                issues.append(self._unknown_ref("cost_schedule_mappings", mapping.mapping_id, "activity_id", mapping.activity_id, "activity"))

        for impact in dataset.risks.risk_impacts:
            if impact.risk_id not in risk_ids:
                issues.append(self._unknown_ref("risk_impacts", impact.impact_id, "risk_id", impact.risk_id, "risk event"))
            if impact.activity_id and impact.activity_id not in activity_ids:
                issues.append(self._unknown_ref("risk_impacts", impact.impact_id, "activity_id", impact.activity_id, "activity"))
            if impact.cost_id and impact.cost_id not in cost_ids:
                issues.append(self._unknown_ref("risk_impacts", impact.impact_id, "cost_id", impact.cost_id, "cost item"))
            if not impact.activity_id and not impact.cost_id:
                issues.append(
                    ValidationIssue(
                        severity=ValidationSeverity.error,
                        table="risk_impacts",
                        row_id=impact.impact_id,
                        field="activity_id",
                        message="Risk impact must reference at least one activity_id or cost_id.",
                        code="risk_impact_without_target",
                    )
                )
            if not impact.schedule_impact and not impact.cost_impact:
                issues.append(
                    ValidationIssue(
                        severity=ValidationSeverity.error,
                        table="risk_impacts",
                        row_id=impact.impact_id,
                        field="schedule_impact",
                        message="Risk impact must include schedule_impact, cost_impact, or both.",
                        code="risk_impact_without_impact",
                    )
                )
        return issues

    def _unknown_ref(self, table: str, row_id: str, field: str, value: str, target: str) -> ValidationIssue:
        return ValidationIssue(
            severity=ValidationSeverity.error,
            table=table,
            row_id=row_id,
            field=field,
            message=f"Referenced {target} '{value}' does not exist.",
            code="unknown_reference",
        )

    def _validate_schedule_network(self, dataset: ScuraDataset) -> list[ValidationIssue]:
        issues: list[ValidationIssue] = []
        activity_ids = [a.activity_id for a in dataset.schedule.activities]
        activity_set = set(activity_ids)
        successors: dict[str, list[str]] = defaultdict(list)
        indegree: dict[str, int] = {activity_id: 0 for activity_id in activity_ids}

        for rel in dataset.schedule.relationships:
            if rel.predecessor_activity_id in activity_set and rel.successor_activity_id in activity_set:
                successors[rel.predecessor_activity_id].append(rel.successor_activity_id)
                indegree[rel.successor_activity_id] += 1

        queue = deque([activity_id for activity_id, degree in indegree.items() if degree == 0])
        visited = 0
        while queue:
            activity_id = queue.popleft()
            visited += 1
            for successor in successors[activity_id]:
                indegree[successor] -= 1
                if indegree[successor] == 0:
                    queue.append(successor)

        if activity_ids and visited != len(activity_ids):
            issues.append(
                ValidationIssue(
                    severity=ValidationSeverity.error,
                    table="relationships",
                    row_id=None,
                    field="relationship_id",
                    message="Schedule relationships contain a circular logic path.",
                    code="circular_schedule_logic",
                )
            )

        linked = set()
        for rel in dataset.schedule.relationships:
            linked.add(rel.predecessor_activity_id)
            linked.add(rel.successor_activity_id)
        for activity_id in activity_set - linked:
            if len(activity_set) > 1:
                issues.append(
                    ValidationIssue(
                        severity=ValidationSeverity.warning,
                        table="activities",
                        row_id=activity_id,
                        field="activity_id",
                        message="Activity is not linked by any schedule relationship.",
                        code="orphan_activity",
                    )
                )

        return issues

    def _validate_business_rules(self, dataset: ScuraDataset) -> list[ValidationIssue]:
        issues: list[ValidationIssue] = []
        uncertainty_activity_ids = {u.activity_id for u in dataset.schedule.duration_uncertainties}
        for activity in dataset.schedule.activities:
            if activity.status.value != "complete" and activity.activity_id not in uncertainty_activity_ids:
                issues.append(
                    ValidationIssue(
                        severity=ValidationSeverity.warning,
                        table="activities",
                        row_id=activity.activity_id,
                        field="activity_id",
                        message="Activity has no duration uncertainty row. Simulation will need a fallback duration.",
                        code="missing_duration_uncertainty",
                    )
                )
            if activity.status.value == "complete" and activity.remaining_duration_days not in (None, 0):
                issues.append(
                    ValidationIssue(
                        severity=ValidationSeverity.warning,
                        table="activities",
                        row_id=activity.activity_id,
                        field="remaining_duration_days",
                        message="Completed activity should usually have zero remaining duration.",
                        code="completed_activity_has_remaining_duration",
                    )
                )

        mapped_cost_ids = {m.cost_id for m in dataset.cost.cost_schedule_mappings}
        for calendar in dataset.schedule.calendars:
            if calendar.workdays_per_week < 1 or calendar.workdays_per_week > 7:
                issues.append(
                    ValidationIssue(
                        severity=ValidationSeverity.error,
                        table="calendars",
                        row_id=calendar.calendar_id,
                        field="workdays_per_week",
                        message="Calendar workdays_per_week must be between 1 and 7.",
                        code="invalid_calendar_workweek",
                    )
                )

        for group in dataset.correlations:
            if len(group.target_ids) < 2:
                issues.append(
                    ValidationIssue(
                        severity=ValidationSeverity.warning,
                        table="correlations",
                        row_id=group.correlation_id,
                        field="target_ids",
                        message="Correlation group should normally include at least two targets.",
                        code="small_correlation_group",
                    )
                )

        for cost in dataset.cost.cost_items:
            if cost.cost_type.value in {"duration_dependent", "monthly_burn"} and cost.cost_id not in mapped_cost_ids:
                issues.append(
                    ValidationIssue(
                        severity=ValidationSeverity.warning,
                        table="cost_items",
                        row_id=cost.cost_id,
                        field="cost_type",
                        message="Time-dependent cost item is not mapped to any schedule activity.",
                        code="unmapped_time_dependent_cost",
                    )
                )

        return issues

    def _response(self, issues: list[ValidationIssue]) -> ValidationResponse:
        error_count = sum(1 for issue in issues if issue.severity == ValidationSeverity.error)
        warning_count = sum(1 for issue in issues if issue.severity == ValidationSeverity.warning)
        return ValidationResponse(valid=error_count == 0, error_count=error_count, warning_count=warning_count, issues=issues)
