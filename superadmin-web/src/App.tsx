import { useEffect, useState } from 'react';
import { Layout, ROUTES, Route } from './components/Layout';
import { LogoMark } from './components/Icons';
import { useAuth } from './lib/auth';
import { DataProvider } from './lib/data';
import { OpsDataProvider } from './lib/opsData';
import { Accounts } from './pages/Accounts';
import { Analytics } from './pages/Analytics';
import { Approvals } from './pages/Approvals';
import { AuditLog } from './pages/AuditLog';
import { BarangayUnits } from './pages/BarangayUnits';
import { Checkpoints } from './pages/Checkpoints';
import { Login } from './pages/Login';
import { Overview } from './pages/Overview';
import { Reports } from './pages/Reports';
import { SystemSettings } from './pages/SystemSettings';
import { Training } from './pages/Training';

// "#/checkpoints/guadalupe" opens the Checkpoints page filtered to one barangay.
const readLocation = (): { route: Route; param?: string } => {
  const [name, param] = window.location.hash.replace(/^#\/?/, '').split('/');
  return (ROUTES as string[]).includes(name) ? { route: name as Route, param: param || undefined } : { route: 'overview' };
};

export function App() {
  const { state } = useAuth();
  const [loc, setLoc] = useState(readLocation);

  useEffect(() => {
    const onHash = () => setLoc(readLocation());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const go = (r: Route, param?: string) => { window.location.hash = `#/${r}${param ? `/${param}` : ''}`; };

  if (state.status === 'loading') {
    return <div className="splash"><LogoMark size={56} /><p className="muted">Loading…</p></div>;
  }
  if (state.status === 'signed-out') return <Login />;

  const { route, param } = loc;
  return (
    <DataProvider>
      <OpsDataProvider>
        <Layout route={route}>
          {route === 'overview' && <Overview go={go} />}
          {route === 'reports' && <Reports />}
          {route === 'analytics' && <Analytics />}
          {route === 'accounts' && <Accounts />}
          {route === 'approvals' && <Approvals />}
          {route === 'units' && <BarangayUnits openCheckpoints={(id) => go('checkpoints', id)} />}
          {route === 'checkpoints' && <Checkpoints key={param ?? 'all'} initialBarangayId={param} />}
          {route === 'training' && <Training />}
          {route === 'settings' && <SystemSettings />}
          {route === 'audit' && <AuditLog />}
        </Layout>
      </OpsDataProvider>
    </DataProvider>
  );
}
