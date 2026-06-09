import type { ScuraDataset } from '../types/scura';

export function createDefaultDataset(projectId?: string, scenarioId?: string): ScuraDataset {
  return {
    schema_version: '0.3.0',
    project: { project_id: projectId ?? null, name: null },
    scenario: { scenario_id: scenarioId ?? null, name: null, status_date: null },
    schedule: {
      activities: [
        { activity_id: 'A100', name: 'Design', wbs_id: '1.1', baseline_duration_days: 30, calendar_id: 'standard_5_day', status: 'not_started', actual_start: null, actual_finish: null, remaining_duration_days: 30 },
        { activity_id: 'A200', name: 'Procurement', wbs_id: '1.2', baseline_duration_days: 60, calendar_id: 'standard_5_day', status: 'not_started', actual_start: null, actual_finish: null, remaining_duration_days: 60 },
        { activity_id: 'A300', name: 'Construction', wbs_id: '1.3', baseline_duration_days: 90, calendar_id: 'standard_5_day', status: 'not_started', actual_start: null, actual_finish: null, remaining_duration_days: 90 }
      ],
      relationships: [
        { relationship_id: 'REL-001', predecessor_activity_id: 'A100', successor_activity_id: 'A200', relationship_type: 'FS', lag_days: 0 },
        { relationship_id: 'REL-002', predecessor_activity_id: 'A200', successor_activity_id: 'A300', relationship_type: 'FS', lag_days: 0 }
      ],
      duration_uncertainties: [
        { activity_id: 'A100', distribution: 'triangular', minimum: 25, most_likely: 35, maximum: 50 },
        { activity_id: 'A200', distribution: 'triangular', minimum: 50, most_likely: 70, maximum: 110 },
        { activity_id: 'A300', distribution: 'triangular', minimum: 80, most_likely: 100, maximum: 150 }
      ],
      calendars: [
        { calendar_id: 'standard_5_day', name: 'Standard 5-Day', workdays_per_week: 5, notes: 'Default Monday-Friday calendar' },
        { calendar_id: 'seven_day', name: 'Seven-Day Work', workdays_per_week: 7, notes: 'Continuous work calendar' }
      ],
      milestones: [
        { milestone_id: 'MS-001', name: 'Procurement Complete', activity_id: 'A200', target_day: 115 },
        { milestone_id: 'MS-002', name: 'Project Complete', activity_id: 'A300', target_day: 220 }
      ]
    },
    cost: {
      cost_items: [
        { cost_id: 'C100', wbs_id: '1.1', description: 'Design labor', baseline_cost: 500000, cost_type: 'duration_dependent', currency: 'USD' },
        { cost_id: 'C200', wbs_id: '1.2', description: 'Equipment', baseline_cost: 2500000, cost_type: 'fixed', currency: 'USD' },
        { cost_id: 'C300', wbs_id: '1.3', description: 'Construction labor', baseline_cost: 4000000, cost_type: 'duration_dependent', currency: 'USD' },
        { cost_id: 'C400', wbs_id: '1.0', description: 'Project management', baseline_cost: 75000, cost_type: 'monthly_burn', currency: 'USD' }
      ],
      cost_uncertainties: [
        { cost_id: 'C100', distribution: 'triangular', minimum: 450000, most_likely: 525000, maximum: 700000 },
        { cost_id: 'C200', distribution: 'triangular', minimum: 2300000, most_likely: 2600000, maximum: 3200000 },
        { cost_id: 'C300', distribution: 'triangular', minimum: 3600000, most_likely: 4300000, maximum: 5500000 }
      ],
      cost_schedule_mappings: [
        { mapping_id: 'MAP-001', cost_id: 'C100', activity_id: 'A100', behavior: 'scale_with_duration' },
        { mapping_id: 'MAP-002', cost_id: 'C200', activity_id: 'A200', behavior: 'fixed_to_activity' },
        { mapping_id: 'MAP-003', cost_id: 'C300', activity_id: 'A300', behavior: 'scale_with_duration' },
        { mapping_id: 'MAP-004', cost_id: 'C400', activity_id: 'A100', behavior: 'project_burn' },
        { mapping_id: 'MAP-005', cost_id: 'C400', activity_id: 'A200', behavior: 'project_burn' },
        { mapping_id: 'MAP-006', cost_id: 'C400', activity_id: 'A300', behavior: 'project_burn' }
      ]
    },
    risks: {
      risk_events: [
        { risk_id: 'R100', name: 'Design rework', description: 'Design review may create rework.', probability: 0.25, owner: 'Engineering', status: 'active' },
        { risk_id: 'R200', name: 'Supplier delay', description: 'Supplier delivery may slip.', probability: 0.30, owner: 'Procurement', status: 'active' }
      ],
      risk_impacts: [
        { impact_id: 'RI-001', risk_id: 'R100', activity_id: 'A100', cost_id: 'C100', schedule_impact: { distribution: 'triangular', minimum: 10, most_likely: 20, maximum: 30 }, cost_impact: { distribution: 'triangular', minimum: 100000, most_likely: 250000, maximum: 400000 } },
        { impact_id: 'RI-002', risk_id: 'R200', activity_id: 'A200', cost_id: 'C200', schedule_impact: { distribution: 'triangular', minimum: 20, most_likely: 40, maximum: 60 }, cost_impact: { distribution: 'triangular', minimum: 200000, most_likely: 500000, maximum: 800000 } }
      ]
    },
    correlations: [
      { correlation_id: 'CORR-001', name: 'Field execution complexity', target_type: 'activity_duration', target_ids: ['A200', 'A300'], strength: 0.45, notes: 'Procurement and construction outcomes share execution conditions.' },
      { correlation_id: 'CORR-002', name: 'Labor cost pressure', target_type: 'cost_item', target_ids: ['C100', 'C300'], strength: 0.35, notes: 'Engineering and construction labor rates can move together.' }
    ],
    assumptions: []
  };
}
