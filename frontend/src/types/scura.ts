export interface Project {
  id: string;
  name: string;
  description?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Scenario {
  id: string;
  project_id: string;
  name: string;
  description?: string | null;
  status_date?: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface ScenarioDatasetRecord {
  id: string;
  scenario_id: string;
  dataset_json: ScuraDataset;
  schema_version: string;
  is_valid: boolean;
  created_at: string;
  updated_at: string;
}

export type ActivityStatus = 'not_started' | 'in_progress' | 'complete';
export type RelationshipType = 'FS' | 'SS' | 'FF' | 'SF';
export type DistributionType = 'triangular' | 'pert' | 'normal' | 'uniform';
export type CostType = 'fixed' | 'duration_dependent' | 'monthly_burn' | 'quantity_dependent' | 'risk_only';
export type CostMappingBehavior = 'fixed_to_activity' | 'scale_with_duration' | 'project_burn' | 'milestone_payment' | 'risk_only';

export interface ProjectEnvelope {
  project_id?: string | null;
  name?: string | null;
}

export interface ScenarioEnvelope {
  scenario_id?: string | null;
  name?: string | null;
  status_date?: string | null;
}

export interface Activity {
  activity_id: string;
  name: string;
  wbs_id?: string | null;
  baseline_duration_days: number;
  calendar_id?: string | null;
  status: ActivityStatus;
  actual_start?: string | null;
  actual_finish?: string | null;
  remaining_duration_days?: number | null;
}

export interface Relationship {
  relationship_id: string;
  predecessor_activity_id: string;
  successor_activity_id: string;
  relationship_type: RelationshipType;
  lag_days: number;
}

export interface TriPointUncertainty {
  distribution: DistributionType;
  minimum: number;
  most_likely: number;
  maximum: number;
}

export interface DurationUncertainty extends TriPointUncertainty {
  activity_id: string;
}

export interface CostItem {
  cost_id: string;
  wbs_id?: string | null;
  description: string;
  baseline_cost: number;
  cost_type: CostType;
  currency: string;
}

export interface CostUncertainty extends TriPointUncertainty {
  cost_id: string;
}

export interface CostScheduleMapping {
  mapping_id: string;
  cost_id: string;
  activity_id: string;
  behavior: CostMappingBehavior;
}

export interface RiskEvent {
  risk_id: string;
  name: string;
  description?: string | null;
  probability: number;
  owner?: string | null;
  status: string;
}

export interface RiskImpact {
  impact_id: string;
  risk_id: string;
  activity_id?: string | null;
  cost_id?: string | null;
  schedule_impact?: TriPointUncertainty | null;
  cost_impact?: TriPointUncertainty | null;
}

export interface ScuraDataset {
  schema_version: string;
  project: ProjectEnvelope;
  scenario: ScenarioEnvelope;
  schedule: {
    activities: Activity[];
    relationships: Relationship[];
    duration_uncertainties: DurationUncertainty[];
    calendars: Calendar[];
    milestones: Milestone[];
  };
  cost: {
    cost_items: CostItem[];
    cost_uncertainties: CostUncertainty[];
    cost_schedule_mappings: CostScheduleMapping[];
  };
  risks: {
    risk_events: RiskEvent[];
    risk_impacts: RiskImpact[];
  };
  correlations: CorrelationGroup[];
  assumptions: Record<string, unknown>[];
}

export interface ValidationIssue {
  severity: 'error' | 'warning';
  table: string;
  row_id?: string | null;
  field?: string | null;
  message: string;
  code: string;
}

export interface ValidationResponse {
  valid: boolean;
  error_count: number;
  warning_count: number;
  issues: ValidationIssue[];
}

export interface ColumnDef<T> {
  key: keyof T & string;
  label: string;
  type?: 'text' | 'number' | 'select';
  options?: string[];
}


export interface ImportPreview {
  import_id: string;
  filename: string;
  dataset_json: ScuraDataset;
  validation: ValidationResponse;
  sheet_row_counts: Record<string, number>;
}

export interface SimulationConfig {
  scenario_id: string;
  run_name: string;
  iterations: number;
  random_seed?: number | null;
  target_duration_days?: number | null;
  target_budget?: number | null;
  confidence_levels: number[];
  include_risk_events: boolean;
  include_cost_uncertainty: boolean;
  include_schedule_uncertainty: boolean;
  include_correlations: boolean;
  include_milestone_confidence?: boolean;
  include_criticality_index?: boolean;
  calendar_mode: string;
}

export interface SimulationRun {
  id: string;
  scenario_id: string;
  run_name: string;
  config_json: SimulationConfig;
  status: string;
  worker_job_id?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  error_message?: string | null;
  created_at: string;
}

export interface SimulationResult {
  run_id: string;
  summary: Record<string, any>;
  charts: Record<string, any>;
  driver_analysis: Record<string, any>;
  artifacts?: Record<string, any>;
}

export interface SimulationRunWithResult {
  run: SimulationRun;
  result?: SimulationResult | null;
}

export interface ScenarioAuditEvent {
  id: string;
  scenario_id: string;
  action: string;
  entity_type: string;
  entity_id?: string | null;
  actor: string;
  details_json: Record<string, any>;
  created_at: string;
}

export interface ScenarioComparisonItem {
  scenario: Scenario;
  dataset_stats: Record<string, number>;
  latest_completed_run?: Record<string, any> | null;
}

export interface ScenarioComparisonRead {
  project_id: string;
  items: ScenarioComparisonItem[];
}

// Advanced modeling additions
export interface Calendar {
  calendar_id: string;
  name: string;
  workdays_per_week: number;
  notes?: string | null;
}

export interface Milestone {
  milestone_id: string;
  name: string;
  activity_id: string;
  target_day?: number | null;
}

export type CorrelationTargetType = 'activity_duration' | 'cost_item' | 'risk_probability';

export interface CorrelationGroup {
  correlation_id: string;
  name: string;
  target_type: CorrelationTargetType;
  target_ids: string[];
  strength: number;
  notes?: string | null;
}
