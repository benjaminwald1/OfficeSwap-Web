/* Each phone on the page is a real photo of a hand holding an iPhone, with the app video on its
   screen. The thumb follows the video's clock: reaches over, presses each button, flicks the
   form up, and returns to rest on the edge. It moves the way a real thumb does in a one-handed
   grip: the palm keeps holding the phone while the thumb swings out from its base knuckle, and
   for a nearer key it bends at its two knuckles, the tip tipping down onto the glass. The hand is
   drawn as one continuous piece of skin: spots along the thumb go where the joints put them, the
   palm, wrist and heel stay put, and the flesh between follows smoothly (a moving-least-squares
   warp on a mesh), so there are no cut edges. */
(function () {
  // ---- Photo geometry, in pixels of the 1245x1762 layers ----
  var IMG_W = 1245, IMG_H = 1762;
  var SCREEN = { tl: [406.7, 57.0], tr: [1066.1, 68.3], br: [1049.7, 1503.0], bl: [390.0, 1495.0] };
  // The phone's lower body: the palm is behind it, so when the grip slides down, the palm (drawn on
  // in the palm layer where the photo has it hidden) shows only below this outline
  var PHONE_LOW = [[352, 1100], [352, 1497], [360, 1508], [385, 1529], [410, 1536], [460, 1537], [560, 1540], [685, 1541],
                   [785, 1542], [810, 1540], [835, 1532], [985, 1532], [1010, 1527], [1035, 1517], [1060, 1497], [1085, 1447], [1100, 1360], [1045, 1340], [1045, 1100]];
  var HAND_BOX = [0, 560, 372, 1762];        // the moving piece: the thumb and the ball of the hand, down to the wrist (a little past the
                                             // phone's edge, where the thumb's rounded pad is drawn in: the photo hides it behind the phone)
  var PIVOT = [260, 1480];                   // the thumb's base joint, deep in the ball of the thumb (the wrist and palm stay put)
  var PAD = [300, 600];                      // with the pivot, sets the thumb's axis (x runs along it)
  var TOUCH_PT = [307, 615];                 // the middle of the tip at rest: what meets the glass

  // ---- The joints, as fractions of the thumb's length from its base (the tip is 1) ----
  // The thumb moves only at its three joints, with rigid bone between them: a little at its base joint in
  // the ball of the thumb (so the ball barely moves), most of the swing at the base knuckle where the
  // thumb leaves the ball, and the top knuckle for a nearer key. Each joint bends over a short, smooth
  // hinge zone (HINGE each side).
  var ROOT = [-0.04, 0.06], MCP = 0.375, IP = 0.66, HINGE = { mcp: 0.08, ip: 0.055 };
  // For a nearer key the thumb bends (flexes) at both knuckles: up to BEND.max radians in all, the
  // last knuckle taking most of it, the way a thumb curls its tip onto a key.
  var BEND = { mcp: 0.3, ip: 0.7, max: 1.9 };
  // The thumb is drawn a fixed SHORT shorter past its base knuckle than in the photo, at rest and moving
  // alike, so its size never changes.
  var SHORT = 0.05;
  var TURN_ROOT = 0.25;                       // share of the swing taken at the base joint; the rest at the base knuckle
  // Much of a real knuckle's bend goes down toward the glass, not sideways: the fingertip tips
  // onto the screen, so seen from the front just the last segment (and a little of the one before)
  // looks shorter. FLAT is the share of the bend that shows sideways; TIP how much shorter each
  // segment looks per radian of bend.
  var FLAT = 1, TIP = { prox: 0, dist: 0 };
  // How far each side of the axis the flesh reaches (outer side toward the edge of the hand, inner
  // side toward the phone), by length fraction.
  var BAND = { u: [0.05, 0.2, 0.375, 0.55, 0.66, 0.8, 0.95], outer: [-110, -117, -156, -138, -129, -82, -35], inner: [83, 77, 61, 48, 57, 72, 58] };

  // ---- Motion: t (s), x, y (screen fractions), lift (0 = on the glass), rest (1 = resting on the edge), hold ----
  var KEYS = [
    [0.00, 0.14, 0.43, 1, 1, 0], [1.25, 0.14, 0.43, 1, 1, 0], [1.95, 0.15, 0.42, 0.8, 0, 0],
    [2.15, 0.14, 0.43, 0, 0, 1], [2.35, 0.14, 0.43, 0, 0, 1], [2.75, 0.32, 0.60, 0.9, 0, 0],
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
  function smooth(u, a, b) { var x = clamp((u - a) / (b - a), 0, 1); return x * x * (3 - 2 * x); }
  function lerp(u, xs, ys) {
    if (u <= xs[0]) return ys[0];
    for (var i = 1; i < xs.length; i++) if (u <= xs[i]) return ys[i - 1] + (ys[i] - ys[i - 1]) * (u - xs[i - 1]) / (xs[i] - xs[i - 1]);
    return ys[ys.length - 1];
  }
  var REST_ANGLE = Math.atan2(PAD[1] - PIVOT[1], PAD[0] - PIVOT[0]);
  var REST_LEN = Math.hypot(PAD[0] - PIVOT[0], PAD[1] - PIVOT[1]);
  function mul(m, n) {   // m after n
    return [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
            m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
  }
  function apply(m, p) { return [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]]; }
  function rot(a) { var c = Math.cos(a), n = Math.sin(a); return [c, n, -n, c, 0, 0]; }
  function dist(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1]); }
  // the tip's contact point in the thumb's own frame
  var TOUCH = (function () {
    var dx = TOUCH_PT[0] - PIVOT[0], dy = TOUCH_PT[1] - PIVOT[1], c = Math.cos(REST_ANGLE), n = Math.sin(REST_ANGLE);
    return [dx * c + dy * n, -dx * n + dy * c];
  })();

  // ---- The joint chain: thin rigid slices along the thumb, each turned a little more than the last ----
  // Per slice (at its middle): how much of the turn at the base has built up, and how much of the bend.
  var N = 120, BASE = -120, SW = (REST_LEN * 1.06 - BASE) / N;
  var PF = [], PC = [], PP = [], PD = [];
  for (var si = 0; si <= N; si++) {
    var su = (BASE + SW * (Math.min(si, N - 1) + 0.5)) / REST_LEN;
    PF.push(TURN_ROOT * smooth(su, ROOT[0], ROOT[1]) + (1 - TURN_ROOT) * smooth(su, MCP - HINGE.mcp, MCP + HINGE.mcp));
    PP.push(smooth(su, MCP - HINGE.mcp, MCP + HINGE.mcp)); PD.push(smooth(su, IP - HINGE.ip, IP + HINGE.ip));
    PC.push(BEND.mcp * smooth(su, MCP - HINGE.mcp, MCP + HINGE.mcp) + BEND.ip * smooth(su, IP - HINGE.ip, IP + HINGE.ip));
  }
  // fn(S, x0): S maps the thumb's own frame (x along it, from the pivot) to photo pixels for
  // the slice starting at x0.
  function chain(turn, bend, fn, shift, shorten) {
    shift = shift || [0, 0];
    var M = mul(mul([1, 0, 0, 1, PIVOT[0] + shift[0], PIVOT[1] + shift[1]], rot(REST_ANGLE)), [1, 0, 0, 1, BASE, 0]);
    for (var i = 0; i < N; i++) {
      var x0 = BASE + SW * i;
      if (i > 0) M = mul(M, rot(turn * (PF[i] - PF[i - 1]) + FLAT * bend * (PC[i] - PC[i - 1])));
      var sx = (1 - (shorten || 0) * PP[i]) * (1 - bend * (TIP.prox * PP[i] + (TIP.dist - TIP.prox) * PD[i]));
      fn(mul(mul(M, [sx, 0, 0, 1, 0, 0]), [1, 0, 0, 1, -x0, 0]), x0);
      M = mul(M, [1, 0, 0, 1, SW * sx, 0]);
    }
  }
  function touchAt(turn, bend, back, shorten) {   // back: how far behind the tip the contact is
    var out = null, t = [TOUCH[0] - (back || 0), TOUCH[1]];
    chain(turn, bend, function (S, x0) { if (out === null && t[0] >= x0 && t[0] < x0 + SW) out = apply(S, t); }, null, shorten);
    return out || TOUCH_PT;
  }
  function wrapAngle(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; }

  // Turn and bend so the fingertip lands on the target. The swing is shared between the base joint and
  // the base knuckle, so the two are solved together (a far key gets a straighter thumb).
  function thumbPose(p) {
    var tg = onScreen(p.x, p.y);
    tg = [tg[0] - p.lift * 4, tg[1] - p.lift * 8];
    var turn = 0, bend = 0.5, sh = SHORT, e = 1e-3;
    for (var it = 0; it < 30; it++) {   // Gauss-Newton on (turn, bend), bend kept within the knuckles' range
      var tp = touchAt(turn, bend, 0, sh), fx = tp[0] - tg[0], fy = tp[1] - tg[1];
      if (fx * fx + fy * fy < 0.25) break;
      var a = touchAt(turn + e, bend, 0, sh), c = touchAt(turn, bend + e, 0, sh);
      var j11 = (a[0] - tp[0]) / e, j21 = (a[1] - tp[1]) / e, j12 = (c[0] - tp[0]) / e, j22 = (c[1] - tp[1]) / e;
      var det = j11 * j22 - j12 * j21;
      if (Math.abs(det) < 1e-6) break;
      var dt = -(j22 * fx - j12 * fy) / det, db = -(-j21 * fx + j11 * fy) / det;
      var m = Math.max(Math.abs(dt), Math.abs(db)) > 0.3 ? 0.3 / Math.max(Math.abs(dt), Math.abs(db)) : 1;
      turn += dt * m; bend = clamp(bend + db * m, 0, BEND.max);
    }
    if (bend <= 1e-4) {   // out of reach even straight: point the thumb steadily at the key
      bend = 0;
      for (var it2 = 0; it2 < 20; it2++) {
        var tq = touchAt(turn, 0, 0, sh);
        turn += 0.7 * wrapAngle(Math.atan2(tg[1] - PIVOT[1], tg[0] - PIVOT[0]) - Math.atan2(tq[1] - PIVOT[1], tq[0] - PIVOT[0]));
      }
    }
    var k = 1 - p.rest;
    return { turn: turn * k, bend: bend * k, back: 0, shorten: sh, slide: 0, shift: [0, 0], over: k, lift: p.lift, target: tg };
  }



  // ---- The warp: the whole hand deforms as one piece of skin. Marked spots along the bones
  // (HANDLES, in the thumb's frame) go where the joint chain puts them; PINS at the wrist and the
  // heel of the hand stay put; everything between follows smoothly (moving least squares, rigid). ----
  var HANDLES = (function () {
    var pts = [];
    // none right at the base: the web between the swinging thumb and the still palm is left to stretch
    // freely, so it never folds over itself
    for (var u = 0.12; u <= 1.02; u += 0.05) {
      pts.push([u * REST_LEN, 0]);
      pts.push([u * REST_LEN, lerp(u, BAND.u, BAND.outer) * 0.8]);
      pts.push([u * REST_LEN, lerp(u, BAND.u, BAND.inner) * 0.8]);
    }
    return pts;
  })();
  // [x, y, share of the grip's shift it follows]: the palm, the heel under the phone and the wrist stay
  // exactly as in the photo while the thumb moves
  var PINS = [[40, 1700, 0], [150, 1700, 0], [130, 1740, 0], [230, 1762, 0], [300, 1760, 0], [340, 1700, 0], [340, 1620, 0],
              [345, 1560, 0], [420, 1570, 0], [560, 1600, 0], [720, 1640, 0], [110, 1590, 0], [200, 1630, 0], [300, 1630, 0],
              [150, 1540, 0], [110, 1530, 0]];
  // The mesh covers the moving piece; everything right of it (the heel under the phone, the
  // fingers, the phone's outline) is the still palm piece.
  var WARP = { x0: 0, y0: HAND_BOX[1], y1: IMG_H, step: 24, xmax: HAND_BOX[2] };
  var REST_S = [];
  chain(0, 0, function (S) { REST_S.push(S); });
  function controls(q) {   // [[from x, from y, to x, to y], ...] in photo pixels
    var out = [], Ss = [];
    chain(q.turn, q.bend, function (S) { Ss.push(S); }, q.shift, q.shorten);
    HANDLES.forEach(function (h) {
      var i = clamp(Math.floor((h[0] - BASE) / SW), 0, N - 1);
      var a = apply(REST_S[i], h), b = apply(Ss[i], h);
      out.push([a[0], a[1], b[0], b[1]]);
    });
    PINS.forEach(function (p) { out.push([p[0], p[1], p[0] + q.shift[0] * p[2], p[1] + q.shift[1] * p[2]]); });
    return out;
  }
  function mlsRigid(cp, x, y) {
    var n = cp.length, ws = new Array(n), sw = 0, px = 0, py = 0, qx = 0, qy = 0, i, w, c;
    for (i = 0; i < n; i++) {
      c = cp[i]; var dx = c[0] - x, dy = c[1] - y;
      w = dx * dx + dy * dy + 1e-3; w = 1 / (w * w); ws[i] = w; sw += w;   // 1/d^4: each spot's pull stays local, so the knuckles keep their shape
      px += w * c[0]; py += w * c[1]; qx += w * c[2]; qy += w * c[3];
    }
    px /= sw; py /= sw; qx /= sw; qy /= sw;
    var mu = 0, la = 0;
    for (i = 0; i < n; i++) {
      c = cp[i]; var ax = c[0] - px, ay = c[1] - py, bx = c[2] - qx, by = c[3] - qy;
      mu += ws[i] * (ax * bx + ay * by); la += ws[i] * (ax * by - ay * bx);
    }
    var th = Math.atan2(la, mu), cs = Math.cos(th), sn = Math.sin(th), rx = x - px, ry = y - py;
    return [cs * rx - sn * ry + qx, sn * rx + cs * ry + qy];
  }
  window.OfficeSwapThumb = { pose: pose, thumbPose: thumbPose, controls: controls, mlsRigid: mlsRigid };

  // ---- The mesh over the warped part of the photo ----
  var GRID = (function () {
    var xs = [], ys = [], x, y;
    for (x = WARP.x0; x < WARP.xmax + WARP.step; x += WARP.step) xs.push(Math.min(x, WARP.xmax));
    for (y = WARP.y0; y < WARP.y1 + WARP.step; y += WARP.step) ys.push(Math.min(y, WARP.y1));
    var nx = xs.length, ny = ys.length, uv = new Float32Array(nx * ny * 2), idx = [], i, j, k = 0;
    for (j = 0; j < ny; j++) for (i = 0; i < nx; i++) { uv[k++] = xs[i]; uv[k++] = ys[j]; }
    for (j = 0; j < ny - 1; j++) for (i = 0; i < nx - 1; i++) {
      var a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
    return { nx: nx, ny: ny, uv: uv, idx: new Uint16Array(idx), count: nx * ny };
  })();

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

  // A tiny WebGL warper: draws a textured mesh whose vertices are given in photo pixels.
  function makeWarper() {
    var c = document.createElement("canvas"), gl = c.getContext("webgl", { alpha: true, premultipliedAlpha: true, antialias: true });
    if (!gl) return null;
    function sh(type, src) { var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; }
    var prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER,
      "attribute vec2 a_pos; attribute vec2 a_uv; uniform vec2 u_scale; uniform vec2 u_offset; uniform vec2 u_size; varying vec2 v_uv;" +
      "void main() { vec2 p = a_pos * u_scale + u_offset; gl_Position = vec4(p.x / u_size.x * 2.0 - 1.0, 1.0 - p.y / u_size.y * 2.0, 0.0, 1.0); v_uv = a_uv; }"));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER,
      "precision highp float; uniform sampler2D u_tex; uniform vec4 u_box; uniform vec4 u_keep; uniform float u_inv; uniform vec2 u_scale; uniform vec2 u_offset; uniform vec2 u_size; varying vec2 v_uv;" +
      "void main() { vec2 ph = vec2((gl_FragCoord.x - u_offset.x) / u_scale.x, (u_size.y - gl_FragCoord.y - u_offset.y) / u_scale.y);" +
      " bool inside = ph.x >= u_keep.x && ph.x < u_keep.y && ph.y >= u_keep.z && ph.y < u_keep.w;" +
      " if (u_inv > 0.5 ? inside : !inside) discard;" +
      " vec2 t = (v_uv - u_box.xy) / u_box.zw; if (t.x < 0.0 || t.x > 1.0 || t.y < 0.0 || t.y > 1.0) discard;" +
      " vec4 col = texture2D(u_tex, t); gl_FragColor = vec4(col.rgb * col.a, col.a); }"));
    gl.linkProgram(prog); gl.useProgram(prog);
    var loc = { pos: gl.getAttribLocation(prog, "a_pos"), uv: gl.getAttribLocation(prog, "a_uv"),
                scale: gl.getUniformLocation(prog, "u_scale"), offset: gl.getUniformLocation(prog, "u_offset"), size: gl.getUniformLocation(prog, "u_size"),
                box: gl.getUniformLocation(prog, "u_box"), keep: gl.getUniformLocation(prog, "u_keep"), inv: gl.getUniformLocation(prog, "u_inv"), tex: gl.getUniformLocation(prog, "u_tex") };
    var posBuf = gl.createBuffer(), uvBuf = gl.createBuffer(), idxBuf = gl.createBuffer(), quadBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, uvBuf); gl.bufferData(gl.ARRAY_BUFFER, GRID.uv, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf); gl.bufferData(gl.ARRAY_BUFFER, GRID.uv.byteLength, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, IMG_W, 0, 0, IMG_H, IMG_W, IMG_H]), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, GRID.idx, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(loc.pos); gl.enableVertexAttribArray(loc.uv);
    function attrs(pos, uv) {
      gl.bindBuffer(gl.ARRAY_BUFFER, pos); gl.vertexAttribPointer(loc.pos, 2, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, uv); gl.vertexAttribPointer(loc.uv, 2, gl.FLOAT, false, 0, 0);
    }
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.uniform1i(loc.tex, 0);
    function texture(img) {
      var t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      return t;
    }
    return {
      canvas: c, gl: gl, texture: texture,
      size: function (w, h) { if (c.width !== w || c.height !== h) { c.width = w; c.height = h; } gl.viewport(0, 0, w, h); gl.uniform2f(loc.size, w, h); },
      positions: function (arr) { gl.bindBuffer(gl.ARRAY_BUFFER, posBuf); gl.bufferSubData(gl.ARRAY_BUFFER, 0, arr); },
      clear: function () { gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); },
      // draw one texture piece through the warped mesh: box = where its pixels sit in the photo,
      // keep = [x0, x1, y0, y1] of the photo (as placed on the page) to show, or with inv to leave out
      draw: function (tex, box, keep, inv, scale, offset) {
        attrs(posBuf, uvBuf);
        gl.uniform2f(loc.scale, scale, scale); gl.uniform2f(loc.offset, offset[0], offset[1]);
        gl.uniform4f(loc.box, box[0], box[1], box[2], box[3]); gl.uniform4f(loc.keep, keep[0], keep[1], keep[2], keep[3]); gl.uniform1f(loc.inv, inv ? 1 : 0);
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.drawElements(gl.TRIANGLES, GRID.idx.length, gl.UNSIGNED_SHORT, 0);
      },
      // the same, unwarped, over the whole photo
      drawStill: function (tex, box, keep, inv, scale, offset) {
        attrs(quadBuf, quadBuf);
        gl.uniform2f(loc.scale, scale, scale); gl.uniform2f(loc.offset, offset[0], offset[1]);
        gl.uniform4f(loc.box, box[0], box[1], box[2], box[3]); gl.uniform4f(loc.keep, keep[0], keep[1], keep[2], keep[3]); gl.uniform1f(loc.inv, inv ? 1 : 0);
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
    };
  }

  var first = true;
  document.querySelectorAll(".hold").forEach(function (holder) {
    var video = holder.querySelector("video"), canvas = holder.querySelector(".hold-hand");
    if (!video || !canvas || !canvas.getContext) return;
    var ctx = canvas.getContext("2d");
    var palmImg = null, fullImg = null, warper = null, thumbTex = null, palmTex = null, margin = 0.12;
    var pos = new Float32Array(GRID.count * 2);

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

    // Where every mesh vertex goes for this pose.
    function deform(q) {
      var cp = controls(q), uv = GRID.uv;
      for (var i = 0; i < GRID.count; i++) {
        var d = mlsRigid(cp, uv[2 * i], uv[2 * i + 1]);
        pos[2 * i] = d[0]; pos[2 * i + 1] = d[1];
      }
    }

    function draw() {
      if (!warper || !palmImg) { placeVideo(); return; }
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

      deform(q);
      warper.size(canvas.width, canvas.height);
      var all = [0, IMG_W, 0, IMG_H];
      // the rest of the hand (the heel under the phone, the fingers), untouched
      warper.clear();
      var hand = [ox, q.slide * s];   // the whole hand, slid down the phone for a near key
      warper.drawStill(palmTex, [0, 0, IMG_W, IMG_H], all, false, s, hand);
      ctx.save();
      ctx.beginPath(); ctx.rect(0, 0, canvas.width, canvas.height);
      PHONE_LOW.forEach(function (c, j) { ctx[j ? "lineTo" : "moveTo"](c[0] * s + ox, c[1] * s); });
      ctx.closePath(); ctx.clip("evenodd");   // the phone stays in front of the palm
      ctx.drawImage(warper.canvas, 0, 0);
      ctx.restore();
      // the thumb and the ball of the hand on top, with a soft shadow on the glass only: close and
      // dark when touching, wider and fainter when raised
      warper.clear();
      warper.positions(pos);
      // (it may move past the photo's own edges, so nothing of it is cut off there)
      warper.draw(thumbTex, [HAND_BOX[0], HAND_BOX[1], HAND_BOX[2] - HAND_BOX[0], HAND_BOX[3] - HAND_BOX[1]], [-IMG_W, 2 * IMG_W, -IMG_H, 2 * IMG_H], false, s, hand);
      if (q.over > 0.01) {
        ctx.save();
        ctx.beginPath();
        [SCREEN.tl, SCREEN.tr, SCREEN.br, SCREEN.bl].forEach(function (c, j) { ctx[j ? "lineTo" : "moveTo"](c[0] * s + ox, c[1] * s); });
        ctx.clip();
        ctx.shadowColor = "rgba(0,0,0," + ((0.30 - q.lift * 0.12) * q.over).toFixed(3) + ")";
        ctx.shadowBlur = (4 + q.lift * 14) * dpr;
        ctx.shadowOffsetX = (4 + q.lift * 12) * dpr;
        ctx.shadowOffsetY = (6 + q.lift * 18) * dpr;
        ctx.drawImage(warper.canvas, 0, 0);
        ctx.restore();
      }
      ctx.drawImage(warper.canvas, 0, 0);
      ctx.setTransform(s, 0, 0, s, ox, 0);   // photo pixels -> canvas pixels
      // (the untouched photo is never faded back in at rest: its thumb is a little longer than the drawn one,
      // which keeps one size throughout)
    }

    Promise.all([load(canvas.getAttribute("data-thumb")), load(canvas.getAttribute("data-palm")),
                 load(holder.querySelector(".hold-still").getAttribute("src"))]).then(function (imgs) {
      warper = makeWarper();
      if (!warper) return;                     // no WebGL: the still photo stays, the video still plays
      thumbTex = warper.texture(imgs[0]); palmTex = warper.texture(imgs[1]);
      palmImg = imgs[1]; fullImg = imgs[2];
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
