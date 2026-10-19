import { ReactNode, useEffect, useRef, useState } from 'react';
import { statusOf } from '../lib/accountRules';
import { Account, AccountStatus, ROLE_LABELS, Role } from '../lib/types';
import { MoreIcon } from './Icons';

const STATUS_LABELS: Record<AccountStatus, string> = {
  active: 'Active', pending: 'Pending approval', rejected: 'ID rejected', inactive: 'Deactivated', removed: 'Removed',
};

export const StatusPill = ({ account }: { account: Account }) => {
  const status = statusOf(account);
  return <span className={`pill pill-${status}`}>{STATUS_LABELS[status]}</span>;
};

export const RolePill = ({ role }: { role: Role }) => (
  <span className={`pill pill-role pill-role-${role}`}>{ROLE_LABELS[role]}</span>
);

export interface MenuItem { label: string; onSelect: () => void; danger?: boolean; disabled?: boolean; title?: string }

/** A "…" button with a small dropdown that closes on outside click or Escape. */
export function RowMenu({ items, label }: { items: MenuItem[]; label: string }): ReactNode {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  return (
    <div className="menu" ref={ref}>
      <button type="button" className="icon-btn" aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <MoreIcon />
      </button>
      {open && (
        <div className="menu-list" role="menu">
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              className={`menu-item${item.danger ? ' menu-item-danger' : ''}`}
              disabled={item.disabled}
              title={item.title}
              onClick={() => { setOpen(false); item.onSelect(); }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
