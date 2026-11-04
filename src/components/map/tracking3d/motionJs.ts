/**
 * How the 3D truck moves and turns on the tracking map, as plain JavaScript for the WebView
 * page (tracking3dPage.ts). No React Native imports and no browser APIs, so the unit tests
 * run this exact code with `new Function` and drive it through turns and U-turns.
 *
 * Between two GPS updates the truck drives along the road through its corners (`via`) at a
 * steady speed, easing out when it comes to a stop and easing in when it pulls away.
 * Its heading comes only from the movement (the road ahead of it, a few metres of look-ahead
 * so it starts turning into a corner just before it, like a driver) or, for tiny moves and
 * when parked, from the heading the crew's phone reported (road direction / GPS course).
 * It is never derived from the camera, so turning the map never turns the truck.
 *
 * The drawn heading turns towards that direction smoothly with a limited turn rate, so a
 * U-turn sweeps round over about a second and a half instead of flipping.
 *
 * Exposes: csMotionCreate(), csMotionPush(state, target, nowMs), csMotionStep(state, nowMs),
 * csTurn(from, to), csBearing(a, b), csDist(a, b).
 */
export const MOTION_CONSTANTS = {
  /** A hop longer than this is a catch-up after lost signal: place the truck there, don't drive through blocks. */
  MAX_GLIDE_M: 1500,
  /** A straight-line hop (no road corners known) longer than this is also placed, not driven. */
  MAX_STRAIGHT_GLIDE_M: 150,
  /** Moves shorter than this keep the reported heading (GPS jitter must not spin the truck). */
  MIN_HEADING_MOVE_M: 5,
  /** Look this far ahead along the road to decide which way to face. */
  LOOKAHEAD_M: 6,
  /** Fastest the drawn truck turns, degrees per second. */
  MAX_TURN_DPS: 140,
  /** How quickly the drawn heading closes in on the target direction (per second). */
  TURN_GAIN: 6,
};

