/**
 * Live tracking of a cleanup crew driving to a site, like a delivery app.
 *
 * Crew leader's phone: "On my way" calls startTrip(). It gets a road route (OSRM, free,
 * no key; a straight line if that fails), then follows the phone's GPS while the app is
 * open, writing position, heading, remaining distance and arrival time to
 * `crewTracking/{taskId}` at most every few seconds. Leaving the route by 120 m fetches a
 * new route; coming within 60 m of the site marks the trip arrived and stops tracking.
 *
 * Everyone else (official, Admin, the resident who reported it) subscribes to that one
 * document and animates the truck between updates (see components/map/).
 *
 * Location is only shared during the trip, only from the foreground, and stops by itself
 * on arrival or when work starts.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { getNotifications } from './notificationsModule';
import { getCurrentPosition, lacksPlayServices, watchPosition } from './devicePosition';
import * as TaskManager from 'expo-task-manager';
import { collection, doc, onSnapshot, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { auth, db } from './firebase';
import { createNotification } from './notificationService';
import { CleanupTask, CrewTracking, User } from '../types';
import {
  ARRIVED_M, LatLng, NavInstruction, NavStep, OFF_ROUTE_M, REROUTE_M, bearing, etaSeconds, formatEta,
  GpsFix, SNAP_M, isPlausibleFix, locateOnRoute, nextInstruction, pathLength, placeSteps, pointAlong, simplifyPath,
  rerouteDecision, truckHeading,
} from './routeMath';
import * as Speech from 'expo-speech';
import { distanceM } from './reportProximity';
import { noteReceived, secondsSinceSeen } from '../components/map/trackingStatus';

const COL = 'crewTracking';
const OSRM = 'https://router.project-osrm.org/route/v1/driving';
// Write at most this often, unless the truck has moved a lot. Ride-hailing apps refresh every
// few seconds; viewers glide the truck along the road in between.
const MIN_WRITE_MS = 2500;
const MIN_MOVE_M = 6;
// Even when stopped (traffic, loading the truck), refresh so viewers see the crew is still
// live. Viewers say "Signal lost" after STALE_S (60 s) without one, i.e. four missed beats.
const HEARTBEAT_MS = 15000;
// How often the crew's phone checks whether a heartbeat is due (independent of GPS).
const BEAT_CHECK_MS = 5000;

// ─── Routing ─────────────────────────────────────────────────────────────────

export interface RoadRoute {
  path: LatLng[]; distanceM: number; durationS: number; source: 'osrm' | 'straight';
  /** Turn-by-turn directions for the crew (kept on their phone, not shared). */
  steps: NavStep[];
}

interface OsrmStep {
  name?: string;
  ref?: string;
  maneuver: { type: string; modifier?: string; exit?: number; location: [number, number] };
}

type OsrmRoute = {
  distance: number; duration: number; geometry: { coordinates: [number, number][] }; legs?: Array<{ steps?: OsrmStep[] }>;
};

async function requestOsrm(from: LatLng, to: LatLng, heading: number | undefined, signal: AbortSignal): Promise<OsrmRoute> {
  // `bearings` makes the route start the way the truck is already facing (within 60 degrees),
  // so a re-route doesn't tell it to turn around in the middle of the road.
  const bearings = heading != null ? `&bearings=${Math.round(((heading % 360) + 360) % 360)},60;` : '';
  const url = `${OSRM}/${from.longitude},${from.latitude};${to.longitude},${to.latitude}?overview=full&geometries=geojson&steps=true${bearings}`;
  const res = await fetch(url, { signal });
  const json = await res.json() as { code?: string; routes?: OsrmRoute[] };
  const r = json.routes?.[0];
  if (!res.ok || !r || r.geometry.coordinates.length < 2) throw new Error(`No route (${json.code ?? res.status})`);
  return r;
}

/**
 * A road route from `from` to `to` (OSRM, the OpenStreetMap road network). `heading`, when
 * known, keeps the route going the way the truck faces; if no such route exists (one-way
 * street, dead end) it asks again without it, and only then falls back to a straight line.
 */
