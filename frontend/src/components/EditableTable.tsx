import type { ColumnDef, ValidationIssue } from '../types/scura';

type EditableTableProps<T extends Record<string, unknown>> = {
  title: string;
  tableName: string;
  idKey: keyof T & string;
  rows: T[];
  columns: ColumnDef<T>[];
  issues: ValidationIssue[];
  onChange: (rows: T[]) => void;
  createRow: () => T;
};

function parseValue(value: string, type?: string): unknown {
  if (type === 'number') {
    if (value.trim() === '') return 0;
    const parsed = Number(value);
    return Number.isNaN(parsed) ? value : parsed;
  }
  return value;
}

export function EditableTable<T extends Record<string, unknown>>({
  title,
  tableName,
  idKey,
  rows,
  columns,
  issues,
  onChange,
  createRow
}: EditableTableProps<T>) {
  const tableIssues = issues.filter((issue) => issue.table === tableName);

  function issueFor(row: T, field: string) {
    const rowId = String(row[idKey] ?? '');
    return tableIssues.find((issue) => issue.row_id === rowId && issue.field === field);
  }

  function rowIssues(row: T) {
    const rowId = String(row[idKey] ?? '');
    return tableIssues.filter((issue) => issue.row_id === rowId || issue.row_id == null);
  }

  function updateCell(rowIndex: number, key: keyof T & string, value: unknown) {
    const next = rows.map((row, index) => index === rowIndex ? { ...row, [key]: value } : row);
    onChange(next);
  }

  function removeRow(rowIndex: number) {
    onChange(rows.filter((_, index) => index !== rowIndex));
  }

  return (
    <section className="table-section">
      <div className="table-heading">
        <div>
          <h3>{title}</h3>
          <p>{rows.length} rows · {tableIssues.length} validation notes</p>
        </div>
        <button onClick={() => onChange([...rows, createRow()])}>Add row</button>
      </div>
      <div className="table-scroll">
        <table className="editable-table">
          <thead>
            <tr>
              {columns.map((column) => <th key={column.key}>{column.label}</th>)}
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={`${String(row[idKey])}-${rowIndex}`} className={rowIssues(row).some((issue) => issue.severity === 'error') ? 'row-error' : rowIssues(row).length ? 'row-warning' : ''}>
                {columns.map((column) => {
                  const issue = issueFor(row, column.key);
                  return (
                    <td key={column.key} className={issue ? `cell-${issue.severity}` : ''} title={issue?.message ?? ''}>
                      {column.type === 'select' ? (
                        <select
                          value={String(row[column.key] ?? '')}
                          onChange={(event) => updateCell(rowIndex, column.key, event.target.value)}
                        >
                          {(column.options ?? []).map((option) => <option key={option} value={option}>{option}</option>)}
                        </select>
                      ) : (
                        <input
                          type={column.type === 'number' ? 'number' : 'text'}
                          value={String(row[column.key] ?? '')}
                          onChange={(event) => updateCell(rowIndex, column.key, parseValue(event.target.value, column.type))}
                        />
                      )}
                    </td>
                  );
                })}
                <td><button className="secondary" onClick={() => removeRow(rowIndex)}>Delete</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {tableIssues.length > 0 && (
        <ul className="table-issues">
          {tableIssues.slice(0, 5).map((issue, index) => (
            <li key={`${issue.code}-${index}`} className={issue.severity}>{issue.row_id ?? 'table'} · {issue.field ?? 'field'} · {issue.message}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
