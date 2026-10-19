import { useEffect, useState } from 'react';
import { fullName } from '../lib/accountRules';
import { getVerification } from '../lib/accounts';
import { compareIdToSelfies } from '../lib/faceMatch';
import { FaceMatchResult, VERDICT_TEXT, matchSummaryForRecord } from '../lib/faceVerdict';
import { formatDateTime } from '../lib/format';
import { Account, ID_TYPE_LABELS, ROLE_LABELS, Verification } from '../lib/types';
import { useAccountActions } from '../lib/useAccountActions';
import { Dialog } from './Dialog';

const REJECTION_REASONS = [
  'The photo of the ID is blurry or cut off. Please retake it in good light.',
  "The face on the ID doesn't match your selfies.",
  'The ID is expired or is not a valid government ID.',
  "The name on the ID doesn't match the name you registered with.",
  "The selfies don't show the required poses (straight, smiling, turned).",
];
const OTHER = '__other__';

const SELFIE_LABELS = { neutral: 'Straight', smile: 'Smiling', turn: 'Turned' } as const;

type Load = { state: 'loading' } | { state: 'missing' } | { state: 'ready'; v: Verification };

export function ReviewDialog({ account, onClose }: { account: Account; onClose: () => void }) {
  const actions = useAccountActions();
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [match, setMatch] = useState<FaceMatchResult | null>(null);
  const [progress, setProgress] = useState('');
  const [matchError, setMatchError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reasonChoice, setReasonChoice] = useState(REJECTION_REASONS[0]);
  const [customReason, setCustomReason] = useState('');
  const busy = actions.busyKey === `identity:${account.uid}`;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const v = await getVerification(account.uid);
        if (cancelled) return;
        if (!v || !v.idImage) { setLoad({ state: 'missing' }); return; }
        setLoad({ state: 'ready', v });
        try {
          const result = await compareIdToSelfies(v, (m) => { if (!cancelled) setProgress(m); });
          if (!cancelled) setMatch(result);
        } catch (e) {
          if (!cancelled) setMatchError((e as Error).message);
        }
      } catch (e) {
        if (!cancelled) { setLoad({ state: 'missing' }); setMatchError((e as Error).message); }
      }
    })();
    return () => { cancelled = true; };
  }, [account.uid]);

  const hasRecord = load.state === 'ready';
  const record = matchSummaryForRecord(match);
  const weak = !match || match.verdict === 'uncertain' || match.verdict === 'mismatch' || match.verdict === 'no-face' || match.selfiesConsistent === false;
  const reason = reasonChoice === OTHER ? customReason.trim() : reasonChoice;

  const approve = async () => { if (await actions.decideIdentity(account, record, hasRecord)) onClose(); };
  const reject = async () => { if (reason && await actions.decideIdentity(account, record, hasRecord, reason)) onClose(); };

  const cc = load.state === 'ready' ? load.v.clientChecks : null;
  const yes = (b: boolean | null | undefined) => (b === true ? '✓' : b === false ? '✗' : '–');

  return (
    <Dialog title={`Review ID: ${fullName(account)}`} onClose={onClose} size="lg">
      <div className="dialog-body review">
        <dl className="facts">
          <div><dt>Applying as</dt><dd>{ROLE_LABELS[account.role]}</dd></div>
          <div><dt>Email</dt><dd>{account.email}</dd></div>
          {account.barangay && <div><dt>Barangay</dt><dd>{account.barangay}</dd></div>}
          {account.employeeId && <div><dt>Employee ID</dt><dd>{account.employeeId}</dd></div>}
          {load.state === 'ready' && <div><dt>ID type</dt><dd>{ID_TYPE_LABELS[load.v.idType] ?? load.v.idType}</dd></div>}
          {load.state === 'ready' && <div><dt>Submitted</dt><dd>{formatDateTime(load.v.submittedAt)}</dd></div>}
        </dl>

        {load.state === 'loading' && <p className="muted">Loading photos…</p>}

        {load.state === 'missing' && (
          <p className="callout callout-warn">
            No ID photos were received for this applicant{matchError ? ` (${matchError})` : ''}. You can reject so they are asked to send them again.
          </p>
        )}

        {load.state === 'ready' && (
          <>
            <div className="review-photos">
              <figure className="review-id">
                <img src={load.v.idImage} alt={`ID submitted by ${fullName(account)}`} />
                <figcaption>ID photo</figcaption>
              </figure>
              <div className="review-selfies">
                {(['neutral', 'smile', 'turn'] as const).map((k) => {
                  const src = { neutral: load.v.selfieNeutral, smile: load.v.selfieSmile, turn: load.v.selfieTurn }[k];
                  const m = match?.selfies.find((s) => s.step === k);
                  return (
                    <figure key={k}>
                      <img src={src} alt={`${SELFIE_LABELS[k]} selfie`} />
                      <figcaption>
                        {SELFIE_LABELS[k]}
                        {m && <span className="muted small"> · {m.faceFound ? (m.distance !== null ? `distance ${m.distance.toFixed(2)}` : 'face found') : 'no face found'}</span>}
                      </figcaption>
                    </figure>
                  );
                })}
              </div>
            </div>

            <div className={`verdict verdict-${match ? match.verdict : 'running'}`} role="status">
              {match ? (
                <>
                  <strong>{VERDICT_TEXT[match.verdict].label}</strong>
                  <span>{VERDICT_TEXT[match.verdict].detail}</span>
                  {match.selfiesConsistent === false && (
                    <span className="verdict-warn">The three selfies don't look like the same person. Look closely: someone may have swapped faces between photos.</span>
                  )}
                  <span className="muted small">
                    Automatic check, run in your browser ({match.backend}). Distance: lower means more alike; 0.60 or less is a likely match. It is only a guide: compare the photos yourself.
                  </span>
                </>
              ) : matchError ? (
                <>
                  <strong>Automatic comparison unavailable</strong>
                  <span>{matchError}</span>
                </>
              ) : (
                <>
                  <strong>Comparing faces…</strong>
                  <span className="muted">{progress || 'Starting…'}</span>
                </>
              )}
            </div>

            {cc && (
              <p className="muted small">
                {cc.mode === 'unavailable'
                  ? "The applicant's phone couldn't run its own photo checks, so nothing below was verified by it. "
                  : 'Reported by the applicant’s phone (not independently verified): '}
                face on ID {yes(cc.faceOnId)} · text readable {yes(cc.textReadable)} · last name on ID {yes(cc.lastNameOnId)} · first name on ID {yes(cc.firstNameOnId)} ·
                selfie poses: straight {yes(cc.liveness?.neutral)} smile {yes(cc.liveness?.smile)} turn {yes(cc.liveness?.turn)}
              </p>
            )}
          </>
        )}

        {!rejecting ? (
          <label className="check review-confirm">
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} disabled={load.state !== 'ready'} />
            I have compared the photos myself, the ID looks genuine and valid, and the person in the selfies is the person on the ID.
          </label>
        ) : (
          <div className="field">
            <label htmlFor="reject-reason">Reason (the applicant will see this)</label>
            <select id="reject-reason" value={reasonChoice} onChange={(e) => setReasonChoice(e.target.value)}>
              {REJECTION_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
              <option value={OTHER}>Other…</option>
            </select>
            {reasonChoice === OTHER && (
              <textarea rows={3} value={customReason} onChange={(e) => setCustomReason(e.target.value)} placeholder="Explain what they should fix" aria-label="Custom reason" />
            )}
          </div>
        )}

        {!rejecting && confirmed && weak && load.state === 'ready' && (
          <p className="callout callout-warn">The automatic check isn't a clear match. Approve only if you are sure from the photos.</p>
        )}
        <p className="muted small">When you decide, the ID photo and selfies are deleted from the system; only the outcome and reason are kept.</p>
      </div>

      <div className="dialog-actions">
        {!rejecting ? (
          <>
            <button className="btn" onClick={onClose} disabled={busy}>Close</button>
            <button className="btn btn-danger-outline" onClick={() => setRejecting(true)} disabled={busy}>Reject…</button>
            <button className="btn btn-primary" onClick={approve} disabled={busy || !confirmed || load.state !== 'ready'}>
              {busy ? 'Saving…' : 'Approve account'}
            </button>
          </>
        ) : (
          <>
            <button className="btn" onClick={() => setRejecting(false)} disabled={busy}>Back</button>
            <button className="btn btn-danger" onClick={reject} disabled={busy || !reason}>{busy ? 'Saving…' : 'Reject ID'}</button>
          </>
        )}
      </div>
    </Dialog>
  );
}
