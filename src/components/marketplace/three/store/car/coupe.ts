/* eslint-disable -- ported procedural geometry, kept close to its source so it's easy to compare. */
// @ts-nocheck

/*
 * The 3D car for showrooms: a coupe built entirely in code (no model file to
 * download), in metres, Y up, +Z the front of the car and X its width. It
 * returns plain arrays per part (the body, and one wheel used four times) and
 * per material (paint, glass, chrome, lights...), so the shop can share one
 * built car between every car in a fleet and repaint each one.
 *
 * `detail` scales how finely the curved parts are divided: 1 is the full car
 * (about 134,000 triangles), 0.5 a lighter one for cars further away.
 *
 * It takes most of a second to build, so it runs in a worker (car-worker.ts).
 */

export interface CarPart {
  material: string;
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
}
export interface CarMaterialSpec {
  color: number;
  metal: number;
  rough: number;
  clearcoat?: number;
  clearcoatRough?: number;
  emissive?: number;
  emissiveStrength?: number;
  doubleSided?: boolean;
  specular?: number;
}
export interface CarModel {
  nodes: { name: string; mesh: "body" | "wheel"; t: [number, number, number]; r: [number, number, number, number] }[];
  meshes: Record<"body" | "wheel", CarPart[]>;
  materials: Record<string, CarMaterialSpec>;
  warnings: number;
  dims: { length: number; width: number; height: number; wheelbase: number; tireRadius: number };
}

