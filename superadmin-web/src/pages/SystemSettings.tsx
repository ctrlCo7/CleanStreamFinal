import { FormEvent, useEffect, useState } from 'react';
import { useActor } from '../lib/auth';
import { useToast } from '../lib/feedback';
import { formatDateTime } from '../lib/format';
import { FEATURE_FLAGS, Settings, saveSettings } from '../lib/operations';
import { OpsErrors, useOps } from '../lib/opsData';

/** Human names of the settings that differ, for the audit log. */
const changedFields = (a: Settings, b: Settings): string[] => {
  const out: string[] = [];
  if (a.maintenanceMode !== b.maintenanceMode) out.push(`maintenance mode (${b.maintenanceMode ? 'on' : 'off'})`);
  if (a.maintenanceMessage !== b.maintenanceMessage) out.push('maintenance message');
  if (a.supportEmail !== b.supportEmail) out.push('support email');
  if (a.supportPhone !== b.supportPhone) out.push('support phone');
  if (a.aiModelVersion !== b.aiModelVersion) out.push(`AI model version (${b.aiModelVersion})`);
  if (a.aiReviewThreshold !== b.aiReviewThreshold) out.push(`AI review threshold (${b.aiReviewThreshold}%)`);
  if (JSON.stringify(a.defaultSeverityThresholds) !== JSON.stringify(b.defaultSeverityThresholds)) out.push('severity thresholds');
  for (const [k, v] of Object.entries(b.notificationSettings)) {
    if (a.notificationSettings[k as keyof Settings['notificationSettings']] !== v) out.push(`${k} (${v ? 'on' : 'off'})`);
  }
  for (const f of FEATURE_FLAGS) if (a.featureFlags[f.key] !== b.featureFlags[f.key]) out.push(`${f.label} (${b.featureFlags[f.key] ? 'on' : 'off'})`);
  if (JSON.stringify(a.customModel) !== JSON.stringify(b.customModel)) out.push(`custom model (${b.customModel.enabled ? `on, ${b.customModel.version || b.customModel.url}` : 'off'})`);
  return out;
};

const NOTIFICATION_OPTIONS: Array<{ key: keyof Settings['notificationSettings']; label: string; hint: string }> = [
  { key: 'enablePush', label: 'Push notifications', hint: 'Master switch for phone notifications.' },
  { key: 'criticalAlerts', label: 'Critical waste alerts', hint: 'Alert Admins and officials when a critical or hazardous report comes in.' },
  { key: 'reportUpdateAlerts', label: 'Report status updates', hint: 'Tell reporters when their report is verified, assigned or resolved.' },
  { key: 'inspectionReminders', label: 'Inspection reminders', hint: 'Remind officials of their scheduled checkpoint inspections.' },
];

