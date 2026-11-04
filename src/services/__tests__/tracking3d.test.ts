import { describe, expect, it } from 'vitest';
import { MOTION_CONSTANTS, motionJs } from '../../components/map/tracking3d/motionJs';
import { truckModelJs } from '../../components/map/tracking3d/truckModelJs';
import { tracking3dHtml, Frame3D } from '../../components/map/tracking3d/tracking3dPage';
import { movementStatus, speedKmh, tripProgress } from '../../components/map/trackingStatus';
import { nextMotion } from '../../components/map/truckMotion';
import type { CrewTracking } from '../../types';

// The exact JavaScript the WebView runs, loaded into a sandbox `window`.
type P = { lng: number; lat: number };
interface MotionState { shown: P | null; h: number; speed: number; accel: number; turnRate: number; active: boolean; jumped: boolean }
interface Motion {
  csMotionCreate(): MotionState;
  csMotionPush(st: MotionState, to: unknown, now: number): MotionState;
  csMotionStep(st: MotionState, now: number): MotionState;
  csTurn(a: number, b: number): number;
}
function loadMotion(): Motion {
  const win: Record<string, unknown> = {};
  // eslint-disable-next-line no-new-func
  new Function('window', motionJs)(win);
  return win as unknown as Motion;
}

const M = 1 / 111320; // degrees of latitude per metre
const at = (northM: number, eastM: number) => ({
  latitude: 10.3 + northM * M,
  longitude: 123.89 + (eastM * M) / Math.cos((10.3 * Math.PI) / 180),
});

/** Runs the glide at 60 fps and records every drawn frame. */
function drive(m: Motion, st: MotionState, from: number, ms: number) {
  const out: Array<{ t: number; h: number; p: P; speed: number; turnRate: number }> = [];
  for (let t = from; t <= from + ms; t += 16) {
    m.csMotionStep(st, t);
    out.push({ t, h: st.h, p: { ...st.shown! }, speed: st.speed, turnRate: st.turnRate });
  }
  return out;
}

const maxStepPerFrame = (frames: Array<{ h: number }>, m: Motion) =>
  Math.max(...frames.slice(1).map((f, i) => Math.abs(m.csTurn(frames[i].h, f.h))));

describe('3D truck motion (page script)', () => {
  it('drives straight ahead without turning', () => {
    const m = loadMotion();
    const st = m.csMotionCreate();
    m.csMotionPush(st, { ...at(0, 0), heading: 0 }, 0);
    m.csMotionPush(st, { ...at(40, 0), heading: 0, durationMs: 2500 }, 0);
    const frames = drive(m, st, 0, 2600);
    expect(frames.every((f) => Math.abs(m.csTurn(0, f.h)) < 0.01)).toBe(true);
    expect(st.shown!.lat).toBeCloseTo(at(40, 0).latitude, 9);
  });

  it('turns right through a corner, along the road, ending facing east', () => {
    const m = loadMotion();
    const st = m.csMotionCreate();
    m.csMotionPush(st, { ...at(0, 0), heading: 0 }, 0);
    m.csMotionPush(st, { ...at(30, 30), heading: 90, via: [at(30, 0)], durationMs: 3000 }, 0);
    const frames = drive(m, st, 0, 4500);
    // Never turns left, never more than the max turn rate.
    expect(frames.every((f) => f.turnRate >= -0.01)).toBe(true);
    expect(maxStepPerFrame(frames, m)).toBeLessThanOrEqual((MOTION_CONSTANTS.MAX_TURN_DPS * 16) / 1000 + 1e-6);
    expect(Math.round(st.h)).toBe(90);
    // It stays on the road: every drawn point is on the north leg (east 0) or the east leg (north 30).
    for (const f of frames) {
      const north = (f.p.lat - 10.3) / M;
      const east = ((f.p.lng - 123.89) / M) * Math.cos((10.3 * Math.PI) / 180);
      expect(Math.min(Math.abs(east), Math.abs(north - 30))).toBeLessThan(0.01);
    }
    // It starts turning just before the corner (look-ahead), not after it.
    const firstTurn = frames.find((f) => Math.abs(m.csTurn(0, f.h)) > 1)!;
    expect((firstTurn.p.lat - 10.3) / M).toBeLessThan(30);
  });

  it('turns left through a corner, ending facing west', () => {
    const m = loadMotion();
    const st = m.csMotionCreate();
    m.csMotionPush(st, { ...at(0, 0), heading: 0 }, 0);
    m.csMotionPush(st, { ...at(30, -30), heading: 270, via: [at(30, 0)], durationMs: 3000 }, 0);
    const frames = drive(m, st, 0, 4500);
    expect(frames.every((f) => f.turnRate <= 0.01)).toBe(true);
    expect(Math.round(st.h)).toBe(270);
  });

  it('sweeps round smoothly in a U-turn instead of flipping', () => {
    const m = loadMotion();
    const st = m.csMotionCreate();
    m.csMotionPush(st, { ...at(0, 0), heading: 0 }, 0);
    // Turned round (new route): now heading south, 20 m back down the road.
    m.csMotionPush(st, { ...at(-20, 0), heading: 180, durationMs: 2500 }, 0);
    const frames = drive(m, st, 0, 3000);
    expect(maxStepPerFrame(frames, m)).toBeLessThanOrEqual((MOTION_CONSTANTS.MAX_TURN_DPS * 16) / 1000 + 1e-6);
    // 180° at the max turn rate takes over a second, and it gets there.
    const halfway = frames.find((f) => Math.abs(m.csTurn(0, f.h)) >= 90)!;
    expect(halfway.t).toBeGreaterThan(500);
    expect(Math.round(st.h)).toBe(180);
    // Always one way round, never back and forth.
    const signs = new Set(frames.filter((f) => Math.abs(f.turnRate) > 0.5).map((f) => Math.sign(f.turnRate)));
    expect(signs.size).toBe(1);
  });

  it('ignores GPS jitter: a 1 m wobble backwards does not spin a parked truck', () => {
    const m = loadMotion();
    const st = m.csMotionCreate();
    m.csMotionPush(st, { ...at(0, 0), heading: 0 }, 0);
    m.csMotionPush(st, { ...at(-1, 0), heading: 0, durationMs: 2500, stopped: true }, 0);
    const frames = drive(m, st, 0, 2600);
    expect(frames.every((f) => Math.abs(m.csTurn(0, f.h)) < 0.01)).toBe(true);
  });

  it('eases into a stop and goes still', () => {
    const m = loadMotion();
    const st = m.csMotionCreate();
    m.csMotionPush(st, { ...at(0, 0), heading: 0 }, 0);
    m.csMotionPush(st, { ...at(25, 0), heading: 0, durationMs: 2500 }, 0);
    drive(m, st, 0, 2500);
    m.csMotionPush(st, { ...at(35, 0), heading: 0, durationMs: 2500, stopped: true }, 2500);
    const frames = drive(m, st, 2516, 4000);
    const early = frames.find((f) => f.t >= 2800)!.speed;
    const late = frames.find((f) => f.t >= 4800)!.speed;
    expect(late).toBeLessThan(early);
    expect(st.active).toBe(false);
    expect(st.speed).toBe(0);
  });

  it('places the truck after lost signal instead of driving through blocks', () => {
    const m = loadMotion();
    const st = m.csMotionCreate();
    m.csMotionPush(st, { ...at(0, 0), heading: 0 }, 0);
    m.csMotionPush(st, { ...at(400, 300), heading: 90, durationMs: 5000 }, 0);
    expect(st.jumped).toBe(true);
    expect(st.shown!.lat).toBeCloseTo(at(400, 300).latitude, 9);
    expect(st.h).toBe(90);
  });
});

