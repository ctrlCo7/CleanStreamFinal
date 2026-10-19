import { useEffect, useState } from 'react';
import { Layout, Route } from './components/Layout';
import { LogoMark } from './components/Icons';
import { useAuth } from './lib/auth';
import { DataProvider } from './lib/data';
import { Accounts } from './pages/Accounts';
import { Approvals } from './pages/Approvals';
import { AuditLog } from './pages/AuditLog';
import { Login } from './pages/Login';
import { Overview } from './pages/Overview';

const ROUTES: Route[] = ['overview', 'accounts', 'approvals', 'audit'];

const readRoute = (): Route => {
  const name = window.location.hash.replace(/^#\/?/, '');
  return (ROUTES as string[]).includes(name) ? (name as Route) : 'overview';
};

export function App() {
  const { state } = useAuth();
  const [route, setRoute] = useState<Route>(readRoute);

  useEffect(() => {
    const onHash = () => setRoute(readRoute());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const go = (r: Route) => { window.location.hash = `#/${r}`; };

  if (state.status === 'loading') {
    return <div className="splash"><LogoMark size={56} /><p className="muted">Loading…</p></div>;
  }
  if (state.status === 'signed-out') return <Login />;

  return (
    <DataProvider>
      <Layout route={route}>
        {route === 'overview' && <Overview go={go} />}
        {route === 'accounts' && <Accounts />}
        {route === 'approvals' && <Approvals />}
        {route === 'audit' && <AuditLog />}
      </Layout>
    </DataProvider>
  );
}