export function SystemSettings() {
  const { settings, loading } = useOps();
  const actor = useActor();
  const toast = useToast();
  const [draft, setDraft] = useState<Settings>(settings);
  const [busy, setBusy] = useState(false);

  // Take the saved values once they arrive, and after someone else saves, unless mid-edit.
  const [dirty, setDirty] = useState(false);
  useEffect(() => { if (!dirty) setDraft(settings); }, [settings, dirty]);

  const set = (patch: Partial<Settings>) => { setDraft((d) => ({ ...d, ...patch })); setDirty(true); };
  const t = draft.defaultSeverityThresholds;
  const thresholdError = !(t.critical > t.high && t.high > t.moderate && t.moderate > 0 && t.critical <= 100)
    ? 'Thresholds must go down from Critical to Moderate, between 1 and 100.' : null;
  const modelError = draft.customModel.enabled && !/^https:\/\/.+\/model\.json$/.test(draft.customModel.url)
    ? 'Enter the https:// address of the model.json file.' : null;
  const changes = changedFields(settings, draft);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (thresholdError || modelError) return;
    setBusy(true);
    try {
      await saveSettings(actor, draft, changes);
      setDirty(false);
      toast.success('Settings saved');
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (loading.settings) return <p className="muted">Loading…</p>;

  return (
    <form onSubmit={submit}>
      <header className="page-head">
        <div>
          <h1>System settings</h1>
          <p className="muted">
            App-wide settings shared by the CleanStream mobile app.
            {settings.updatedAt && <> Last saved {formatDateTime(settings.updatedAt)}{settings.updatedBy ? ` by ${settings.updatedBy}` : ''}.</>}
          </p>
        </div>
        <div className="approval-actions">
          <button type="button" className="btn" disabled={!dirty || busy} onClick={() => { setDraft(settings); setDirty(false); }}>Discard</button>
          <button type="submit" className="btn btn-primary" disabled={!dirty || busy || !!thresholdError || !!modelError || changes.length === 0}>{busy ? 'Saving…' : 'Save changes'}</button>
        </div>
      </header>
      <OpsErrors streams={['settings']} />
      <p className="callout callout-warn" style={{ margin: '0 0 16px' }}>
        The mobile app currently applies <strong>maintenance mode</strong> (both report screens stop accepting submissions)
        and the <strong>custom waste model</strong>.
        The other settings are saved here but aren't read by the app yet.
      </p>

      <div className="two-col">
        <section className="card">
          <h2>General</h2>
          <label className="check">
            <input type="checkbox" checked={draft.maintenanceMode} onChange={(e) => set({ maintenanceMode: e.target.checked })} />
            <span><strong>Maintenance mode</strong><br /><span className="muted small">The app shows the message below and stops accepting new reports.</span></span>
          </label>
          <div className="field" style={{ marginTop: 10 }}>
            <label htmlFor="s-msg">Maintenance message</label>
            <input id="s-msg" value={draft.maintenanceMessage} onChange={(e) => set({ maintenanceMessage: e.target.value })} placeholder="CleanStream is being updated. Please try again after 6 PM." />
          </div>
          <div className="form-grid" style={{ marginTop: 6 }}>
            <div className="field">
              <label htmlFor="s-email">Support email</label>
              <input id="s-email" type="email" value={draft.supportEmail} onChange={(e) => set({ supportEmail: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="s-phone">Support phone</label>
              <input id="s-phone" value={draft.supportPhone} onChange={(e) => set({ supportPhone: e.target.value })} />
            </div>
          </div>
        </section>

        <section className="card">
          <h2>Notifications</h2>
          {NOTIFICATION_OPTIONS.map((o) => (
            <label key={o.key} className="check">
              <input
                type="checkbox"
                checked={draft.notificationSettings[o.key]}
                onChange={(e) => set({ notificationSettings: { ...draft.notificationSettings, [o.key]: e.target.checked } })}
              />
              <span><strong>{o.label}</strong><br /><span className="muted small">{o.hint}</span></span>
            </label>
          ))}
        </section>
      </div>

      <div className="two-col">
        <section className="card">
          <h2>AI / CNN model</h2>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="s-model">Model version</label>
              <input id="s-model" value={draft.aiModelVersion} onChange={(e) => set({ aiModelVersion: e.target.value })} />
              <p className="field-hint">Recorded on each new analysis.</p>
            </div>
            <div className="field">
              <label htmlFor="s-review">Manual review below (%)</label>
              <input id="s-review" type="number" min={0} max={100} value={draft.aiReviewThreshold} onChange={(e) => set({ aiReviewThreshold: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })} />
              <p className="field-hint">Results less confident than this are flagged for an official to confirm.</p>
            </div>
          </div>
          <h3 className="subhead">Severity score thresholds</h3>
          <div className="form-grid three">
            {(['critical', 'high', 'moderate'] as const).map((k) => (
              <div className="field" key={k}>
                <label htmlFor={`s-${k}`}>{k[0].toUpperCase() + k.slice(1)} from</label>
                <input
                  id={`s-${k}`}
                  type="number"
                  min={1}
                  max={100}
                  value={t[k]}
                  aria-invalid={!!thresholdError}
                  onChange={(e) => set({ defaultSeverityThresholds: { ...t, [k]: Number(e.target.value) || 0 } })}
                />
              </div>
            ))}
          </div>
          {thresholdError ? <p className="field-error">{thresholdError}</p> : <p className="field-hint">A severity score under {t.moderate} counts as Low.</p>}

          <h3 className="subhead">Custom waste model</h3>
          <label className="check" style={{ marginTop: 0 }}>
            <input type="checkbox" checked={draft.customModel.enabled} onChange={(e) => set({ customModel: { ...draft.customModel, enabled: e.target.checked } })} />
            <span>Use the model trained on CleanStream photos (see <a href="#/training">Training data</a>)</span>
          </label>
          <div className="form-grid" style={{ marginTop: 8 }}>
            <div className="field span-2">
              <label htmlFor="s-cm-url">Model URL (model.json)</label>
              <input id="s-cm-url" value={draft.customModel.url} placeholder="https://cleanstream-b7942.web.app/models/waste/model.json" onChange={(e) => set({ customModel: { ...draft.customModel, url: e.target.value.trim() } })} aria-invalid={!!modelError} />
              {modelError ? <p className="field-error">{modelError}</p> : <p className="field-hint">metadata.json with the class labels must sit next to it. Phones download it once per session.</p>}
            </div>
            <div className="field">
              <label htmlFor="s-cm-ver">Version</label>
              <input id="s-cm-ver" value={draft.customModel.version} placeholder="waste-v1" onChange={(e) => set({ customModel: { ...draft.customModel, version: e.target.value } })} />
            </div>
          </div>
        </section>

        <section className="card">
          <h2>Features</h2>
          <p className="muted small" style={{ marginTop: 0 }}>Turn app features on or off for every user.</p>
          {FEATURE_FLAGS.map((f) => (
            <label key={f.key} className="check">
              <input type="checkbox" checked={draft.featureFlags[f.key]} onChange={(e) => set({ featureFlags: { ...draft.featureFlags, [f.key]: e.target.checked } })} />
              {f.label}
            </label>
          ))}
        </section>
      </div>
    </form>
  );
}
