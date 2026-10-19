import { ReactNode, createContext, useContext, useEffect, useMemo, useState } from 'react';
import { subscribeAccounts, subscribeAudit } from './accounts';
import { Account, AuditEntry } from './types';

interface DataApi {
  accounts: Account[];
  audit: AuditEntry[];
  loading: boolean;
  /** Set if either live query was refused or failed (e.g. missing permission). */
  error: string | null;
}

const DataContext = createContext<DataApi | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubAccounts = subscribeAccounts(
      (list) => { setAccounts(list); setError(null); },
      (e) => setError(`Couldn't load accounts: ${e.message}`),
    );
    const unsubAudit = subscribeAudit(setAudit, (e) => setError(`Couldn't load the audit log: ${e.message}`));
    return () => { unsubAccounts(); unsubAudit(); };
  }, []);

  const value = useMemo(
    () => ({ accounts: accounts ?? [], audit, loading: accounts === null && !error, error }),
    [accounts, audit, error],
  );
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): DataApi {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used inside <DataProvider>');
  return ctx;
}
