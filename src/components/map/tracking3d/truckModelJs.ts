import { MAP_COLORS } from '../mapColors';

/**
 * A municipal garbage compactor truck built from three.js shapes (no model file to download),
 * as plain JavaScript for the WebView page. Real proportions in metres: 8.2 m long, 2.5 m
 * wide, 3.6 m tall; white cab with windscreen, side windows, mirrors, headlights, indicators
 * and an amber roof beacon; green compactor body with CleanStream sanitation branding on both
 * sides; dark-green tailgate with hopper, tail and brake lights, a hazard-striped rear step and
 * grab handles; three axles with tyres and hubs, fenders, mud flaps and a fuel tank; a soft
 * contact shadow on the road.
 *
 * Model axes: x to the truck's right, y up, z backwards (the nose points to -z), origin on the
 * road under the middle of the truck. tracking3dPage.ts turns `group` by the GPS heading.
 *
 * `csBuildTruck(THREE, dark)` returns { group, update(dt, motion, opts) }.
 */
export const TRUCK_DIMENSIONS = { length: 8.2, width: 2.5, height: 3.6 };

export const truckModelJs = `
  function csCanvas(w, h, draw) {
    var c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    return c;
  }
  function csLeaf(ctx, x, y, s, color) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    ctx.fillStyle = color; ctx.beginPath();
    ctx.moveTo(-10, 10); ctx.bezierCurveTo(-12, -6, 2, -14, 12, -12); ctx.bezierCurveTo(12, 2, 2, 12, -10, 10); ctx.fill();
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(-9, 9); ctx.lineTo(7, -7); ctx.stroke();
    ctx.restore();
  }

  window.csBuildTruck = function (THREE, dark) {
    var GREEN = '${MAP_COLORS.truck}', GREEN_DARK = '${MAP_COLORS.truckDark}';
    var group = new THREE.Group();
    var body = new THREE.Group();   // sprung: leans in turns, dips when braking
    group.add(body);
    var all = [];
    function lam(color, extra) {
      var m = new THREE.MeshLambertMaterial(Object.assign({ color: color }, extra || {}));
      all.push(m); return m;
    }
    function glow(color) { var m = new THREE.MeshBasicMaterial({ color: color }); all.push(m); return m; }
    function box(parent, mat, w, h, d, x, y, z) {
      var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z); parent.add(m); return m;
    }

    var white = lam('#f4f6f5'), green = lam(GREEN), greenDark = lam(GREEN_DARK), charcoal = lam('#2b2f33');
    var black = lam('#161819'), steel = lam('#9aa3ab'), chrome = lam('#d5dade');
    var glass = lam('#1d3650', { emissive: new THREE.Color('#0a1626') });

    // ── Chassis (unsprung) ──
    box(group, charcoal, 1.3, 0.3, 7.5, 0, 0.82, 0.2);
    var tank = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 1.0, 16), chrome);
    tank.rotation.x = Math.PI / 2; tank.position.set(-1.0, 0.75, -1.45); group.add(tank);
    box(group, charcoal, 0.45, 0.5, 0.7, 1.0, 0.78, -1.45);   // battery / tool box

    // ── Cab ──
    box(body, white, 2.4, 2.05, 1.95, 0, 1.98, -3.05);
    box(body, green, 2.42, 0.2, 1.97, 0, 1.18, -3.05);           // green band
    box(body, white, 2.3, 0.25, 1.4, 0, 3.12, -3.2);              // roof cap
    box(body, glass, 2.18, 0.95, 0.06, 0, 2.38, -4.04);           // windscreen
    box(body, black, 2.3, 0.08, 0.07, 0, 2.9, -4.05);             // windscreen frame top
    box(body, glass, 0.06, 0.78, 1.05, 1.215, 2.36, -3.3);        // side windows
    box(body, glass, 0.06, 0.78, 1.05, -1.215, 2.36, -3.3);
    box(body, black, 0.02, 1.5, 0.03, 1.212, 1.75, -2.65);        // door seams
    box(body, black, 0.02, 1.5, 0.03, -1.212, 1.75, -2.65);
    box(body, chrome, 0.04, 0.05, 0.3, 1.225, 1.7, -3.0);         // door handles
    box(body, chrome, 0.04, 0.05, 0.3, -1.225, 1.7, -3.0);
    box(body, black, 1.55, 0.6, 0.05, 0, 1.38, -4.04);            // grille
    for (var gi = 0; gi < 4; gi++) box(body, steel, 1.45, 0.04, 0.02, 0, 1.18 + gi * 0.14, -4.07);
    box(body, charcoal, 2.48, 0.42, 0.28, 0, 0.78, -4.02);        // bumper
    box(body, black, 0.9, 0.12, 0.05, 0, 0.62, -4.17);            // plate holder

    var headMat = glow('#fff6d8');
    box(body, headMat, 0.42, 0.24, 0.06, 0.86, 1.3, -4.05);
    box(body, headMat, 0.42, 0.24, 0.06, -0.86, 1.3, -4.05);
    var signalL = glow('#d98b00'), signalR = glow('#d98b00');
    box(body, signalR, 0.14, 0.16, 0.06, 1.14, 1.3, -4.05);
    box(body, signalL, 0.14, 0.16, 0.06, -1.14, 1.3, -4.05);

    // Mirrors on arms, both sides
    [1, -1].forEach(function (s) {
      box(body, black, 0.4, 0.05, 0.05, s * 1.4, 2.42, -3.78);
      box(body, black, 0.09, 0.48, 0.22, s * 1.62, 2.28, -3.78);
      box(body, glass, 0.02, 0.4, 0.17, s * 1.62, 2.28, -3.67);
    });

    // Roof beacon bar (amber, flashes while driving)
    box(body, charcoal, 1.3, 0.12, 0.32, 0, 3.3, -3.3);
    var beaconA = glow('#ffb020'), beaconB = glow('#ffb020');
    box(body, beaconA, 0.3, 0.18, 0.26, 0.48, 3.45, -3.3);
    box(body, beaconB, 0.3, 0.18, 0.26, -0.48, 3.45, -3.3);

    // ── Compactor body ──
    box(body, charcoal, 2.3, 2.25, 0.12, 0, 2.15, -2.02);         // gap behind cab
    box(body, green, 2.5, 2.45, 5.4, 0, 2.25, 0.75);
    box(body, greenDark, 2.53, 0.36, 5.42, 0, 1.17, 0.75);        // lower skirt
    box(body, green, 2.3, 0.16, 5.3, 0, 3.55, 0.75);              // rounded top (step-in)
    box(body, greenDark, 2.54, 0.08, 5.44, 0, 3.47, 0.75);        // top rail
    [-1.9, 3.4].forEach(function (z) { box(body, greenDark, 2.56, 2.4, 0.1, 0, 2.25, z); }); // end ribs

    // Branding panels on both sides (CanvasTexture)
    var brand = csCanvas(1024, 256, function (ctx, w, h) {
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = GREEN; ctx.fillRect(0, h - 34, w, 34);
      csLeaf(ctx, 120, 112, 4.2, GREEN);
      ctx.fillStyle = GREEN_DARK; ctx.font = 'bold 104px Arial, Helvetica, sans-serif'; ctx.textBaseline = 'middle';
      ctx.fillText('CLEANSTREAM', 220, 100);
      ctx.fillStyle = '#334155'; ctx.font = 'bold 40px Arial, Helvetica, sans-serif';
      ctx.fillText('CITY ENVIRONMENTAL SANITATION', 224, 182);
      ctx.fillStyle = '#ffffff'; ctx.font = 'bold 24px Arial, Helvetica, sans-serif';
      ctx.fillText('KEEP OUR WATERWAYS CLEAN', 230, h - 16);
    });
    var brandTex = new THREE.CanvasTexture(brand);
    var brandMat = lam('#ffffff', { map: brandTex });
    var plateGeo = new THREE.PlaneGeometry(4.7, 1.17);
    var right = new THREE.Mesh(plateGeo, brandMat); right.rotation.y = Math.PI / 2; right.position.set(1.262, 2.42, 0.75); body.add(right);
    var left = new THREE.Mesh(plateGeo, brandMat); left.rotation.y = -Math.PI / 2; left.position.set(-1.262, 2.42, 0.75); body.add(left);

    // ── Tailgate / hopper ──
    box(body, greenDark, 2.5, 2.5, 0.55, 0, 2.1, 3.72);
    box(body, black, 2.0, 0.85, 0.06, 0, 1.45, 4.01);             // hopper opening
    box(body, steel, 2.1, 0.06, 0.08, 0, 1.92, 4.02);             // hopper lip
    var tailMat = glow('#7a1212');
    box(body, tailMat, 0.24, 0.38, 0.05, 1.05, 1.08, 4.02);
    box(body, tailMat, 0.24, 0.38, 0.05, -1.05, 1.08, 4.02);
    var revMat = glow('#e5e7eb');
    box(body, revMat, 0.14, 0.12, 0.05, 0.78, 0.98, 4.02);
    box(body, revMat, 0.14, 0.12, 0.05, -0.78, 0.98, 4.02);
    var rearBeacon = glow('#ffb020');
    box(body, rearBeacon, 0.22, 0.14, 0.2, 1.0, 3.42, 3.8);
    box(body, rearBeacon, 0.22, 0.14, 0.2, -1.0, 3.42, 3.8);
    [1.12, -1.12].forEach(function (x) { box(body, chrome, 0.06, 0.95, 0.06, x, 2.25, 4.03); }); // grab handles
    var stripes = csCanvas(256, 32, function (ctx, w, h) {
      ctx.fillStyle = '#facc15'; ctx.fillRect(0, 0, w, h); ctx.fillStyle = '#111111';
      for (var i = -2; i < 20; i++) { ctx.beginPath(); ctx.moveTo(i * 24, h); ctx.lineTo(i * 24 + 12, h); ctx.lineTo(i * 24 + 24, 0); ctx.lineTo(i * 24 + 12, 0); ctx.fill(); }
    });
    var stepMat = lam('#ffffff', { map: new THREE.CanvasTexture(stripes) });
    box(group, stepMat, 2.4, 0.18, 0.45, 0, 0.62, 4.0);           // rear step (hazard stripes)

    // ── Wheels: front axle steers, two rear axles; all spin ──
    var R = 0.52, TW = 0.42;
    var tyreGeo = new THREE.CylinderGeometry(R, R, TW, 22); tyreGeo.rotateZ(Math.PI / 2);
    var hubGeo = new THREE.CylinderGeometry(R * 0.56, R * 0.56, TW + 0.02, 16); hubGeo.rotateZ(Math.PI / 2);
    var capGeo = new THREE.CylinderGeometry(R * 0.2, R * 0.2, TW + 0.05, 10); capGeo.rotateZ(Math.PI / 2);
    var lugGeo = new THREE.BoxGeometry(TW + 0.04, 0.07, 0.07);
    var wheels = [], steer = [];
    function wheel(x, z, front) {
      var pivot = new THREE.Group(); pivot.position.set(x, R, z); group.add(pivot);
      var spin = new THREE.Group(); pivot.add(spin);
      spin.add(new THREE.Mesh(tyreGeo, black));
      spin.add(new THREE.Mesh(hubGeo, steel));
      spin.add(new THREE.Mesh(capGeo, chrome));
      for (var i = 0; i < 3; i++) {
        var lug = new THREE.Mesh(lugGeo, charcoal);
        var a = i * Math.PI * 2 / 3; lug.position.set(0, Math.cos(a) * R * 0.38, Math.sin(a) * R * 0.38);
        spin.add(lug);
      }
      wheels.push(spin); if (front) steer.push(pivot);
    }
    [1.02, -1.02].forEach(function (x) { wheel(x, -2.75, true); wheel(x, 1.55, false); wheel(x, 2.65, false); });
    [1, -1].forEach(function (s) {
      box(body, charcoal, 0.5, 0.08, 1.35, s * 1.04, 1.12, -2.75);  // front fenders
      box(body, charcoal, 0.5, 0.08, 2.4, s * 1.04, 1.12, 2.1);     // rear fenders
      box(group, black, 0.46, 0.5, 0.03, s * 1.02, 0.42, 3.28);     // mud flaps
    });

    // ── Contact shadow (soft ellipse on the road) ──
    var shadowTex = new THREE.CanvasTexture(csCanvas(64, 128, function (ctx, w, h) {
      var g = ctx.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2);
      g.addColorStop(0, 'rgba(0,0,0,0.55)'); g.addColorStop(0.7, 'rgba(0,0,0,0.25)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.save(); ctx.scale(1, 2); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h / 2); ctx.restore();
    }));
    var shadow = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 9.6),
      new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2; shadow.position.set(0.25, 0.03, 0.25); group.add(shadow);

    // Headlight pool on the road at night
    var beam = null;
    if (dark) {
      var beamTex = new THREE.CanvasTexture(csCanvas(64, 128, function (ctx, w, h) {
        var g = ctx.createLinearGradient(0, h, 0, 0);
        g.addColorStop(0, 'rgba(255,240,190,0.55)'); g.addColorStop(1, 'rgba(255,240,190,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(w * 0.3, h); ctx.lineTo(w * 0.7, h); ctx.lineTo(w, 0); ctx.lineTo(0, 0); ctx.fill();
      }));
      beam = new THREE.Mesh(new THREE.PlaneGeometry(4.5, 9), new THREE.MeshBasicMaterial({ map: beamTex, transparent: true, depthWrite: false }));
      beam.rotation.x = -Math.PI / 2; beam.position.set(0, 0.04, -8.6); group.add(beam);
    }

    var t = 0, steerAngle = 0, pitch = 0, roll = 0, faded = false;
    var amber = new THREE.Color('#ffb020'), amberOff = new THREE.Color('#6b4a10');
    var brakeOn = new THREE.Color('#ff2a2a'), brakeOff = new THREE.Color('#8a1414');

    // dt: seconds since last frame; m: motion state (motionJs); o: { stale }
    function update(dt, m, o) {
      t += dt;
      var v = m.speed || 0, w = (m.turnRate || 0) * Math.PI / 180;
      // Wheels roll with the distance covered.
      var roll1 = v * dt / R;
      for (var i = 0; i < wheels.length; i++) wheels[i].rotation.x -= roll1;
      // Front wheels steer into the turn (bicycle model, 4.9 m wheelbase).
      var want = v > 0.6 ? Math.atan(4.9 * w / v) : steerAngle * 0.9;
      want = Math.max(-0.5, Math.min(0.5, want));
      steerAngle += (want - steerAngle) * Math.min(1, dt * 6);
      for (var j = 0; j < steer.length; j++) steer[j].rotation.y = -steerAngle;
      // Body: nose dips when braking, squats when pulling away; leans out of turns.
      var wantPitch = Math.max(-0.035, Math.min(0.035, (m.accel || 0) * 0.02));
      var wantRoll = Math.max(-0.045, Math.min(0.045, v * w * 0.018));
      pitch += (wantPitch - pitch) * Math.min(1, dt * 4);
      roll += (wantRoll - roll) * Math.min(1, dt * 4);
      body.rotation.x = pitch; body.rotation.z = roll;
      // Lights: brake lights when slowing or stopped, beacons flash while driving.
      var braking = (m.accel || 0) < -0.25 || v < 0.3;
      tailMat.color.copy(braking ? brakeOn : brakeOff);
      var on = v > 0.3 && Math.sin(t * 9) > 0;
      beaconA.color.copy(on ? amber : amberOff); beaconB.color.copy(!on && v > 0.3 ? amber : amberOff);
      rearBeacon.color.copy(on ? amber : amberOff);
      // Indicators blink on the side it is turning to.
      var blink = Math.sin(t * 7) > 0;
      signalR.color.copy(w > 0.12 && blink ? amber : amberOff);
      signalL.color.copy(w < -0.12 && blink ? amber : amberOff);
      if (beam) beam.visible = !o.stale;
      // Signal lost: fade the truck so it reads as "last known position".
      if (!!o.stale !== faded) {
        faded = !!o.stale;
        all.forEach(function (mat) { mat.transparent = faded; mat.opacity = faded ? 0.5 : 1; mat.needsUpdate = true; });
      }
    }
    // Road decals (shadow, headlight pool) are left out of the see-through pass.
    return { group: group, update: update, decals: beam ? [shadow, beam] : [shadow] };
  };
`;
