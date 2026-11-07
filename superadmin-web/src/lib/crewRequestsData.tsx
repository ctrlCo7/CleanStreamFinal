import { ReactNode, createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { CrewRequest, subscribeCrewRequests } from './crewRequests';
import { useToast } from './feedback';

interface CrewRequestsApi {
  requests: CrewRequest[];
  pending: CrewRequest[];
  loading: boolean;
  error: string | null;
}

const Ctx = createContext<CrewRequestsApi | null>(null);

/** Ids that are new since the last list (pure, unit-tested). The first list never counts as new. */
export function newPendingIds(previous: Set<string> | null, current: CrewRequest[]): string[] {
  if (previous === null) return [];
  return current.filter((r) => r.status === 'pending' && !previous.has(r.id)).map((r) => r.id);
}

const desktopAlert = (title: string, body: string) => {
  try {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    const n = new Notification(title, { body, tag: 'cleanstream-crew-request' });
    n.onclick = () => { window.focus(); window.location.hash = '#/requests'; n.close(); };
  } catch { /* the browser blocks notifications here; the in-page alert still shows */ }
};

/**
 * Keeps the cleanup team requests live across the portal, so the sidebar badge, the browser
 * tab title and the alerts work on every page. A new request pops up in the page and, if the
 * Super Admin turned on desktop alerts, as a system notification even when the tab is hidden.
 */
export function CrewRequestsProvider({ children }: { children: ReactNode }) {
  const toast = useToast();
  const [requests, setRequests] = useState<CrewRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const seen = useRef<Set<string> | null>(null);

  useEffect(() => subscribeCrewRequests(
    (list) => {
      const fresh = newPendingIds(seen.current, list);
      seen.current = new Set(list.map((r) => r.id));
      setRequests(list);
      setError(null);
      for (const id of fresh) {
        const r = list.find((x) => x.id === id);
        if (!r) continue;
        const who = `${r.requestedByName} (${r.requestedByRole === 'admin' ? 'Captain' : 'Official'})`;
        toast.success(`New cleanup team request from Brgy. ${r.barangay}: "${r.teamName}", by ${who}`);
        desktopAlert('New cleanup team request', `Brgy. ${r.barangay} asks for "${r.teamName}" (${r.crewSize} workers).`);
      }
    },
    (e) => setError(`Couldn't load cleanup team requests: ${e.message}`),
  ), [toast]);

  const value = useMemo<CrewRequestsApi>(() => {
    const list = requests ?? [];
    return { requests: list, pending: list.filter((r) => r.status === 'pending'), loading: requests === null && !error, error };
  }, [requests, error]);

  // "(2) CleanStream Super Admin": waiting requests show in the tab even when it's in the background.
  useEffect(() => {
    const base = document.title.replace(/^\(\d+\)\s*/, '');
    document.title = value.pending.length ? `(${value.pending.length}) ${base}` : base;
  }, [value.pending.length]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCrewRequests(): CrewRequestsApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('useCrewRequests must be used inside <CrewRequestsProvider>');
  return v;
}
