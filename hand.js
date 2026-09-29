/* Each phone on the page is a real photo of a hand holding an iPhone, with the app video on its
   screen. The thumb is a separate, undistorted piece of the photo, drawn as a chain of thin
   slices along its length so it can turn at its joints like a real one: the fleshy mound at
   its base stays with the hand, the slender thumb swings from its root under the palm and
   hinges at the two knuckles. It never
   stretches; for a nearer key it curls, and the last bones tip toward the glass so they look
   shorter from the front. It follows the video's clock: reaches over, presses each button,
   flicks the form up, and returns to rest on the edge. */
(function () {
  // ---- Photo geometry, in pixels of the 1245x1762 layers ----
  var IMG_W = 1245, IMG_H = 1762;
  var SCREEN = { tl: [406.7, 57.0], tr: [1066.1, 68.3], br: [1049.7, 1503.0], bl: [390.0, 1495.0] };
  var THUMB_BOX = [117, 580, 360, 1157];     // where the thumb piece sits at rest
  var PIVOT = [240, 1125];                   // the root of the thumb's bone, hidden under the palm
  var PAD = [331.5, 621];                    // with the pivot, sets the thumb's axis (x runs along it)
  var TOUCH = [514, -25];                    // the middle of the tip, in the thumb's frame: what meets the glass
  var MASK_X = 330;                          // left of this the thumb stays inside the hand's outline; the phone starts just right of it

  // ---- The joints, as fractions of the thumb's length (0 at the pivot, 1 at the tip) ----
  // The thumb swings from its root under the palm (the turn eases in across ROOT, most of it
  // hidden by the palm). The two knuckles are hinges: narrow zones where the angle changes,
  // with straight bone between them.
  var ROOT = [-0.05, 0.35], MCP = 0.66, IP = 0.84, HINGE = 0.06;
  var TURN_AT_ROOT = 0.75;                    // share of the turn taken at the root; the rest at the first knuckle
  // Curl (0..1) closes the reach for nearer keys: the knuckles bend a little (radians at full
  // curl) and the bones tip toward the glass, so they look shorter (never longer) from the front:
  // the metacarpal barely, the last phalanx the most, as it presses.
  var CURL = { mcp: 0.30, ip: 0.70, meta: 0.10, proximal: 0.15, distal: 0.32 };
  // The fleshy base at the crease stays put under the swinging thumb (fading out from UNDER[0]
  // to UNDER[1]), so the hand's outline holds where the thumb leaves it; the moving thumb fades
  // in over START, so it grows out of that base with no seam.
  var UNDER = [0.22, 0.40], START = [0.08, 0.20];
  // Only the slender thumb swings; the fleshy mound at its base (the thenar) belongs to the hand
  // and stays put. This band, in the thumb's frame, is how far each side of the axis the moving
  // piece reaches (outer side toward the edge of the hand, inner side toward the phone).
  var BAND = { u: [0.2, 0.5, 0.8], outer: [-90, -80, -66], inner: [75, 60, 45], feather: 6 };

  // ---- Motion: t (s), x, y (screen fractions), lift (0 = on the glass), rest (1 = resting on the edge), hold ----
  var KEYS = [
    [0.00, 0.14, 0.43, 1, 1, 0], [1.25, 0.14, 0.43, 1, 1, 0], [1.95, 0.15, 0.42, 0.8, 0, 0],
    [2.15, 0.14, 0.43, 0, 0, 1], [2.35, 0.14, 0.43, 0, 0, 1], [2.75, 0.25, 0.56, 0.9, 0, 0],
    [3.08, 0.34, 0.655, 0.25, 0, 0], [3.18, 0.35, 0.66, 0, 0, 1], [3.50, 0.30, 0.50, 0, 0, 1],
    [3.66, 0.30, 0.52, 0.8, 0, 0], [4.30, 0.37, 0.65, 0.5, 0, 0], [4.48, 0.378, 0.665, 0, 0, 1],
    [4.66, 0.378, 0.665, 0, 0, 1], [4.90, 0.44, 0.63, 0.8, 0, 0], [5.05, 0.49, 0.655, 0.45, 0, 0],
    [5.15, 0.495, 0.66, 0, 0, 1], [5.33, 0.495, 0.66, 0, 0, 1], [5.72, 0.42, 0.63, 0.8, 0, 0],
    [5.86, 0.40, 0.64, 0.2, 0, 0], [5.93, 0.40, 0.64, 0, 0, 1], [6.25, 0.38, 0.54, 0, 0, 1],
    [6.40, 0.38, 0.55, 0.8, 0, 0], [7.05, 0.42, 0.545, 0.45, 0, 0], [7.22, 0.42, 0.556, 0, 0, 1],
    [7.40, 0.42, 0.556, 0, 0, 1], [7.90, 0.30, 0.50, 1, 0, 0], [8.60, 0.14, 0.43, 1, 1, 0], [30, 0.14, 0.43, 1, 1, 0]
  ];
  function hermite(p0, p1, m0, m1, u) {
    var u2 = u * u, u3 = u2 * u;
    return (2 * u3 - 3 * u2 + 1) * p0 + (u3 - 2 * u2 + u) * m0 + (-2 * u3 + 3 * u2) * p1 + (u3 - u2) * m1;
  }
  function tangent(i, c) {
    if (KEYS[i][5] || i === 0 || i === KEYS.length - 1) return 0;
    var a = KEYS[i - 1], b = KEYS[i + 1];
    return (b[c] - a[c]) / (b[0] - a[0]);
  }
  function pose(t) {
    t = Math.max(0, t);
    for (var i = 1; i < KEYS.length; i++) {
      if (t <= KEYS[i][0]) {
        var a = KEYS[i - 1], b = KEYS[i], dt = b[0] - a[0], u = (t - a[0]) / dt, o = [];
        for (var c = 1; c <= 3; c++) o.push(hermite(a[c], b[c], tangent(i - 1, c) * dt, tangent(i, c) * dt, u));
        var ru = u * u * (3 - 2 * u);
        return { x: o[0], y: o[1], lift: Math.max(0, Math.min(1, o[2])), rest: a[4] + (b[4] - a[4]) * ru };
      }
    }
    return { x: 0.14, y: 0.43, lift: 1, rest: 1 };
  }
  function onScreen(u, v) {
    var q = SCREEN;
    return [(1 - v) * ((1 - u) * q.tl[0] + u * q.tr[0]) + v * ((1 - u) * q.bl[0] + u * q.br[0]),
            (1 - v) * ((1 - u) * q.tl[1] + u * q.tr[1]) + v * ((1 - u) * q.bl[1] + u * q.br[1])];
  }
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function smooth(u, a, b) { var x = clamp((u - a) / (b - a), 0, 1); return x * x * (3 - 2 * x); }
  var REST_ANGLE = Math.atan2(PAD[1] - PIVOT[1], PAD[0] - PIVOT[0]);
  var REST_LEN = Math.hypot(PAD[0] - PIVOT[0], PAD[1] - PIVOT[1]);
  function mul(m, n) {   // m after n
    return [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
            m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
  }
  function apply(m, p) { return [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]]; }
  function rot(a) { var c = Math.cos(a), n = Math.sin(a); return [c, n, -n, c, 0, 0]; }
  function dist(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1]); }

  // The thumb as a chain of thin slices along its length. Per slice (at its middle): how much of
  // the turn toward the target has built up, how much of the curl (in radians), and how far past
  // each knuckle it is (for the shortening).
  var N = 120, BASE = -160, SW = (REST_LEN * 1.12 - BASE) / N;
  var PF = [], PC = [], PM = [], PI = [], PU = [], PE = [], PS = [];
  for (var si = 0; si <= N; si++) {
    var su = (BASE + SW * (Math.min(si, N - 1) + 0.5)) / REST_LEN;
    var th = smooth(su, ROOT[0], ROOT[1]), m = smooth(su, MCP - HINGE, MCP + HINGE), ip = smooth(su, IP - HINGE, IP + HINGE);
    PF.push(TURN_AT_ROOT * th + (1 - TURN_AT_ROOT) * m);
    PC.push(CURL.mcp * m + CURL.ip * ip);
    PM.push(m); PI.push(ip); PE.push(smooth(su, ROOT[1], ROOT[1] + 0.2));
    PU.push(1 - smooth(su, UNDER[0], UNDER[1])); PS.push(smooth(su, START[0], START[1]));
  }
  // fn(S, x0, w, aNext, under, sx, own): S maps the thumb's own frame (x along it, from the
  // pivot) to photo pixels for the slice [x0, x0 + w), which is squeezed by sx along the thumb;
  // aNext is the extra turn where the next slice begins; under and own are how much of the
  // fixed base and of the moving thumb show here.
  function chain(turn, curl, press, fn) {
    var M = mul(mul([1, 0, 0, 1, PIVOT[0], PIVOT[1]], rot(REST_ANGLE)), [1, 0, 0, 1, BASE, 0]);
    var s0 = 1 - CURL.meta * curl, s1 = 1 - CURL.proximal * curl, s2 = 1 - CURL.distal * curl - 0.03 * press;
    for (var i = 0; i < N; i++) {
      var x0 = BASE + SW * i;
      if (i > 0) M = mul(M, rot(turn * (PF[i] - PF[i - 1]) + curl * (PC[i] - PC[i - 1])));
      var sx = 1 + (s0 - 1) * PE[i] + (s1 - s0) * PM[i] + (s2 - s1) * PI[i];
      fn(mul(mul(M, [sx, 0, 0, 1, 0, 0]), [1, 0, 0, 1, -x0, 0]), x0, SW, turn * (PF[i + 1] - PF[i]) + curl * (PC[i + 1] - PC[i]), PU[i], sx, PS[i]);
      M = mul(M, [1, 0, 0, 1, SW * sx, 0]);
    }
  }
  function touchAt(turn, curl, press) {
    var out = null;
    chain(turn, curl, press, function (S, x0, w) { if (out === null && TOUCH[0] >= x0 && TOUCH[0] < x0 + w) out = apply(S, TOUCH); });
    return out || PAD;
  }
  function wrapAngle(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; }
  var REACH_SPAN = dist(touchAt(0, 0, 0), PIVOT) - dist(touchAt(0, 1, 0), PIVOT);

  // Turn and curl for the thumb so the middle of its tip lands on the target: turn toward it,
  // curl as much as needed to close the distance (a farther key gets a straighter thumb).
  function thumbPose(p) {
    var tg = onScreen(p.x, p.y);
    tg = [tg[0] - p.lift * 4, tg[1] - p.lift * 8];
    var press = 1 - p.lift, turn = 0, curl = 0;
    var want = Math.atan2(tg[1] - PIVOT[1], tg[0] - PIVOT[0]), dw = dist(tg, PIVOT);
    for (var it = 0; it < 12; it++) {
      var pos = touchAt(turn, curl, press);
      turn += wrapAngle(want - Math.atan2(pos[1] - PIVOT[1], pos[0] - PIVOT[0]));
      curl = clamp(curl + 0.8 * (dist(pos, PIVOT) - dw) / REACH_SPAN, 0, 1);
    }
    var k = 1 - p.rest;
    return { turn: turn * k, curl: curl * k, press: press * k, over: k, lift: p.lift, target: tg };
  }
  function slices(t) {
    var p = pose(t), q = thumbPose(p), out = [], base = [];
    chain(q.turn, q.curl, q.press, function (S, x0, w, aNext, under, sx, own) { if (own > 0.001) out.push({ S: S, x0: x0, w: w, aNext: aNext, sx: sx, alpha: own }); });
    chain(0, 0, 0, function (S, x0, w, aNext, under, sx) { if (under > 0.001) base.push({ S: S, x0: x0, w: w, aNext: aNext, alpha: under, sx: sx }); });
    return { p: p, q: q, touch: touchAt(q.turn, q.curl, q.press), slices: out, base: base };
  }
  window.OfficeSwapThumb = { pose: pose, thumbPose: thumbPose, slices: slices };

  function mul4(A, B) {   // column-major 4x4 product A*B
    var o = new Array(16);
    for (var col = 0; col < 4; col++) for (var row = 0; row < 4; row++) {
      var v = 0; for (var k = 0; k < 4; k++) v += A[k * 4 + row] * B[col * 4 + k];
      o[col * 4 + row] = v;
    }
    return o;
  }
  function homography(src, dst) {
    var A = [], b = [];
    for (var i = 0; i < 4; i++) {
      var x = src[i][0], y = src[i][1], X = dst[i][0], Y = dst[i][1];
      A.push([x, y, 1, 0, 0, 0, -X * x, -X * y]); b.push(X);
      A.push([0, 0, 0, x, y, 1, -Y * x, -Y * y]); b.push(Y);
    }
    for (var c = 0; c < 8; c++) {
      var p = c; for (var r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
      var tmp = A[c]; A[c] = A[p]; A[p] = tmp; var tb = b[c]; b[c] = b[p]; b[p] = tb;
      for (r = 0; r < 8; r++) if (r !== c) {
        var f = A[r][c] / A[c][c];
        for (var k = c; k < 8; k++) A[r][k] -= f * A[c][k];
        b[r] -= f * b[c];
      }
    }
    var h = b.map(function (v, i) { return v / A[i][i]; });
    return [h[0], h[3], 0, h[6], h[1], h[4], 0, h[7], 0, 0, 1, 0, h[2], h[5], 0, 1];
  }

  function lerp(u, xs, ys) {
    if (u <= xs[0]) return ys[0];
    for (var i = 1; i < xs.length; i++) if (u <= xs[i]) return ys[i - 1] + (ys[i] - ys[i - 1]) * (u - xs[i - 1]) / (xs[i] - xs[i - 1]);
    return ys[ys.length - 1];
  }
  // The thumb piece with the thenar cut away (soft-edged), for the moving thumb.
  function slenderThumb(img) {
    var c = document.createElement("canvas"), w = THUMB_BOX[2] - THUMB_BOX[0], h = THUMB_BOX[3] - THUMB_BOX[1];
    c.width = w; c.height = h;
    var g = c.getContext("2d");
    g.translate(-THUMB_BOX[0], -THUMB_BOX[1]); g.translate(PIVOT[0], PIVOT[1]); g.rotate(REST_ANGLE);
    g.filter = "blur(" + BAND.feather + "px)";
    g.fillStyle = "#fff"; g.beginPath();
    var u, pts = [];
    for (u = -0.4; u <= 1.3; u += 0.05) pts.push([u * REST_LEN, lerp(u, BAND.u, BAND.outer)]);
    for (u = 1.3; u >= -0.4; u -= 0.05) pts.push([u * REST_LEN, lerp(u, BAND.u, BAND.inner)]);
    pts.forEach(function (p, i) { if (i) g.lineTo(p[0], p[1]); else g.moveTo(p[0], p[1]); });
    g.closePath(); g.fill();
    g.filter = "none"; g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = "source-in";
    g.drawImage(img, 0, 0, w, h);
    return c;
  }
  function load(src) { return new Promise(function (res, rej) { var i = new Image(); i.onload = function () { res(i); }; i.onerror = rej; i.src = src; }); }

  var first = true;
  document.querySelectorAll(".hold").forEach(function (holder) {
    var video = holder.querySelector("video"), canvas = holder.querySelector(".hold-hand");
    if (!video || !canvas || !canvas.getContext) return;
    var ctx = canvas.getContext("2d");
    var thumbImg = null, thinImg = null, palmImg = null, fullImg = null, maskImg = null, margin = 0.12, offc = null;
    function offscreen(w, h) {
      if (!offc) offc = document.createElement("canvas");
      if (offc.width !== w || offc.height !== h) { offc.width = w; offc.height = h; }
      return offc;
    }

    var phoneImg = holder.querySelector(".hold-phone");
    function placeVideo() {
      var s = holder.clientWidth / IMG_W, bleed = 3, vw = 604, vh = 1312;
      video.style.width = vw + "px"; video.style.height = vh + "px";
      var d = [[SCREEN.tl[0] - bleed, SCREEN.tl[1] - bleed], [SCREEN.tr[0] + bleed, SCREEN.tr[1] - bleed],
               [SCREEN.br[0] + bleed, SCREEN.br[1] + bleed], [SCREEN.bl[0] - bleed, SCREEN.bl[1] + bleed]]
              .map(function (p) { return [p[0] * s, p[1] * s]; });
      video.style.transform = "matrix3d(" + homography([[0, 0], [vw, 0], [vw, vh], [0, vh]], d).join(",") + ")";
      if (phoneImg) { phoneImg.style.transformOrigin = "0 0"; phoneImg.style.transform = ""; }
    }

    function draw() {
      if (!thumbImg || !palmImg) { placeVideo(); return; }
      var cssW = holder.clientWidth, cssH = holder.clientHeight, dpr = Math.min(window.devicePixelRatio || 1, 2);
      var W = Math.round(cssW * (1 + margin * 2)), H = Math.round(cssH * (1 + margin));
      if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
        canvas.style.width = W + "px"; canvas.style.height = H + "px"; canvas.style.left = (-cssW * margin) + "px";
        canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      }
      var s = cssW / IMG_W * dpr, ox = cssW * margin * dpr;
      var p = pose(video.currentTime), q = thumbPose(p);
      placeVideo();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingQuality = "high";
      ctx.setTransform(s, 0, 0, s, ox, 0);   // photo pixels -> canvas pixels

      // The thumb, slice by slice: each one turned a little more than the last at the joints.
      // First the fleshy base that stays put at the crease, then the moving thumb over it.
      var off = offscreen(canvas.width, canvas.height), octx = off.getContext("2d");
      octx.setTransform(1, 0, 0, 1, 0, 0); octx.clearRect(0, 0, off.width, off.height);
      octx.imageSmoothingQuality = "high";
      function slice(S, x0, w, aNext, alpha, sx, img) {
        octx.save();
        octx.globalAlpha = alpha;
        octx.setTransform(s, 0, 0, s, ox, 0);
        octx.transform(S[0], S[1], S[2], S[3], S[4], S[5]);      // into the thumb's own frame, bent
        // each slice ends exactly where the next one (turned a little more) begins: no gaps, no overlaps
        var x1 = x0 + w, sn = Math.sin(aNext) * 400 / sx;
        octx.beginPath(); octx.moveTo(x0 - 1.5, -400); octx.lineTo(x1 + sn, -400); octx.lineTo(x1 - sn, 400); octx.lineTo(x0 - 1.5, 400); octx.closePath(); octx.clip();
        octx.rotate(-REST_ANGLE); octx.translate(-PIVOT[0], -PIVOT[1]);
        octx.drawImage(img, THUMB_BOX[0], THUMB_BOX[1], THUMB_BOX[2] - THUMB_BOX[0], THUMB_BOX[3] - THUMB_BOX[1]);
        octx.restore();
      }
      if (q.over > 0.01) chain(0, 0, 0, function (S, x0, w, aNext, under, sx) { if (under > 0.001) slice(S, x0, w, aNext, under * q.over, sx, thumbImg); });
      chain(q.turn, q.curl, q.press, function (S, x0, w, aNext, under, sx, own) { if (own > 0.001) slice(S, x0, w, aNext, own, sx, thinImg); });
      // Keep the swinging base inside the hand's outline, so it never bulges out of the hand.
      if (maskImg) {
        octx.save();
        octx.globalCompositeOperation = "destination-in";
        octx.setTransform(s, 0, 0, s, ox, 0);
        octx.drawImage(maskImg, 0, 0, IMG_W, IMG_H);
        octx.restore();
      }
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (q.over > 0.01) {
        // soft shadow on the glass: close and dark when touching, wider and fainter when raised
        ctx.shadowColor = "rgba(0,0,0," + ((0.30 - q.lift * 0.12) * q.over).toFixed(3) + ")";
        ctx.shadowBlur = (4 + q.lift * 14) * dpr;
        ctx.shadowOffsetX = (4 + q.lift * 12) * dpr;
        ctx.shadowOffsetY = (6 + q.lift * 18) * dpr;
      }
      ctx.drawImage(off, 0, 0);
      ctx.restore();
      ctx.setTransform(s, 0, 0, s, ox, 0);

      // The palm on top hides the thumb's root, like a real hand.
      ctx.drawImage(palmImg, 0, 0, IMG_W, IMG_H);
      // Resting, the untouched photo shows; it fades out as the thumb lifts off the edge.
      var still = 1 - q.over;
      // Only in the last moment of the rest, when the moving thumb is almost exactly where the
      // photo's thumb is, so the two never show as separate thumbs.
      var show = clamp((still - 0.82) / 0.15, 0, 1); show = show * show * (3 - 2 * show);
      if (show > 0.01 && fullImg) {
        ctx.globalAlpha = show;
        ctx.drawImage(fullImg, 0, 0, IMG_W, IMG_H);
        ctx.globalAlpha = 1;
      }
    }

    Promise.all([load(canvas.getAttribute("data-thumb")), load(canvas.getAttribute("data-palm")),
                 load(holder.querySelector(".hold-still").getAttribute("src"))]).then(function (imgs) {
      thumbImg = imgs[0]; palmImg = imgs[1]; fullImg = imgs[2];
      thinImg = slenderThumb(thumbImg);
      // the hand's outline on the thumb's side, from the photo; everything from the phone's edge
      // rightward is fair game (the thumb crosses the bezel and the screen)
      maskImg = document.createElement("canvas"); maskImg.width = IMG_W; maskImg.height = IMG_H;
      var mctx = maskImg.getContext("2d");
      mctx.drawImage(fullImg, 0, 0, IMG_W, IMG_H);
      mctx.fillRect(MASK_X, 0, IMG_W - MASK_X, IMG_H);
      holder.classList.add("live");
      dirty = true;
    }).catch(function () {});

    // Follow the video's clock every frame, whatever way it was started (autoplay, replay, seek).
    var lastT = -1, dirty = true;
    function loop() {
      var t = video.currentTime;
      if (dirty || t !== lastT) { lastT = t; dirty = false; draw(); }
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
    ["loadeddata", "loadedmetadata"].forEach(function (e) { video.addEventListener(e, function () { dirty = true; }); });
    addEventListener("resize", function () { dirty = true; });
    placeVideo();
    if (first) { window.OfficeSwapThumb.draw = draw; first = false; }
  });
})();
