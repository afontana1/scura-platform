import { API_BASE_URL } from '../api/client';
import type { SimulationRunWithResult } from '../types/scura';

type HistogramData = { bins?: number[]; counts?: number[] };
type SCurvePoint = { value: number; confidence: number };
type ScatterPoint = { duration: number; cost: number };

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

function metricRows(summary: Record<string, any>) {
  return [
    ['Baseline Duration', days(summary.baseline_duration_days)],
    ['P50 Duration', days(summary.duration_percentiles?.p50)],
    ['P80 Duration', days(summary.duration_percentiles?.p80)],
    ['Schedule Contingency P80', days(summary.schedule_contingency_p80)],
    ['Baseline Cost', dollars(summary.baseline_cost)],
    ['P50 Cost', dollars(summary.cost_percentiles?.p50)],
    ['P80 Cost', dollars(summary.cost_percentiles?.p80)],
    ['Cost Contingency P80', dollars(summary.cost_contingency_p80)],
    ['Target Date Probability', percent(summary.probability_meet_target_duration)],
    ['Target Budget Probability', percent(summary.probability_meet_target_budget)],
    ['Joint Probability', percent(summary.joint_probability)],
    ['Iterations', Number(summary.iterations ?? 0).toLocaleString()],
    ['Engine Version', String(summary.engine_version ?? 'n/a')],
    ['Calendar Mode', String(summary.calendar_mode ?? 'simple_days')]
  ];
}

function summaryCsv(summary: Record<string, any>) {
  const rows = [['Metric', 'Value'], ...metricRows(summary)];
  return rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
}

function BarHistogram({ title, data, formatter }: { title: string; data?: HistogramData; formatter: (value: number) => string }) {
  const bins = data?.bins ?? [];
  const counts = data?.counts ?? [];
  const maxCount = Math.max(1, ...counts);
  const labels = counts.map((_, index) => {
    const low = bins[index] ?? 0;
    const high = bins[index + 1] ?? low;
    return `${formatter(low)}–${formatter(high)}`;
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

export function ResultDashboard({ simulationResult }: { simulationResult: SimulationRunWithResult }) {
  if (!simulationResult.result) return null;
  const { summary, charts, driver_analysis } = simulationResult.result;
  const artifacts = simulationResult.result.artifacts ?? {};
  const riskDrivers = driver_analysis.risk_drivers ?? [];
  const activitySensitivity = driver_analysis.activity_sensitivity ?? [];
  const criticalityIndex = driver_analysis.criticality_index ?? [];
  const milestoneConfidence = driver_analysis.milestone_confidence ?? [];
  const runName = simulationResult.run.run_name.replace(/[^a-z0-9_-]+/gi, '_').toLowerCase();

  return (
    <section className="results-dashboard">
      <div className="card dashboard-header">
        <div>
          <p className="eyebrow dark">SCURA Results Dashboard</p>
          <h2>{simulationResult.run.run_name}</h2>
          <p className="muted">Run status: {simulationResult.run.status} · Worker job: {simulationResult.run.worker_job_id ?? 'n/a'} · Completed: {simulationResult.run.completed_at ? new Date(simulationResult.run.completed_at).toLocaleString() : 'n/a'}</p>
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
        <p>Server-generated report artifacts are available for completed runs. Use the PDF for an executive readout, the Excel workbook for audit/review, and JSON/HTML/CSV for downstream reporting pipelines.</p>
      </div>

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
            <thead><tr><th>Risk</th><th>Runs</th><th>Δ Days</th><th>Δ Cost</th></tr></thead>
            <tbody>
              {riskDrivers.slice(0, 10).map((row: any) => (
                <tr key={row.risk_id}>
                  <td>{row.risk_id}</td>
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
              {Object.keys(summary.duration_percentiles ?? {}).map((key) => (
                <tr key={key}>
                  <td>{key.toUpperCase()}</td>
                  <td>{days(summary.duration_percentiles?.[key])}</td>
                  <td>{dollars(summary.cost_percentiles?.[key])}</td>
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
              {criticalityIndex.slice(0, 10).map((row: any) => (
                <tr key={row.activity_id}>
                  <td>{row.activity_id}</td>
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
              {activitySensitivity.slice(0, 10).map((row: any) => (
                <tr key={row.activity_id}>
                  <td>{row.activity_id}</td>
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
            {milestoneConfidence.map((row: any) => (
              <tr key={row.milestone_id}>
                <td>{row.name}</td>
                <td>{row.activity_id}</td>
                <td>{row.target_day == null ? 'n/a' : days(row.target_day)}</td>
                <td>{percent(row.probability_meet_target)}</td>
                <td>{days(row.percentiles?.p50)}</td>
                <td>{days(row.percentiles?.p80)}</td>
              </tr>
            ))}
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