describe('3D tracking page', () => {
  const frame: Frame3D = {
    truck: { ...at(0, 0), heading: 0, via: [], durationMs: 2500 },
    ahead: [at(0, 0), at(100, 0)],
    destination: at(100, 0),
    straight: false, stale: false, offRoute: false, me: null,
    labels: { truck: "🚚 Team 'A'", site: 'Cleanup site', me: 'You' },
  };

  it('builds pages whose scripts parse, light and dark, driver or viewer', () => {
    for (const dark of [false, true]) {
      for (const driver of [false, true]) {
        const html = tracking3dHtml({ dark, driver, frame });
        const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((x) => x[1]);
        expect(scripts.length).toBe(2);
        // eslint-disable-next-line no-new-func
        for (const s of scripts) expect(() => new Function(s)).not.toThrow();
        expect(html).toContain('three@0.149.0');
        expect(html).toContain("type: 'custom', renderingMode: '3d'");
        expect(html).toContain('fill-extrusion');
      }
    }
  });

  it('builds the truck model script', () => {
    // eslint-disable-next-line no-new-func
    expect(() => new Function(truckModelJs)).not.toThrow();
  });
});

describe('live status', () => {
  const base = { status: 'en_route', remainingM: 2000, routeDistanceM: 4000, speed: 8 } as CrewTracking;
  it('says what the truck is doing', () => {
    expect(movementStatus(base, 3)).toBe('moving');
    expect(movementStatus({ ...base, speed: 0.2 }, 3)).toBe('stopped');
    expect(movementStatus({ ...base, offRoute: true }, 3)).toBe('rerouting');
    expect(movementStatus({ ...base, remainingM: 90 }, 3)).toBe('arriving');
    expect(movementStatus(base, 90)).toBe('lost');
    expect(speedKmh(base)).toBe(29);
  });
  it('keeps trip progress after a re-route', () => {
    expect(tripProgress(base)).toBe(50);
    // Re-routed 1.5 km in: the new route is 2.5 km, but the trip was 4 km.
    expect(tripProgress({ ...base, tripDistanceM: 4000, routeDistanceM: 2500, remainingM: 2500 })).toBe(38);
  });
});

describe('viewers know a new route replaced the old one', () => {
  const trip = (routeVersion: number, alongM: number, atMs: number) => ({
    ...at(alongM, 0), heading: 0, alongM, onRoute: true, updatedAtMs: atMs, routeVersion,
    route: [at(0, 0), at(30, 0), at(30, 30)], routeDistanceM: 60, speed: 8,
  }) as unknown as CrewTracking;
  it('traces corners on the same route, not across a new one', () => {
    const a = nextMotion(undefined, trip(1, 20, 0));
    expect(nextMotion(a.memo, { ...trip(1, 45, 2500), ...at(30, 15) }).target.via).toHaveLength(1);
    expect(nextMotion(a.memo, { ...trip(2, 45, 2500), ...at(30, 15) }).target.via).toHaveLength(0);
  });
  it('marks a standing truck as stopped', () => {
    expect(nextMotion(undefined, { ...trip(1, 20, 0), speed: 0.3 } as CrewTracking).target.stopped).toBe(true);
    expect(nextMotion(undefined, trip(1, 20, 0)).target.stopped).toBe(false);
  });
});
