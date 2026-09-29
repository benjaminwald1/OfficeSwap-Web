/* The phone on the page is a real photo of a hand holding an iPhone, with the app video on its screen.
   The hand stays exactly as photographed; each tap and swipe in the video is shown the way iPhone
   screen recordings show touches: a soft circle on the glass that appears as the finger lands, follows
   it while it drags, and fades as it lifts. It follows the video's clock, however it was started. */
(function () {
  // ---- Photo geometry, in pixels of the 1245x1762 layers ----
  var IMG_W = 1245, IMG_H = 1762;
  var SCREEN = { tl: [406.7, 57.0], tr: [1066.1, 68.3], br: [1049.7, 1503.0], bl: [390.0, 1495.0] };
  var DOT = 38;   // touch circle radius, photo px (about 22 points on the phone)

  // ---- Motion: t (s), x, y (screen fractions), lift (0 = on the glass), rest (1 = no touch), hold ----
  var KEYS = [
    [0.00, 0.36, 0.36, 1, 1, 0], [1.25, 0.36, 0.36, 1, 1, 0], [1.95, 0.37, 0.35, 0.8, 0, 0],
    [2.15, 0.36, 0.36, 0, 0, 1], [2.35, 0.36, 0.36, 0, 0, 1], [2.75, 0.32, 0.60, 0.9, 0, 0],
    [3.08, 0.44, 0.695, 0.25, 0, 0], [3.18, 0.45, 0.70, 0, 0, 1], [3.50, 0.40, 0.53, 0, 0, 1],
    [3.66, 0.40, 0.55, 0.8, 0, 0], [4.30, 0.40, 0.66, 0.5, 0, 0], [4.48, 0.40, 0.675, 0, 0, 1],
    [4.66, 0.40, 0.675, 0, 0, 1], [4.90, 0.45, 0.64, 0.8, 0, 0], [5.05, 0.49, 0.655, 0.45, 0, 0],
    [5.15, 0.495, 0.66, 0, 0, 1], [5.33, 0.495, 0.66, 0, 0, 1], [5.72, 0.42, 0.63, 0.8, 0, 0],
    [5.86, 0.47, 0.68, 0.2, 0, 0], [5.93, 0.47, 0.68, 0, 0, 1], [6.25, 0.44, 0.56, 0, 0, 1],
    [6.40, 0.44, 0.57, 0.8, 0, 0], [7.05, 0.42, 0.545, 0.45, 0, 0], [7.22, 0.42, 0.556, 0, 0, 1],
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
  window.OfficeSwapThumb = { pose: pose, onScreen: onScreen };

  document.querySelectorAll(".hold").forEach(function (holder) {
    var video = holder.querySelector("video"), canvas = holder.querySelector(".hold-hand");
    if (!video || !canvas || !canvas.getContext) return;
    var ctx = canvas.getContext("2d");

    function placeVideo() {
      var s = holder.clientWidth / IMG_W, bleed = 3, vw = 604, vh = 1312;
      video.style.width = vw + "px"; video.style.height = vh + "px";
      var d = [[SCREEN.tl[0] - bleed, SCREEN.tl[1] - bleed], [SCREEN.tr[0] + bleed, SCREEN.tr[1] - bleed],
               [SCREEN.br[0] + bleed, SCREEN.br[1] + bleed], [SCREEN.bl[0] - bleed, SCREEN.bl[1] + bleed]]
              .map(function (p) { return [p[0] * s, p[1] * s]; });
      video.style.transform = "matrix3d(" + homography([[0, 0], [vw, 0], [vw, vh], [0, vh]], d).join(",") + ")";
    }

    function draw() {
      placeVideo();
      var cssW = holder.clientWidth, cssH = holder.clientHeight, dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
        canvas.style.width = cssW + "px"; canvas.style.height = cssH + "px"; canvas.style.left = "0px";
        canvas.width = Math.round(cssW * dpr); canvas.height = Math.round(cssH * dpr);
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      var p = pose(video.currentTime), touch = (1 - p.rest) * clamp(1 - p.lift * 1.6, 0, 1);
      if (touch < 0.01) return;
      var s = cssW / IMG_W * dpr, c = onScreen(p.x, p.y), r = DOT * (0.8 + 0.2 * touch) * s;
      ctx.save();
      ctx.globalAlpha = touch;
      ctx.shadowColor = "rgba(0,0,0,0.18)"; ctx.shadowBlur = 10 * s; ctx.shadowOffsetY = 2 * s;
      ctx.beginPath(); ctx.arc(c[0] * s, c[1] * s, r, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.55)"; ctx.fill();
      ctx.shadowColor = "transparent";
      ctx.lineWidth = 2.5 * s; ctx.strokeStyle = "rgba(60,60,67,0.35)"; ctx.stroke();
      ctx.restore();
    }

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
    window.OfficeSwapThumb.draw = draw;
  });
})();
