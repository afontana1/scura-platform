import { useState } from 'react';
import { apiPost, apiPostForm } from '../api/client';
import type { ImportPreview, ScenarioDatasetRecord, ScuraDataset } from '../types/scura';
import { ValidationPanel } from './ValidationPanel';

type ImportWizardProps = {
  scenarioId: string;
  onDatasetImported: (dataset: ScuraDataset, record: ScenarioDatasetRecord) => void;
  onError: (message: string) => void;
  onMessage: (message: string) => void;
};

export function ImportWizard({ scenarioId, onDatasetImported, onError, onMessage }: ImportWizardProps) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [uploading, setUploading] = useState(false);
  const [committing, setCommitting] = useState(false);

  async function uploadWorkbook() {
    if (!file) return;
    setUploading(true);
    onError('');
    try {
      const form = new FormData();
      form.append('file', file);
      const result = await apiPostForm<ImportPreview>('/api/imports/excel', form);
      setPreview(result);
      onMessage(result.validation.valid ? 'Import parsed and validated.' : 'Import parsed with validation issues.');
    } catch (err) {
      onError(String(err));
    } finally {
      setUploading(false);
    }
  }

  async function commitImport() {
    if (!preview || !scenarioId) return;
    setCommitting(true);
    onError('');
    try {
      const saved = await apiPost<ScenarioDatasetRecord>(`/api/imports/${preview.import_id}/commit`, {
        scenario_id: scenarioId,
        replace_existing: true
      });
      onDatasetImported(saved.dataset_json, saved);
      onMessage(preview.validation.valid ? 'Import committed to scenario.' : 'Import committed with validation issues.');
    } catch (err) {
      onError(String(err));
    } finally {
      setCommitting(false);
    }
  }

  return (
    <section className="card import-wizard">
      <div className="table-heading">
        <div>
          <h2>Spreadsheet import</h2>
          <p>Excel is parsed into canonical SCURA JSON, validated, previewed, then committed to the selected scenario.</p>
        </div>
      </div>

      <div className="import-controls">
        <input type="file" accept=".xlsx,.xlsm" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
        <button disabled={!file || uploading} onClick={uploadWorkbook}>{uploading ? 'Uploading…' : 'Upload & Preview'}</button>
        <button disabled={!preview || !scenarioId || committing} onClick={commitImport}>{committing ? 'Committing…' : 'Commit to Scenario'}</button>
      </div>

      {preview && (
        <div className="grid two import-preview">
          <div>
            <h3>Parsed workbook</h3>
            <p><strong>{preview.filename}</strong></p>
            <ul className="sheet-counts">
              {Object.entries(preview.sheet_row_counts).map(([sheet, count]) => (
                <li key={sheet}>{sheet}: {count} rows</li>
              ))}
            </ul>
            <details>
              <summary>Canonical JSON preview</summary>
              <pre>{JSON.stringify(preview.dataset_json, null, 2)}</pre>
            </details>
          </div>
          <div>
            <h3>Import validation</h3>
            <ValidationPanel validation={preview.validation} />
          </div>
        </div>
      )}
    </section>
  );
}
