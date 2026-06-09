import type { Scenario, ScenarioAuditEvent, ScenarioComparisonRead } from '../types/scura';

interface Props {
  scenarios: Scenario[];
  selectedScenarioId: string;
  comparison: ScenarioComparisonRead | null;
  auditEvents: ScenarioAuditEvent[];
  selectedCompareIds: string[];
  onSelectedCompareIdsChange: (ids: string[]) => void;
  onDuplicate: () => void;
  onCompare: () => void;
  onRefreshAudit: () => void;
}

function formatMetric(value: unknown) {
  if (typeof value === 'number') {
    if (Math.abs(value) >= 100000) return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
    return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
  return value == null ? '—' : String(value);
}

export function ScenarioManagement({
  scenarios,
  selectedScenarioId,
  comparison,
  auditEvents,
  selectedCompareIds,
  onSelectedCompareIdsChange,
  onDuplicate,
  onCompare,
  onRefreshAudit
}: Props) {
  function toggleScenario(id: string, checked: boolean) {
    if (checked) onSelectedCompareIdsChange([...selectedCompareIds, id]);
    else onSelectedCompareIdsChange(selectedCompareIds.filter((item) => item !== id));
  }

  return (
    <section className="card">
      <h2>Scenario Management</h2>
      <p className="muted">Duplicate scenarios, compare alternatives, review version history, and inspect audit trail events.</p>
      <div className="toolbar">
        <button disabled={!selectedScenarioId} onClick={onDuplicate}>Duplicate Selected Scenario</button>
        <button disabled={selectedCompareIds.length < 2} onClick={onCompare}>Compare Selected Scenarios</button>
        <button disabled={!selectedScenarioId} className="secondary" onClick={onRefreshAudit}>Refresh Audit Trail</button>
      </div>

      <div className="compare-picker">
        <h3>Choose scenarios to compare</h3>
        {scenarios.map((scenario) => (
          <label key={scenario.id} className="checkbox-row">
            <input
              type="checkbox"
              checked={selectedCompareIds.includes(scenario.id)}
              onChange={(event) => toggleScenario(scenario.id, event.target.checked)}
            />
            <span>{scenario.name} · v{scenario.version}</span>
          </label>
        ))}
      </div>

      {comparison && (
        <div className="comparison-table-wrap">
          <h3>Scenario Comparison</h3>
          <table className="data-table compact-table">
            <thead>
              <tr>
                <th>Scenario</th>
                <th>Version</th>
                <th>Activities</th>
                <th>Costs</th>
                <th>Risks</th>
                <th>P80 Duration</th>
                <th>P80 Cost</th>
                <th>Joint Probability</th>
              </tr>
            </thead>
            <tbody>
              {comparison.items.map((item) => (
                <tr key={item.scenario.id}>
                  <td>{item.scenario.name}</td>
                  <td>{item.scenario.version}</td>
                  <td>{item.dataset_stats.activities}</td>
                  <td>{item.dataset_stats.cost_items}</td>
                  <td>{item.dataset_stats.risk_events}</td>
                  <td>{formatMetric(item.latest_completed_run?.duration_p80)}</td>
                  <td>{formatMetric(item.latest_completed_run?.cost_p80)}</td>
                  <td>{formatMetric(item.latest_completed_run?.joint_probability)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="audit-list">
        <h3>Selected Scenario Audit Trail</h3>
        {auditEvents.length === 0 ? <p className="muted">No audit events loaded yet.</p> : auditEvents.slice(0, 10).map((event) => (
          <div key={event.id} className="audit-event">
            <strong>{event.action}</strong> <span className="muted">{event.entity_type} · {new Date(event.created_at).toLocaleString()}</span>
            <pre>{JSON.stringify(event.details_json, null, 2)}</pre>
          </div>
        ))}
      </div>
    </section>
  );
}