export function buildCar(detail?: number): CarModel {
  var Q = detail === undefined ? 1 : detail;
  function nq(n) { return Math.max(3, Math.round(n * Q)); }
  var PI = Math.PI;
  function clamp(x, a, b) { return Math.min(b, Math.max(a, x)); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smooth(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function norm(a) { var l = Math.hypot(a[0], a[1], a[2]); return l > 1e-12 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, 0]; }

  // ------------------------------------------------------------ mesh
  function Mesh() { this.p = []; this.n = []; this.i = []; }
  Mesh.prototype.v = function (x, y, z, nx, ny, nz) {
    this.p.push(x, y, z); this.n.push(nx || 0, ny || 0, nz || 0); return this.p.length / 3 - 1;
  };
  Mesh.prototype.quad = function (a, b, c, d) { this.i.push(a, b, c, a, c, d); };
  Mesh.prototype.smoothNormals = function () {
    var p = this.p, n = this.n, i = this.i, k;
    var prev = n.slice();
    for (k = 0; k < n.length; k++) n[k] = 0;
    for (k = 0; k < i.length; k += 3) {
      var a = i[k] * 3, b = i[k + 1] * 3, c = i[k + 2] * 3;
      var ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
      var vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
      var nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      n[a] += nx; n[a + 1] += ny; n[a + 2] += nz;
      n[b] += nx; n[b + 1] += ny; n[b + 2] += nz;
      n[c] += nx; n[c + 1] += ny; n[c + 2] += nz;
    }
    for (k = 0; k < n.length; k += 3) {
      var l = Math.hypot(n[k], n[k + 1], n[k + 2]);
      if (l > 1e-20) { n[k] /= l; n[k + 1] /= l; n[k + 2] /= l; }
      else { n[k] = prev[k]; n[k + 1] = prev[k + 1]; n[k + 2] = prev[k + 2]; if (!(Math.hypot(n[k], n[k + 1], n[k + 2]) > 0.5)) { n[k] = 0; n[k + 1] = 1; n[k + 2] = 0; } }
    }
    return this;
  };
  // make triangle winding agree with the stored vertex normals
  Mesh.prototype.orient = function () {
    var p = this.p, n = this.n, i = this.i;
    for (var k = 0; k < i.length; k += 3) {
      var a = i[k] * 3, b = i[k + 1] * 3, c = i[k + 2] * 3;
      var ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
      var vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
      var gx = uy * vz - uz * vy, gy = uz * vx - ux * vz, gz = ux * vy - uy * vx;
      var sx = n[a] + n[b] + n[c], sy = n[a + 1] + n[b + 1] + n[c + 1], sz = n[a + 2] + n[b + 2] + n[c + 2];
      if (gx * sx + gy * sy + gz * sz < 0) { var t = i[k + 1]; i[k + 1] = i[k + 2]; i[k + 2] = t; }
    }
    return this;
  };
  Mesh.prototype.add = function (m) {
    var off = this.p.length / 3, k;
    for (k = 0; k < m.p.length; k++) { this.p.push(m.p[k]); this.n.push(m.n[k]); }
    for (k = 0; k < m.i.length; k++) this.i.push(m.i[k] + off);
    return this;
  };
  Mesh.prototype.mirrorX = function () {
    var m = new Mesh(), k;
    for (k = 0; k < this.p.length; k += 3) {
      m.p.push(-this.p[k], this.p[k + 1], this.p[k + 2]);
      m.n.push(-this.n[k], this.n[k + 1], this.n[k + 2]);
    }
    for (k = 0; k < this.i.length; k += 3) m.i.push(this.i[k], this.i[k + 2], this.i[k + 1]);
    return m;
  };
  Mesh.prototype.xform = function (fp, fn) { // rigid transforms only
    for (var k = 0; k < this.p.length; k += 3) {
      var q = fp(this.p[k], this.p[k + 1], this.p[k + 2]);
      this.p[k] = q[0]; this.p[k + 1] = q[1]; this.p[k + 2] = q[2];
      var r = (fn || fp)(this.n[k], this.n[k + 1], this.n[k + 2]);
      this.n[k] = r[0]; this.n[k + 1] = r[1]; this.n[k + 2] = r[2];
    }
    return this;
  };

  // ------------------------------------------------------------ curves
  // smooth 1D profile from control points (uniform cubic B-spline, clamped ends)
  function bspline(ctrl) {
    var P = [ctrl[0], ctrl[0]].concat(ctrl, [ctrl[ctrl.length - 1], ctrl[ctrl.length - 1]]);
    var ts = [], vs = [], segs = P.length - 3, M = 60;
    for (var s = 0; s < segs; s++) {
      for (var i = 0; i < M; i++) {
        var u = i / M, u2 = u * u, u3 = u2 * u;
        var b0 = (1 - 3 * u + 3 * u2 - u3) / 6, b1 = (4 - 6 * u2 + 3 * u3) / 6, b2 = (1 + 3 * u + 3 * u2 - 3 * u3) / 6, b3 = u3 / 6;
        ts.push(b0 * P[s][0] + b1 * P[s + 1][0] + b2 * P[s + 2][0] + b3 * P[s + 3][0]);
        vs.push(b0 * P[s][1] + b1 * P[s + 1][1] + b2 * P[s + 2][1] + b3 * P[s + 3][1]);
      }
    }
    ts.push(ctrl[ctrl.length - 1][0]); vs.push(ctrl[ctrl.length - 1][1]);
    var n = ts.length;
    return function (t) {
      if (t <= ts[0]) return vs[0];
      if (t >= ts[n - 1]) return vs[n - 1];
      var lo = 0, hi = n - 1;
      while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (ts[mid] <= t) lo = mid; else hi = mid; }
      var d = ts[hi] - ts[lo];
      return d > 1e-12 ? lerp(vs[lo], vs[hi], (t - ts[lo]) / d) : vs[lo];
    };
  }
  // centripetal Catmull-Rom segment p1->p2, pushes n points (excluding p2)
  function crSeg(p0, p1, p2, p3, n, xs, ys) {
    var t0 = 0;
    var t1 = t0 + Math.sqrt(Math.hypot(p1[0] - p0[0], p1[1] - p0[1])) + 1e-9;
    var t2 = t1 + Math.sqrt(Math.hypot(p2[0] - p1[0], p2[1] - p1[1])) + 1e-9;
    var t3 = t2 + Math.sqrt(Math.hypot(p3[0] - p2[0], p3[1] - p2[1])) + 1e-9;
    for (var i = 0; i < n; i++) {
      var t = t1 + (t2 - t1) * i / n;
      for (var c = 0; c < 2; c++) {
        var a1 = (t1 - t) / (t1 - t0) * p0[c] + (t - t0) / (t1 - t0) * p1[c];
        var a2 = (t2 - t) / (t2 - t1) * p1[c] + (t - t1) / (t2 - t1) * p2[c];
        var a3 = (t3 - t) / (t3 - t2) * p2[c] + (t - t2) / (t3 - t2) * p3[c];
        var b1 = (t2 - t) / (t2 - t0) * a1 + (t - t0) / (t2 - t0) * a2;
        var b2 = (t3 - t) / (t3 - t1) * a2 + (t - t1) / (t3 - t1) * a3;
        var v = (t2 - t) / (t2 - t1) * b1 + (t - t1) / (t2 - t1) * b2;
        (c === 0 ? xs : ys).push(v);
      }
    }
  }
  function crChain(pts, per) { // smooth 2D polyline through pts
    var ext = [[2 * pts[0][0] - pts[1][0], 2 * pts[0][1] - pts[1][1]]].concat(pts);
    var L = pts.length;
    ext.push([2 * pts[L - 1][0] - pts[L - 2][0], 2 * pts[L - 1][1] - pts[L - 2][1]]);
    var xs = [], ys = [], out = [];
    for (var j = 0; j < L - 1; j++) crSeg(ext[j], ext[j + 1], ext[j + 2], ext[j + 3], per, xs, ys);
    xs.push(pts[L - 1][0]); ys.push(pts[L - 1][1]);
    for (var k = 0; k < xs.length; k++) out.push([xs[k], ys[k]]);
    return out;
  }
  function blunt(d, L, p) {
    if (d >= L) return 1; if (d <= 0) return 0;
    return Math.pow(1 - Math.pow(1 - d / L, p), 1 / p);
  }

  // ------------------------------------------------------------ car proportions
  var zFront = 2.26, zRear = -2.24;      // nose and tail tips
  var zF = 1.36, zR = -1.34;             // axle positions
  var tireR = 0.345, yW = tireR;         // wheel radius / axle height
  var archR = 0.384, archSlant = 0.03;
  var yNF = 0.47, yNR = 0.63;            // height of nose / tail tip
  var xInner = 0.56;                     // inner wall of the wheel wells

  var fT = bspline([[-2.40, 0.945], [-2.20, 0.955], [-2.0, 0.972], [-1.75, 1.02], [-1.40, 1.12], [-1.0, 1.228],
    [-0.65, 1.298], [-0.30, 1.322], [0.0, 1.308], [0.25, 1.252], [0.50, 1.14], [0.75, 1.005], [0.92, 0.915], [0.92, 0.915],
    [1.10, 0.895], [1.40, 0.868], [1.75, 0.82], [2.05, 0.75], [2.26, 0.685], [2.40, 0.66]]);
  var fS = bspline([[-2.40, 0.905], [-2.20, 0.915], [-1.90, 0.925], [-1.50, 0.915], [-1.0, 0.875], [-0.5, 0.84],
    [0.0, 0.822], [0.5, 0.818], [0.9, 0.825], [1.3, 0.812], [1.7, 0.768], [2.05, 0.705], [2.26, 0.65], [2.40, 0.63]]);
  var fB = bspline([[-2.40, 0.25], [-2.30, 0.245], [-1.90, 0.21], [-1.40, 0.175], [-0.80, 0.165], [0.80, 0.165],
    [1.50, 0.165], [2.0, 0.17], [2.40, 0.175]]);
  var fW = bspline([[-2.40, 0.86], [-2.30, 0.87], [-1.90, 0.925], [-1.34, 0.94], [-0.70, 0.925], [0.0, 0.91],
    [0.70, 0.905], [1.36, 0.915], [1.90, 0.90], [2.26, 0.88], [2.40, 0.875]]);
  function wRoof(z) { return 0.615 + 0.03 * smooth((z + 0.2) / 1.0); }

  // key points of the half cross-section at station z
  function sectionKeys(z) {
    var dF = zFront - z, dR = z - zRear;
    var yT = fT(z), yS = fS(z), yB = fB(z);
    var etF = blunt(dF, 0.34, 2.6), etR = blunt(dR, 0.16, 3.0);
    var ebF = blunt(dF, 0.22, 2.4), ebR = blunt(dR, 0.24, 2.2);
    var ew = blunt(dF, 0.62, 2.3) * blunt(dR, 0.55, 2.6);
    yT = yNF + (yT - yNF) * etF; yS = yNF + (yS - yNF) * etF; yB = yNF + (yB - yNF) * ebF;
    yT = yNR + (yT - yNR) * etR; yS = yNR + (yS - yNR) * etR; yB = yNR + (yB - yNR) * ebR;
    var Wb = fW(z) * ew;
    var fl = (0.020 * Math.exp(-Math.pow((z - zF) / 0.40, 2)) + 0.035 * Math.exp(-Math.pow((z - zR) / 0.42, 2))) * ew;
    var g = smooth((yT - yS - 0.07) / 0.22);
    var Hs = yS - yB;
    var xC = Wb * lerp(0.962, 0.925, g);
    var Bx = Wb + fl;
    var xD = lerp(0.80 * xC, Math.min(wRoof(z), 0.80 * xC), g);
    var crown = lerp(0.6 * (yT - yS), 0.05, g);
    var yD = yT - crown;
    var A = [Wb * 0.965 + fl * 0.3, yB];
    var B = [Bx, yB + 0.40 * Hs];
    var rS = Math.min(lerp(0.07, 0.05, g), 0.3 * Hs);
    var c1 = [xC + 0.25 * (Bx - xC), yS - rS];
    var dx = xD - xC, dy = yD - yS, len = Math.hypot(dx, dy) || 1e-9;
    var ux = dx / len, uy = dy / len;
    var r2 = Math.min(lerp(0.08, 0.04, g), 0.42 * len);
    var c2 = [xC + ux * r2, yS + uy * r2];
    var rD = Math.min(lerp(0.03, 0.04, g), 0.3 * len);
    var d1 = [xD - ux * rD, yD - uy * rD];
    var rD2 = Math.min(0.05, 0.25 * xD);
    var k = (xD - rD2) / (xD || 1e-9);
    var d2 = [xD - rD2, yT - crown * k * k];
    var e1 = [0.5 * xD, yT - crown * 0.25];
    var E = [0, yT];
    var K = [A, B, c1, c2, d1, d2, e1, E];
    // towards the nose and tail tips the section relaxes into a plain rounded form
    var mt = Math.min(smooth(dF / 0.34), smooth(dR / 0.26));
    if (mt < 1) {
      var yc = 0.5 * (yB + yT), bb = 0.5 * (yT - yB);
      for (var q = 0; q < 8; q++) {
        var ph = PHI[q] * PI / 180, cs = Math.cos(ph), sn = Math.sin(ph);
        var ex = Bx * Math.pow(Math.abs(cs), 0.77), ey = yc + bb * (sn < 0 ? -1 : 1) * Math.pow(Math.abs(sn), 0.77);
        K[q] = [lerp(ex, K[q][0], mt), lerp(ey, K[q][1], mt)];
      }
      K[7][0] = 0; if (mt <= 0) K[0][0] = 0;
    }
    return { K: K, yB: yB, yS: yS, yT: yT, yD: yD, xC: xC, xD: xD, Bx: Bx, g: g, Wb: Wb };
  }
  var PHI = [-90, -32, 14, 36, 50, 62, 77, 90];
  var SEG = [8, 6, 4, 8, 4, 6, 6];
  var N1 = SEG[0] + SEG[1];
  var NH = 0; SEG.forEach(function (s) { NH += s; });

  function sectionPts(z, m) {
    var s = sectionKeys(z), K = s.K;
    var ext = [[2 * K[0][0] - K[1][0], 2 * K[0][1] - K[1][1]]].concat(K, [[-K[6][0], K[6][1]]]);
    var xs = [], ys = [];
    for (var j = 0; j < 7; j++) crSeg(ext[j], ext[j + 1], ext[j + 2], ext[j + 3], SEG[j] * m, xs, ys);
    xs.push(K[7][0]); ys.push(K[7][1]);
    return { xs: xs, ys: ys, s: s };
  }
  var DM = 3, cache = new Map();
  function dsec(z) {
    var d = cache.get(z);
    if (!d) { if (cache.size > 6000) cache.clear(); d = sectionPts(z, DM); cache.set(z, d); }
    return d;
  }
  function xAtY(z, y) {
    var d = dsec(z), ys = d.ys, xs = d.xs, n = ys.length;
    if (y <= ys[0]) return xs[0];
    if (y >= ys[n - 1]) return 0;
    var lo = 0, hi = n - 1;
    while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (ys[mid] <= y) lo = mid; else hi = mid; }
    var dd = ys[hi] - ys[lo];
    return dd > 1e-12 ? lerp(xs[lo], xs[hi], (y - ys[lo]) / dd) : xs[lo];
  }
  function yAtX(z, x) {
    var d = dsec(z), ys = d.ys, xs = d.xs, n = ys.length, lo = SEG[0] * DM, hi = n - 1;
    if (x >= xs[lo]) return ys[lo];
    if (x <= 0) return ys[n - 1];
    while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (xs[mid] >= x) lo = mid; else hi = mid; }
    var dd = xs[lo] - xs[hi];
    return dd > 1e-12 ? lerp(ys[lo], ys[hi], (xs[lo] - x) / dd) : ys[lo];
  }
  function inside(z, x, y) {
    var d = dsec(z), ys = d.ys;
    if (y < ys[0] || y > ys[ys.length - 1]) return false;
    return Math.abs(x) < xAtY(z, y);
  }
  var warn = 0;
  function zEnd(x, y, front) {
    var a = front ? zFront - 0.9 : zRear + 0.9, b = front ? zFront : zRear;
    if (!inside(a, x, y)) warn++;
    for (var k = 0; k < 24; k++) { var m = 0.5 * (a + b); if (inside(m, x, y)) a = m; else b = m; }
    return 0.5 * (a + b);
  }
  function sideSurf(z, y) { return [xAtY(z, y), y, z]; }
  function topSurf(x, z) { return [x, yAtX(z, Math.abs(x)), z]; }
  function frontSurf(x, y) { return [x, y, zEnd(x, y, true)]; }
  function rearSurf(x, y) { return [x, y, zEnd(x, y, false)]; }

  function yLowAt(z, yB) {
    var ws = [zF, zR];
    for (var k = 0; k < 2; k++) {
      var dz = Math.abs(z - ws[k]);
      if (dz < archR) return Math.max(yB, yW + Math.sqrt(archR * archR - dz * dz));
      if (dz < archR + archSlant) return lerp(yW, yB, (dz - archR) / archSlant);
    }
    return yB;
  }
  function inArch(z) { return Math.abs(z - zF) < archR + archSlant || Math.abs(z - zR) < archR + archSlant; }

  // ------------------------------------------------------------ body shell
  var zs = [], i, j, k;
  var NE = nq(34);
  for (i = 1; i <= NE; i++) { var s0 = i / NE, dd0 = 0.5 * Math.pow(s0, 2.6); zs.push(zRear + dd0); zs.push(zFront - dd0); }
  for (var zc = zRear + 0.5 + 0.03; zc < zFront - 0.5 - 0.015; zc += 0.03 / Q) if (!inArch(zc)) zs.push(zc);
  [zF, zR].forEach(function (zw) {
    for (var q = 0, AQ = nq(40); q <= AQ; q++) zs.push(zw + archR * Math.cos(PI * q / AQ));
    for (var q2 = 1; q2 <= 3; q2++) { zs.push(zw + archR + archSlant * q2 / 3); zs.push(zw - archR - archSlant * q2 / 3); }
  });
  zs.sort(function (a, b) { return a - b; });
  zs = zs.filter(function (z, idx) { return idx === 0 || z - zs[idx - 1] > 1e-5; });

  var RING = 2 * NH + 1;
  var body = new Mesh();
  var under = new Mesh();
  zs.forEach(function (z) {
    var sec = sectionPts(z, 1), xs = sec.xs, ys = sec.ys;
    var yl = yLowAt(z, sec.s.yB);
    // underside strip
    var xa = xs[0]; if (inArch(z)) xa = Math.min(xa, xInner);
    under.v(-xa, ys[0], z, 0, -1, 0); under.v(xa, ys[0], z, 0, -1, 0);
    // analytic normals from the smooth parametrisation
    var hN = 0.002, zP = Math.min(z + hN, zFront - 1e-6), zM = Math.max(z - hN, zRear + 1e-6);
    var sP = sectionPts(zP, 1), sM = sectionPts(zM, 1), nX = [], nY = [], nZ = [];
    for (j = 0; j <= NH; j++) {
      var j0 = Math.max(j - 1, 0), tsx, tsy;
      if (j < NH) { tsx = xs[j + 1] - xs[j0]; tsy = ys[j + 1] - ys[j0]; } else { tsx = -2 * xs[NH - 1]; tsy = 0; }
      var dxz = sP.xs[j] - sM.xs[j], dyz = sP.ys[j] - sM.ys[j], dzz = zP - zM;
      var cn = norm([tsy * dzz, -tsx * dzz, tsx * dyz - tsy * dxz]);
      nX.push(cn[0]); nY.push(cn[1]); nZ.push(cn[2]);
    }
    if (yl > ys[0] + 1e-6) { // lift the lower edge over the wheel arch
      var kk = 0; while (kk < N1 - 1 && ys[kk + 1] < yl) kk++;
      var f = Math.min(kk + (yl - ys[kk]) / (ys[kk + 1] - ys[kk]), N1 - 0.5);
      var nx = [], ny = [], na = [], nb = [], nc = [];
      for (var q = 0; q < N1; q++) {
        var sp = f + (N1 - f) * q / N1, i0 = Math.min(Math.floor(sp), N1 - 1), fr = sp - i0;
        nx.push(lerp(xs[i0], xs[i0 + 1], fr)); ny.push(lerp(ys[i0], ys[i0 + 1], fr));
        var nn = norm([lerp(nX[i0], nX[i0 + 1], fr), lerp(nY[i0], nY[i0 + 1], fr), lerp(nZ[i0], nZ[i0 + 1], fr)]);
        na.push(nn[0]); nb.push(nn[1]); nc.push(nn[2]);
      }
      for (q = 0; q < N1; q++) { xs[q] = nx[q]; ys[q] = ny[q]; nX[q] = na[q]; nY[q] = nb[q]; nZ[q] = nc[q]; }
    }
    for (j = 0; j <= NH; j++) body.v(-xs[j], ys[j], z, -nX[j], nY[j], nZ[j]);
    for (j = NH - 1; j >= 0; j--) body.v(xs[j], ys[j], z, nX[j], nY[j], nZ[j]);
  });
  for (i = 0; i < zs.length - 1; i++) {
    for (j = 0; j < RING - 1; j++) {
      var a = i * RING + j;
      body.quad(a, a + RING, a + RING + 1, a + 1);
    }
    under.quad(i * 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  }
  // nose and tail caps
  (function () {
    var cF = body.v(0, yNF, zFront, 0, 0, 1), cR = body.v(0, yNR, zRear, 0, 0, -1), last = (zs.length - 1) * RING;
    for (j = 0; j < RING - 1; j++) {
      body.i.push(last + j + 1, last + j, cF);
      body.i.push(j, j + 1, cR);
    }
    under.i.push(0, 1, under.v(0, yNR, zRear, 0, -1, 0));
    var ul = (zs.length - 1) * 2;
    under.i.push(ul + 1, ul, under.v(0, yNF, zFront, 0, -1, 0));
  })();
  under.smoothNormals();

  // ------------------------------------------------------------ surface patches
  function gridMesh(P, nu, nv, surf, off, hint) {
    var W = nu + 1, pts = P.map(function (ab) { return surf(ab[0], ab[1]); });
    var nrm = [], m = new Mesh(), ii, jj;
    for (jj = 0; jj <= nv; jj++) for (ii = 0; ii <= nu; ii++) {
      var tu = sub(pts[jj * W + Math.min(ii + 1, nu)], pts[jj * W + Math.max(ii - 1, 0)]);
      var tv = sub(pts[Math.min(jj + 1, nv) * W + ii], pts[Math.max(jj - 1, 0) * W + ii]);
      nrm.push(norm(cross(tu, tv)));
    }
    var c = nrm[(nv >> 1) * W + (nu >> 1)], sg = dot(c, hint) < 0 ? -1 : 1;
    for (jj = 0; jj <= nv; jj++) for (ii = 0; ii <= nu; ii++) {
      var q = jj * W + ii, n = nrm[q];
      if (n[0] === 0 && n[1] === 0 && n[2] === 0) n = [hint[0] * sg, hint[1] * sg, hint[2] * sg];
      var o = off(ii, jj);
      m.v(pts[q][0] + n[0] * sg * o, pts[q][1] + n[1] * sg * o, pts[q][2] + n[2] * sg * o, n[0] * sg, n[1] * sg, n[2] * sg);
    }
    for (jj = 0; jj < nv; jj++) for (ii = 0; ii < nu; ii++) {
      var a0 = jj * W + ii; m.quad(a0, a0 + 1, a0 + W + 1, a0 + W);
    }
    return m.orient();
  }
  // rounded panel sitting just proud of a surface, with a bevelled edge sunk into it
  function patch(surf, map, nu, nv, o) {
    var NU = nu + 2, NV = nv + 2, P = [], sk = o.sk || [0.03, 0.03], sq = o.sq || 0;
    for (var jj = 0; jj <= NV; jj++) for (var ii = 0; ii <= NU; ii++) {
      var skirt = (ii === 0 || ii === NU || jj === 0 || jj === NV);
      var s = -1 + 2 * clamp(ii - 1, 0, nu) / nu, t = -1 + 2 * clamp(jj - 1, 0, nv) / nv;
      if (sq) {
        var ri = Math.max(Math.abs(s), Math.abs(t));
        var rn = Math.pow(Math.pow(Math.abs(s), sq) + Math.pow(Math.abs(t), sq), 1 / sq);
        if (rn > 1e-9) { s *= ri / rn; t *= ri / rn; }
      }
      if (skirt) { s *= 1 + sk[0]; t *= 1 + sk[1]; }
      P.push(map((s + 1) / 2, (t + 1) / 2));
    }
    return gridMesh(P, NU, NV, surf, function (ii, jj) {
      return (ii === 0 || ii === NU || jj === 0 || jj === NV) ? -(o.drop || 0.003) : o.off;
    }, o.hint);
  }
  function densify(pts, step) {
    var out = [pts[0]];
    for (var q = 1; q < pts.length; q++) {
      var a = pts[q - 1], b = pts[q], L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(L / step));
      for (var w = 1; w <= n; w++) out.push([lerp(a[0], b[0], w / n), lerp(a[1], b[1], w / n)]);
    }
    return out;
  }
  function roundCorners(pts, r, closed) {
    var out = [], n = pts.length;
    for (var q = 0; q < n; q++) {
      if (!closed && (q === 0 || q === n - 1)) { out.push(pts[q]); continue; }
      var p = pts[q], a = pts[(q - 1 + n) % n], b = pts[(q + 1) % n];
      var la = Math.hypot(a[0] - p[0], a[1] - p[1]), lb = Math.hypot(b[0] - p[0], b[1] - p[1]);
      var ra = Math.min(r, la * 0.45), rb = Math.min(r, lb * 0.45);
      var pa = [p[0] + (a[0] - p[0]) / la * ra, p[1] + (a[1] - p[1]) / la * ra];
      var pb = [p[0] + (b[0] - p[0]) / lb * rb, p[1] + (b[1] - p[1]) / lb * rb];
      for (var w = 0; w <= 6; w++) {
        var t = w / 6, u = 1 - t;
        out.push([u * u * pa[0] + 2 * u * t * p[0] + t * t * pb[0], u * u * pa[1] + 2 * u * t * p[1] + t * t * pb[1]]);
      }
    }
    if (closed) out.push(out[0]);
    return out;
  }
  function strip(surf, poly, w, off, hint) {
    var n = poly.length, r0 = [], r1 = [];
    for (var q = 0; q < n; q++) {
      var a = poly[Math.max(q - 1, 0)], b = poly[Math.min(q + 1, n - 1)];
      var tx = b[0] - a[0], ty = b[1] - a[1], l = Math.hypot(tx, ty) || 1;
      var px = -ty / l * w / 2, py = tx / l * w / 2;
      r0.push([poly[q][0] + px, poly[q][1] + py]); r1.push([poly[q][0] - px, poly[q][1] - py]);
    }
    return gridMesh(r0.concat(r1), n - 1, 1, surf, function () { return off; }, hint);
  }

  var parts = { body: {}, wheel: {} };
  function put(node, mat, mesh) {
    if (!parts[node][mat]) parts[node][mat] = new Mesh();
    parts[node][mat].add(mesh);
  }
  function putBoth(mat, mesh) { put('body', mat, mesh); put('body', mat, mesh.mirrorX()); }

  put('body', 'paint', body);
  put('body', 'well', under);

  var SX = [1, 0, 0], SY = [0, 1, 0], SZF = [0, 0, 1], SZR = [0, 0, -1];

  // --- glazing
  function sideGlass(z0, z1, nu) {
    return patch(sideSurf, function (u, v) {
      var z = lerp(z0, z1, u), K = sectionKeys(z).K;
      return [z, lerp(K[3][1] + 0.006, K[4][1] - 0.004, v)];
    }, nu, 10, { off: 0.004, sq: 7, sk: [0.012, 0.05], hint: SX });
  }
  putBoth('glass', sideGlass(-0.345, 0.60, 44));
  putBoth('glass', sideGlass(-1.20, -0.415, 34));
  function topGlass(z0, z1, margin, nu) {
    return patch(topSurf, function (u, v) {
      var z = lerp(z0, z1, u), K = sectionKeys(z).K, xw = K[5][0] - margin;
      return [lerp(-xw, xw, v), z];
    }, nu, 30, { off: 0.004, sq: 9, sk: [0.02, 0.012], hint: SY });
  }
  put('body', 'glass', topGlass(0.20, 0.885, 0.03, 26));
  put('body', 'glass', topGlass(-1.68, -0.62, 0.04, 34));
  // cowl strip at the base of the windscreen
  put('body', 'trim', patch(topSurf, function (u, v) {
    var z = lerp(0.90, 0.955, u), xw = sectionKeys(z).K[5][0] - 0.02;
    return [lerp(-xw, xw, v), z];
  }, 3, 30, { off: 0.003, sq: 0, sk: [0.1, 0.01], hint: SY }));

  // --- side skirts
  putBoth('trim', patch(sideSurf, function (u, v) {
    var z = lerp(zR + archR + archSlant + 0.035, zF - archR - archSlant - 0.035, u), yb = sectionKeys(z).yB;
    return [z, lerp(yb + 0.004, yb + 0.075, v)];
  }, 60, 4, { off: 0.007, sq: 0, sk: [0.004, 0.08], hint: SX }));

  // --- front lamps, intakes
  function lampMap(u0, u1, v0, v1) {
    return function (u, v) {
      var uu = lerp(u0, u1, u), vv = lerp(v0, v1, v);
      var x = lerp(0.40, 0.815, uu), yc = lerp(0.578, 0.652, Math.pow(clamp(uu, 0, 1.2), 1.2)), h = lerp(0.026, 0.044, uu);
      return [x, yc + (vv - 0.5) * 2 * h];
    };
  }
  putBoth('lens', patch(frontSurf, lampMap(0, 1, 0, 1), 40, 8, { off: 0.004, sq: 5, sk: [0.02, 0.1], hint: SZF }));
  putBoth('drl', patch(frontSurf, lampMap(0.08, 0.94, 0.62, 0.84), 40, 2, { off: 0.0065, sq: 0, sk: [0.004, 0.1], drop: -0.005, hint: SZF }));
  putBoth('drl', patch(frontSurf, lampMap(0.10, 0.34, 0.18, 0.46), 10, 3, { off: 0.0065, sq: 3, sk: [0.02, 0.06], drop: -0.005, hint: SZF }));
  put('body', 'trim', patch(frontSurf, function (u, v) {
    var hw = lerp(0.45, 0.58, v);
    return [lerp(-hw, hw, u), lerp(0.25, 0.405, v)];
  }, 44, 10, { off: 0.004, sq: 5, sk: [0.012, 0.05], hint: SZF }));
  [0.288, 0.327, 0.366].forEach(function (yc) {
    put('body', 'gloss', patch(frontSurf, function (u, v) {
      var hw = lerp(0.45, 0.58, (yc - 0.25) / 0.155) - 0.035;
      return [lerp(-hw, hw, u), yc + (v - 0.5) * 0.013];
    }, 40, 1, { off: 0.012, sq: 0, sk: [0.002, 0.5], drop: -0.006, hint: SZF }));
  });
  putBoth('trim', patch(frontSurf, function (u, v) {
    return [lerp(0.655, 0.755, u) + 0.02 * v, lerp(0.255, 0.425, v)];
  }, 8, 12, { off: 0.004, sq: 4, sk: [0.05, 0.03], hint: SZF }));

  // --- rear lamps, diffuser
  put('body', 'tail', patch(rearSurf, function (u, v) {
    var x = lerp(-0.80, 0.80, u), lift = 0.02 * Math.pow(Math.abs(x) / 0.8, 3);
    return [x, lerp(0.812, 0.872, v) + lift];
  }, 80, 6, { off: 0.004, sq: 6, sk: [0.006, 0.08], hint: SZR }));
  put('body', 'tailglow', patch(rearSurf, function (u, v) {
    var x = lerp(-0.765, 0.765, u), lift = 0.02 * Math.pow(Math.abs(x) / 0.8, 3);
    return [x, lerp(0.835, 0.851, v) + lift];
  }, 80, 1, { off: 0.0065, sq: 0, sk: [0.002, 0.2], drop: -0.005, hint: SZR }));
  put('body', 'trim', patch(rearSurf, function (u, v) {
    var hw = lerp(0.50, 0.58, v);
    return [lerp(-hw, hw, u), lerp(0.345, 0.50, v)];
  }, 40, 8, { off: 0.004, sq: 5, sk: [0.012, 0.05], hint: SZR }));

  // --- panel gaps
  var SEAM_W = 0.005, SEAM_OFF = 0.0012;
  (function () {
    var door = roundCorners([[0.805, fS(0.805) - 0.004], [0.775, 0.275], [-0.405, 0.275], [-0.34, fS(-0.34) - 0.004]], 0.07, false);
    putBoth('seam', strip(sideSurf, densify(door, 0.02), SEAM_W, SEAM_OFF, SX));
    var hy = fS(-0.2) - 0.085;
    var handle = roundCorners([[-0.13, hy + 0.012], [-0.13, hy - 0.012], [-0.29, hy - 0.012], [-0.29, hy + 0.012]], 0.011, true);
    putBoth('seam', strip(sideSurf, densify(handle, 0.01), 0.003, SEAM_OFF, SX));
    var flap = [], fa;
    for (fa = 0; fa <= 40; fa++) flap.push([-0.70 + 0.062 * Math.cos(2 * PI * fa / 40), 0.70 + 0.062 * Math.sin(2 * PI * fa / 40)]);
    put('body', 'seam', strip(sideSurf, flap, 0.004, SEAM_OFF, SX));
    // bonnet
    var hood = [], zq, a;
    for (zq = 0.965; zq <= 1.9001; zq += 0.03) hood.push([sectionKeys(zq).xD + 0.012, zq]);
    var xe = hood[hood.length - 1][0];
    for (a = 1; a <= 20; a++) { var an = a / 20 * PI / 2; hood.push([xe * Math.cos(an), 1.90 + 0.15 * Math.sin(an)]); }
    var left = hood.slice(0, hood.length - 1).map(function (p) { return [-p[0], p[1]]; });
    var full = hood.slice().concat(left.reverse());
    put('body', 'seam', strip(topSurf, densify(full, 0.02), SEAM_W, SEAM_OFF, SY));
    // boot lid
    var boot = roundCorners([[-0.62, -1.80], [-0.60, -2.05], [0.60, -2.05], [0.62, -1.80]], 0.08, false);
    put('body', 'seam', strip(topSurf, densify(boot, 0.02), SEAM_W, SEAM_OFF, SY));
  })();

  // ------------------------------------------------------------ generic solids
  function tube(path, rad, sides) {
    var m = new Mesh(), n = path.length;
    for (var q = 0; q < n; q++) {
      var T = norm(sub(path[Math.min(q + 1, n - 1)], path[Math.max(q - 1, 0)]));
      var ref = Math.abs(T[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
      var N = norm(cross(T, ref)), B = cross(T, N), r = typeof rad === 'function' ? rad(q / (n - 1)) : rad;
      for (var w = 0; w <= sides; w++) {
        var an = 2 * PI * w / sides, c = Math.cos(an), s = Math.sin(an);
        var d = [N[0] * c + B[0] * s, N[1] * c + B[1] * s, N[2] * c + B[2] * s];
        m.v(path[q][0] + d[0] * r, path[q][1] + d[1] * r, path[q][2] + d[2] * r, d[0], d[1], d[2]);
      }
    }
    for (q = 0; q < n - 1; q++) for (w = 0; w < sides; w++) {
      var a0 = q * (sides + 1) + w; m.quad(a0, a0 + 1, a0 + sides + 2, a0 + sides + 1);
    }
    return m.orient();
  }
  // surface of revolution around the X axis; chains are lists of [x, r] walked clockwise
  function latheX(chains, seg) {
    var m = new Mesh();
    chains.forEach(function (ch) {
      var base = m.p.length / 3, n = ch.length, nr = [];
      for (var q = 0; q < n; q++) {
        var a = ch[Math.max(q - 1, 0)], b = ch[Math.min(q + 1, n - 1)];
        var tx = b[0] - a[0], tr = b[1] - a[1], l = Math.hypot(tx, tr) || 1;
        nr.push([-tr / l, tx / l]);
      }
      for (var w = 0; w <= seg; w++) {
        var an = 2 * PI * w / seg, c = Math.cos(an), s = Math.sin(an);
        for (q = 0; q < n; q++) m.v(ch[q][0], ch[q][1] * c, ch[q][1] * s, nr[q][0], nr[q][1] * c, nr[q][1] * s);
      }
      for (w = 0; w < seg; w++) for (q = 0; q < n - 1; q++) {
        var a0 = base + w * n + q; m.quad(a0, a0 + 1, a0 + n + 1, a0 + n);
      }
    });
    return m.orient();
  }
  function grid(fn, nfn, nu, nv) {
    var m = new Mesh();
    for (var jj = 0; jj <= nv; jj++) for (var ii = 0; ii <= nu; ii++) {
      var p = fn(ii / nu, jj / nv), n = nfn(ii / nu, jj / nv);
      m.v(p[0], p[1], p[2], n[0], n[1], n[2]);
    }
    for (jj = 0; jj < nv; jj++) for (ii = 0; ii < nu; ii++) { var a0 = jj * (nu + 1) + ii; m.quad(a0, a0 + 1, a0 + nu + 2, a0 + nu + 1); }
    return m.orient();
  }

  // ------------------------------------------------------------ wheel arches
  var wheelX = {};
  [['f', zF], ['r', zR]].forEach(function (wd) {
    var zw = wd[1], path = [], q;
    function addPt(dz, y) { var z = zw + dz; path.push([xAtY(z, y), y, z]); }
    for (q = 3; q >= 1; q--) { var zz = zw + archR + archSlant * q / 3; addPt(archR + archSlant * q / 3, lerp(yW, sectionKeys(zz).yB, q / 3)); }
    for (q = 0; q <= nq(48); q++) addPt(archR * Math.cos(PI * q / nq(48)), yW + archR * Math.sin(PI * q / nq(48)));
    for (q = 1; q <= 3; q++) { var zz2 = zw - archR - archSlant * q / 3; addPt(-archR - archSlant * q / 3, lerp(yW, sectionKeys(zz2).yB, q / 3)); }
    var minX = 1e9; path.forEach(function (p) { if (p[1] > yW - 0.05) minX = Math.min(minX, p[0]); });
    wheelX[wd[0]] = minX - 0.016 - 0.1285;
    // rolled lip
    putBoth('paint', tube(path.map(function (p) { return [p[0] - 0.004, p[1], p[2]]; }), 0.008, 8));
    // liner
    var n = path.length;
    var liner = grid(function (u, v) {
      var p = path[Math.round(u * (n - 1))];
      return [lerp(p[0] - 0.006, xInner, v), p[1], p[2]];
    }, function (u) {
      var p = path[Math.round(u * (n - 1))];
      return norm([0, yW - p[1], zw - p[2]]);
    }, n - 1, 1);
    putBoth('well', liner);
    var wall = new Mesh(), c = wall.v(xInner, yW, zw, 1, 0, 0);
    path.forEach(function (p) { wall.v(xInner, p[1], p[2], 1, 0, 0); });
    for (q = 0; q < n; q++) wall.i.push(c, 1 + q, 1 + (q + 1) % n);
    putBoth('well', wall.orient());
  });

  // ------------------------------------------------------------ mirrors, exhausts
  (function () {
    var zm = 0.70, sk = sectionKeys(zm), cx = sk.xC + 0.125, cy = sk.yS + 0.095, cz = zm;
    var rx = 0.095, ry = 0.052, rz = 0.05, e = 0.72;
    var hs = grid(function (u, v) {
      var th = PI * v, ph = 2 * PI * u, d = [Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph)];
      function pw(t) { return (t < 0 ? -1 : 1) * Math.pow(Math.abs(t), e); }
      return [cx + rx * pw(d[0]), cy + ry * pw(d[1]), Math.max(cz + rz * pw(d[2]), cz - 0.022)];
    }, function (u, v) {
      var th = PI * v, ph = 2 * PI * u;
      return [Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph)];
    }, 28, 16);
    hs.smoothNormals();
    putBoth('gloss', hs);
    var mg = grid(function (u, v) {
      var an = 2 * PI * u; return [cx + 0.078 * v * Math.cos(an), cy + 0.04 * v * Math.sin(an), cz - 0.0235];
    }, function () { return [0, 0, -1]; }, 24, 1);
    putBoth('chrome', mg);
    putBoth('gloss', tube([[sk.xC - 0.03, sk.yS + 0.035, zm - 0.01], [sk.xC + 0.03, sk.yS + 0.06, zm], [cx - 0.03, cy - 0.01, cz + 0.005]], 0.017, 10));
    // exhaust tips
    var ez = zEnd(0.36, 0.42, false);
    var tip = latheX([[[0.05, 0.036], [-0.045, 0.036]], [[-0.045, 0.044], [0.05, 0.044]], [[-0.045, 0.036], [-0.045, 0.044]]], 28);
    tip.xform(function (x, y, z) { return [y, z, x]; });
    var tipR = new Mesh().add(tip); tipR.xform(function (x, y, z) { return [x + 0.36, y + 0.42, z + ez]; }, function (x, y, z) { return [x, y, z]; });
    putBoth('chrome', tipR);
    var plug = grid(function (u, v) { var an = 2 * PI * u; return [0.36 + 0.036 * v * Math.cos(an), 0.42 + 0.036 * v * Math.sin(an), ez + 0.035]; },
      function () { return [0, 0, -1]; }, 20, 1);
    putBoth('trim', plug);
  })();

  // ------------------------------------------------------------ wheel
  (function () {
    var SEGS = nq(72);
    var inner = crChain([[-0.104, 0.245], [-0.124, 0.258], [-0.1285, 0.285], [-0.124, 0.312], [-0.108, 0.329], [-0.092, 0.335]], 4);
    var outer = inner.map(function (p) { return [-p[0], p[1]]; }).reverse();
    var chains = [inner], edges = [-0.092, -0.067, -0.057, -0.027, -0.017, 0.017, 0.027, 0.057, 0.067, 0.092], gd = 0.328;
    for (var q = 0; q < edges.length - 1; q++) {
      var a = edges[q], b = edges[q + 1];
      if (q % 2 === 0) chains.push([[a, 0.335], [b, 0.335]]);
      else { chains.push([[a, 0.335], [a + 0.0012, gd]]); chains.push([[a + 0.0012, gd], [b - 0.0012, gd]]); chains.push([[b - 0.0012, gd], [b, 0.335]]); }
    }
    chains.push(outer);
    put('wheel', 'rubber', latheX(chains, SEGS));

    var flange = crChain([[0.104, 0.245], [0.114, 0.249], [0.121, 0.2535], [0.1255, 0.2505], [0.1255, 0.243], [0.120, 0.234], [0.108, 0.2265], [0.094, 0.2235]], 3);
    var barrel = [[0.094, 0.2235], [0.0, 0.219], [-0.10, 0.217], [-0.118, 0.232], [-0.121, 0.248]];
    var hub = crChain([[0.036, 0.082], [0.054, 0.070], [0.0625, 0.048], [0.065, 0.022], [0.065, 0.0]], 4);
    var alloy = latheX([flange, barrel, hub], SEGS);
    // five split spokes
    for (var kS = 0; kS < 5; kS++) for (var side = -1; side <= 1; side += 2) {
      var ph0 = 2 * PI * kS / 5 + side * 0.10, ph1 = 2 * PI * kS / 5 + side * 0.225;
      var h = [0.045 * Math.cos(ph0), 0.045 * Math.sin(ph0)], r = [0.238 * Math.cos(ph1), 0.238 * Math.sin(ph1)];
      var T2 = norm([0, r[0] - h[0], r[1] - h[1]]), S = [0, -T2[2], T2[1]], NS = nq(12), NC = nq(12), sp = new Mesh();
      for (var a2 = 0; a2 <= NS; a2++) {
        var s = a2 / NS, w = lerp(0.040, 0.024, s) / 2, t = lerp(0.032, 0.02, s) / 2;
        var cxs = lerp(0.054, 0.092, Math.pow(s, 1.6)) - t, cyy = lerp(h[0], r[0], s), czz = lerp(h[1], r[1], s);
        for (var b2 = 0; b2 <= NC; b2++) {
          var an = 2 * PI * b2 / NC, ca = Math.cos(an), sa = Math.sin(an), ex = 2 / 2.6;
          var pa = (ca < 0 ? -1 : 1) * Math.pow(Math.abs(ca), ex), pb = (sa < 0 ? -1 : 1) * Math.pow(Math.abs(sa), ex);
          sp.v(cxs + pb * t, cyy + S[1] * pa * w, czz + S[2] * pa * w, sa, S[1] * ca, S[2] * ca);
        }
      }
      for (a2 = 0; a2 < NS; a2++) for (b2 = 0; b2 < NC; b2++) { var a0 = a2 * (NC + 1) + b2; sp.quad(a0, a0 + 1, a0 + NC + 2, a0 + NC + 1); }
      alloy.add(sp.orient());
    }
    put('wheel', 'alloy', alloy);
    put('wheel', 'steel', latheX([
      [[0.02, 0.19], [0.02, 0.095]], [[-0.008, 0.19], [0.02, 0.19]], [[0.02, 0.095], [0.05, 0.085]], [[-0.008, 0.095], [-0.008, 0.19]]
    ], nq(56)));
  })();

  // brake calipers (fixed to the body, not the spinning wheel)
  function caliper(xw, zw, th0, th1) {
    var m = new Mesh(), x0 = -0.045, x1 = 0.046, r0 = 0.118, r1 = 0.213;
    function P(x, r, th) { return [xw + x, yW + r * Math.sin(th), zw + r * Math.cos(th)]; }
    function rad(th) { return [0, Math.sin(th), Math.cos(th)]; }
    function tan(th) { return [0, Math.cos(th), -Math.sin(th)]; }
    m.add(grid(function (u, v) { return P(lerp(x0, x1, v), r1, lerp(th0, th1, u)); }, function (u) { return rad(lerp(th0, th1, u)); }, 10, 1));
    m.add(grid(function (u, v) { return P(lerp(x0, x1, v), r0, lerp(th0, th1, u)); }, function (u) { var r = rad(lerp(th0, th1, u)); return [0, -r[1], -r[2]]; }, 10, 1));
    m.add(grid(function (u, v) { return P(x1, lerp(r0, r1, v), lerp(th0, th1, u)); }, function () { return [1, 0, 0]; }, 10, 1));
    m.add(grid(function (u, v) { return P(x0, lerp(r0, r1, v), lerp(th0, th1, u)); }, function () { return [-1, 0, 0]; }, 10, 1));
    m.add(grid(function (u, v) { return P(lerp(x0, x1, u), lerp(r0, r1, v), th0); }, function () { var t = tan(th0); return [0, -t[1], -t[2]]; }, 1, 1));
    m.add(grid(function (u, v) { return P(lerp(x0, x1, u), lerp(r0, r1, v), th1); }, function () { return tan(th1); }, 1, 1));
    return m;
  }
  putBoth('caliper', caliper(wheelX.f, zF, PI - 0.52, PI + 0.52));
  putBoth('caliper', caliper(wheelX.r, zR, -0.52, 0.52));

  // ------------------------------------------------------------ result
  var materials = {
    paint:    { color: 0x8f0b12, metal: 0.45, rough: 0.38, clearcoat: 1.0, clearcoatRough: 0.035 },
    glass:    { color: 0x0a0f14, metal: 0.0, rough: 0.02 },
    trim:     { color: 0x0d0d0e, metal: 0.0, rough: 0.62 },
    gloss:    { color: 0x08080a, metal: 0.0, rough: 0.12, clearcoat: 1.0, clearcoatRough: 0.03 },
    seam:     { color: 0x030303, metal: 0.0, rough: 0.9 },
    well:     { color: 0x020202, metal: 0.0, rough: 1.0, specular: 0 },
    lens:     { color: 0x0a0b0d, metal: 0.0, rough: 0.05, clearcoat: 1.0, clearcoatRough: 0.0 },
    drl:      { color: 0xffffff, metal: 0.0, rough: 0.3, emissive: 0xf2f6ff, emissiveStrength: 4.0 },
    tail:     { color: 0x2a0306, metal: 0.0, rough: 0.06, clearcoat: 1.0, clearcoatRough: 0.0 },
    tailglow: { color: 0xd00a0a, metal: 0.0, rough: 0.3, emissive: 0xff0808, emissiveStrength: 1.3 },
    chrome:   { color: 0xdfe3e8, metal: 1.0, rough: 0.06 },
    rubber:   { color: 0x0e0e0f, metal: 0.0, rough: 0.86 },
    alloy:    { color: 0xc4c8ce, metal: 1.0, rough: 0.24, doubleSided: true },
    steel:    { color: 0x8a8d92, metal: 1.0, rough: 0.4, doubleSided: true },
    caliper:  { color: 0xe6b400, metal: 0.0, rough: 0.3, clearcoat: 0.6, clearcoatRough: 0.1 }
  };
  var nodes = [
    { name: 'Body', mesh: 'body', t: [0, 0, 0], r: [0, 0, 0, 1] },
    { name: 'Wheel_FR', mesh: 'wheel', t: [wheelX.f, yW, zF], r: [0, 0, 0, 1] },
    { name: 'Wheel_FL', mesh: 'wheel', t: [-wheelX.f, yW, zF], r: [0, 1, 0, 0] },
    { name: 'Wheel_RR', mesh: 'wheel', t: [wheelX.r, yW, zR], r: [0, 0, 0, 1] },
    { name: 'Wheel_RL', mesh: 'wheel', t: [-wheelX.r, yW, zR], r: [0, 1, 0, 0] }
  ];
  var meshes = {};
  Object.keys(parts).forEach(function (nk) {
    meshes[nk] = [];
    Object.keys(parts[nk]).forEach(function (mk) {
      var m = parts[nk][mk];
      meshes[nk].push({ material: mk, positions: new Float32Array(m.p), normals: new Float32Array(m.n), indices: new Uint32Array(m.i) });
    });
  });
  var maxX = 0, maxY = 0;
  for (k = 0; k < body.p.length; k += 3) { maxX = Math.max(maxX, body.p[k]); maxY = Math.max(maxY, body.p[k + 1]); }
  return { nodes: nodes, meshes: meshes, materials: materials, warnings: warn,
    dims: { length: zFront - zRear, width: 2 * maxX, height: maxY, wheelbase: zF - zR, tireRadius: tireR } };
}
