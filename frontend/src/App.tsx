import { useEffect, useMemo, useState } from 'react';
import { apiGet, apiPost, apiPut } from './api/client';
import { EditableTable } from './components/EditableTable';
import { ImportWizard } from './components/ImportWizard';
import { ValidationPanel } from './components/ValidationPanel';
import { ResultDashboard } from './components/ResultDashboard';
import { ScenarioManagement } from './components/ScenarioManagement';
import { createDefaultDataset } from './data/defaultDataset';
import type {
  Activity,
  Calendar,
  ColumnDef,
  CorrelationGroup,
  CostItem,
  CostScheduleMapping,
  CostUncertainty,
  DurationUncertainty,
  Project,
  Relationship,
  Milestone,
  RiskEvent,
  RiskImpact,
  Scenario,
  ScenarioDatasetRecord,
  ScuraDataset,
  SimulationRun,
  SimulationRunWithResult,
  ScenarioAuditEvent,
  ScenarioComparisonRead,
  ValidationResponse
} from './types/scura';

function defaultProjectName() {
  return `SCURA Project ${new Date().toLocaleString()}`;
}

function defaultScenarioName() {
  return `Baseline Scenario ${new Date().toLocaleString()}`;
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

const activityColumns: ColumnDef<Activity>[] = [
  { key: 'activity_id', label: 'Activity ID' },
  { key: 'name', label: 'Name' },
  { key: 'wbs_id', label: 'WBS' },
  { key: 'baseline_duration_days', label: 'Baseline Duration', type: 'number' },
  { key: 'remaining_duration_days', label: 'Remaining Duration', type: 'number' },
  { key: 'calendar_id', label: 'Calendar' },
  { key: 'status', label: 'Status', type: 'select', options: ['not_started', 'in_progress', 'complete'] }
];

const relationshipColumns: ColumnDef<Relationship>[] = [
  { key: 'relationship_id', label: 'Relationship ID' },
  { key: 'predecessor_activity_id', label: 'Predecessor' },
  { key: 'successor_activity_id', label: 'Successor' },
  { key: 'relationship_type', label: 'Type', type: 'select', options: ['FS', 'SS', 'FF', 'SF'] },
  { key: 'lag_days', label: 'Lag', type: 'number' }
];

const durationColumns: ColumnDef<DurationUncertainty>[] = [
  { key: 'activity_id', label: 'Activity ID' },
  { key: 'distribution', label: 'Distribution', type: 'select', options: ['triangular', 'pert', 'normal', 'uniform'] },
  { key: 'minimum', label: 'Min', type: 'number' },
  { key: 'most_likely', label: 'Most Likely', type: 'number' },
  { key: 'maximum', label: 'Max', type: 'number' }
];

const costItemColumns: ColumnDef<CostItem>[] = [
  { key: 'cost_id', label: 'Cost ID' },
  { key: 'description', label: 'Description' },
  { key: 'wbs_id', label: 'WBS' },
  { key: 'baseline_cost', label: 'Baseline Cost', type: 'number' },
  { key: 'cost_type', label: 'Cost Type', type: 'select', options: ['fixed', 'duration_dependent', 'monthly_burn', 'quantity_dependent', 'risk_only'] },
  { key: 'currency', label: 'Currency' }
];

const costUncertaintyColumns: ColumnDef<CostUncertainty>[] = [
  { key: 'cost_id', label: 'Cost ID' },
  { key: 'distribution', label: 'Distribution', type: 'select', options: ['triangular', 'pert', 'normal', 'uniform'] },
  { key: 'minimum', label: 'Min', type: 'number' },
  { key: 'most_likely', label: 'Most Likely', type: 'number' },
  { key: 'maximum', label: 'Max', type: 'number' }
];

const mappingColumns: ColumnDef<CostScheduleMapping>[] = [
  { key: 'mapping_id', label: 'Mapping ID' },
  { key: 'cost_id', label: 'Cost ID' },
  { key: 'activity_id', label: 'Activity ID' },
  { key: 'behavior', label: 'Behavior', type: 'select', options: ['fixed_to_activity', 'scale_with_duration', 'project_burn', 'milestone_payment', 'risk_only'] }
];

const riskEventColumns: ColumnDef<RiskEvent>[] = [
  { key: 'risk_id', label: 'Risk ID' },
  { key: 'name', label: 'Name' },
  { key: 'probability', label: 'Probability', type: 'number' },
  { key: 'owner', label: 'Owner' },
  { key: 'status', label: 'Status' }
];

const riskImpactColumns: ColumnDef<RiskImpact>[] = [
  { key: 'impact_id', label: 'Impact ID' },
  { key: 'risk_id', label: 'Risk ID' },
  { key: 'activity_id', label: 'Activity ID' },
  { key: 'cost_id', label: 'Cost ID' }
];

const calendarColumns: ColumnDef<Calendar>[] = [
  { key: 'calendar_id', label: 'Calendar ID' },
  { key: 'name', label: 'Name' },
  { key: 'workdays_per_week', label: 'Workdays / Week', type: 'number' },
  { key: 'notes', label: 'Notes' }
];

const milestoneColumns: ColumnDef<Milestone>[] = [
  { key: 'milestone_id', label: 'Milestone ID' },
  { key: 'name', label: 'Name' },
  { key: 'activity_id', label: 'Activity ID' },
  { key: 'target_day', label: 'Target Day', type: 'number' }
];

const correlationColumns: ColumnDef<CorrelationGroup>[] = [
  { key: 'correlation_id', label: 'Correlation ID' },
  { key: 'name', label: 'Name' },
  { key: 'target_type', label: 'Target Type', type: 'select', options: ['activity_duration', 'cost_item', 'risk_probability'] },
  { key: 'target_ids', label: 'Target IDs' },
  { key: 'strength', label: 'Strength', type: 'number' },
  { key: 'notes', label: 'Notes' }
];

export function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>('');
  const [datasetRecord, setDatasetRecord] = useState<ScenarioDatasetRecord | null>(null);
  const [dataset, setDataset] = useState<ScuraDataset | null>(null);
  const [activeTab, setActiveTab] = useState<string>('activities');
  const [validation, setValidation] = useState<ValidationResponse | null>(null);
  const [schema, setSchema] = useState<Record<string, unknown> | null>(null);
  const [message, setMessage] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [simulationRuns, setSimulationRuns] = useState<SimulationRun[]>([]);
  const [simulationResult, setSimulationResult] = useState<SimulationRunWithResult | null>(null);
  const [simulationBusy, setSimulationBusy] = useState(false);
  const [runName, setRunName] = useState('Baseline P80 Run');
  const [iterations, setIterations] = useState(5000);
  const [targetDuration, setTargetDuration] = useState(220);
  const [targetBudget, setTargetBudget] = useState(8500000);
  const [randomSeed, setRandomSeed] = useState(12345);
  const [includeCorrelations, setIncludeCorrelations] = useState(true);
  const [calendarMode, setCalendarMode] = useState('simple_days');
  const [auditEvents, setAuditEvents] = useState<ScenarioAuditEvent[]>([]);
  const [comparison, setComparison] = useState<ScenarioComparisonRead | null>(null);
  const [selectedCompareIds, setSelectedCompareIds] = useState<string[]>([]);

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId),
    [projects, selectedProjectId]
  );

  async function refreshProjects() {
    const loaded = await apiGet<Project[]>('/api/projects');
    setProjects(loaded);
    if (!selectedProjectId && loaded.length > 0) setSelectedProjectId(loaded[0].id);
  }

  async function refreshScenarios(projectId: string) {
    const loaded = await apiGet<Scenario[]>(`/api/projects/${projectId}/scenarios`);
    setScenarios(loaded);
    if (loaded.length > 0) {
      setSelectedScenarioId(loaded[0].id);
      setSelectedCompareIds(loaded.slice(0, 2).map((scenario) => scenario.id));
    } else {
      setSelectedScenarioId('');
      setDatasetRecord(null);
      setDataset(null);
      setValidation(null);
      setSelectedCompareIds([]);
      setComparison(null);
      setAuditEvents([]);
    }
  }

  async function loadDataset(scenarioId: string) {
    const loaded = await apiGet<ScenarioDatasetRecord>(`/api/scenarios/${scenarioId}/dataset`);
    setDatasetRecord(loaded);
    setDataset(loaded.dataset_json);
    setValidation(null);
    refreshSimulationRuns(scenarioId).catch(() => undefined);
    setSimulationResult(null);
    loadAuditEvents(scenarioId).catch(() => undefined);
  }

  useEffect(() => {
    refreshProjects().catch((err) => setError(String(err)));
    apiGet<Record<string, unknown>>('/api/schemas/scura-dataset').then(setSchema).catch((err) => setError(String(err)));
  }, []);

  useEffect(() => {
    if (selectedProjectId) refreshScenarios(selectedProjectId).catch((err) => setError(String(err)));
  }, [selectedProjectId]);

  useEffect(() => {
    if (selectedScenarioId) loadDataset(selectedScenarioId).catch((err) => setError(String(err)));
  }, [selectedScenarioId]);

  async function createProject() {
    setError('');
    const created = await apiPost<Project>('/api/projects', {
      name: defaultProjectName(),
      description: 'Created from the SCURA frontend.'
    });
    await refreshProjects();
    setSelectedProjectId(created.id);
    setMessage('Project created.');
  }

  async function createScenario() {
    if (!selectedProjectId) return;
    setError('');
    const created = await apiPost<Scenario>(`/api/projects/${selectedProjectId}/scenarios`, {
      name: defaultScenarioName(),
      description: 'Baseline scenario with advanced SCURA engine configuration, editable tables, simulation dashboard, and scenario management.'
    });
    await refreshScenarios(selectedProjectId);
    setSelectedScenarioId(created.id);
    const seed = createDefaultDataset(selectedProjectId, created.id);
    await apiPut<ScenarioDatasetRecord>(`/api/scenarios/${created.id}/dataset`, {
      dataset_json: seed,
      schema_version: seed.schema_version,
      is_valid: false
    });
    setDataset(seed);
    setMessage('Scenario created with starter SCURA data.');
  }

  function updateDataset(next: ScuraDataset) {
    setDataset(next);
    setValidation(null);
  }

  async function saveDataset() {
    if (!selectedScenarioId || !dataset) return;
    setError('');
    const validationResponse = await apiPost<ValidationResponse>(`/api/validation/scura-dataset`, { dataset_json: dataset });
    setValidation(validationResponse);
    const saved = await apiPut<ScenarioDatasetRecord>(`/api/scenarios/${selectedScenarioId}/dataset`, {
      dataset_json: dataset,
      schema_version: dataset.schema_version,
      is_valid: validationResponse.valid
    });
    setDatasetRecord(saved);
    setMessage(validationResponse.valid ? 'Dataset saved and valid.' : 'Dataset saved with validation issues.');
  }

  async function runValidation() {
    if (!dataset) return;
    setError('');
    const validationResponse = await apiPost<ValidationResponse>(`/api/validation/scura-dataset`, { dataset_json: dataset });
    setValidation(validationResponse);
    setMessage(validationResponse.valid ? 'Dataset is valid.' : 'Validation issues found.');
  }

  async function refreshSimulationRuns(scenarioId: string) {
    const runs = await apiGet<SimulationRun[]>(`/api/scenarios/${scenarioId}/simulation-runs`);
    setSimulationRuns(runs);
  }

  async function runSimulation() {
    if (!selectedScenarioId) return;
    setError('');
    setMessage('');
    setSimulationBusy(true);
    try {
      const queued = await apiPost<SimulationRunWithResult>(`/api/scenarios/${selectedScenarioId}/simulation-runs`, {
        config: {
          scenario_id: selectedScenarioId,
          run_name: runName,
          iterations,
          random_seed: randomSeed || null,
          target_duration_days: targetDuration || null,
          target_budget: targetBudget || null,
          confidence_levels: [10, 50, 70, 80, 90],
          include_risk_events: true,
          include_cost_uncertainty: true,
          include_schedule_uncertainty: true,
          include_correlations: includeCorrelations,
          include_milestone_confidence: true,
          include_criticality_index: true,
          calendar_mode: calendarMode
        }
      });
      setSimulationResult(queued);
      setMessage('Simulation queued. Polling for completion...');

      let latest = queued;
      for (let attempt = 0; attempt < 120; attempt += 1) {
        await sleep(1000);
        latest = await apiGet<SimulationRunWithResult>(`/api/simulation-runs/${queued.run.id}`);
        setSimulationResult(latest);
        if (latest.run.status === 'completed' || latest.run.status === 'failed') break;
      }
      await refreshSimulationRuns(selectedScenarioId);
      setMessage(latest.run.status === 'completed' ? 'Simulation completed.' : `Simulation status: ${latest.run.status}`);
    } finally {
      setSimulationBusy(false);
    }
  }

  async function openSimulationRun(runId: string) {
    const loaded = await apiGet<SimulationRunWithResult>(`/api/simulation-runs/${runId}`);
    setSimulationResult(loaded);
  }

  async function loadAuditEvents(scenarioId: string) {
    const loaded = await apiGet<ScenarioAuditEvent[]>(`/api/scenarios/${scenarioId}/audit-events`);
    setAuditEvents(loaded);
  }

  async function duplicateScenario() {
    if (!selectedScenarioId || !selectedProjectId) return;
    setError('');
    const selected = scenarios.find((scenario) => scenario.id === selectedScenarioId);
    const created = await apiPost<Scenario>(`/api/scenarios/${selectedScenarioId}/duplicate`, {
      name: `${selected?.name ?? 'Scenario'} Copy`,
      include_dataset: true
    });
    await refreshScenarios(selectedProjectId);
    setSelectedScenarioId(created.id);
    setMessage('Scenario duplicated with its dataset.');
  }

  async function compareScenarios() {
    if (!selectedProjectId || selectedCompareIds.length < 2) return;
    setError('');
    const loaded = await apiPost<ScenarioComparisonRead>(`/api/projects/${selectedProjectId}/scenarios/compare`, { scenario_ids: selectedCompareIds });
    setComparison(loaded);
    setMessage('Scenario comparison refreshed.');
  }

  function resetStarterData() {
    if (!selectedScenarioId || !selectedProjectId) return;
    updateDataset(createDefaultDataset(selectedProjectId, selectedScenarioId));
    setMessage('Starter dataset loaded in the editor. Save to persist it.');
  }

  const issues = validation?.issues ?? [];

  return (
    <main className="page">
      <section className="hero">
        <div>
          <p className="eyebrow">SCURA Platform</p>
          <h1>Queue-backed SCURA simulations, large-run artifacts, scenario management, dashboard, and validation</h1>
          <p>
            Queue-backed SCURA simulations, scenario management, validation, charts, report exports, and large-run artifacts.
          </p>
        </div>
        <div className="actions">
          <button onClick={() => createProject().catch((err) => setError(String(err)))}>Create Project</button>
          <button disabled={!selectedProjectId} onClick={() => createScenario().catch((err) => setError(String(err)))}>Create Scenario</button>
        </div>
      </section>

      {message && <div className="notice success">{message}</div>}
      {error && <div className="notice error">{error}</div>}

      <section className="grid two">
        <div className="card">
          <h2>Projects</h2>
          <select value={selectedProjectId} onChange={(event) => setSelectedProjectId(event.target.value)}>
            <option value="">Select a project</option>
            {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
          </select>
          {selectedProject && <p className="muted">Selected: {selectedProject.name}</p>}
        </div>

        <div className="card">
          <h2>Scenarios</h2>
          <select value={selectedScenarioId} onChange={(event) => setSelectedScenarioId(event.target.value)}>
            <option value="">Select a scenario</option>
            {scenarios.map((scenario) => <option key={scenario.id} value={scenario.id}>{scenario.name}</option>)}
          </select>
          {datasetRecord && <p className="muted">Dataset: schema {datasetRecord.schema_version} · saved valid: {String(datasetRecord.is_valid)}</p>}
        </div>
      </section>

      <section className="card toolbar-card">
        <div className="toolbar">
          <button disabled={!dataset} onClick={() => saveDataset().catch((err) => setError(String(err)))}>Validate & Save</button>
          <button disabled={!dataset} onClick={() => runValidation().catch((err) => setError(String(err)))}>Run Validation</button>
          <button disabled={!selectedScenarioId} className="secondary" onClick={resetStarterData}>Load Starter Dataset</button>
          <span className="muted">Frontend edits JSON-shaped objects; backend owns validation and increments scenario versions when data is saved.</span>
        </div>
      </section>

      {selectedScenarioId && (
        <ScenarioManagement
          scenarios={scenarios}
          selectedScenarioId={selectedScenarioId}
          comparison={comparison}
          auditEvents={auditEvents}
          selectedCompareIds={selectedCompareIds}
          onSelectedCompareIdsChange={setSelectedCompareIds}
          onDuplicate={() => duplicateScenario().catch((err) => setError(String(err)))}
          onCompare={() => compareScenarios().catch((err) => setError(String(err)))}
          onRefreshAudit={() => loadAuditEvents(selectedScenarioId).catch((err) => setError(String(err)))}
        />
      )}

      {selectedScenarioId && (
        <section className="card">
          <h2>Model Configuration & Simulation</h2>
          <div className="form-grid">
            <label>Run name<input value={runName} onChange={(event) => setRunName(event.target.value)} /></label>
            <label>Iterations<input type="number" min={1} max={1000000} value={iterations} onChange={(event) => setIterations(Number(event.target.value))} /></label>
            <label>Random seed<input type="number" value={randomSeed} onChange={(event) => setRandomSeed(Number(event.target.value))} /></label>
            <label>Target duration days<input type="number" value={targetDuration} onChange={(event) => setTargetDuration(Number(event.target.value))} /></label>
            <label>Target budget<input type="number" value={targetBudget} onChange={(event) => setTargetBudget(Number(event.target.value))} /></label>
            <label>Calendar mode<select value={calendarMode} onChange={(event) => setCalendarMode(event.target.value)}><option value="simple_days">Simple days</option><option value="calendar_aware">Calendar-aware elapsed days</option></select></label>
            <label className="checkbox-label"><input type="checkbox" checked={includeCorrelations} onChange={(event) => setIncludeCorrelations(event.target.checked)} /> Include correlations</label>
          </div>
          <div className="toolbar">
            <button disabled={!dataset || simulationBusy} onClick={() => runSimulation().catch((err) => setError(String(err)))}>{simulationBusy ? 'Running...' : 'Run SCURA Simulation'}</button>
            <span className="muted">The backend queues the run to a Redis/RQ worker and stores large iteration outputs as downloadable artifacts.</span>
          </div>
          {simulationRuns.length > 0 && (
            <div className="run-list">
              <h3>Run history</h3>
              {simulationRuns.slice(0, 5).map((run) => (
                <button key={run.id} className="link-button" onClick={() => openSimulationRun(run.id).catch((err) => setError(String(err)))}>
                  {run.run_name} · {run.status} · {new Date(run.created_at).toLocaleString()}
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {simulationResult?.result && (
        <ResultDashboard simulationResult={simulationResult} />
      )}

      {selectedScenarioId && (
        <ImportWizard
          scenarioId={selectedScenarioId}
          onDatasetImported={(importedDataset, record) => {
            setDataset(importedDataset);
            setDatasetRecord(record);
            setValidation(null);
          }}
          onError={setError}
          onMessage={setMessage}
        />
      )}

      {!dataset ? (
        <section className="card"><p>Create or select a scenario to edit SCURA data.</p></section>
      ) : (
        <section className="grid editor-layout">
          <div className="card editor-shell">
            <nav className="tabs">
              {[
                ['activities', 'Activities'],
                ['relationships', 'Relationships'],
                ['durations', 'Duration Uncertainty'],
                ['costs', 'Cost Items'],
                ['cost_uncertainty', 'Cost Uncertainty'],
                ['mappings', 'Cost-Schedule Map'],
                ['risks', 'Risk Events'],
                ['risk_impacts', 'Risk Impacts'],
                ['calendars', 'Calendars'],
                ['milestones', 'Milestones'],
                ['correlations', 'Correlations'],
                ['json', 'JSON Preview']
              ].map(([key, label]) => (
                <button key={key} className={activeTab === key ? 'active' : ''} onClick={() => setActiveTab(key)}>{label}</button>
              ))}
            </nav>

            {activeTab === 'activities' && (
              <EditableTable<Activity & Record<string, unknown>>
                title="Schedule Activities"
                tableName="activities"
                idKey="activity_id"
                rows={dataset.schedule.activities as (Activity & Record<string, unknown>)[]}
                columns={activityColumns as ColumnDef<Activity & Record<string, unknown>>[]}
                issues={issues}
                createRow={() => ({ activity_id: `A${Date.now()}`, name: 'New activity', wbs_id: '', baseline_duration_days: 1, remaining_duration_days: 1, calendar_id: 'standard_5_day', status: 'not_started' })}
                onChange={(rows) => updateDataset({ ...dataset, schedule: { ...dataset.schedule, activities: rows } })}
              />
            )}

            {activeTab === 'relationships' && (
              <EditableTable<Relationship & Record<string, unknown>>
                title="Schedule Relationships"
                tableName="relationships"
                idKey="relationship_id"
                rows={dataset.schedule.relationships as (Relationship & Record<string, unknown>)[]}
                columns={relationshipColumns as ColumnDef<Relationship & Record<string, unknown>>[]}
                issues={issues}
                createRow={() => ({ relationship_id: `REL-${Date.now()}`, predecessor_activity_id: '', successor_activity_id: '', relationship_type: 'FS', lag_days: 0 })}
                onChange={(rows) => updateDataset({ ...dataset, schedule: { ...dataset.schedule, relationships: rows } })}
              />
            )}

            {activeTab === 'durations' && (
              <EditableTable<DurationUncertainty & Record<string, unknown>>
                title="Duration Uncertainty"
                tableName="duration_uncertainties"
                idKey="activity_id"
                rows={dataset.schedule.duration_uncertainties as (DurationUncertainty & Record<string, unknown>)[]}
                columns={durationColumns as ColumnDef<DurationUncertainty & Record<string, unknown>>[]}
                issues={issues}
                createRow={() => ({ activity_id: '', distribution: 'triangular', minimum: 1, most_likely: 2, maximum: 3 })}
                onChange={(rows) => updateDataset({ ...dataset, schedule: { ...dataset.schedule, duration_uncertainties: rows } })}
              />
            )}

            {activeTab === 'costs' && (
              <EditableTable<CostItem & Record<string, unknown>>
                title="Cost Items"
                tableName="cost_items"
                idKey="cost_id"
                rows={dataset.cost.cost_items as (CostItem & Record<string, unknown>)[]}
                columns={costItemColumns as ColumnDef<CostItem & Record<string, unknown>>[]}
                issues={issues}
                createRow={() => ({ cost_id: `C${Date.now()}`, description: 'New cost item', wbs_id: '', baseline_cost: 0, cost_type: 'fixed', currency: 'USD' })}
                onChange={(rows) => updateDataset({ ...dataset, cost: { ...dataset.cost, cost_items: rows } })}
              />
            )}

            {activeTab === 'cost_uncertainty' && (
              <EditableTable<CostUncertainty & Record<string, unknown>>
                title="Cost Uncertainty"
                tableName="cost_uncertainties"
                idKey="cost_id"
                rows={dataset.cost.cost_uncertainties as (CostUncertainty & Record<string, unknown>)[]}
                columns={costUncertaintyColumns as ColumnDef<CostUncertainty & Record<string, unknown>>[]}
                issues={issues}
                createRow={() => ({ cost_id: '', distribution: 'triangular', minimum: 0, most_likely: 0, maximum: 0 })}
                onChange={(rows) => updateDataset({ ...dataset, cost: { ...dataset.cost, cost_uncertainties: rows } })}
              />
            )}

            {activeTab === 'mappings' && (
              <EditableTable<CostScheduleMapping & Record<string, unknown>>
                title="Cost-Schedule Mapping"
                tableName="cost_schedule_mappings"
                idKey="mapping_id"
                rows={dataset.cost.cost_schedule_mappings as (CostScheduleMapping & Record<string, unknown>)[]}
                columns={mappingColumns as ColumnDef<CostScheduleMapping & Record<string, unknown>>[]}
                issues={issues}
                createRow={() => ({ mapping_id: `MAP-${Date.now()}`, cost_id: '', activity_id: '', behavior: 'scale_with_duration' })}
                onChange={(rows) => updateDataset({ ...dataset, cost: { ...dataset.cost, cost_schedule_mappings: rows } })}
              />
            )}

            {activeTab === 'risks' && (
              <EditableTable<RiskEvent & Record<string, unknown>>
                title="Risk Events"
                tableName="risk_events"
                idKey="risk_id"
                rows={dataset.risks.risk_events as (RiskEvent & Record<string, unknown>)[]}
                columns={riskEventColumns as ColumnDef<RiskEvent & Record<string, unknown>>[]}
                issues={issues}
                createRow={() => ({ risk_id: `R${Date.now()}`, name: 'New risk', probability: 0.1, owner: '', status: 'active' })}
                onChange={(rows) => updateDataset({ ...dataset, risks: { ...dataset.risks, risk_events: rows } })}
              />
            )}

            {activeTab === 'risk_impacts' && (
              <EditableTable<RiskImpact & Record<string, unknown>>
                title="Risk Impacts"
                tableName="risk_impacts"
                idKey="impact_id"
                rows={dataset.risks.risk_impacts as (RiskImpact & Record<string, unknown>)[]}
                columns={riskImpactColumns as ColumnDef<RiskImpact & Record<string, unknown>>[]}
                issues={issues}
                createRow={() => ({ impact_id: `RI-${Date.now()}`, risk_id: '', activity_id: '', cost_id: '', schedule_impact: { distribution: 'triangular', minimum: 0, most_likely: 0, maximum: 0 }, cost_impact: null })}
                onChange={(rows) => updateDataset({ ...dataset, risks: { ...dataset.risks, risk_impacts: rows } })}
              />
            )}


            {activeTab === 'calendars' && (
              <EditableTable<Calendar & Record<string, unknown>>
                title="Calendars"
                tableName="calendars"
                idKey="calendar_id"
                rows={(dataset.schedule.calendars ?? []) as (Calendar & Record<string, unknown>)[]}
                columns={calendarColumns as ColumnDef<Calendar & Record<string, unknown>>[]}
                issues={issues}
                createRow={() => ({ calendar_id: `CAL-${Date.now()}`, name: 'New calendar', workdays_per_week: 5, notes: '' })}
                onChange={(rows) => updateDataset({ ...dataset, schedule: { ...dataset.schedule, calendars: rows } })}
              />
            )}

            {activeTab === 'milestones' && (
              <EditableTable<Milestone & Record<string, unknown>>
                title="Milestones"
                tableName="milestones"
                idKey="milestone_id"
                rows={(dataset.schedule.milestones ?? []) as (Milestone & Record<string, unknown>)[]}
                columns={milestoneColumns as ColumnDef<Milestone & Record<string, unknown>>[]}
                issues={issues}
                createRow={() => ({ milestone_id: `MS-${Date.now()}`, name: 'New milestone', activity_id: '', target_day: 0 })}
                onChange={(rows) => updateDataset({ ...dataset, schedule: { ...dataset.schedule, milestones: rows } })}
              />
            )}

            {activeTab === 'correlations' && (
              <EditableTable<CorrelationGroup & Record<string, unknown>>
                title="Correlation Groups"
                tableName="correlations"
                idKey="correlation_id"
                rows={(dataset.correlations ?? []) as (CorrelationGroup & Record<string, unknown>)[]}
                columns={correlationColumns as ColumnDef<CorrelationGroup & Record<string, unknown>>[]}
                issues={issues}
                createRow={() => ({ correlation_id: `CORR-${Date.now()}`, name: 'New correlation', target_type: 'activity_duration', target_ids: [], strength: 0.5, notes: '' })}
                onChange={(rows) => updateDataset({ ...dataset, correlations: rows.map((row) => ({ ...row, target_ids: Array.isArray(row.target_ids) ? row.target_ids : String(row.target_ids ?? '').split(',').map((item) => item.trim()).filter(Boolean) })) })}
              />
            )}

            {activeTab === 'json' && (
              <div className="json-preview">
                <h3>Canonical SCURA JSON</h3>
                <pre>{JSON.stringify(dataset, null, 2)}</pre>
              </div>
            )}
          </div>

          <aside className="card side-panel">
            <h2>Validation</h2>
            <ValidationPanel validation={validation} />
            <details>
              <summary>Backend JSON schema loaded</summary>
              <pre>{schema ? JSON.stringify(schema, null, 2) : 'Loading schema...'}</pre>
            </details>
          </aside>
        </section>
      )}
    </main>
  );
}