export async function fetchRoute(from: LatLng, to: LatLng, timeoutMs = 8000, heading?: number): Promise<RoadRoute> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let r: OsrmRoute;
    try {
      r = await requestOsrm(from, to, heading, controller.signal);
    } catch (e) {
      if (heading == null || controller.signal.aborted) throw e;
      r = await requestOsrm(from, to, undefined, controller.signal);
    }
    const path = simplifyPath(r.geometry.coordinates.map(([lng, lat]) => ({ latitude: lat, longitude: lng })));
    const raw = (r.legs ?? []).flatMap((leg) => leg.steps ?? [])
      // "new name" is just the same road changing its name: not worth telling the driver.
      .filter((s) => s.maneuver.type !== 'new name' && s.maneuver.type !== 'notification')
      .map((s) => ({
        type: s.maneuver.type,
        ...(s.maneuver.modifier ? { modifier: s.maneuver.modifier } : {}),
        ...(s.maneuver.exit ? { exit: s.maneuver.exit } : {}),
        name: s.name || s.ref || '',
        location: { latitude: s.maneuver.location[1], longitude: s.maneuver.location[0] },
      }));
    return { path, distanceM: r.distance, durationS: r.duration, source: 'osrm', steps: placeSteps(path, raw) };
  } catch (e) {
    console.warn('[Tracking] Road route unavailable, using a straight line:', e);
    const dist = distanceM(from.latitude, from.longitude, to.latitude, to.longitude);
    const path = [from, to];
    return {
      path, distanceM: dist, durationS: etaSeconds(dist), source: 'straight',
      steps: placeSteps(path, [{ type: 'arrive', name: '', location: to }]),
    };
  } finally {
    clearTimeout(timer);
  }
}

// ─── Crew leader's side ──────────────────────────────────────────────────────
//
// GPS updates come from one of two places, and both go through handleLocation():
//  - Background (preferred): Location.startLocationUpdatesAsync with an Android foreground
//    service ("CleanStream is sharing your location" notification). Keeps working when the
//    crew switches apps, locks the phone, or closes CleanStream.
//  - Foreground only: watchPositionAsync, when the crew didn't allow "all the time".
// The trip is saved on the phone so the background task can pick it up after the screen
// that started it is gone.

/** Background task name. Defined at module load (App.tsx imports this file) so Android can wake it. */
export const TRIP_TASK = 'cleanstream-crew-trip';
const TRIP_KEY = 'cleanstream_active_trip_v1';

interface TripRecord {
  state: CrewTracking;
  assignedByUserId?: string;
  lastWriteAt: number;
  lastWritePos: LatLng;
  lastReroute: number;
  /** GPS fixes in a row further than REROUTE_M from the route. */
  offCount?: number;
  background: boolean;
  /** Turn-by-turn directions. Missing on trips saved by older versions of the app. */
  steps?: NavStep[];
  /** Which manoeuvres were already spoken, as "<atM>:far" / "<atM>:near". */
  spoken?: string[];
}

export interface TripCallbacks {
  onArrived?: () => void;
  onError?: (message: string) => void;
}

let trip: TripRecord | null = null;
let tripLoaded = false;
let foregroundSub: Location.LocationSubscription | null = null;
/** The last GPS fix that was used, to throw away glitches (see isPlausibleFix). */
let lastFix: GpsFix | null = null;
let rerouting = false;
let callbacks: TripCallbacks = {};
const listeners = new Set<(s: CrewTracking | null) => void>();

const publish = () => listeners.forEach((l) => l(trip?.state ?? null));

// ─── Directions for the crew (like a ride-hailing driver app) ────────────────

let nav: NavInstruction | null = null;
const navListeners = new Set<(n: NavInstruction | null) => void>();
const publishNav = () => navListeners.forEach((l) => l(nav));

/** The crew's next turn while their trip to `taskId` is running on this phone. */
export function watchNavigation(taskId: string, fn: (n: NavInstruction | null) => void): () => void {
  const f = (n: NavInstruction | null) => fn(trip?.state.taskId === taskId ? n : null);
  navListeners.add(f);
  f(nav);
  return () => { navListeners.delete(f); };
}

