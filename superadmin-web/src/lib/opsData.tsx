import { ReactNode, createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  Checkpoint, DEFAULT_SETTINGS, Inspection, Report, Settings,
  subscribeCheckpoints, subscribeInspections, subscribeReports, subscribeSettings,
} from './operations';

type Stream = 'reports' | 'checkpoints' | 'inspections' | 'settings';

interface OpsApi {
  reports: Report[];
  checkpoints: Checkpoint[];
  inspections: Inspection[];
  settings: Settings;
  /** True until that stream's first answer (or error) arrives. */
  loading: Record<Stream, boolean>;
  /** Kept per stream, so one refused query doesn't blank out the pages that don't need it. */
  errors: Partial<Record<Stream, string>>;
}

const OpsContext = createContext<OpsApi | null>(null);

export function OpsDataProvider({ children }: { children: ReactNode }) {
  const [reports, setReports] = useState<Report[] | null>(null);
  const [checkpoints, setCheckpoints] = useState<Checkpoint[] | null>(null);
  const [inspections, setInspections] = useState<Inspection[] | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [errors, setErrors] = useState<Partial<Record<Stream, string>>>({});

  useEffect(() => {
    const fail = (s: Stream, what: string) => (e: Error) => setErrors((x) => ({ ...x, [s]: `Couldn't load ${what}: ${e.message}` }));
    const ok = <T,>(s: Stream, set: (v: T) => void) => (v: T) => { set(v); setErrors((x) => (x[s] ? { ...x, [s]: undefined } : x)); };
    const unsubs = [
      subscribeReports(ok('reports', setReports), fail('reports', 'waste reports')),
      subscribeCheckpoints(ok('checkpoints', setCheckpoints), fail('checkpoints', 'checkpoints')),
      subscribeInspections(ok('inspections', setInspections), fail('inspections', 'inspection reports')),
      subscribeSettings(ok('settings', setSettings), fail('settings', 'system settings')),
    ];
    return () => unsubs.forEach((u) => u());
  }, []);

  const value = useMemo<OpsApi>(() => ({
    reports: reports ?? [],
    checkpoints: checkpoints ?? [],
    inspections: inspections ?? [],
    settings: settings ?? DEFAULT_SETTINGS,
    loading: {
      reports: reports === null && !errors.reports,
      checkpoints: checkpoints === null && !errors.checkpoints,
      inspections: inspections === null && !errors.inspections,
      settings: settings === null && !errors.settings,
    },
    errors,
  }), [reports, checkpoints, inspections, settings, errors]);

  return <OpsContext.Provider value={value}>{children}</OpsContext.Provider>;
}

export function useOps(): OpsApi {
  const ctx = useContext(OpsContext);
  if (!ctx) throw new Error('useOps must be used inside <OpsDataProvider>');
  return ctx;
}

/** Shows the errors of just the streams a page depends on. */
export function OpsErrors({ streams }: { streams: Stream[] }) {
  const { errors } = useOps();
  const shown = streams.map((s) => errors[s]).filter(Boolean);
  return <>{shown.map((e) => <p key={e} className="callout callout-error" role="alert">{e}</p>)}</>;
}
