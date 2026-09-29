/* Each phone on the page is a real photo of a hand holding an iPhone, with the app video on its
   screen. The thumb is a separate, undistorted piece of the photo. It turns at its base knuckle,
   which sits under the palm like a real one, and gets a little shorter when it presses near its
   base (a thumb bending toward the glass looks shorter from the front). It follows the video's
   clock: reaches over, presses each button, flicks the form up, and returns to rest on the edge. */
(function () {
  // ---- Photo geometry, in pixels of the 1245x1762 layers ----
  var IMG_W = 1245, IMG_H = 1762;
  var SCREEN = { tl: [406.7, 57.0], tr: [1066.1, 68.3], br: [1049.7, 1503.0], bl: [390.0, 1495.0] };
  var THUMB_BOX = [133, 580, 360, 1133];     // where the thumb piece sits at rest
  var PIVOT = [240, 1125];               // its base knuckle, hidden under the palm
  var PAD = [331.5, 621];                    // the pad that touches the glass

  // ---- Motion: t (s), x, y (screen fractions), lift (0 = on the glass), rest (1 = resting on the edge), hold ----
  var KEYS = [
    [0.00, 0.14, 0.42, 1, 1, 0], [1.25, 0.14, 0.42, 1, 1, 0], [1.95, 0.15, 0.41, 0.8, 0, 0],
    [2.15, 0.14, 0.42, 0, 0, 1], [2.35, 0.14, 0.42, 0, 0, 1], [2.75, 0.25, 0.56, 0.9, 0, 0],
    [3.08, 0.34, 0.655, 0.25, 0, 0], [3.18, 0.35, 0.66, 0, 0, 1], [3.50, 0.30, 0.50, 0, 0, 1],
    [3.66, 0.30, 0.52, 0.8, 0, 0], [4.30, 0.37, 0.65, 0.5, 0, 0], [4.48, 0.378, 0.665, 0, 0, 1],
    [4.66, 0.378, 0.665, 0, 0, 1], [4.95, 0.44, 0.63, 0.8, 0, 0], [5.12, 0.495, 0.655, 0.45, 0, 0],
    [5.23, 0.500, 0.665, 0, 0, 1], [5.40, 0.500, 0.665, 0, 0, 1], [5.72, 0.42, 0.63, 0.8, 0, 0],
    [5.86, 0.40, 0.64, 0.2, 0, 0], [5.93, 0.40, 0.64, 0, 0, 1], [6.25, 0.38, 0.54, 0, 0, 1],
    [6.40, 0.38, 0.55, 0.8, 0, 0], [7.05, 0.44, 0.545, 0.45, 0, 0], [7.22, 0.45, 0.556, 0, 0, 1],
    [7.40, 0.45, 0.556, 0, 0, 1], [7.90, 0.30, 0.50, 1, 0, 0], [8.60, 0.14, 0.42, 1, 1, 0], [30, 0.14, 0.42, 1, 1, 0]
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
    return { x: 0.14, y: 0.42, lift: 1, rest: 1 };
  }
  function onScreen(u, v) {
    var q = SCREEN;
    return [(1 - v) * ((1 - u) * q.tl[0] + u * q.tr[0]) + v * ((1 - u) * q.bl[0] + u * q.br[0]),
            (1 - v) * ((1 - u) * q.tl[1] + u * q.tr[1]) + v * ((1 - u) * q.bl[1] + u * q.br[1])];
  }
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  var REST_ANGLE = Math.atan2(PAD[1] - PIVOT[1], PAD[0] - PIVOT[0]);
  var REST_LEN = Math.hypot(PAD[0] - PIVOT[0], PAD[1] - PIVOT[1]);
  function wrapAngle(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; }

  // Turn and length for the thumb so its pad lands on the target.
  function thumbPose(p) {
    var tg = onScreen(p.x, p.y);
    tg = [tg[0] - p.lift * 4, tg[1] - p.lift * 8];
    var v = [tg[0] - PIVOT[0], tg[1] - PIVOT[1]];
    var turn = wrapAngle(Math.atan2(v[1], v[0]) - REST_ANGLE);
    var len = clamp(Math.hypot(v[0], v[1]) / REST_LEN, 0.74, 1.08);
    var k = 1 - p.rest;
    return { turn: turn * k, len: 1 + (len - 1) * k, grow: 1 + p.lift * 0.03 * k, over: k, lift: p.lift };
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

  function load(src) { return new Promise(function (res, rej) { var i = new Image(); i.onload = function () { res(i); }; i.onerror = rej; i.src = src; }); }

  var first = true;
  document.querySelectorAll(".hold").forEach(function (holder) {
    var video = holder.querySelector("video"), canvas = holder.querySelector(".hold-hand");
    if (!video || !canvas || !canvas.getContext) return;
    var ctx = canvas.getContext("2d");
    var thumbImg = null, palmImg = null, fullImg = null, margin = 0.12;

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
      if (!thumbImg || !palmImg) return;
      var cssW = holder.clientWidth, cssH = holder.clientHeight, dpr = Math.min(window.devicePixelRatio || 1, 2);
      var W = Math.round(cssW * (1 + margin * 2)), H = Math.round(cssH * (1 + margin));
      if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
        canvas.style.width = W + "px"; canvas.style.height = H + "px"; canvas.style.left = (-cssW * margin) + "px";
        canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      }
      var s = cssW / IMG_W * dpr, ox = cssW * margin * dpr;
      var p = pose(video.currentTime), q = thumbPose(p);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingQuality = "high";
      ctx.setTransform(s, 0, 0, s, ox, 0);   // photo pixels -> canvas pixels

      // The thumb: turn about its knuckle; shorten along its own length when bending toward the glass.
      ctx.save();
      ctx.translate(PIVOT[0], PIVOT[1]);
      ctx.rotate(q.turn + REST_ANGLE);
      ctx.scale(q.len * q.grow, q.grow);
      ctx.rotate(-REST_ANGLE);
      ctx.translate(-PIVOT[0], -PIVOT[1]);
      if (q.over > 0.01) {
        // soft shadow on the glass: close and dark when touching, wider and fainter when raised
        ctx.shadowColor = "rgba(0,0,0," + ((0.30 - q.lift * 0.12) * q.over).toFixed(3) + ")";
        ctx.shadowBlur = (4 + q.lift * 14) * dpr;
        ctx.shadowOffsetX = (4 + q.lift * 12) * dpr;
        ctx.shadowOffsetY = (6 + q.lift * 18) * dpr;
      }
      ctx.drawImage(thumbImg, THUMB_BOX[0], THUMB_BOX[1], THUMB_BOX[2] - THUMB_BOX[0], THUMB_BOX[3] - THUMB_BOX[1]);
      ctx.restore();

      // The palm on top hides the thumb's base knuckle, like a real hand.
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
      holder.classList.add("live");
      draw();
    }).catch(function () {});

    var raf = 0;
    function loop() { draw(); raf = video.paused || video.ended ? 0 : requestAnimationFrame(loop); }
    video.addEventListener("play", function () { if (!raf) raf = requestAnimationFrame(loop); });
    ["seeked", "ended", "pause", "loadeddata", "loadedmetadata"].forEach(function (e) { video.addEventListener(e, draw); });
    addEventListener("resize", draw);
    placeVideo();
    if (first) { window.OfficeSwapThumb = { draw: draw, pose: pose, thumbPose: thumbPose }; first = false; }
  });
})();
