import { API_BASE_URL } from '../api/client';
import type { Relationship, ScuraDataset, SimulationRunWithResult } from '../types/scura';

type HistogramData = { bins?: number[]; counts?: number[] };
type SCurvePoint = { value: number; confidence: number };
type ScatterPoint = { duration: number; cost: number };
type GanttBand = {
  activity_id: string;
  name: string;
  status: string;
  p10_start: number;
  p50_start: number;
  p90_start: number;
  p10_finish: number;
  p50_finish: number;
  p90_finish: number;
  mean_duration: number;
  criticality: number;
};
type PositionedNode = {
  id: string;
  label: string;
  level: number;
  order: number;
  x: number;
  y: number;
};

function dollars(value: unknown) {
  const number = Number(value ?? 0);
  return `$${Math.round(number).toLocaleString()}`;
}

function days(value: unknown) {
  const number = Number(value ?? 0);
  return `${number.toFixed(1)} days`;
}

function percent(value: unknown) {
  if (value === null || value === undefined) return 'n/a';
  return `${(Number(value) * 100).toFixed(1)}%`;
}

function downloadText(filename: string, content: string, mime = 'text/plain') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function metricRows(summary: Record<string, unknown>) {
  return [
    ['Baseline Duration', days(summary.baseline_duration_days)],
    ['P50 Duration', days((summary.duration_percentiles as Record<string, number> | undefined)?.p50)],
    ['P80 Duration', days((summary.duration_percentiles as Record<string, number> | undefined)?.p80)],
    ['Schedule Contingency P80', days(summary.schedule_contingency_p80)],
    ['Baseline Cost', dollars(summary.baseline_cost)],
    ['P50 Cost', dollars((summary.cost_percentiles as Record<string, number> | undefined)?.p50)],
    ['P80 Cost', dollars((summary.cost_percentiles as Record<string, number> | undefined)?.p80)],
    ['Cost Contingency P80', dollars(summary.cost_contingency_p80)],
    ['Target Date Probability', percent(summary.probability_meet_target_duration)],
    ['Target Budget Probability', percent(summary.probability_meet_target_budget)],
    ['Joint Probability', percent(summary.joint_probability)],
    ['Iterations', Number(summary.iterations ?? 0).toLocaleString()],
    ['Engine Version', String(summary.engine_version ?? 'n/a')],
    ['Calendar Mode', String(summary.calendar_mode ?? 'simple_days')]
  ];
}

function summaryCsv(summary: Record<string, unknown>) {
  const rows = [['Metric', 'Value'], ...metricRows(summary)];
  return rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
}

function buildDependencyLayout(dataset?: ScuraDataset | null): { nodes: PositionedNode[]; edges: Relationship[] } {
  if (!dataset) return { nodes: [], edges: [] };
  const activities = dataset.schedule.activities;
  const relationships = dataset.schedule.relationships;
  const indegree = new Map<string, number>();
  const successors = new Map<string, string[]>();

  for (const activity of activities) {
    indegree.set(activity.activity_id, 0);
    successors.set(activity.activity_id, []);
  }

  for (const relationship of relationships) {
    if (!indegree.has(relationship.predecessor_activity_id) || !indegree.has(relationship.successor_activity_id)) continue;
    indegree.set(relationship.successor_activity_id, (indegree.get(relationship.successor_activity_id) ?? 0) + 1);
    successors.get(relationship.predecessor_activity_id)?.push(relationship.successor_activity_id);
  }

  const queue = activities.filter((activity) => (indegree.get(activity.activity_id) ?? 0) === 0).map((activity) => activity.activity_id);
  const levelMap = new Map<string, number>();
  for (const activity of activities) levelMap.set(activity.activity_id, 0);

  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentLevel = levelMap.get(current) ?? 0;
    for (const successor of successors.get(current) ?? []) {
      levelMap.set(successor, Math.max(levelMap.get(successor) ?? 0, currentLevel + 1));
      indegree.set(successor, (indegree.get(successor) ?? 1) - 1);
      if ((indegree.get(successor) ?? 0) === 0) queue.push(successor);
    }
  }

  const columns = new Map<number, string[]>();
  for (const activity of activities) {
    const level = levelMap.get(activity.activity_id) ?? 0;
    const bucket = columns.get(level) ?? [];
    bucket.push(activity.activity_id);
    columns.set(level, bucket);
  }

  const nodeWidth = 168;
  const columnGap = 88;
  const rowGap = 86;
  const nodes = activities.map((activity) => {
    const level = levelMap.get(activity.activity_id) ?? 0;
    const order = (columns.get(level) ?? []).indexOf(activity.activity_id);
    return {
      id: activity.activity_id,
      label: activity.name || activity.activity_id,
      level,
      order,
      x: 24 + level * (nodeWidth + columnGap),
      y: 28 + order * rowGap
    };
  });

  return { nodes, edges: relationships };
}