const VOICE_KEY = 'cleanstream_voice_directions_v1';
let voiceOn = true;
AsyncStorage.getItem(VOICE_KEY).then((v) => { if (v === 'off') voiceOn = false; }).catch(() => undefined);

export const isVoiceOn = () => voiceOn;
export function setVoiceOn(on: boolean): void {
  voiceOn = on;
  if (!on) Speech.stop().catch(() => undefined);
  AsyncStorage.setItem(VOICE_KEY, on ? 'on' : 'off').catch(() => undefined);
}

const say = (text: string) => {
  if (!voiceOn) return;
  try {
    Speech.speak(text, { language: 'en-US' });
  } catch (e) {
    console.warn('[Tracking] Voice directions unavailable:', e);
  }
};

// Each turn is announced twice: ahead of time, then just before it.
const ANNOUNCE_FAR_M = 250;
const ANNOUNCE_NEAR_M = 50;
const spokenDistance = (m: number) =>
  m < 1000 ? `${Math.round(m / 50) * 50 || 50} meters` : `${(m / 1000).toFixed(1)} kilometers`;
const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

function updateNav(t: TripRecord, travelledM: number): void {
  nav = t.steps ? nextInstruction(t.steps, travelledM) : null;
  publishNav();
  if (!nav || nav.step.type === 'depart') return;
  const spoken = (t.spoken ??= []);
  const id = String(Math.round(nav.step.atM));
  const d = nav.distanceM;
  if (d <= ANNOUNCE_NEAR_M && nav.step.type !== 'arrive') {
    if (!spoken.includes(`${id}:near`)) {
      spoken.push(`${id}:near`, `${id}:far`);
      say(nav.then ? `${nav.text}, then ${lowerFirst(nav.then)}` : nav.text);
    }
  } else if (d <= ANNOUNCE_FAR_M && d > ANNOUNCE_NEAR_M * 2 && !spoken.includes(`${id}:far`)) {
    spoken.push(`${id}:far`);
    say(`In ${spokenDistance(d)}, ${lowerFirst(nav.text)}`);
  }
}

function clearNav(): void {
  nav = null;
  publishNav();
  Speech.stop().catch(() => undefined);
}

async function loadTrip(): Promise<TripRecord | null> {
  if (tripLoaded) return trip;
  try {
    const raw = await AsyncStorage.getItem(TRIP_KEY);
    trip = raw ? (JSON.parse(raw) as TripRecord) : null;
  } catch {
    trip = null;
  }
  tripLoaded = true;
  publish();
  return trip;
}

const saveTrip = () =>
  (trip ? AsyncStorage.setItem(TRIP_KEY, JSON.stringify(trip)) : AsyncStorage.removeItem(TRIP_KEY))
    .catch((e) => console.warn('[Tracking] Could not save trip on the phone:', e));

// Pick up a trip that was running before the app restarted.
loadTrip().catch(() => undefined);

export const isTripActive = (taskId: string) => trip?.state.taskId === taskId && trip.state.status === 'en_route';

/** Follows this phone's own trip (no network round trip), e.g. for the crew's screen. */
export function watchLocalTrip(taskId: string, fn: (s: CrewTracking | null) => void): () => void {
  const f = (s: CrewTracking | null) => fn(s && s.taskId === taskId ? s : null);
  listeners.add(f);
  f(trip?.state ?? null);
  // The crew is looking at this trip: if the app was restarted mid-trip, start sending again.
  loadTrip().then(() => { if (isTripActive(taskId)) resumeUpdates().catch(() => undefined); }).catch(() => undefined);
  return () => { listeners.delete(f); };
}

const ping = (userId: string | undefined, s: CrewTracking, title: string, body: string) => {
  if (!userId) return;
  createNotification({ userId, type: 'task_updated', taskId: s.taskId, reportId: s.reportId, title, body })
    .catch((e) => console.warn('[Tracking] Notification failed (non-fatal):', e));
};