export const motionJs = `
  var CS_M = ${JSON.stringify(MOTION_CONSTANTS)};
  function csTurn(from, to) { return ((to - from + 540) % 360) - 180; }
  function csDist(a, b) {
    var k = Math.cos(a.lat * Math.PI / 180), dx = (b.lng - a.lng) * k, dy = b.lat - a.lat;
    return Math.sqrt(dx * dx + dy * dy) * 111320;
  }
  function csBearing(a, b) {
    var r = Math.PI / 180, y = Math.sin((b.lng - a.lng) * r) * Math.cos(b.lat * r);
    var x = Math.cos(a.lat * r) * Math.sin(b.lat * r) - Math.sin(a.lat * r) * Math.cos(b.lat * r) * Math.cos((b.lng - a.lng) * r);
    return (Math.atan2(y, x) / r + 360) % 360;
  }
  function csClamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  function csMotionCreate() {
    return { shown: null, h: 0, finalH: 0, path: null, lens: [], total: 0, start: 0, duration: 0,
      ease: 'linear', lastT: 0, speed: 0, accel: 0, turnRate: 0, stopped: true, jumped: false, active: false };
  }

  function csAlong(st, m) {
    var p = st.path, left = m, j = 0;
    while (j < st.lens.length - 1 && left > st.lens[j]) { left -= st.lens[j]; j++; }
    var f = st.lens[j] ? csClamp(left / st.lens[j], 0, 1) : 1, a = p[j], b = p[j + 1];
    return { lng: a.lng + (b.lng - a.lng) * f, lat: a.lat + (b.lat - a.lat) * f };
  }

  function csEase(kind, t) {
    if (kind === 'inout') return t * t * (3 - 2 * t);
    if (kind === 'out') return 1 - (1 - t) * (1 - t);
    if (kind === 'in') return t * t;
    return t;
  }

  // A new position from the crew's phone. to: { latitude, longitude, heading, via?, durationMs?, stopped? }
  window.csMotionPush = function (st, to, now) {
    var target = { lng: to.longitude, lat: to.latitude };
    var toH = typeof to.heading === 'number' && isFinite(to.heading) ? ((to.heading % 360) + 360) % 360 : st.finalH;
    st.jumped = false;
    if (!st.shown) {
      st.shown = target; st.h = toH; st.finalH = toH; st.path = null; st.lastT = now; st.stopped = !!to.stopped;
      st.jumped = true;
      return st;
    }
    var via = (to.via || []).map(function (p) { return { lng: p.longitude, lat: p.latitude }; });
    var path = [{ lng: st.shown.lng, lat: st.shown.lat }].concat(via, [target]);
    var lens = [], total = 0;
    for (var i = 1; i < path.length; i++) { lens.push(csDist(path[i - 1], path[i])); total += lens[i - 1]; }
    st.finalH = toH;
    // Too far to drive there believably: put it there (the road route will be right again).
    if (total > CS_M.MAX_GLIDE_M || (via.length === 0 && total > CS_M.MAX_STRAIGHT_GLIDE_M)) {
      st.shown = target; st.h = toH; st.path = null; st.speed = 0; st.jumped = true; st.stopped = !!to.stopped;
      return st;
    }
    var startSlow = st.stopped, endSlow = !!to.stopped;
    st.ease = startSlow && endSlow ? 'inout' : endSlow ? 'out' : startSlow ? 'in' : 'linear';
    st.path = total > 0.05 ? path : null;
    st.lens = lens; st.total = total; st.start = now;
    st.duration = Math.max(300, to.durationMs || 1800);
    st.stopped = endSlow;
    return st;
  };

  // Advances the drawn truck to time now. Returns the state: shown {lng, lat}, h (degrees),
  // speed (m/s as drawn), accel (m/s2), turnRate (deg/s, + = turning right), active.
  window.csMotionStep = function (st, now) {
    if (!st.shown) return st;
    var dt = csClamp((now - st.lastT) / 1000, 0, 0.1);
    st.lastT = now;
    var prev = st.shown, desired = st.finalH;
    if (st.path) {
      var t = csClamp((now - st.start) / st.duration, 0, 1);
      var along = st.total * csEase(st.ease, t);
      st.shown = csAlong(st, along);
      if (st.total >= CS_M.MIN_HEADING_MOVE_M && t < 1) {
        var aheadM = along + CS_M.LOOKAHEAD_M;
        var ahead = aheadM < st.total ? csAlong(st, aheadM) : st.path[st.path.length - 1];
        if (csDist(st.shown, ahead) > 0.5) desired = csBearing(st.shown, ahead);
      }
      if (t >= 1) st.path = null;
    }
    var diff = csTurn(st.h, desired);
    var step = diff * (1 - Math.exp(-dt * CS_M.TURN_GAIN));
    var maxStep = CS_M.MAX_TURN_DPS * dt;
    step = csClamp(step, -maxStep, maxStep);
    // Close enough: settle exactly, so a parked truck is perfectly still.
    if (Math.abs(diff) < 0.05) step = diff;
    st.h = (st.h + step + 360) % 360;
    st.turnRate = dt > 0 ? step / dt : 0;
    var inst = dt > 0 ? csDist(prev, st.shown) / dt : 0;
    var k = 1 - Math.exp(-dt * 5);
    var newSpeed = st.speed + (inst - st.speed) * k;
    st.accel = st.accel + ((dt > 0 ? (newSpeed - st.speed) / dt : 0) - st.accel) * k;
    st.speed = newSpeed;
    st.active = !!st.path || Math.abs(diff) > 0.05 || st.speed > 0.05 || Math.abs(st.accel) > 0.05;
    if (!st.active) { st.speed = 0; st.accel = 0; st.turnRate = 0; }
    return st;
  };
  window.csMotionCreate = csMotionCreate;
  window.csTurn = csTurn;
  window.csBearing = csBearing;
  window.csDist = csDist;
`;
