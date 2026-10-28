import { ReactNode } from 'react';
import { statusOf } from '../lib/accountRules';
import { useAuth } from '../lib/auth';
import { useData } from '../lib/data';
import {
  AnalyticsIcon, ApprovalsIcon, HistoryIcon, LogoMark, LogoutIcon, ModelIcon, OverviewIcon, PinIcon, ReportsIcon, SettingsIcon, UnitsIcon,
  UsersIcon,
} from './Icons';

export type Route = 'overview' | 'reports' | 'analytics' | 'accounts' | 'approvals' | 'units' | 'checkpoints' | 'training' | 'settings' | 'audit';

export const ROUTES: Route[] = ['overview', 'reports', 'analytics', 'accounts', 'approvals', 'units', 'checkpoints', 'training', 'settings', 'audit'];

const NAV: Array<{ route: Route; label: string; icon: ReactNode; group?: string }> = [
  { route: 'overview', label: 'Overview', icon: <OverviewIcon /> },
  { route: 'reports', label: 'All reports', icon: <ReportsIcon /> },
  { route: 'analytics', label: 'Analytics', icon: <AnalyticsIcon /> },
  { route: 'accounts', label: 'Accounts', icon: <UsersIcon />, group: 'People' },
  { route: 'approvals', label: 'Approvals', icon: <ApprovalsIcon /> },
  { route: 'units', label: 'Barangay units', icon: <UnitsIcon />, group: 'Field operations' },
  { route: 'checkpoints', label: 'Checkpoints', icon: <PinIcon /> },
  { route: 'training', label: 'Training data', icon: <ModelIcon />, group: 'System' },
  { route: 'settings', label: 'System settings', icon: <SettingsIcon /> },
  { route: 'audit', label: 'Audit log', icon: <HistoryIcon /> },
];

export function Layout({ route, children }: { route: Route; children: ReactNode }) {
  const { state, logOut } = useAuth();
  const { accounts, error } = useData();
  const pending = accounts.filter((a) => statusOf(a) === 'pending').length;
  const email = state.status === 'ready' ? state.actor.email : '';

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <LogoMark size={32} />
          <div><strong>CleanStream</strong><span>Super Admin</span></div>
        </div>
        <nav aria-label="Main">
          {NAV.flatMap((n) => [
            n.group ? <span key={`g-${n.group}`} className="nav-group">{n.group}</span> : null,
            <a key={n.route} href={`#/${n.route}`} className={`nav-item${route === n.route ? ' active' : ''}`} aria-current={route === n.route ? 'page' : undefined}>
              {n.icon}
              <span>{n.label}</span>
              {n.route === 'approvals' && pending > 0 && <span className="badge" aria-label={`${pending} waiting`}>{pending}</span>}
            </a>,
          ])}
        </nav>
        <div className="sidebar-foot">
          <span className="muted small ellipsis" title={email}>{email}</span>
          <button className="btn btn-sm" onClick={() => void logOut()}><LogoutIcon /> Sign out</button>
        </div>
      </aside>
      <main className="content">
        {error && <p className="callout callout-error" role="alert">{error}</p>}
        {children}
      </main>
    </div>
  );
}