// ─── Heartbeat ───────────────────────────────────────────────────────────────
// Phones only report GPS when they move (and skip blurry fixes), so a parked truck, or one
// waiting for its first good fix, would send nothing and look "lost" to everyone. This timer
// keeps saying "still here" while the trip runs, whatever the GPS is doing.
let beatTimer: ReturnType<typeof setInterval> | null = null;

function beat(force = false): void {
  const t = trip;
  if (!t || t.state.status !== 'en_route') { stopHeartbeat(); return; }
  if (auth.currentUser?.uid !== t.state.crewId) return;
  const now = Date.now();
  if (!force && now - t.lastWriteAt < HEARTBEAT_MS) return;
  t.lastWriteAt = now;
  t.state = { ...t.state, updatedAtMs: now };
  publish();
  updateDoc(doc(db, COL, t.state.taskId), { updatedAtMs: now })
    .catch((e) => console.warn('[Tracking] Heartbeat failed (will retry):', e));
  saveTrip();
}

function startHeartbeat(): void {
  if (!beatTimer) beatTimer = setInterval(() => beat(), BEAT_CHECK_MS);
}

function stopHeartbeat(): void {
  if (beatTimer) clearInterval(beatTimer);
  beatTimer = null;
}

async function stopUpdates(): Promise<void> {
  stopHeartbeat();
  foregroundSub?.remove();
  foregroundSub = null;
  clearNav();
  try {
    if (await Location.hasStartedLocationUpdatesAsync(TRIP_TASK)) await Location.stopLocationUpdatesAsync(TRIP_TASK);
  } catch (e) {
    console.warn('[Tracking] Could not stop background updates:', e);
  }
}