function BarHistogram({ title, data, formatter }: { title: string; data?: HistogramData; formatter: (value: number) => string }) {
  const bins = data?.bins ?? [];
  const counts = data?.counts ?? [];
  const maxCount = Math.max(1, ...counts);
  const labels = counts.map((_, index) => {
    const low = bins[index] ?? 0;
    const high = bins[index + 1] ?? low;
    return `${formatter(low)}-${formatter(high)}`;
  });

  return (
    <div className="chart-card">
      <h3>{title}</h3>
      <div className="histogram" role="img" aria-label={title}>
        {counts.map((count, index) => (
          <div key={index} className="histogram-bar-wrap" title={`${labels[index]}: ${count}`}>
            <div className="histogram-bar" style={{ height: `${Math.max(3, (count / maxCount) * 100)}%` }} />
          </div>
        ))}
      </div>
      <div className="chart-footnote">
        <span>{labels[0] ?? 'n/a'}</span>
        <span>{labels[labels.length - 1] ?? 'n/a'}</span>
      </div>
    </div>
  );
}

function SCurve({ title, points, formatter }: { title: string; points?: SCurvePoint[]; formatter: (value: number) => string }) {
  const values = points ?? [];
  const width = 640;
  const height = 220;
  const margin = 28;
  const minX = Math.min(...values.map((p) => p.value), 0);
  const maxX = Math.max(...values.map((p) => p.value), 1);
  const range = maxX - minX || 1;
  const polyline = values
    .map((point) => {
      const x = margin + ((point.value - minX) / range) * (width - margin * 2);
      const y = height - margin - point.confidence * (height - margin * 2);
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <div className="chart-card">
      <h3>{title}</h3>
      <svg className="line-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={title}>
        <line x1={margin} y1={height - margin} x2={width - margin} y2={height - margin} />
        <line x1={margin} y1={margin} x2={margin} y2={height - margin} />
        <polyline points={polyline} fill="none" strokeWidth="3" />
      </svg>
      <div className="chart-footnote"><span>{formatter(minX)}</span><span>{formatter(maxX)}</span></div>
    </div>
  );
}

function ScatterPlot({ points }: { points?: ScatterPoint[] }) {
  const values = points ?? [];
  const width = 640;
  const height = 260;
  const margin = 30;
  const minDuration = Math.min(...values.map((p) => p.duration), 0);
  const maxDuration = Math.max(...values.map((p) => p.duration), 1);
  const minCost = Math.min(...values.map((p) => p.cost), 0);
  const maxCost = Math.max(...values.map((p) => p.cost), 1);
  const durationRange = maxDuration - minDuration || 1;
  const costRange = maxCost - minCost || 1;

  return (
    <div className="chart-card wide-chart">
      <h3>Cost vs. Schedule Scatter</h3>
      <svg className="scatter-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Cost versus schedule scatter plot">
        <line x1={margin} y1={height - margin} x2={width - margin} y2={height - margin} />
        <line x1={margin} y1={margin} x2={margin} y2={height - margin} />
        {values.map((point, index) => {
          const x = margin + ((point.duration - minDuration) / durationRange) * (width - margin * 2);
          const y = height - margin - ((point.cost - minCost) / costRange) * (height - margin * 2);
          return <circle key={index} cx={x} cy={y} r="2" />;
        })}
      </svg>
      <div className="chart-footnote">
        <span>{days(minDuration)} / {dollars(minCost)}</span>
        <span>{days(maxDuration)} / {dollars(maxCost)}</span>
      </div>
    </div>
  );
}

function DependencyGraph({ dataset }: { dataset?: ScuraDataset | null }) {
  const { nodes, edges } = buildDependencyLayout(dataset);
  if (nodes.length === 0) return null;

  const nodeWidth = 168;
  const nodeHeight = 54;
  const width = Math.max(720, ...nodes.map((node) => node.x + nodeWidth + 24));
  const height = Math.max(240, ...nodes.map((node) => node.y + nodeHeight + 24));
  const byId = new Map(nodes.map((node) => [node.id, node]));

  return (
    <div className="chart-card schedule-card wide-chart">
      <div className="schedule-card-header">
        <div>
          <p className="eyebrow dark">Dependency Network</p>
          <h3>Schedule structure and task relationships</h3>
        </div>
        <p className="muted">Activities are layered by dependency depth, with relationship type and lag shown on each link.</p>
      </div>
      <div className="schedule-canvas">
        <svg className="network-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Dependency graph">
          <defs>
            <marker id="arrowhead-network" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" />
            </marker>
          </defs>
          {edges.map((edge) => {
            const source = byId.get(edge.predecessor_activity_id);
            const target = byId.get(edge.successor_activity_id);
            if (!source || !target) return null;
            const startX = source.x + nodeWidth;
            const startY = source.y + nodeHeight / 2;
            const endX = target.x;
            const endY = target.y + nodeHeight / 2;
            const midX = startX + (endX - startX) / 2;
            const path = `M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}`;
            return (
              <g key={edge.relationship_id}>
                <path className="network-edge" d={path} markerEnd="url(#arrowhead-network)" />
                <text className="network-edge-label" x={midX} y={(startY + endY) / 2 - 6}>
                  {edge.relationship_type}{edge.lag_days ? ` ${edge.lag_days > 0 ? '+' : ''}${edge.lag_days}d` : ''}
                </text>
              </g>
            );
          })}
          {nodes.map((node) => (
            <g key={node.id} transform={`translate(${node.x}, ${node.y})`}>
              <rect className="network-node" width={nodeWidth} height={nodeHeight} rx="18" ry="18" />
              <text className="network-node-id" x="14" y="20">{node.id}</text>
              <text className="network-node-label" x="14" y="38">{node.label.slice(0, 24)}</text>
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}

function LogicGateDiagram({ dataset }: { dataset?: ScuraDataset | null }) {
  if (!dataset) return null;
  const incoming = new Map<string, Relationship[]>();
  for (const relationship of dataset.schedule.relationships) {
    const list = incoming.get(relationship.successor_activity_id) ?? [];
    list.push(relationship);
    incoming.set(relationship.successor_activity_id, list);
  }

  const gateRows = dataset.schedule.activities
    .map((activity) => ({ activity, inputs: incoming.get(activity.activity_id) ?? [] }))
    .filter((row) => row.inputs.length > 1)
    .slice(0, 6);

  const correlationRows = dataset.correlations.slice(0, 4);

  return (
    <div className="chart-card schedule-card">
      <div className="schedule-card-header">
        <div>
          <p className="eyebrow dark">Logic / Rule Layer</p>
          <h3>Constraint fan-in, gates, and modeled rules</h3>
        </div>
        <p className="muted">The dataset encodes deterministic fan-in as AND-style gating. Correlations and risk impacts are separate uncertainty rules applied later.</p>
      </div>
      <div className="logic-gate-list">
        {gateRows.length === 0 && correlationRows.length === 0 && <p className="muted">No multi-predecessor gates or correlation groups are configured.</p>}
        {gateRows.map(({ activity, inputs }) => (
          <div key={activity.activity_id} className="logic-row">
            <div className="logic-pill-group">
              {inputs.map((input) => (
                <span key={input.relationship_id} className="logic-pill">
                  {input.predecessor_activity_id} {input.relationship_type}
                </span>
              ))}
            </div>
            <div className="logic-gate">AND</div>
            <div className="logic-target">
              <strong>{activity.activity_id}</strong>
              <span>{activity.name}</span>
            </div>
          </div>
        ))}
        {correlationRows.map((group) => (
          <div key={group.correlation_id} className="logic-row correlation-row">
            <div className="logic-pill-group">
              {group.target_ids.slice(0, 4).map((targetId) => (
                <span key={targetId} className="logic-pill secondary-pill">{targetId}</span>
              ))}
            </div>
            <div className="logic-gate">{Math.round(group.strength * 100)}%</div>
            <div className="logic-target">
              <strong>{group.name}</strong>
              <span>{group.target_type.replace(/_/g, ' ')}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StateMachineView({ dataset }: { dataset?: ScuraDataset | null }) {
  if (!dataset) return null;
  const counts = {
    not_started: dataset.schedule.activities.filter((activity) => activity.status === 'not_started').length,
    in_progress: dataset.schedule.activities.filter((activity) => activity.status === 'in_progress').length,
    complete: dataset.schedule.activities.filter((activity) => activity.status === 'complete').length
  };

  return (
    <div className="chart-card schedule-card">
      <div className="schedule-card-header">
        <div>
          <p className="eyebrow dark">Finite State Machine</p>
          <h3>Workflow state coverage</h3>
        </div>
        <p className="muted">The current model exposes activity execution state directly: not started, in progress, and complete.</p>
      </div>
      <svg className="fsm-svg" viewBox="0 0 780 220" role="img" aria-label="Activity state machine">
        <defs>
          <marker id="arrowhead-fsm" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
            <path d="M 0 0 L 10 5 L 0 10 z" />
          </marker>
        </defs>
        <line className="fsm-edge" x1="220" y1="110" x2="320" y2="110" markerEnd="url(#arrowhead-fsm)" />
        <line className="fsm-edge" x1="460" y1="110" x2="560" y2="110" markerEnd="url(#arrowhead-fsm)" />
        <path className="fsm-edge dashed" d="M 610 82 C 640 34, 480 26, 430 68" markerEnd="url(#arrowhead-fsm)" />
        <g transform="translate(40, 58)">
          <rect className="fsm-node state-not-started" width="180" height="104" rx="24" ry="24" />
          <text className="fsm-node-title" x="20" y="34">Not Started</text>
          <text className="fsm-node-value" x="20" y="62">{counts.not_started} activities</text>
          <text className="fsm-node-copy" x="20" y="84">Waiting on logic gates and predecessors</text>
        </g>
        <g transform="translate(300, 58)">
          <rect className="fsm-node state-in-progress" width="180" height="104" rx="24" ry="24" />
          <text className="fsm-node-title" x="20" y="34">In Progress</text>
          <text className="fsm-node-value" x="20" y="62">{counts.in_progress} activities</text>
          <text className="fsm-node-copy" x="20" y="84">Remaining duration drives sampled finish</text>
        </g>
        <g transform="translate(560, 58)">
          <rect className="fsm-node state-complete" width="180" height="104" rx="24" ry="24" />
          <text className="fsm-node-title" x="20" y="34">Complete</text>
          <text className="fsm-node-value" x="20" y="62">{counts.complete} activities</text>
          <text className="fsm-node-copy" x="20" y="84">Modeled as zero remaining duration</text>
        </g>
      </svg>
    </div>
  );
}

function ProbabilisticGantt({ dataset, rows }: { dataset?: ScuraDataset | null; rows?: GanttBand[] }) {
  const bands = (rows ?? []).slice(0, 18);
  if (!dataset || bands.length === 0) return null;

  const relationships = dataset.schedule.relationships.filter((relationship) =>
    bands.some((row) => row.activity_id === relationship.predecessor_activity_id) &&
    bands.some((row) => row.activity_id === relationship.successor_activity_id)
  );
  const rowMap = new Map(bands.map((row, index) => [row.activity_id, { row, index }]));
  const minDay = Math.min(...bands.map((row) => row.p10_start), 0);
  const maxDay = Math.max(...bands.map((row) => row.p90_finish), 1);
  const width = 1060;
  const labelWidth = 220;
  const chartWidth = width - labelWidth - 36;
  const rowHeight = 34;
  const top = 54;
  const height = top + bands.length * rowHeight + 34;
  const xForDay = (day: number) => labelWidth + ((day - minDay) / (maxDay - minDay || 1)) * chartWidth;

  const ticks = Array.from({ length: 6 }, (_, index) => minDay + ((maxDay - minDay) * index) / 5);

  return (
    <div className="chart-card schedule-card wide-chart">
      <div className="schedule-card-header">
        <div>
          <p className="eyebrow dark">Probabilistic Gantt</p>
          <h3>P10 / P50 / P90 schedule with dependency arrows</h3>
        </div>
        <p className="muted">Translucent bars show the P10-P90 finish window, bold bars show the P50 schedule, and arrows follow the dependency network for the visible activities.</p>
      </div>
      <div className="schedule-canvas">
        <svg className="gantt-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Probabilistic gantt chart">
          <defs>
            <marker id="arrowhead-gantt" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
              <path d="M 0 0 L 10 5 L 0 10 z" />
            </marker>
          </defs>
          {ticks.map((tick, index) => {
            const x = xForDay(tick);
            return (
              <g key={index}>
                <line className="gantt-grid-line" x1={x} y1="30" x2={x} y2={height - 20} />
                <text className="gantt-tick" x={x} y="20" textAnchor="middle">Day {tick.toFixed(0)}</text>
              </g>
            );
          })}
          {bands.map((row, index) => {
            const y = top + index * rowHeight;
            return (
              <g key={row.activity_id}>
                <text className="gantt-label-id" x="18" y={y + 14}>{row.activity_id}</text>
                <text className="gantt-label-name" x="18" y={y + 28}>{row.name.slice(0, 30)}</text>
                <rect className={`gantt-band status-${row.status}`} x={xForDay(row.p10_start)} y={y + 6} width={Math.max(6, xForDay(row.p90_finish) - xForDay(row.p10_start))} height="16" rx="8" ry="8" />
                <rect className="gantt-band-median" x={xForDay(row.p50_start)} y={y + 8} width={Math.max(4, xForDay(row.p50_finish) - xForDay(row.p50_start))} height="12" rx="6" ry="6" />
                <circle className="gantt-point" cx={xForDay(row.p10_finish)} cy={y + 14} r="3.5" />
                <circle className="gantt-point median" cx={xForDay(row.p50_finish)} cy={y + 14} r="4" />
                <text className="gantt-meta" x={width - 8} y={y + 18} textAnchor="end">
                  {percent(row.criticality)} critical
                </text>
              </g>
            );
          })}
          {relationships.map((relationship) => {
            const source = rowMap.get(relationship.predecessor_activity_id);
            const target = rowMap.get(relationship.successor_activity_id);
            if (!source || !target) return null;
            const startX = xForDay(source.row.p50_finish);
            const startY = top + source.index * rowHeight + 14;
            const endX = xForDay(target.row.p50_start);
            const endY = top + target.index * rowHeight + 14;
            const elbowX = Math.max(startX + 20, (startX + endX) / 2);
            const path = `M ${startX} ${startY} C ${elbowX} ${startY}, ${elbowX} ${endY}, ${endX} ${endY}`;
            return (
              <g key={relationship.relationship_id}>
                <path className="gantt-dependency" d={path} markerEnd="url(#arrowhead-gantt)" />
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

export function ResultDashboard({
  simulationResult,
  dataset
}: {
  simulationResult: SimulationRunWithResult;
  dataset?: ScuraDataset | null;
}) {
  if (!simulationResult.result) return null;
  const { summary, charts, driver_analysis } = simulationResult.result;
  const artifacts = simulationResult.result.artifacts ?? {};
  const riskDrivers = driver_analysis.risk_drivers ?? [];
  const activitySensitivity = driver_analysis.activity_sensitivity ?? [];
  const criticalityIndex = driver_analysis.criticality_index ?? [];
  const milestoneConfidence = driver_analysis.milestone_confidence ?? [];
  const runName = simulationResult.run.run_name.replace(/[^a-z0-9_-]+/gi, '_').toLowerCase();
  const ganttRows = (charts.probabilistic_gantt ?? []) as GanttBand[];

  return (
    <section className="results-dashboard">
      <div className="card dashboard-header">
        <div>
          <p className="eyebrow dark">SCURA Results Dashboard</p>
          <h2>{simulationResult.run.run_name}</h2>
          <p className="muted">Run status: {simulationResult.run.status} | Worker job: {simulationResult.run.worker_job_id ?? 'n/a'} | Completed: {simulationResult.run.completed_at ? new Date(simulationResult.run.completed_at).toLocaleString() : 'n/a'}</p>
        </div>
        <div className="actions">
          <a className="button-link primary-report" href={`${API_BASE_URL}/api/simulation-runs/${simulationResult.run.id}/reports/pdf`}>Executive PDF</a>
          <a className="button-link primary-report" href={`${API_BASE_URL}/api/simulation-runs/${simulationResult.run.id}/reports/xlsx`}>Audit Excel</a>
          <a className="button-link" href={`${API_BASE_URL}/api/simulation-runs/${simulationResult.run.id}/reports/html`}>HTML Report</a>
          <a className="button-link" href={`${API_BASE_URL}/api/simulation-runs/${simulationResult.run.id}/reports/csv`}>Summary CSV</a>
          <a className="button-link" href={`${API_BASE_URL}/api/simulation-runs/${simulationResult.run.id}/reports/json`}>Report JSON</a>
          <button className="secondary" onClick={() => downloadText(`${runName}_summary.csv`, summaryCsv(summary), 'text/csv')}>Quick CSV</button>
          <button className="secondary" onClick={() => downloadText(`${runName}_results.json`, JSON.stringify(simulationResult.result, null, 2), 'application/json')}>Raw JSON</button>
          {artifacts.iterations_csv && <a className="button-link" href={`${API_BASE_URL}/api/simulation-runs/${simulationResult.run.id}/artifacts/iterations_csv`}>Iterations CSV</a>}
          {artifacts.iterations_jsonl && <a className="button-link" href={`${API_BASE_URL}/api/simulation-runs/${simulationResult.run.id}/artifacts/iterations_jsonl`}>Iterations JSONL</a>}
        </div>
      </div>

      <div className="card report-note">
        <h2>Report Package</h2>
        <p>Server-generated report artifacts are available for completed runs. Use the PDF for an executive readout, the Excel workbook for audit and review, and JSON, HTML, or CSV for downstream reporting pipelines.</p>
      </div>

      {dataset && (
        <section className="schedule-stack">
          <div className="card schedule-stack-card">
            <h2>Project Schedule Model</h2>
            <div className="schedule-flow">
              <div className="flow-step">
                <strong>Dependency Network</strong>
                <span>What depends on what</span>
              </div>
              <div className="flow-arrow">v</div>
              <div className="flow-step">
                <strong>Logic / Rule Layer</strong>
                <span>AND gates, correlations, constraints</span>
              </div>
              <div className="flow-arrow">v</div>
              <div className="flow-step">
                <strong>Monte Carlo Simulation</strong>
                <span>Duration and cost uncertainty</span>
              </div>
              <div className="flow-arrow">v</div>
              <div className="flow-step accent-step">
                <strong>Probabilistic Gantt</strong>
                <span>P10 / P50 / P90 schedule</span>
              </div>
            </div>
          </div>

          <DependencyGraph dataset={dataset} />
          <div className="schedule-grid">
            <LogicGateDiagram dataset={dataset} />
            <StateMachineView dataset={dataset} />
          </div>
          <ProbabilisticGantt dataset={dataset} rows={ganttRows} />
        </section>
      )}

      <div className="card">
        <h2>Confidence Summary</h2>
        <div className="metric-grid large">
          {metricRows(summary).map(([label, value]) => (
            <div key={label}><strong>{label}</strong><span>{value}</span></div>
          ))}
        </div>
      </div>

      <div className="chart-grid">
        <BarHistogram title="Duration Histogram" data={charts.duration_histogram} formatter={(value) => `${value.toFixed(0)}d`} />
        <BarHistogram title="Cost Histogram" data={charts.cost_histogram} formatter={(value) => `$${Math.round(value / 1000)}k`} />
        <SCurve title="Duration S-Curve" points={charts.duration_s_curve} formatter={(value) => `${value.toFixed(0)}d`} />
        <SCurve title="Cost S-Curve" points={charts.cost_s_curve} formatter={(value) => `$${Math.round(value / 1000)}k`} />
        <ScatterPlot points={charts.cost_schedule_scatter} />
      </div>

      <div className="grid two">
        <div className="card">
          <h2>Top Risk Drivers</h2>
          <table className="compact-table">
            <thead><tr><th>Risk</th><th>Runs</th><th>Delta Days</th><th>Delta Cost</th></tr></thead>
            <tbody>
              {riskDrivers.slice(0, 10).map((row: Record<string, unknown>) => (
                <tr key={String(row.risk_id)}>
                  <td>{String(row.risk_id)}</td>
                  <td>{Number(row.occurrence_count).toLocaleString()}</td>
                  <td>{Number(row.duration_delta).toFixed(1)}</td>
                  <td>{dollars(row.cost_delta)}</td>
                </tr>
              ))}
              {riskDrivers.length === 0 && <tr><td colSpan={4}>No risk-driver rows were available for this run.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="card">
          <h2>Percentile Table</h2>
          <table className="compact-table">
            <thead><tr><th>Confidence</th><th>Duration</th><th>Cost</th></tr></thead>
            <tbody>
              {Object.keys((summary.duration_percentiles as Record<string, number> | undefined) ?? {}).map((key) => (
                <tr key={key}>
                  <td>{key.toUpperCase()}</td>
                  <td>{days((summary.duration_percentiles as Record<string, number> | undefined)?.[key])}</td>
                  <td>{dollars((summary.cost_percentiles as Record<string, number> | undefined)?.[key])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid two">
        <div className="card">
          <h2>Criticality Index</h2>
          <table className="compact-table">
            <thead><tr><th>Activity</th><th>Criticality</th></tr></thead>
            <tbody>
              {criticalityIndex.slice(0, 10).map((row: Record<string, unknown>) => (
                <tr key={String(row.activity_id)}>
                  <td>{String(row.activity_id)}</td>
                  <td>{percent(row.criticality)}</td>
                </tr>
              ))}
              {criticalityIndex.length === 0 && <tr><td colSpan={2}>No criticality rows were available.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="card">
          <h2>Activity Sensitivity</h2>
          <table className="compact-table">
            <thead><tr><th>Activity</th><th>Duration Corr.</th><th>Cost Corr.</th></tr></thead>
            <tbody>
              {activitySensitivity.slice(0, 10).map((row: Record<string, unknown>) => (
                <tr key={String(row.activity_id)}>
                  <td>{String(row.activity_id)}</td>
                  <td>{Number(row.duration_correlation).toFixed(3)}</td>
                  <td>{Number(row.cost_correlation).toFixed(3)}</td>
                </tr>
              ))}
              {activitySensitivity.length === 0 && <tr><td colSpan={3}>No sensitivity rows were available.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h2>Milestone Confidence</h2>
        <table className="compact-table">
          <thead><tr><th>Milestone</th><th>Activity</th><th>Target</th><th>Probability</th><th>P50</th><th>P80</th></tr></thead>
          <tbody>
            {milestoneConfidence.map((row: Record<string, unknown>) => {
              const percentiles = (row.percentiles as Record<string, number> | undefined) ?? {};
              return (
                <tr key={String(row.milestone_id)}>
                  <td>{String(row.name)}</td>
                  <td>{String(row.activity_id)}</td>
                  <td>{row.target_day == null ? 'n/a' : days(row.target_day)}</td>
                  <td>{percent(row.probability_meet_target)}</td>
                  <td>{days(percentiles.p50)}</td>
                  <td>{days(percentiles.p80)}</td>
                </tr>
              );
            })}
            {milestoneConfidence.length === 0 && <tr><td colSpan={6}>No milestone rows were configured for this scenario.</td></tr>}
          </tbody>
        </table>
      </div>

      <details className="card raw-json">
        <summary>Raw result JSON</summary>
        <pre>{JSON.stringify(simulationResult.result, null, 2)}</pre>
      </details>
    </section>
  );
}
