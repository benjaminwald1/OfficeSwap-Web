/* The hero shows a real photo of a hand holding an iPhone, with the app video on its screen.
   The thumb is rigged with three bones (base in the palm, knuckle, middle joint) and drawn as a
   bendable WebGL mesh. Following the video's clock, it reaches over, bends to land its pad on
   each button, lifts between taps, drags the form up, and returns to rest on the phone's edge. */
(function () {
 // Every phone on the page (the hero and the closing section) gets its own rig.
 document.querySelectorAll(".hold").forEach(function (holder, index) {
  var video = holder.querySelector("video");
  var canvas = holder.querySelector(".hold-hand");
  if (!video || !canvas) return;

  // ---- Photo geometry, in pixels of the 1245x1762 layers ----
  var IMG_W = 1245, IMG_H = 1762;
  var SCREEN = { tl: [406.7, 57.0], tr: [1066.1, 68.3], br: [1049.7, 1503.0], bl: [390.0, 1495.0] };
  var C = [180, 1605], M = [262.5, 1200], I = [303.75, 885], PAD = [331.5, 621]; // thumb base, knuckle, joint, pad

  // Screen fraction -> photo pixels (bilinear over the screen's four corners).
  function onScreen(u, v) {
    var t = SCREEN;
    var x = (1 - v) * ((1 - u) * t.tl[0] + u * t.tr[0]) + v * ((1 - u) * t.bl[0] + u * t.br[0]);
    var y = (1 - v) * ((1 - u) * t.tl[1] + u * t.tr[1]) + v * ((1 - u) * t.bl[1] + u * t.br[1]);
    return [x, y];
  }

  // ---- Put the video on the photo's screen (a slight tilt, so a full perspective map) ----
  function homography(src, dst) {
    var A = [], b = [];
    for (var i = 0; i < 4; i++) {
      var x = src[i][0], y = src[i][1], X = dst[i][0], Y = dst[i][1];
      A.push([x, y, 1, 0, 0, 0, -X * x, -X * y]); b.push(X);
      A.push([0, 0, 0, x, y, 1, -Y * x, -Y * y]); b.push(Y);
    }
    for (var c = 0; c < 8; c++) {                     // Gaussian elimination
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
  function placeVideo() {
    var s = holder.clientWidth / IMG_W, bleed = 3;
    var vw = 604, vh = 1312;
    video.style.width = vw + "px"; video.style.height = vh + "px";
    var d = [[SCREEN.tl[0] - bleed, SCREEN.tl[1] - bleed], [SCREEN.tr[0] + bleed, SCREEN.tr[1] - bleed],
             [SCREEN.br[0] + bleed, SCREEN.br[1] + bleed], [SCREEN.bl[0] - bleed, SCREEN.bl[1] + bleed]]
            .map(function (p) { return [p[0] * s, p[1] * s]; });
    video.style.transform = "matrix3d(" + homography([[0, 0], [vw, 0], [vw, vh], [0, vh]], d).join(",") + ")";
  }

  // ---- Thumb motion: t (s), x, y (screen fractions), lift (0 = on the glass), rest (1 = resting on the edge), hold ----
  var KEYS = [
    [0.00, 0.17, 0.39, 1, 1, 0], [1.20, 0.17, 0.39, 1, 1, 0], [1.95, 0.17, 0.39, 0.9, 0, 0],
    [2.18, 0.16, 0.372, 0, 0, 1], [2.38, 0.16, 0.372, 0, 0, 1], [2.80, 0.40, 0.72, 0.8, 0, 0],
    [3.22, 0.55, 0.83, 0.25, 0, 0], [3.32, 0.55, 0.82, 0, 0, 1], [3.40, 0.55, 0.81, 0, 0, 0],
    [3.75, 0.55, 0.59, 0, 0, 1], [3.95, 0.50, 0.62, 0.9, 0, 0], [4.45, 0.39, 0.73, 0.45, 0, 0],
    [4.64, 0.378, 0.744, 0, 0, 1], [4.82, 0.378, 0.744, 0, 0, 1], [5.10, 0.45, 0.72, 0.7, 0, 0],
    [5.28, 0.505, 0.735, 0.4, 0, 0], [5.39, 0.500, 0.744, 0, 0, 1], [5.56, 0.500, 0.744, 0, 0, 1],
    [5.85, 0.58, 0.80, 0.7, 0, 0], [6.05, 0.60, 0.79, 0.2, 0, 0], [6.10, 0.60, 0.785, 0, 0, 1],
    [6.44, 0.60, 0.705, 0, 0, 1], [6.65, 0.64, 0.78, 0.9, 0, 0], [7.18, 0.70, 0.915, 0.45, 0, 0],
    [7.36, 0.70, 0.931, 0, 0, 1], [7.55, 0.70, 0.931, 0, 0, 1], [8.05, 0.45, 0.70, 1, 0, 0],
    [8.75, 0.17, 0.39, 1, 1, 0], [20, 0.17, 0.39, 1, 1, 0]
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
        for (var c = 1; c <= 4; c++) o.push(hermite(a[c], b[c], tangent(i - 1, c) * dt, tangent(i, c) * dt, u));
        var ru = u * u * (3 - 2 * u);                       // rest blends with an ease, never overshoots
        return { x: o[0], y: o[1], lift: Math.max(0, Math.min(1, o[2])), rest: a[4] + (b[4] - a[4]) * ru };
      }
    }
    var l = KEYS[KEYS.length - 1];
    return { x: l[1], y: l[2], lift: l[3], rest: l[4] };
  }

  // ---- 2D affine helpers: [a, b, c, d, e, f] maps (x, y) to (a x + c y + e, b x + d y + f) ----
  function mul(m, n) {
    return [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
            m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
  }
  function rotAbout(p, a, s) {
    s = s || 1; var c = Math.cos(a) * s, n = Math.sin(a) * s;
    return [c, n, -n, c, p[0] - c * p[0] + n * p[1], p[1] - n * p[0] - c * p[1]];
  }
  // Scale by f across the direction th (angle), about point p; lengths along th are unchanged.
  function scaleAcross(p, th, f) {
    var c = Math.cos(th), n = Math.sin(th), k = f - 1;
    var a = 1 + k * n * n, b = -k * c * n, d = 1 + k * c * c;   // I + k * (perp perp^T)
    return [a, b, b, d, p[0] - a * p[0] - b * p[1], p[1] - b * p[0] - d * p[1]];
  }
  function apply(m, p) { return [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]]; }
  function ang(v) { return Math.atan2(v[1], v[0]); }
  function wrap(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; }
  function dist(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1]); }
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }

  // ---- Thumb IK: base turns part of the way, then knuckle + joint solve like a real two-joint finger ----
  var L1 = dist(M, I), L2 = dist(I, PAD);
  // Two-joint solve from the knuckle: returns the knuckle and joint turns that put the pad on target.
  function twoJoint(a0, target, grow) {
    var B0 = rotAbout(C, a0);
    var M1 = apply(B0, M), I1 = apply(B0, I);
    var l1 = L1 * grow, l2 = L2 * grow, d = dist(target, M1), stretch = 1;
    if (d > (l1 + l2) * 0.999) { stretch = d / ((l1 + l2) * 0.999); l1 *= stretch; l2 *= stretch; }
    var dd = clamp(d, Math.abs(l1 - l2) + 1, (l1 + l2) * 0.999);
    var base = ang([target[0] - M1[0], target[1] - M1[1]]);
    var A = Math.acos(clamp((l1 * l1 + dd * dd - l2 * l2) / (2 * l1 * dd), -1, 1));
    var jA = [M1[0] + Math.cos(base - A) * l1, M1[1] + Math.sin(base - A) * l1];
    var jB = [M1[0] + Math.cos(base + A) * l1, M1[1] + Math.sin(base + A) * l1];
    var v = [target[0] - M1[0], target[1] - M1[1]];
    function side(j) { return v[0] * (j[1] - M1[1]) - v[1] * (j[0] - M1[0]); }
    var J = side(jA) < side(jB) ? jA : jB;       // knuckles bow outward, away from the palm
    var a1 = wrap(ang([J[0] - M1[0], J[1] - M1[1]]) - ang([I1[0] - M1[0], I1[1] - M1[1]]));
    var s = grow * stretch;
    var B1 = mul(rotAbout(M1, a1, s), B0);
    var I2 = apply(B1, I), P2 = apply(B1, PAD);
    var a2 = wrap(ang([target[0] - I2[0], target[1] - I2[1]]) - ang([P2[0] - I2[0], P2[1] - I2[1]]));
    return { a0: a0, a1: a1, a2: a2, s: s, stretch: stretch };
  }
  // A real thumb swings mostly from its base and keeps its joints gently bent, so pick the base
  // swing that needs the least bending at the knuckle and joint (and never folds past their range).
  function solve(target, lift) {
    var grow = 1 + lift * 0.035, best = null, bestCost = 1e9;
    for (var a0 = -0.35; a0 <= 1.15; a0 += 0.01) {
      var q = twoJoint(a0, target, grow);
      var cost = Math.abs(q.a1) * 1.0 + Math.abs(q.a2) * 1.2 + Math.abs(a0) * 0.35 + (q.stretch - 1) * 25
               + Math.max(0, Math.abs(q.a1) - 0.8) * 8 + Math.max(0, Math.abs(q.a2) - 1.0) * 8;
      if (cost < bestCost) { bestCost = cost; best = q; }
    }
    return best;
  }
  // Blend a solved pose toward rest by easing the joint angles back to zero.
  function bones(p) {
    var target = onScreen(p.x, p.y);
    target = [target[0] - p.lift * 5, target[1] - p.lift * 9];
    var q = solve(target, p.lift), k = 1 - p.rest;
    var s = 1 + (q.s - 1) * k;
    var B0 = rotAbout(C, q.a0 * k);
    var M1 = apply(B0, M);
    var B1 = mul(rotAbout(M1, q.a1 * k, s), B0);
    var I2 = apply(B1, I);
    var B2 = mul(rotAbout(I2, q.a2 * k), B1);
    // Swung over the glass, we see more of the thumb's broad back than its side: widen it across its
    // length (about the knuckle-to-pad line, so the pad stays exactly on target).
    var widen = 1 + clamp(q.a0 * k / 0.9, 0, 1) * 0.22;
    if (widen > 1.001) {
      var pad = apply(B2, PAD), th = ang([pad[0] - M1[0], pad[1] - M1[1]]);
      var W = scaleAcross(M1, th, widen);
      B1 = mul(W, B1); B2 = mul(W, B2);
    }
    return [B0, B1, B2];
  }

  // ---- WebGL ----
  var gl = canvas.getContext("webgl", { premultipliedAlpha: true, alpha: true, antialias: true });
  if (!gl) return;   // the static photo still shows; only the thumb animation is lost
  var VS = [
    "attribute vec2 aPos; attribute vec3 aW;",
    "uniform mat3 uB[3]; uniform float uScale; uniform vec2 uView; uniform vec2 uShift;",
    "varying vec2 vUV; varying float vT;",
    "void main(){",
    "  vec3 p = vec3(aPos, 1.0); float w0 = 1.0 - aW.x - aW.y - aW.z;",
    "  vec2 q = p.xy * w0 + (uB[0]*p).xy * aW.x + (uB[1]*p).xy * aW.y + (uB[2]*p).xy * aW.z;",
    "  vec2 c = (q * uScale + uShift) / uView * 2.0 - 1.0;",
    "  gl_Position = vec4(c.x, -c.y, 0.0, 1.0); vUV = aPos / vec2(" + IMG_W + ".0, " + IMG_H + ".0); vT = aW.y + aW.z;",
    "}"].join("\n");
  var FS = [
    "precision mediump float; uniform sampler2D uTex; uniform float uShadow; varying vec2 vUV; varying float vT;",
    "void main(){ vec4 t = texture2D(uTex, vUV);",
    "  if (uShadow > 0.0) { gl_FragColor = vec4(0.0, 0.0, 0.0, t.a * uShadow * smoothstep(0.35, 0.9, vT)); }",
    "  else { gl_FragColor = t; } }"].join("\n");
  function shader(type, src) { var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; }
  var prog = gl.createProgram();
  gl.attachShader(prog, shader(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FS));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
  gl.useProgram(prog);
  var loc = { aPos: gl.getAttribLocation(prog, "aPos"), aW: gl.getAttribLocation(prog, "aW") };
  ["uScale", "uView", "uShift", "uTex", "uShadow"].forEach(function (n) { loc[n] = gl.getUniformLocation(prog, n); });
  loc.uB = [0, 1, 2].map(function (i) { return gl.getUniformLocation(prog, "uB[" + i + "]"); });

  function load(src) { return new Promise(function (res, rej) { var i = new Image(); i.onload = function () { res(i); }; i.onerror = rej; i.src = src; }); }
  var ready = false, count = 0;
  Promise.all([load(canvas.getAttribute("data-src")), load(canvas.getAttribute("data-weights"))]).then(function (imgs) {
    var img = imgs[0], wimg = imgs[1];
    function pixels(im, w, h) { var c = document.createElement("canvas"); c.width = w; c.height = h; var x = c.getContext("2d"); x.drawImage(im, 0, 0, w, h); return x.getImageData(0, 0, w, h).data; }
    var alpha = pixels(img, IMG_W, IMG_H), WW = wimg.naturalWidth, WH = wimg.naturalHeight, wts = pixels(wimg, WW, WH);
    function a(x, y) { x = clamp(x | 0, 0, IMG_W - 1); y = clamp(y | 0, 0, IMG_H - 1); return alpha[(y * IMG_W + x) * 4 + 3]; }
    function w(x, y) {                               // bilinear sample of the weight map (drawn at 1/4 scale)
      var fx = clamp(x / 4, 0, WW - 1.001), fy = clamp(y / 4, 0, WH - 1.001), x0 = fx | 0, y0 = fy | 0, dx = fx - x0, dy = fy - y0, o = [0, 0, 0];
      for (var ch = 0; ch < 3; ch++) {
        var g = function (xx, yy) { return wts[(yy * WW + xx) * 4 + ch] / 255; };
        o[ch] = (g(x0, y0) * (1 - dx) + g(x0 + 1, y0) * dx) * (1 - dy) + (g(x0, y0 + 1) * (1 - dx) + g(x0 + 1, y0 + 1) * dx) * dy;
      }
      return o;
    }
    var pos = [], ww = [];
    function vert(x, y) { var q = w(x, y); pos.push(x, y); ww.push(q[0], q[1], q[2]); }
    // Fine cells on the thumb (it bends), coarse ones on the still parts of the hand.
    function cell(x0, y0, size) {
      var x1 = Math.min(IMG_W, x0 + size), y1 = Math.min(IMG_H, y0 + size), any = false, moving = false;
      for (var sy = y0; sy <= y1; sy += Math.max(2, size / 4)) for (var sx = x0; sx <= x1; sx += Math.max(2, size / 4)) {
        if (a(sx, sy) > 0) any = true;
        var q = w(sx, sy); if (q[0] + q[1] + q[2] > 0.002) moving = true;
      }
      if (!any) return;
      if (moving && size > 8) { var hs = size / 2; cell(x0, y0, hs); cell(x0 + hs, y0, hs); cell(x0, y0 + hs, hs); cell(x0 + hs, y0 + hs, hs); return; }
      vert(x0, y0); vert(x1, y0); vert(x0, y1); vert(x1, y0); vert(x1, y1); vert(x0, y1);
    }
    for (var y = 0; y < IMG_H; y += 32) for (var x = 0; x < IMG_W; x += 32) cell(x, y, 32);
    count = pos.length / 2;
    function buf(data, attr, size) {
      var b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(attr); gl.vertexAttribPointer(attr, size, gl.FLOAT, false, 0, 0);
    }
    buf(pos, loc.aPos, 2); buf(ww, loc.aW, 3);
    var tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.uniform1i(loc.uTex, 0);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    ready = true;
    holder.classList.add("live");     // hide the static hand picture; the mesh takes over
    draw();
  }).catch(function () {});

  function mat3(m) { return new Float32Array([m[0], m[1], 0, m[2], m[3], 0, m[4], m[5], 1]); }
  var margin = 0.12;                    // canvas extends past the photo so the thumb can travel
  function draw() {
    placeVideo();
    if (!ready) return;
    var cssW = holder.clientWidth, s = cssW / IMG_W, dpr = Math.min(window.devicePixelRatio || 1, 2);
    var W = Math.round(cssW * (1 + margin * 2)), H = Math.round(holder.clientHeight * (1 + margin));
    if (canvas.width !== Math.round(W * dpr)) {
      canvas.style.width = W + "px"; canvas.style.height = H + "px";
      canvas.style.left = (-cssW * margin) + "px";
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    }
    var p = pose(video.currentTime), B = bones(p);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    B.forEach(function (m, i) { gl.uniformMatrix3fv(loc.uB[i], false, mat3(m)); });
    gl.uniform1f(loc.uScale, s * dpr);
    gl.uniform2f(loc.uView, canvas.width, canvas.height);
    var ox = cssW * margin * dpr;
    // Shadow of the thumb on the glass: close and dark when touching, soft and offset when lifted.
    var over = 1 - p.rest;
    if (over > 0.01) {
      var blur = (2 + p.lift * 9) * dpr, dx = (3 + p.lift * 12) * dpr, dy = (5 + p.lift * 18) * dpr;
      var RINGS = [[0.0, 1], [0.5, 6], [1.0, 10]], total = 17, i = 0;
      gl.uniform1f(loc.uShadow, (0.24 - p.lift * 0.09) * over / total * 2.4);
      RINGS.forEach(function (ring) {
        for (var j = 0; j < ring[1]; j++, i++) {
          var an = j / ring[1] * Math.PI * 2 + ring[0];
          gl.uniform2f(loc.uShift, ox + dx + Math.cos(an) * blur * ring[0], dy + Math.sin(an) * blur * ring[0]);
          gl.drawArrays(gl.TRIANGLES, 0, count);
        }
      });
    }
    gl.uniform1f(loc.uShadow, 0); gl.uniform2f(loc.uShift, ox, 0);
    gl.drawArrays(gl.TRIANGLES, 0, count);
  }

  var raf = 0;
  function loop() { draw(); raf = video.paused || video.ended ? 0 : requestAnimationFrame(loop); }
  video.addEventListener("play", function () { if (!raf) raf = requestAnimationFrame(loop); });
  ["seeked", "ended", "pause", "loadeddata", "loadedmetadata"].forEach(function (e) { video.addEventListener(e, draw); });
  addEventListener("resize", draw);
  placeVideo();
  if (index === 0) window.OfficeSwapThumb = { draw: draw, pose: pose, onScreen: onScreen };
 });
})();