// Runs for every GPS update, in the foreground or from the background service.
async function handleLocation(loc: Location.LocationObject): Promise<void> {
  const t0 = await loadTrip();
  if (!t0 || t0.state.status !== 'en_route') {
    await stopUpdates();
    return;
  }
  // If Android restarted the app in the background, nobody is signed in (sign-ins aren't
  // kept between launches) and the position can't be saved. Stop and ask the crew to reopen.
  if (auth.currentUser?.uid !== t0.state.crewId) {
    await stopUpdates();
    getNotifications()?.scheduleNotificationAsync({
      content: { title: 'Location sharing paused', body: 'Open CleanStream and tap “Resume sharing” so the barangay can keep following your truck.' },
      trigger: null,
    }).catch(() => undefined);
    return;
  }

  const t = t0;
  const s = t.state;
  const now = Date.now();
  const fix: GpsFix = { latitude: loc.coords.latitude, longitude: loc.coords.longitude, accuracy: loc.coords.accuracy, timeMs: loc.timestamp || now };
  // A blurry fix (indoors, between tall buildings) or an impossible jump: skip it, like
  // ride-hailing apps do, instead of making the truck hop around.
  if (!isPlausibleFix(fix, lastFix)) { beat(); return; }
  const prevFix = lastFix;
  lastFix = fix;
  const raw: LatLng = { latitude: fix.latitude, longitude: fix.longitude };
  const dest = s.destination;
  const onRoute = locateOnRoute(s.route, raw);
  const travelledM = pathLength(s.route) - onRoute.remainingM;
  // Close to the route: draw the truck on the road, facing along it (GPS wanders 5–20 m).
  const snapped = onRoute.offRouteM <= SNAP_M && s.routeSource === 'osrm';
  const p: LatLng = snapped ? onRoute.point : raw;

  // Strayed from the route (wrong turn, closed road): get a new one from where the truck is
  // now, going the way it faces. Far off: at once; a little off: on the second fix in a row.
  const decision = rerouteDecision({
    offRouteM: onRoute.offRouteM, offCount: t.offCount ?? 0, straight: s.routeSource === 'straight',
    nowMs: now, lastRerouteMs: t.lastReroute, busy: rerouting,
  });
  t.offCount = decision.offCount;
  const { strayed } = decision;
  if (decision.fetch) {
    rerouting = true;
    t.lastReroute = now;
    const facing = (loc.coords.speed ?? 0) > 1 ? s.heading : undefined;
    fetchRoute(p, dest, 8000, facing)
      .then((r) => {
        if (trip !== t) return undefined;
        // Still no road route: keep the old line rather than swapping it for another.
        if (r.source === 'straight' && t.state.routeSource === 'straight' && !strayed) return undefined;
        const routeVersion = (t.state.routeVersion ?? 0) + 1;
        t.state = {
          ...t.state, route: r.path, routeSource: r.source, routeDistanceM: r.distanceM, routeDurationS: r.durationS,
          routeVersion, offRoute: false,
        };
        t.offCount = 0;
        t.steps = r.steps;
        t.spoken = [];
        if (strayed) say('Route updated');
        saveTrip();
        publish();
        return updateDoc(doc(db, COL, s.taskId), {
          route: r.path, routeSource: r.source, routeDistanceM: r.distanceM, routeDurationS: r.durationS, routeVersion, offRoute: false,
        });
      })
      .catch((e) => console.warn('[Tracking] Re-route failed:', e))
      .finally(() => { rerouting = false; });
  }

  const remainingM = onRoute.offRouteM > OFF_ROUTE_M
    ? distanceM(p.latitude, p.longitude, dest.latitude, dest.longitude) * 1.3
    : onRoute.remainingM;
  // On the road, face the way the road goes. Off it, the GPS course while moving, else the
  // direction between this fix and the last one; stopped, keep facing the same way.
  const heading = truckHeading({
    roadHeading: snapped ? pointAlong(s.route, travelledM).heading : null,
    gpsHeading: loc.coords.heading,
    speed: loc.coords.speed,
    prev: prevFix,
    next: raw,
    last: s.heading,
  });
  const arrived = distanceM(raw.latitude, raw.longitude, dest.latitude, dest.longitude) <= ARRIVED_M;

  t.state = {
    ...s,
    latitude: p.latitude,
    longitude: p.longitude,
    heading: Math.round(heading),
    ...(loc.coords.speed != null && loc.coords.speed >= 0 ? { speed: loc.coords.speed } : {}),
    ...(loc.coords.accuracy != null ? { accuracy: loc.coords.accuracy } : {}),
    remainingM: Math.round(arrived ? 0 : remainingM),
    etaSeconds: arrived ? 0 : etaSeconds(remainingM, s.routeDistanceM, s.routeDurationS),
    alongM: Math.round(travelledM * 10) / 10,
    onRoute: snapped,
    offRoute: onRoute.offRouteM > REROUTE_M && s.routeSource === 'osrm',
    updatedAtMs: now,
    ...(arrived ? { status: 'arrived' as const, arrivedAt: now } : {}),
  };
  publish();
  if (!arrived) updateNav(t, travelledM);

  const moved = distanceM(p.latitude, p.longitude, t.lastWritePos.latitude, t.lastWritePos.longitude);
  if (arrived || (now - t.lastWriteAt >= MIN_WRITE_MS && moved >= MIN_MOVE_M) || now - t.lastWriteAt >= HEARTBEAT_MS) {
    t.lastWriteAt = now;
    t.lastWritePos = p;
    const { route: _route, ...live } = t.state;
    updateDoc(doc(db, COL, s.taskId), live).catch((e) => {
      console.warn('[Tracking] Position update failed:', e);
      callbacks.onError?.("Your location couldn't be shared. Check your internet connection.");
    });
    saveTrip();
  }

  if (arrived) {
    await stopUpdates();
    say('You have arrived at the cleanup site');
    ping(t.assignedByUserId, t.state, '🚚 Cleanup crew arrived', `${t.state.crewName} has arrived at the cleanup site.`);
    trip = null;
    saveTrip();
    publish();
    if (t.background) {
      getNotifications()?.scheduleNotificationAsync({
        content: { title: 'You have arrived', body: 'Location sharing has stopped. Take a before photo, then tap Start work.' },
        trigger: null,
      }).catch(() => undefined);
    }
    callbacks.onArrived?.();
  }
}

