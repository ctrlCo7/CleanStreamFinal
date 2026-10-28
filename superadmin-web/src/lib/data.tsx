import { ReactNode, createContext, useContext, useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { subscribeAccounts, subscribeAudit } from './accounts';
import { Barangay, setRegisteredBarangays } from './barangays';
import { db } from './firebase';
import { Account, AuditEntry } from './types';

interface DataApi {
  accounts: Account[];
  audit: AuditEntry[];
  loading: boolean;
  /** Barangays typed in by a Super Admin (the fixed list is in barangays.ts). */
  customBarangays: Barangay[];
  /** Set if either live query was refused or failed (e.g. missing permission). */
  error: string | null;
}

const DataContext = createContext<DataApi | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [customBarangays, setCustomBarangays] = useState<Barangay[]>([]);

  useEffect(() => {
    const unsubAccounts = subscribeAccounts(
      (list) => { setAccounts(list); setError(null); },
      (e) => setError(`Couldn't load accounts: ${e.message}`),
    );
    const unsubAudit = subscribeAudit(setAudit, (e) => setError(`Couldn't load the audit log: ${e.message}`));
    // Registered before the state update, so lookups during the re-render already see them.
    const unsubBarangays = onSnapshot(
      query(collection(db, 'barangays'), where('custom', '==', true)),
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, name: String(d.data().name ?? d.id), custom: true }));
        setRegisteredBarangays(list);
        setCustomBarangays(list);
      },
      (e) => console.warn('[Barangays] Could not load registered barangays:', e),
    );
    return () => { unsubAccounts(); unsubAudit(); unsubBarangays(); };
  }, []);

  const value = useMemo(
    () => ({ accounts: accounts ?? [], audit, customBarangays, loading: accounts === null && !error, error }),
    [accounts, audit, customBarangays, error],
  );
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): DataApi {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used inside <DataProvider>');
  return ctx;
}
