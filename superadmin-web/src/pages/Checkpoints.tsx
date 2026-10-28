import { useMemo, useState } from 'react';
import { CheckpointForm } from '../components/CheckpointForm';
import { PlusIcon, SearchIcon } from '../components/Icons';
import { MenuItem, RowMenu } from '../components/Pill';
import { useActor } from '../lib/auth';
import { listBarangays } from '../lib/barangays';
import { useConfirm, useTick, useToast } from '../lib/feedback';
import { relativeTime } from '../lib/format';
import {
  Checkpoint, CheckpointInput, createCheckpoint, deleteCheckpoint, setCheckpointActive, updateCheckpoint,
} from '../lib/operations';
import { OpsErrors, useOps } from '../lib/opsData';
import { useData } from '../lib/data';
import { CHECKPOINT_STATE_LABELS, CheckpointState, checkpointState } from '../lib/opsStats';

const STATE_PILL: Record<CheckpointState, string> = {
  paused: 'pill-inactive', 'done-today': 'pill-active', 'due-today': 'pill-role', overdue: 'pill-rejected', 'not-today': 'pill-inactive',
};

const to12h = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};

type FormState = null | { mode: 'create' } | { mode: 'edit'; checkpoint: Checkpoint };

export function Checkpoints({ initialBarangayId }: { initialBarangayId?: string }) {
  const { checkpoints, loading } = useOps();
  useData(); // re-render when newly registered barangays arrive
  const actor = useActor();
  const toast = useToast();
  const confirm = useConfirm();
  useTick();
  const [query, setQuery] = useState('');
  const [barangayId, setBarangayId] = useState(initialBarangayId ?? 'all');
  const [form, setForm] = useState<FormState>(null);
  const [busy, setBusy] = useState(false);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return checkpoints.filter((c) =>
      (barangayId === 'all' || c.barangayId === barangayId)
      && (!q || [c.name, c.waterway, c.description, ...c.assignedNames].some((v) => v.toLowerCase().includes(q))));
  }, [checkpoints, query, barangayId]);

  const run = async (work: () => Promise<void>, done: string) => {
    setBusy(true);
    try {
      await work();
      toast.success(done);
      return true;
    } catch (e) {
      toast.error((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const save = async (input: CheckpointInput) => {
    const ok = form?.mode === 'edit'
      ? await run(() => updateCheckpoint(actor, form.checkpoint, input), `Saved ${input.name.trim()}`)
      : await run(() => createCheckpoint(actor, input), `Added ${input.name.trim()}`);
    if (ok) setForm(null);
  };

  const menuFor = (c: Checkpoint): MenuItem[] => [
    { label: 'Edit details & schedule', onSelect: () => setForm({ mode: 'edit', checkpoint: c }) },
    c.isActive
      ? { label: 'Pause inspections', onSelect: () => void run(() => setCheckpointActive(actor, c, false), `${c.name} paused`) }
      : { label: 'Resume inspections', onSelect: () => void run(() => setCheckpointActive(actor, c, true), `${c.name} resumed`) },
    {
      label: 'Delete checkpoint',
      danger: true,
      onSelect: async () => {
        const yes = await confirm({
          title: 'Delete checkpoint?',
          message: <p>Officials will no longer see <strong>{c.name}</strong>. Inspections already filed against it are kept. To stop patrols for a while, pause it instead.</p>,
          confirmLabel: 'Delete',
          danger: true,
        });
        if (yes) void run(() => deleteCheckpoint(actor, c), `${c.name} deleted`);
      },
    },
  ];

  const now = new Date();

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Checkpoints</h1>
          <p className="muted">The waterway monitoring points barangay officials inspect, who is assigned to each, and on which days.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setForm({ mode: 'create' })}><PlusIcon /> New checkpoint</button>
      </header>
      <OpsErrors streams={['checkpoints']} />

      <div className="toolbar">
        <label className="search">
          <SearchIcon />
          <input type="search" placeholder="Search name, waterway or official" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search checkpoints" />
        </label>
        <select value={barangayId} onChange={(e) => setBarangayId(e.target.value)} aria-label="Filter by barangay">
          <option value="all">All barangays</option>
          {listBarangays().map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <span className="muted nowrap">{rows.length} checkpoint{rows.length === 1 ? '' : 's'}</span>
      </div>

      {loading.checkpoints ? <p className="muted">Loading checkpoints…</p> : rows.length === 0 ? (
        <div className="empty">
          <strong>{checkpoints.length === 0 ? 'No checkpoints yet' : 'No checkpoints match'}</strong>
          <p className="muted">{checkpoints.length === 0 ? 'Add the first one so barangay officials can start scheduled inspections.' : 'Try a different search or barangay.'}</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Checkpoint</th><th>Barangay</th><th>Assigned to</th><th>Schedule</th><th>Last inspection</th><th>Today</th><th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {rows.map((c) => {
                const state = checkpointState(c, now);
                return (
                  <tr key={c.id} className={c.isActive ? undefined : 'row-removed'}>
                    <td>
                      <strong>{c.name}</strong>
                      <div className="muted small">
                        {[c.waterway, c.latitude !== undefined && c.longitude !== undefined ? `${c.latitude.toFixed(5)}, ${c.longitude.toFixed(5)}` : null].filter(Boolean).join(' · ') || 'No location set'}
                      </div>
                    </td>
                    <td>{c.barangay}</td>
                    <td>{c.assignedNames.length ? c.assignedNames.join(', ') : <span className="text-warn">Nobody assigned</span>}</td>
                    <td className="nowrap">{c.days.join(', ')}<div className="muted small">{to12h(c.time)}</div></td>
                    <td>{c.lastInspectedAt ? relativeTime(c.lastInspectedAt) : <span className="muted">Never</span>}{c.lastInspectedByName && <div className="muted small">{c.lastInspectedByName}{c.lastCondition ? ` · ${c.lastCondition}` : ''}</div>}</td>
                    <td><span className={`pill ${STATE_PILL[state]}`}>{CHECKPOINT_STATE_LABELS[state]}</span></td>
                    <td className="actions"><RowMenu label={`Actions for ${c.name}`} items={menuFor(c)} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {form && (
        <CheckpointForm
          checkpoint={form.mode === 'edit' ? form.checkpoint : undefined}
          defaultBarangayId={barangayId === 'all' ? undefined : barangayId}
          busy={busy}
          onClose={() => setForm(null)}
          onSubmit={(input) => void save(input)}
        />
      )}
    </>
  );
}
