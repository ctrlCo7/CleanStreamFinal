import { useMemo, useState } from 'react';
import { AccountForm, AccountPrefill } from '../components/AccountForm';
import { Dialog } from '../components/Dialog';
import { useActor } from '../lib/auth';
import { CrewRequest, CrewRequestStatus, ensureStillPending, markApproved, markDeclined, splitName } from '../lib/crewRequests';
import { useCrewRequests } from '../lib/crewRequestsData';
import { useToast } from '../lib/feedback';
import { formatDateTime } from '../lib/format';
import { formatPhone } from '../lib/phone';
import { useAccountActions } from '../lib/useAccountActions';

type Filter = 'pending' | 'answered' | 'all';

const STATUS: Record<CrewRequestStatus, { label: string; cls: string }> = {
  pending: { label: 'Waiting', cls: 'pill-pending' },
  approved: { label: 'Account created', cls: 'pill-active' },
  declined: { label: 'Declined', cls: 'pill-rejected' },
  cancelled: { label: 'Withdrawn', cls: 'pill-inactive' },
};

const prefillFor = (r: CrewRequest): AccountPrefill => ({
  ...splitName(r),
  email: r.leaderEmail,
  role: 'cleanup_team',
  barangayName: r.barangay,
  phone: r.leaderPhone,
  crewSize: r.crewSize,
  note: `For Brgy. ${r.barangay}'s request "${r.teamName}" (${r.crewSize} workers), sent by ${r.requestedByName}. `
    + 'Check the details, then create the account. The request is marked done and the requester is notified.',
});

/**
 * Requests from barangay officials and Captains for a cleanup team (crew) account. The Super
 * Admin creates the account from the request (the form is filled in from it) or declines it.
 */
