from datetime import date
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class ActivityStatus(str, Enum):
    not_started = "not_started"
    in_progress = "in_progress"
    complete = "complete"


class RelationshipType(str, Enum):
    FS = "FS"
    SS = "SS"
    FF = "FF"
    SF = "SF"


class DistributionType(str, Enum):
    triangular = "triangular"
    pert = "pert"
    normal = "normal"
    uniform = "uniform"


class CostType(str, Enum):
    fixed = "fixed"
    duration_dependent = "duration_dependent"
    monthly_burn = "monthly_burn"
    quantity_dependent = "quantity_dependent"
    risk_only = "risk_only"


class CostMappingBehavior(str, Enum):
    fixed_to_activity = "fixed_to_activity"
    scale_with_duration = "scale_with_duration"
    project_burn = "project_burn"
    milestone_payment = "milestone_payment"
    risk_only = "risk_only"


class CorrelationTargetType(str, Enum):
    activity_duration = "activity_duration"
    cost_item = "cost_item"
    risk_probability = "risk_probability"


class Activity(BaseModel):
    activity_id: str = Field(..., min_length=1)
    name: str = Field(..., min_length=1)
    wbs_id: str | None = None
    baseline_duration_days: float = Field(..., ge=0)
    calendar_id: str | None = "standard_5_day"
    status: ActivityStatus = ActivityStatus.not_started
    actual_start: date | None = None
    actual_finish: date | None = None
    remaining_duration_days: float | None = Field(default=None, ge=0)


class Relationship(BaseModel):
    relationship_id: str = Field(..., min_length=1)
    predecessor_activity_id: str = Field(..., min_length=1)
    successor_activity_id: str = Field(..., min_length=1)
    relationship_type: RelationshipType = RelationshipType.FS
    lag_days: float = 0


class Calendar(BaseModel):
    calendar_id: str = Field(..., min_length=1)
    name: str = Field(..., min_length=1)
    workdays_per_week: float = Field(default=5, gt=0, le=7)
    notes: str | None = None


class Milestone(BaseModel):
    milestone_id: str = Field(..., min_length=1)
    name: str = Field(..., min_length=1)
    activity_id: str = Field(..., min_length=1)
    target_day: float | None = Field(default=None, ge=0)


class TriPointUncertainty(BaseModel):
    distribution: DistributionType = DistributionType.triangular
    minimum: float
    most_likely: float
    maximum: float


class DurationUncertainty(TriPointUncertainty):
    activity_id: str = Field(..., min_length=1)


class CostItem(BaseModel):
    cost_id: str = Field(..., min_length=1)
    wbs_id: str | None = None
    description: str = Field(..., min_length=1)
    baseline_cost: float = Field(..., ge=0)
    cost_type: CostType = CostType.fixed
    currency: str = "USD"


class CostUncertainty(TriPointUncertainty):
    cost_id: str = Field(..., min_length=1)


class CostScheduleMapping(BaseModel):
    mapping_id: str = Field(..., min_length=1)
    cost_id: str = Field(..., min_length=1)
    activity_id: str = Field(..., min_length=1)
    behavior: CostMappingBehavior


class RiskEvent(BaseModel):
    risk_id: str = Field(..., min_length=1)
    name: str = Field(..., min_length=1)
    description: str | None = None
    probability: float = Field(..., ge=0, le=1)
    owner: str | None = None
    status: str = "active"


class RiskImpact(BaseModel):
    impact_id: str = Field(..., min_length=1)
    risk_id: str = Field(..., min_length=1)
    activity_id: str | None = None
    cost_id: str | None = None
    schedule_impact: TriPointUncertainty | None = None
    cost_impact: TriPointUncertainty | None = None


class CorrelationGroup(BaseModel):
    correlation_id: str = Field(..., min_length=1)
    name: str = Field(..., min_length=1)
    target_type: CorrelationTargetType
    target_ids: list[str] = Field(default_factory=list)
    strength: float = Field(default=0.5, ge=0, le=1)
    notes: str | None = None


class ScheduleSection(BaseModel):
    activities: list[Activity] = []
    relationships: list[Relationship] = []
    duration_uncertainties: list[DurationUncertainty] = []
    calendars: list[Calendar] = [Calendar(calendar_id="standard_5_day", name="Standard 5-Day", workdays_per_week=5)]
    milestones: list[Milestone] = []


class CostSection(BaseModel):
    cost_items: list[CostItem] = []
    cost_uncertainties: list[CostUncertainty] = []
    cost_schedule_mappings: list[CostScheduleMapping] = []


class RiskSection(BaseModel):
    risk_events: list[RiskEvent] = []
    risk_impacts: list[RiskImpact] = []


class ProjectEnvelope(BaseModel):
    project_id: str | None = None
    name: str | None = None


class ScenarioEnvelope(BaseModel):
    scenario_id: str | None = None
    name: str | None = None
    status_date: date | None = None


class ScuraDataset(BaseModel):
    schema_version: str = "0.3.0"
    project: ProjectEnvelope = ProjectEnvelope()
    scenario: ScenarioEnvelope = ScenarioEnvelope()
    schedule: ScheduleSection = ScheduleSection()
    cost: CostSection = CostSection()
    risks: RiskSection = RiskSection()
    correlations: list[CorrelationGroup] = []
    assumptions: list[dict[str, Any]] = []


class SimulationConfig(BaseModel):
    scenario_id: str
    run_name: str = "SCURA Run"
    iterations: int = Field(default=10_000, ge=1, le=1_000_000)
    random_seed: int | None = None
    target_duration_days: float | None = Field(default=None, ge=0)
    target_budget: float | None = Field(default=None, ge=0)
    confidence_levels: list[int] = [10, 50, 70, 80, 90]
    include_risk_events: bool = True
    include_cost_uncertainty: bool = True
    include_schedule_uncertainty: bool = True
    include_correlations: bool = False
    include_milestone_confidence: bool = True
    include_criticality_index: bool = True
    calendar_mode: str = "simple_days"
