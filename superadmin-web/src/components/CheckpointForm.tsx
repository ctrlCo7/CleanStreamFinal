import { FormEvent, useMemo, useState } from 'react';
import { fullName, statusOf } from '../lib/accountRules';
import { listBarangays } from '../lib/barangays';
import { useData } from '../lib/data';
import { Checkpoint, CheckpointInput, DAYS, validateCheckpoint } from '../lib/operations';
import { Dialog } from './Dialog';

interface Props {
  checkpoint?: Checkpoint;
  defaultBarangayId?: string;
  busy: boolean;
  onClose: () => void;
  onSubmit: (input: CheckpointInput) => void;
}

export function CheckpointForm({ checkpoint, defaultBarangayId, busy, onClose, onSubmit }: Props) {
  const { accounts } = useData();
  const [input, setInput] = useState<CheckpointInput>(() => ({
    name: checkpoint?.name ?? '',
    barangayId: checkpoint?.barangayId ?? defaultBarangayId ?? '',
    waterway: checkpoint?.waterway ?? '',
    description: checkpoint?.description ?? '',
    latitude: checkpoint?.latitude?.toString() ?? '',
    longitude: checkpoint?.longitude?.toString() ?? '',
    assignedUserIds: checkpoint?.assignedUserIds ?? [],
    assignedNames: checkpoint?.assignedNames ?? [],
    days: checkpoint?.days ?? ['Mon', 'Wed', 'Fri'],
    time: checkpoint?.time ?? '07:00',
    isActive: checkpoint?.isActive ?? true,
  }));
  const [touched, setTouched] = useState(false);
  const errors = validateCheckpoint(input);
  const shown = touched ? errors : {};

  // Only active officials of the chosen barangay can patrol its checkpoints.
  const officials = useMemo(
    () => accounts.filter((a) => a.role === 'barangay' && a.barangayId === input.barangayId && statusOf(a) === 'active'),
    [accounts, input.barangayId],
  );

  const set = (patch: Partial<CheckpointInput>) => setInput((i) => ({ ...i, ...patch }));

  const toggleOfficial = (uid: string, name: string) => {
    const on = input.assignedUserIds.includes(uid);
    const ids = on ? input.assignedUserIds.filter((x) => x !== uid) : [...input.assignedUserIds, uid];
    const names = officials.filter((a) => ids.includes(a.uid)).map(fullName);
    set({ assignedUserIds: ids, assignedNames: on ? names : names.includes(name) ? names : [...names, name] });
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (Object.keys(errors).length === 0) onSubmit(input);
  };

  return (
    <Dialog title={checkpoint ? 'Edit checkpoint' : 'New checkpoint'} onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <div className="dialog-body form-grid">
          <div className="field span-2">
            <label htmlFor="cp-name">Name</label>
            <input id="cp-name" value={input.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Guadalupe River – Bridge 2" aria-invalid={!!shown.name} autoFocus />
            {shown.name && <p className="field-error">{shown.name}</p>}
          </div>
          <div className="field">
            <label htmlFor="cp-brgy">Barangay</label>
            <select
              id="cp-brgy"
              value={input.barangayId}
              onChange={(e) => set({ barangayId: e.target.value, assignedUserIds: [], assignedNames: [] })}
              aria-invalid={!!shown.barangayId}
            >
              <option value="">Choose…</option>
              {listBarangays().map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            {shown.barangayId && <p className="field-error">{shown.barangayId}</p>}
          </div>
          <div className="field">
            <label htmlFor="cp-water">Waterway</label>
            <input id="cp-water" value={input.waterway} onChange={(e) => set({ waterway: e.target.value })} placeholder="e.g. Guadalupe River" />
          </div>
          <div className="field">
            <label htmlFor="cp-lat">Latitude</label>
            <input id="cp-lat" inputMode="decimal" value={input.latitude} onChange={(e) => set({ latitude: e.target.value })} placeholder="10.3157" aria-invalid={!!shown.latitude} />
          </div>
          <div className="field">
            <label htmlFor="cp-lng">Longitude</label>
            <input id="cp-lng" inputMode="decimal" value={input.longitude} onChange={(e) => set({ longitude: e.target.value })} placeholder="123.8854" aria-invalid={!!shown.latitude} />
          </div>
          {shown.latitude && <p className="field-error span-2">{shown.latitude}</p>}
          <div className="field span-2">
            <label htmlFor="cp-desc">Description</label>
            <input id="cp-desc" value={input.description} onChange={(e) => set({ description: e.target.value })} placeholder="Landmark, access point, what to look for" />
          </div>

          <fieldset className="field span-2 fieldset">
            <legend>Inspection days</legend>
            <div className="day-picker">
              {DAYS.map((d) => (
                <label key={d} className={`day${input.days.includes(d) ? ' day-on' : ''}`}>
                  <input
                    type="checkbox"
                    checked={input.days.includes(d)}
                    onChange={() => set({ days: input.days.includes(d) ? input.days.filter((x) => x !== d) : [...input.days, d] })}
                  />
                  {d}
                </label>
              ))}
            </div>
            {shown.days && <p className="field-error">{shown.days}</p>}
          </fieldset>
          <div className="field">
            <label htmlFor="cp-time">Inspection time</label>
            <input id="cp-time" type="time" value={input.time} onChange={(e) => set({ time: e.target.value })} aria-invalid={!!shown.time} />
            {shown.time && <p className="field-error">{shown.time}</p>}
          </div>
          <div className="field">
            <label>&nbsp;</label>
            <label className="check" style={{ marginTop: 6 }}>
              <input type="checkbox" checked={input.isActive} onChange={(e) => set({ isActive: e.target.checked })} />
              Active (inspections are scheduled)
            </label>
          </div>

          <fieldset className="field span-2 fieldset">
            <legend>Assigned barangay officials</legend>
            {!input.barangayId ? (
              <p className="field-hint">Choose a barangay first.</p>
            ) : officials.length === 0 ? (
              <p className="field-hint">This barangay has no active officials yet. You can save now and assign people later.</p>
            ) : (
              <div className="check-list">
                {officials.map((a) => (
                  <label key={a.uid} className="check">
                    <input type="checkbox" checked={input.assignedUserIds.includes(a.uid)} onChange={() => toggleOfficial(a.uid, fullName(a))} />
                    {fullName(a)} <span className="muted small">{a.email}</span>
                  </label>
                ))}
              </div>
            )}
          </fieldset>
        </div>
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : checkpoint ? 'Save changes' : 'Add checkpoint'}</button>
        </div>
      </form>
    </Dialog>
  );
}
