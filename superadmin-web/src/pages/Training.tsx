import { useMemo, useState } from 'react';
import { DownloadIcon } from '../components/Icons';
import { csvCell } from '../lib/accountRules';
import { useToast } from '../lib/feedback';
import { OpsErrors, useOps } from '../lib/opsData';
import { CLASS_LABELS, TRAINING_CLASSES, aiAgreement, buildManifest, classCounts, trainingItems } from '../lib/training';

// Classes with fewer photos than this train poorly; the page points them out.
const MIN_PER_CLASS = 50;

const download = (name: string, type: string, body: string) => {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
};

export function Training() {
  const { reports, settings, loading } = useOps();
  const toast = useToast();
  const [officialOnly, setOfficialOnly] = useState(false);

  const items = useMemo(() => trainingItems(reports, officialOnly), [reports, officialOnly]);
  const counts = useMemo(() => classCounts(items), [items]);
  const agreement = useMemo(() => aiAgreement(items), [items]);
  const max = Math.max(1, ...TRAINING_CLASSES.map((c) => counts[c]));
  const thin = TRAINING_CLASSES.filter((c) => counts[c] < MIN_PER_CLASS);
  const official = items.filter((i) => i.labelSource === 'official').length;
  const stamp = new Date().toISOString().slice(0, 10);

  const exportManifest = () => {
    download(`cleanstream-training-${stamp}.json`, 'application/json', JSON.stringify(buildManifest(items), null, 2));
    toast.success(`Exported ${items.length} labelled photo${items.length === 1 ? '' : 's'}`);
  };
  const exportCsv = () => {
    const rows = [['report', 'url', 'label', 'label_source', 'ai_prediction', 'barangay', 'water_context', 'created_at'],
      ...items.map((i) => [i.reportNumber, i.url, i.label, i.labelSource, i.aiPrediction, i.barangay, i.waterContext, i.createdAt])];
    download(`cleanstream-training-${stamp}.csv`, 'text/csv;charset=utf-8', `﻿${rows.map((r) => r.map(csvCell).join(',')).join('\r\n')}`);
  };

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Training data</h1>
          <p className="muted">Photos labelled by officials and reporters, for training CleanStream's own waste model.</p>
        </div>
        <div className="approval-actions">
          <button className="btn" onClick={exportCsv} disabled={items.length === 0}><DownloadIcon /> CSV</button>
          <button className="btn btn-primary" onClick={exportManifest} disabled={items.length === 0}><DownloadIcon /> Export for training</button>
        </div>
      </header>
      <OpsErrors streams={['reports']} />

      <section className="stat-grid" aria-label="Dataset totals">
        <div className="stat"><span className="stat-n">{items.length}</span><span className="stat-l">Labelled photos</span></div>
        <div className="stat"><span className="stat-n">{official}</span><span className="stat-l">Confirmed by an official</span></div>
        <div className="stat"><span className="stat-n">{agreement === null ? '—' : `${agreement}%`}</span><span className="stat-l">Current AI agreed with people</span></div>
        <div className={`stat${thin.length ? ' stat-attn' : ''}`}><span className="stat-n">{TRAINING_CLASSES.length - thin.length}/{TRAINING_CLASSES.length}</span><span className="stat-l">Classes with {MIN_PER_CLASS}+ photos</span></div>
      </section>

      <div className="two-col">
        <section className="card">
          <div className="card-head">
            <h2>Photos per class</h2>
            <label className="check" style={{ margin: 0 }}>
              <input type="checkbox" checked={officialOnly} onChange={(e) => setOfficialOnly(e.target.checked)} />
              Official labels only
            </label>
          </div>
          {loading.reports ? <p className="muted">Loading…</p> : (
            <ul className="bars">
              {TRAINING_CLASSES.map((c) => (
                <li key={c}>
                  <span className="bars-label">{CLASS_LABELS[c]}</span>
                  <span className="bars-track"><span className={`bars-fill${counts[c] < MIN_PER_CLASS ? ' bars-thin' : ''}`} style={{ width: `${(counts[c] / max) * 100}%` }} /></span>
                  <span className="bars-n">{counts[c]}</span>
                </li>
              ))}
            </ul>
          )}
          {thin.length > 0 && (
            <p className="callout callout-warn">
              Needs more photos: {thin.map((c) => CLASS_LABELS[c]).join(', ')}. Ask barangay officials to confirm the waste type when they verify reports.
            </p>
          )}
        </section>

        <section className="card">
          <h2>How to train and use the model</h2>
          <ol className="steps-list">
            <li><strong>Export for training</strong> (button above) to download the labelled-photo list.</li>
            <li>Open <code>ml/train_waste_classifier.py</code> in Google Colab (free GPU), upload the file, and run it. The <code>ml/README.md</code> walks through it.</li>
            <li>It reports accuracy per class. Only continue if the model beats the current AI ({agreement === null ? 'not measured yet' : `${agreement}% agreement`}).</li>
            <li>Copy the output folder to <code>superadmin-web/public/models/waste/</code> and deploy hosting.</li>
            <li>In <a href="#/settings">System settings</a>, turn on the custom model with its URL. Phones pick it up on their next analysis.</li>
          </ol>
          <p className="muted small">
            Custom model: <strong>{settings.customModel.enabled ? `on (${settings.customModel.version || 'no version'})` : 'off'}</strong>
          </p>
        </section>
      </div>

      <section className="card">
        <div className="card-head"><h2>Latest labelled photos</h2><span className="muted small">{items.length} total</span></div>
        {items.length === 0 ? (
          <p className="muted">No labelled photos yet. Labels come from officials verifying reports and from reporters confirming the waste type.</p>
        ) : (
          <div className="photo-grid">
            {items.slice(0, 24).map((i) => (
              <figure key={i.id} className="photo-tile">
                <img src={i.url} alt={`${CLASS_LABELS[i.label]} — ${i.reportNumber}`} loading="lazy" />
                <figcaption>
                  <strong>{CLASS_LABELS[i.label]}</strong>
                  <span className="muted small">
                    {i.labelSource === 'official' ? 'Official' : 'Reporter'}
                    {i.aiPrediction && i.aiPrediction !== i.label ? ` · AI said ${CLASS_LABELS[i.aiPrediction as keyof typeof CLASS_LABELS] ?? i.aiPrediction}` : ''}
                  </span>
                </figcaption>
              </figure>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
