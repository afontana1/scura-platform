import type { ValidationResponse } from '../types/scura';

export function ValidationPanel({ validation }: { validation: ValidationResponse | null }) {
  if (!validation) {
    return <div className="validation-panel empty">Run validation to see schema, reference, and business-rule checks.</div>;
  }

  return (
    <div className="validation-panel">
      <div className="validation-summary">
        <strong>{validation.valid ? 'Valid dataset' : 'Validation issues found'}</strong>
        <span>{validation.error_count} errors</span>
        <span>{validation.warning_count} warnings</span>
      </div>
      <div className="issue-list">
        {validation.issues.length === 0 && <p>No issues found.</p>}
        {validation.issues.map((issue, index) => (
          <div key={`${issue.code}-${index}`} className={`issue ${issue.severity}`}>
            <div><strong>{issue.severity.toUpperCase()}</strong> · {issue.table} · {issue.row_id ?? 'table'} · {issue.field ?? 'field'}</div>
            <p>{issue.message}</p>
            <code>{issue.code}</code>
          </div>
        ))}
      </div>
    </div>
  );
}