export function CrewRequests() {
  const { requests, pending, loading, error } = useCrewRequests();
  const actor = useActor();
  const actions = useAccountActions();
  const toast = useToast();
  const [filter, setFilter] = useState<Filter>('pending');
  const [creatingFor, setCreatingFor] = useState<CrewRequest | null>(null);
  const [decliningFor, setDecliningFor] = useState<CrewRequest | null>(null);
  const [declineReason, setDeclineReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ email: string; password: string; team: string } | null>(null);
  const [alertsState, setAlertsState] = useState(() => (typeof Notification === 'undefined' ? 'unsupported' : Notification.permission));

  const shown = useMemo(() => requests.filter((r) =>
    filter === 'all' || (filter === 'pending' ? r.status === 'pending' : r.status !== 'pending')), [requests, filter]);

  const enableAlerts = async () => {
    try { setAlertsState(await Notification.requestPermission()); } catch { setAlertsState('denied'); }
  };

  const copy = async (text: string, what: string) => {
    try { await navigator.clipboard.writeText(text); toast.success(`${what} copied`); } catch { toast.error("Couldn't copy automatically. Select the text and copy it manually."); }
  };

  const decline = async () => {
    if (!decliningFor) return;
    if (declineReason.trim().length < 5) { toast.error('Give the barangay a short reason (at least 5 characters).'); return; }
    setBusy(true);
    try {
      await ensureStillPending(decliningFor);
      await markDeclined(actor, decliningFor, declineReason);
      toast.success(`Declined. Brgy. ${decliningFor.barangay} was notified.`);
      setDecliningFor(null);
      setDeclineReason('');
    } catch (e) {
      toast.error(`Couldn't decline: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Cleanup team requests</h1>
          <p className="muted">Barangay officials and Captains ask here for a cleanup crew account. Create it from the request, or decline with a reason; they're notified in the app either way.</p>
        </div>
        {alertsState === 'default' && <button className="btn" onClick={() => void enableAlerts()}>Turn on desktop alerts</button>}
        {alertsState === 'granted' && <span className="muted small">Desktop alerts on</span>}
      </header>
      {error && <p className="callout callout-error" role="alert">{error}</p>}
      {alertsState === 'denied' && (
        <p className="callout callout-warn">Desktop alerts are blocked in this browser. New requests still pop up here and show as a badge in the sidebar.</p>
      )}

      <div className="toolbar" role="tablist" aria-label="Which requests">
        {([['pending', `Waiting (${pending.length})`], ['answered', 'Answered'], ['all', 'All']] as const).map(([k, label]) => (
          <button key={k} role="tab" aria-selected={filter === k} className={`btn btn-sm${filter === k ? ' btn-primary' : ''}`} onClick={() => setFilter(k)}>{label}</button>
        ))}
      </div>

      {loading ? <p className="muted">Loading…</p> : shown.length === 0 ? (
        <div className="empty"><p>{filter === 'pending' ? 'No requests are waiting.' : 'No requests here yet.'}</p></div>
      ) : (
        <ul className="approval-list">
          {shown.map((r) => (
            <li key={r.id} className="card request-card">
              <div className="card-head">
                <h2>{r.teamName} <span className="muted">· Brgy. {r.barangay}</span></h2>
                <span className={`pill ${STATUS[r.status].cls}`}>{STATUS[r.status].label}</span>
              </div>
              <dl className="facts">
                <div><dt>Workers</dt><dd>{r.crewSize}</dd></div>
                <div><dt>Requested by</dt><dd>{r.requestedByName} ({r.requestedByRole === 'admin' ? 'Barangay Captain' : 'Barangay Official'})</dd></div>
                <div><dt>Sent</dt><dd>{formatDateTime(r.createdAt)}</dd></div>
                {r.leaderName && <div><dt>Crew leader</dt><dd>{r.leaderName}</dd></div>}
                {r.leaderEmail && <div><dt>Leader email</dt><dd>{r.leaderEmail}</dd></div>}
                {r.leaderPhone && <div><dt>Leader mobile</dt><dd>{formatPhone(r.leaderPhone)}</dd></div>}
              </dl>
              <p className="request-reason"><strong>Why:</strong> {r.reason}</p>
              {r.status === 'approved' && <p className="muted small">Account {r.accountEmail} created {formatDateTime(r.decidedAt)}.</p>}
              {r.status === 'declined' && <p className="muted small">Declined {formatDateTime(r.decidedAt)}: {r.declineReason}</p>}
              {r.status === 'pending' && (
                <div className="approval-actions">
                  <button className="btn btn-primary" onClick={() => setCreatingFor(r)}>Create crew account</button>
                  <button className="btn btn-danger-outline" onClick={() => { setDecliningFor(r); setDeclineReason(''); }}>Decline</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {creatingFor && (
        <AccountForm
          mode="create"
          prefill={prefillFor(creatingFor)}
          busy={actions.busyKey === 'create'}
          onClose={() => setCreatingFor(null)}
          onSubmit={async (input, sendReset) => {
            const request = creatingFor;
            try {
              await ensureStillPending(request);
            } catch (e) {
              toast.error((e as Error).message);
              setCreatingFor(null);
              return;
            }
            const uid = await actions.create(input, sendReset);
            if (!uid) return;
            const email = input.email.trim().toLowerCase();
            setCreatingFor(null);
            setCreated({ email, password: input.password, team: request.teamName });
            try {
              await markApproved(actor, request, { uid, email });
            } catch (e) {
              toast.error(`The account was created, but the request couldn't be marked done: ${(e as Error).message}`);
            }
          }}
        />
      )}

      {decliningFor && (
        <Dialog title={`Decline "${decliningFor.teamName}"?`} onClose={() => setDecliningFor(null)} size="sm">
          <div className="dialog-body">
            <div className="field">
              <label htmlFor="decline-reason">Reason (Brgy. {decliningFor.barangay} will see this)</label>
              <textarea id="decline-reason" rows={3} value={declineReason} onChange={(e) => setDeclineReason(e.target.value)} autoFocus
                placeholder="e.g. One crew is enough for the current number of reports; ask again next quarter." />
            </div>
          </div>
          <div className="dialog-actions">
            <button className="btn" onClick={() => setDecliningFor(null)} disabled={busy}>Cancel</button>
            <button className="btn btn-danger" onClick={() => void decline()} disabled={busy}>{busy ? 'Declining…' : 'Decline request'}</button>
          </div>
        </Dialog>
      )}

      {created && (
        <Dialog title="Crew account created" onClose={() => setCreated(null)}>
          <div className="dialog-body">
            <p>"{created.team}" is ready, and the barangay was notified. Give these sign-in details to the crew leader. <strong>The password won't be shown again.</strong></p>
            <dl className="credentials">
              <div><dt>Email</dt><dd><code>{created.email}</code> <button className="btn btn-sm" onClick={() => void copy(created.email, 'Email')}>Copy</button></dd></div>
              <div><dt>Temporary password</dt><dd><code>{created.password}</code> <button className="btn btn-sm" onClick={() => void copy(created.password, 'Password')}>Copy</button></dd></div>
            </dl>
          </div>
          <div className="dialog-actions"><button className="btn btn-primary" onClick={() => setCreated(null)} autoFocus>Done</button></div>
        </Dialog>
      )}
    </>
  );
}