try {
  TaskManager.defineTask<{ locations?: Location.LocationObject[] }>(TRIP_TASK, async ({ data, error }) => {
    if (error) {
      console.warn('[Tracking] Background location error:', error);
      return;
    }
    for (const loc of data?.locations ?? []) await handleLocation(loc);
  });
} catch (e) {
  // Builds without expo-task-manager (e.g. Expo Go) fall back to foreground tracking.
  console.warn('[Tracking] Background task unavailable:', e);
}

export type TripMode = 'background' | 'foreground';

/**
 * Starts sharing the crew leader's location on the way to the site. Asks for location
 * "all the time" so it keeps working with the app closed; if that's refused, it still
 * works while CleanStream is open. Returns which of the two it got.
 */
export async function startTrip(task: CleanupTask, crew: User, cb: TripCallbacks = {}): Promise<TripMode> {
  callbacks = cb;
  await loadTrip();
  if (isTripActive(task.id)) {
    await resumeUpdates();
    return trip?.background ? 'background' : 'foreground';
  }

  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== 'granted') {
    throw new Error('Location permission is needed so the official and the reporter can follow your trip. Allow it in your phone settings.');
  }
  let canBackground = false;
  try {
    canBackground = (await Location.requestBackgroundPermissionsAsync()).status === 'granted'
      && await TaskManager.isAvailableAsync();
  } catch {
    canBackground = false;
  }

  const here = await getCurrentPosition({ accuracy: Location.Accuracy.High });
  const start: LatLng = { latitude: here.coords.latitude, longitude: here.coords.longitude };
  const destination: LatLng = { latitude: task.location.latitude, longitude: task.location.longitude };
  const route = await fetchRoute(start, destination);
  const now = Date.now();

  const state: CrewTracking = {
    taskId: task.id,
    reportId: task.reportId,
    crewId: crew.uid,
    crewName: task.assignedTeamName || `${crew.firstName} ${crew.lastName}`,
    barangayId: task.barangayId,
    ...(task.reporterUserId ? { reporterUserId: task.reporterUserId } : {}),
    status: 'en_route',
    latitude: start.latitude,
    longitude: start.longitude,
    heading: route.path.length > 1 ? bearing(route.path[0], route.path[1]) : 0,
    ...(here.coords.speed != null && here.coords.speed >= 0 ? { speed: here.coords.speed } : {}),
    ...(here.coords.accuracy != null ? { accuracy: here.coords.accuracy } : {}),
    destination,
    route: route.path,
    routeSource: route.source,
    routeDistanceM: route.distanceM,
    routeDurationS: route.durationS,
    routeVersion: 0,
    tripDistanceM: route.distanceM,
    remainingM: route.distanceM,
    etaSeconds: Math.round(route.durationS),
    startedAt: now,
    updatedAtMs: now,
  };
  await setDoc(doc(db, COL, task.id), state);

  trip = {
    state, assignedByUserId: task.assignedByUserId, lastWriteAt: now, lastWritePos: start, lastReroute: now,
    background: canBackground, steps: route.steps, spoken: [],
  };
  await saveTrip();
  publish();
  updateNav(trip, 0);
  say(`Heading to the cleanup site, ${spokenDistance(route.distanceM)}, about ${formatEta(route.durationS)}`);

  // Tell the official and the reporter, like "Your rider is on the way".
  const body = `${state.crewName} is heading to the site. Arriving in about ${formatEta(state.etaSeconds)}. Open the report to follow them live.`;
  ping(task.assignedByUserId, state, '🚚 Cleanup crew on the way', body);
  ping(task.reporterUserId, state, '🚚 Cleanup crew on the way', body);

  lastFix = null;
  startHeartbeat();
  const options: Location.LocationTaskOptions = {
    accuracy: Location.Accuracy.BestForNavigation,
    timeInterval: 2000,
    // 0, not 5: with a distance filter a parked truck gets no updates at all.
    distanceInterval: 0,
    activityType: Location.ActivityType.AutomotiveNavigation,
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: 'CleanStream is sharing your location',
      notificationBody: 'Heading to the cleanup site. Sharing stops when you arrive.',
      notificationColor: '#1D9E75',
      killServiceOnDestroy: false,
    },
  };
  // Background updates need Google Play services; without them they never arrive.
  if (canBackground && lacksPlayServices()) {
    trip.background = false;
    await saveTrip();
  } else if (canBackground) {
    try {
      await Location.startLocationUpdatesAsync(TRIP_TASK, options);
      return 'background';
    } catch (e) {
      console.warn('[Tracking] Background updates failed to start, using foreground only:', e);
      trip.background = false;
      await saveTrip();
    }
  }
  await startForegroundWatch();
  return 'foreground';
}

async function startForegroundWatch(): Promise<void> {
  startHeartbeat();
  if (foregroundSub) return;
  foregroundSub = await watchPosition(
    { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 2000, distanceInterval: 0 },
    (loc) => { handleLocation(loc); },
  );
}

/**
 * The crew opened the app again during a trip (e.g. after Android closed it): make sure the
 * phone is still sending. A background trip whose service was stopped, or a foreground-only
 * trip (its GPS watch ends with the app), is restarted here.
 */
async function resumeUpdates(): Promise<void> {
  const t = trip;
  if (!t || t.state.status !== 'en_route' || auth.currentUser?.uid !== t.state.crewId) return;
  startHeartbeat();
  beat(true);
  if (t.background) {
    try {
      if (await Location.hasStartedLocationUpdatesAsync(TRIP_TASK)) return;
    } catch { /* fall through to the foreground watch */ }
  }
  await startForegroundWatch();
}

/**
 * Ends the trip: on arrival, when work starts, or when the crew stops sharing. Viewers see
 * "Crew has arrived" or the map disappears.
 */
export async function endTrip(taskId: string, status: 'arrived' | 'ended'): Promise<void> {
  await loadTrip();
  if (trip?.state.taskId === taskId) {
    await stopUpdates();
    trip = null;
    await saveTrip();
    publish();
  }
  try {
    await updateDoc(doc(db, COL, taskId), { status, updatedAtMs: Date.now(), ...(status === 'arrived' ? { arrivedAt: Date.now() } : {}) });
  } catch (e) {
    // No document means no trip was ever started for this task.
    console.warn('[Tracking] Could not end trip (non-fatal):', e);
  }
}

// ─── Viewers' side ───────────────────────────────────────────────────────────

const toTracking = (data: Record<string, unknown>): CrewTracking => {
  const t = data as unknown as CrewTracking;
  noteReceived(t);
  return t;
};

/** Official / Admin / crew: the trip for one task. */
export function subscribeTracking(taskId: string, fn: (t: CrewTracking | null) => void): () => void {
  return onSnapshot(
    doc(db, COL, taskId),
    (snap) => fn(snap.exists() ? toTracking(snap.data()) : null),
    () => fn(null),
  );
}

/**
 * The resident who reported the waste: the live trip for their report, if any. The
 * query must name the reporter, because the rules only let them read their own trips.
 */
export function subscribeTrackingForReport(reportId: string, reporterUserId: string, fn: (t: CrewTracking | null) => void): () => void {
  const q = query(collection(db, COL), where('reportId', '==', reportId), where('reporterUserId', '==', reporterUserId));
  return onSnapshot(
    q,
    (snap) => {
      const trips = snap.docs.map((d) => toTracking(d.data())).sort((a, b) => b.startedAt - a.startedAt);
      fn(trips[0] ?? null);
    },
    () => fn(null),
  );
}

/** Seconds since the crew's phone last reported in. */
export const secondsSinceUpdate = secondsSinceSeen;

/**
 * Trucks currently driving to a site, for the officials' and Admin's map. Both only see
 * their own barangay (the rules require the query to say so).
 */
export function subscribeActiveTrips(viewer: { role: string; barangayId?: string }, fn: (trips: CrewTracking[]) => void): () => void {
  if ((viewer.role !== 'admin' && viewer.role !== 'barangay') || !viewer.barangayId) {
    fn([]);
    return () => undefined;
  }
  const q = query(collection(db, COL), where('barangayId', '==', viewer.barangayId), where('status', '==', 'en_route'));
  return onSnapshot(q, (snap) => fn(snap.docs.map((d) => toTracking(d.data()))), () => fn([]));
}
