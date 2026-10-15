// Letreiros neon da praça inundada (capítulo 02).
// Tudo vira 3 malhas (= 3 draw calls): tubos (cada trecho é um quad "cápsula" com núcleo branco-quente, corpo
// colorido e halo HDR desenhados no shader), placas escuras e luz rebatida na parede. Animação 100% no shader
// (uTime / uWake / uClimb / uProgress); por quadro a CPU só troca uniforms e as intensidades de `lights` — zero alocação.
//
// Uso:  const neon = createNeon({ quality, layout });  scene.add(neon.group);
//       neon.update(t, dt, { progress, camera });       neon.dispose();
// layout: [{ pos:[x,y,z] (centro da BASE da fachada, no plano da parede), rotY, w, h }] — a fachada olha para +Z
// local girado por rotY (rotY = +π/2 → olha para +X). Coordenadas = espaço local de neon.group.
import * as THREE from "three";
import { GLYPHS, SYMBOLS, WORDS, SHORT } from "./font.js";
import { tubeVS, tubeFS, boardVS, boardFS, washVS, washFS } from "./shaders.js";

// cores lineares saturadas (o shader leva o núcleo bem acima de 1 → HDR)
const PAL = {
  magenta: [1, .04, .46], cyan: [.03, .62, 1], amber: [1, .36, .02], lime: [.42, 1, .03],
  red: [1, .025, .03], violet: [.4, .08, 1], pink: [1, .22, .5], ice: [.5, .8, 1],
};
const COLS = Object.keys(PAL);
const BULB = [1, .62, .26];

function mulberry(a) {
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

// ---------- layout de demonstração: avenida ao longo de -Z, prédios dos dois lados + torre no fim ----------
export function demoLayout({ seed = 3, halfWidth = 13, length = 140 } = {}) {
  const r = mulberry(seed), out = [];
  for (const side of [-1, 1]) {
    let z = 4;
    while (z > -length) {
      const w = 9 + r() * 11, h = 8 + r() * 22;
      out.push({ pos: [side * halfWidth, 0, z - w / 2], rotY: side < 0 ? Math.PI / 2 : -Math.PI / 2, w, h });
      z -= w + .6 + r() * 1.5;
    }
  }
  out.push({ pos: [0, 0, -length - 8], rotY: 0, w: 2 * halfWidth - 2, h: 30 });
  return out;
}

// ---------- geometria: arredondamento dos cantos e amostragem ----------
// troca cada canto por uma curva (raio ~c), como o vidro dobrado de um tubo de verdade
function fillet(pts, closed, c) {
  const n = pts.length; if (n < 3) return pts;
  const out = [];
  for (let i = 0; i < n; i++) {
    const B = pts[i];
    if (!closed && (i === 0 || i === n - 1)) { out.push(B); continue; }
    const A = pts[(i - 1 + n) % n], C = pts[(i + 1) % n];
    const ax = A[0] - B[0], ay = A[1] - B[1], cx = C[0] - B[0], cy = C[1] - B[1];
    const la = Math.hypot(ax, ay), lc = Math.hypot(cx, cy);
    if (la < 1e-6 || lc < 1e-6) continue;
    const cos = (ax * cx + ay * cy) / (la * lc);
    if (cos < -.94) { out.push(B); continue; }            // quase reto: mantém
    const ka = Math.min(c, la * .45) / la, kc = Math.min(c, lc * .45) / lc;
    const P1 = [B[0] + ax * ka, B[1] + ay * ka], P2 = [B[0] + cx * kc, B[1] + cy * kc];
    for (let j = 0; j <= 4; j++) {                       // Bézier quadrática P1 → B → P2
      const u = j / 4, a = (1 - u) * (1 - u), b = 2 * u * (1 - u), d = u * u;
      out.push([P1[0] * a + B[0] * b + P2[0] * d, P1[1] * a + B[1] * b + P2[1] * d]);
    }
  }
  return out;
}
// pontos espaçados ao longo de uma polilinha (lâmpadas)
function resample(pts, closed, sp) {
  const P = closed ? [...pts, pts[0]] : pts, out = [];
  let carry = 0;
  for (let i = 0; i < P.length - 1; i++) {
    const [x0, y0] = P[i], [x1, y1] = P[i + 1], L = Math.hypot(x1 - x0, y1 - y0);
    let s = carry;
    while (s <= L) { out.push([x0 + (x1 - x0) * s / L, y0 + (y1 - y0) * s / L]); s += sp; }
    carry = s - L;
  }
  return out;
}
function rrect(x0, y0, x1, y1, rad) {
  const p = [], q = (cx, cy, a0) => { for (let i = 0; i <= 5; i++) { const a = (a0 + i * 18) * Math.PI / 180; p.push([cx + Math.cos(a) * rad, cy + Math.sin(a) * rad]); } };
  q(x1 - rad, y0 + rad, -90); q(x1 - rad, y1 - rad, 0); q(x0 + rad, y1 - rad, 90); q(x0 + rad, y0 + rad, 180);
  return p;
}

// ---------- construtor ----------
export function createNeon({ quality = {}, layout, seed = 7, wakeAt = 0, origin = [0, 0, 0], climb = [14, 34, .45],
  boards = true, gain = 1 } = {}) {
  const mobile = !!quality.mobile;
  const K = mobile ? 4.6 : 7;                             // raio do halo em múltiplos do raio do tubo
  const density = mobile ? .7 : 1;
  const facades = layout?.length ? layout : demoLayout();
  const rnd = mulberry(seed);
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const colPair = () => { const a = pick(COLS); let b = pick(COLS); if (b === a) b = COLS[(COLS.indexOf(a) + 3) % COLS.length]; return [PAL[a], PAL[b]]; };

  // buffers (montados uma vez)
  const T = { P: [], Q: [], C: [], A: [], B: [], R: [], I: [], n: 0 };
  const Bd = { P: [], C: [], K: [], I: [], n: 0 };
  const W = { P: [], U: [], C: [], K: [], I: [], n: 0 };
  const lights = [];
  const _v = new THREE.Vector3();
  const O = new THREE.Vector3(...origin);

  // atraso de despertar: de perto para longe e de baixo para cima (a primeira coisa vista ao emergir)
  const wakeOf = (x, y, z, base) => base + y * .075 + Math.hypot(x - O.x, z - O.z) * .016;

  // frame = { o, x, y, z } (Vector3): plano do letreiro; pontos 2D (x,y) + profundidade z
  const W3 = (F, x, y, z, out = _v) => out.copy(F.o).addScaledVector(F.x, x).addScaledVector(F.y, y).addScaledVector(F.z, z);

  // um trecho de tubo (cápsula) de a até b no plano do frame
  function seg(F, a, b, z, r, col, anim, sign) {
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
    const ux = L > 1e-6 ? dx / L : 1, uy = L > 1e-6 ? dy / L : 0, nx = -uy, ny = ux, h = r * K;
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
    const c = W3(F, mx, my, z), yc = c.y, w = anim.w ?? wakeOf(c.x, c.y, c.z, sign.w0);
    const corners = [[-h, -h], [-h, h], [L + h, -h], [L + h, h]];
    for (const [s, t] of corners) {
      const px = a[0] + ux * s + nx * t, py = a[1] + uy * s + ny * t;
      W3(F, px, py, z); T.P.push(_v.x, _v.y, _v.z);
      T.Q.push(s, t, L, r); T.C.push(...col);
      T.A.push(anim.mode, sign.seed, anim.seq ?? 0, w);
      T.B.push(anim.param ?? 1, anim.y0 ?? 0, anim.y1 ?? 0);
      T.R.push(sign.reveal ?? 0, sign.w0r ?? 0, yc);
    }
    const n = T.n; T.I.push(n, n + 2, n + 1, n + 1, n + 2, n + 3); T.n += 4;
  }
  // polilinha → trechos (subdivide os longos para a cascata/onda andarem suave)
  function stroke(F, pts, closed, z, r, col, anim, sign, maxLen = .55) {
    const P = closed ? [...pts, pts[0]] : pts;
    let total = 0; for (let i = 0; i < P.length - 1; i++) total += Math.hypot(P[i + 1][0] - P[i][0], P[i + 1][1] - P[i][1]);
    let acc = 0;
    for (let i = 0; i < P.length - 1; i++) {
      const a = P[i], b = P[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]), k = Math.max(1, Math.ceil(L / maxLen));
      for (let j = 0; j < k; j++) {
        const p0 = [a[0] + (b[0] - a[0]) * j / k, a[1] + (b[1] - a[1]) * j / k], p1 = [a[0] + (b[0] - a[0]) * (j + 1) / k, a[1] + (b[1] - a[1]) * (j + 1) / k];
        const an = anim.mode === 6 ? { ...anim, seq: (acc + L * (j + .5) / k) / Math.max(total, 1e-3) * total / 3 } : anim;
        seg(F, p0, p1, z, r, col, an, sign);
      }
      acc += L;
    }
  }
  // glifo (fonte ou símbolo) com altura hg em (x,y)
  function glyph(F, g, x, y, hg, z, r, col, anim, sign) {
    for (const s of g.s) {
      const pts = fillet(s.p, s.c, .07).map(([gx, gy]) => [x + gx * hg, y + gy * hg]);
      stroke(F, pts, s.c, z, r, col, anim, sign);
    }
  }
  const textWidth = (txt, hL) => [...txt].reduce((a, ch, i) => a + (GLYPHS[ch]?.w ?? .5) * hL + (i ? hL * .26 : 0), 0);
  // palavra horizontal; anim.mode 1 → seq = ordem da letra
  function word(F, txt, cx, y, hL, z, r, col, anim, sign) {
    const chars = [...txt], n = chars.length;
    let x = cx - textWidth(txt, hL) / 2;
    chars.forEach((ch, i) => {
      const g = GLYPHS[ch]; if (!g) return;
      glyph(F, g, x, y, hL, z, r, col, { ...anim, seq: anim.mode === 1 ? i / Math.max(n - 1, 1) : anim.seq }, sign);
      x += g.w * hL + hL * .26;
    });
  }
  function bulbs(F, pts, closed, sp, z, r, speed, sign) {
    resample(pts, closed, sp).forEach((p, i) => seg(F, p, p, z, r, BULB, { mode: 2, seq: i, param: speed }, sign));
  }
  function quad(buf, F, x0, y0, x1, y1, z, col, k, uv) {
    const n = buf.n;
    [[x0, y0, -1, -1], [x1, y0, 1, -1], [x0, y1, -1, 1], [x1, y1, 1, 1]].forEach(([x, y, u, v]) => {
      W3(F, x, y, z); buf.P.push(_v.x, _v.y, _v.z); buf.C.push(...col); buf.K.push(...k); if (uv) buf.U.push(u, v);
    });
    buf.I.push(n, n + 1, n + 2, n + 2, n + 1, n + 3); buf.n += 4;
  }
  // caixa escura (letreiro vertical): centro c, semi-eixos ax, ay, az (Vector3)
  function box(c, ax, ay, az, col, k) {
    const faces = [[ax, ay, az], [ax.clone().negate(), ay, az.clone().negate()], [az, ay, ax.clone().negate()], [az.clone().negate(), ay, ax], [ay, az, ax], [ay.clone().negate(), az, ax.clone().negate()]];
    for (const [n, u, v] of faces) {
      const o = c.clone().add(n);
      quad(Bd, { o, x: u.clone().normalize(), y: v.clone().normalize(), z: n.clone().normalize() }, -u.length(), -v.length(), u.length(), v.length(), 0, col, k);
    }
  }
  function newSign(F, cx, cy, col, w0, extra = {}) {
    const c = W3(F, cx, cy, .6, new THREE.Vector3());
    const s = { seed: rnd() * 100, w0: wakeOf(c.x, c.y, c.z, w0), ...extra };
    s.w0r = s.w0;
    s.light = { pos: c, color: new THREE.Color(...col), intensity: 0, base: .9, w0: s.w0, y: c.y };
    lights.push(s.light);
    return s;
  }
  const board = (F, x0, y0, x1, y1, col, s, wash = 1.6) => {
    const k = [s.w0, F.o.y + (y0 + y1) / 2];
    if (boards) quad(Bd, F, x0, y0, x1, y1, .05, col, k);
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, hw = (x1 - x0) / 2 * wash + .8, hh = (y1 - y0) / 2 * wash + .8;
    quad(W, F, cx - hw, cy - hh, cx + hw, cy + hh, .015, col, k, true);
  };

  // ---------- tipos de letreiro ----------
  // palavra (fixa / letra a letra / com defeito), placa, moldura de tubo ou de lâmpadas, sublinhado em onda
  function signWord(F, cx, y, avail, maxH) {
    const txt = pick(WORDS), [c1, c2] = colPair();
    let hL = Math.min(maxH, 1.1 + rnd() * 1.4);
    hL = Math.min(hL, avail / (textWidth(txt, 1) + .5));
    if (hL < .6) return 0;
    const r = THREE.MathUtils.clamp(hL * .02, .022, .045), tw = textWidth(txt, hL), pad = hL * .32;
    const m = rnd(), mode = m < .42 ? 0 : m < .82 ? 1 : m < .9 ? 4 : 0;
    const frame = rnd(), under = rnd() < .3;
    const H = hL + pad * 2 + (under ? hL * .45 : 0);
    const reveal = rnd() < .35 ? H : 0;
    const s = newSign(F, cx, y + H / 2, c1, rnd() * .35, { reveal });
    const x0 = cx - tw / 2 - pad, x1 = cx + tw / 2 + pad, y0 = y, y1 = y + H;
    const win = reveal ? { y0: F.o.y + y0, y1: F.o.y + y1 } : {};
    const ty = y + pad + (under ? hL * .45 : 0);
    word(F, txt, cx, ty, hL, .14, r, c1, { mode, param: 5 + rnd() * 4, ...win }, s);
    if (under) stroke(F, fillet(SYMBOLS.wave.s[0].p, false, .05).map(([u, v]) => [x0 + pad * .6 + u * (x1 - x0 - pad * 1.2), y + pad * .55 + (v - .5) * hL * .35]),
      false, .14, r * .8, c2, { mode: 6, param: 3 + rnd() * 2, ...win }, s, .25);
    if (frame < .4) stroke(F, rrect(x0, y0, x1, y1, Math.min(.35, H * .2)), true, .12, r * .85, c2, { mode: rnd() < .5 ? 0 : 6, param: 2.5, ...win }, s);
    else if (frame < .65) bulbs(F, rrect(x0, y0, x1, y1, .2), true, mobile ? .42 : .3, .12, .05, 6 + rnd() * 5, s);
    board(F, x0 - .1, y0 - .1, x1 + .1, y1 + .1, c1, s);
    s.light.base = mode === 1 ? .7 : .9;
    return H;
  }
  // símbolo grande + palavra curta, alternando (seta / estrela / raio / taça / lua ...)
  function signSymbol(F, cx, y, avail, maxH) {
    const sym = SYMBOLS[pick(["star", "arrow", "bolt", "glass", "ring", "diamond", "moon", "arrow"])];
    const txt = pick(SHORT), [c1, c2] = colPair();
    const hS = Math.min(maxH, 1.6 + rnd() * 1.4), hL = hS * .5;
    const sw = sym.w * hS, tw = textWidth(txt, hL), total = sw + hL * .6 + tw;
    if (total > avail) return 0;
    const r = THREE.MathUtils.clamp(hS * .016, .024, .045);
    const s = newSign(F, cx, y + hS / 2, c1, rnd() * .35);
    const x = cx - total / 2, alt = rnd() < .55;
    glyph(F, sym, x, y, hS, .14, r, c1, alt ? { mode: 7, seq: 0, param: .7 + rnd() * .5 } : { mode: rnd() < .3 ? 4 : 0 }, s);
    word(F, txt, x + sw + hL * .6 + tw / 2, y + hS * .25, hL, .14, r * .9, c2, alt ? { mode: 7, seq: 1, param: .7 } : { mode: 1, param: 4 + rnd() * 3 }, s);
    board(F, x - .35, y - .3, x + total + .35, y + hS + .3, c1, s);
    return hS + .3;
  }
  // janela com conteúdo rolando para cima sem parar (letreiro de "subindo")
  function signMarquee(F, cx, y, avail, maxH) {
    const ww = Math.min(avail, 2.4 + rnd() * 1.6), hh = Math.min(maxH, 3.5 + rnd() * 2.5);
    if (ww < 2 || hh < 3) return 0;
    const [c1, c2] = colPair(), s = newSign(F, cx, y + hh / 2, c1, rnd() * .35);
    const win = { y0: F.o.y + y, y1: F.o.y + y + hh }, speed = .45 + rnd() * .4;
    const items = [], n = Math.max(2, Math.round(hh / 1.25));
    for (let i = 0; i < n; i++) items.push(rnd() < .5 ? ["s", pick(["star", "chevron", "diamond", "arrow"])] : ["w", pick(SHORT)]);
    for (const copy of [-1, 0]) items.forEach(([k, v], i) => {
      const yy = y + copy * hh + (i + .5) * hh / n, hg = Math.min(hh / n * .62, ww * .4), col = i % 2 ? c2 : c1;
      if (k === "s") glyph(F, SYMBOLS[v], cx - SYMBOLS[v].w * hg / 2, yy - hg / 2, hg, .14, .03, col, { mode: 5, param: speed, ...win }, s);
      else { const hl = Math.min(hg * .85, ww * .85 / (textWidth(v, 1) + .1)); word(F, v, cx, yy - hl / 2, hl, .14, .03, col, { mode: 5, param: speed, ...win }, s); }
    });
    stroke(F, rrect(cx - ww / 2, y, cx + ww / 2, y + hh, .25), true, .12, .035, c1, { mode: 0 }, s);
    board(F, cx - ww / 2 - .08, y - .08, cx + ww / 2 + .08, y + hh + .08, c1, s);
    return hh;
  }
  // faixa de ondas atravessando a fachada (pulso correndo)
  function signWave(F, cx, y, avail) {
    const [c1, c2] = colPair(), s = newSign(F, cx, y + .5, c1, rnd() * .35), per = Math.max(2, Math.round(avail / 2.2));
    for (const [k, col] of [[0, c1], [1, c2]]) {
      const pts = Array.from({ length: per * 12 + 1 }, (_, i) => [cx - avail / 2 + avail * i / (per * 12), y + .45 + k * .5 + Math.sin(i / 12 * Math.PI * 2 + k * Math.PI) * .22]);
      stroke(F, pts, false, .14, .03, col, { mode: 6, param: 3 + k }, s, .3);
    }
    quad(W, F, cx - avail / 2 - .8, y - .6, cx + avail / 2 + .8, y + 2, .015, c1, [s.w0, F.o.y + y + .7], true);
    return 1.4;
  }
  // escada de divisas subindo pela fachada (cometa de baixo para cima)
  function signLadder(F, x, y0, y1) {
    const [c1, c2] = colPair(), s = newSign(F, x, (y0 + y1) / 2, c1, rnd() * .35), win = { y0: F.o.y + y0, y1: F.o.y + y1 };
    const wd = 1.1, sp = .75;
    for (let y = y0 + .2; y < y1 - .5; y += sp) stroke(F, fillet([[x - wd / 2, y], [x, y + .42], [x + wd / 2, y]], false, .08), false, .14, .032, c1, { mode: 3, ...win }, s);
    for (const sx of [-1, 1]) stroke(F, [[x + sx * (wd / 2 + .22), y0], [x + sx * (wd / 2 + .22), y1]], false, .13, .02, c2, { mode: 3, ...win, param: 1.7 }, s);
    quad(W, F, x - 1.6, y0, x + 1.6, y1, .015, c1, [s.w0, F.o.y + (y0 + y1) / 2], true);
    if (boards) quad(Bd, F, x - .95, y0 - .1, x + .95, y1 + .1, .05, c1, [s.w0, F.o.y + (y0 + y1) / 2]);
  }
  // linhas verticais com pulsos subindo (topo de prédio alto)
  function signBars(F, cx, y0, y1, avail) {
    const [c1] = colPair(), s = newSign(F, cx, (y0 + y1) / 2, c1, rnd() * .35), n = Math.max(3, Math.floor(avail / 1.1));
    for (let i = 0; i < n; i++) {
      const x = cx - avail / 2 + (i + .5) * avail / n;
      stroke(F, [[x, y0], [x, y1]], false, .14, .028, c1, { mode: 3, param: i * .37, y0: F.o.y + y0, y1: F.o.y + y1 }, s);
    }
    quad(W, F, cx - avail / 2 - .8, y0 - .5, cx + avail / 2 + .8, y1 + .5, .015, c1, [s.w0, F.o.y + (y0 + y1) / 2], true);
  }
  // "blade sign": caixa vertical perpendicular à fachada, letras empilhadas acendendo de baixo para cima
  function signBlade(Ff, xb, y0, H) {
    const txt = pick(WORDS.filter((t) => t.length >= 3 && t.length <= 5 && !t.includes(" "))), [c1, c2] = colPair();
    const bw = 1.7, th = .32, gap = .3;
    const C = W3(Ff, xb, y0 + H / 2, gap + bw / 2, new THREE.Vector3());
    const s = newSign({ ...Ff, o: C, z: Ff.x }, 0, 0, c1, rnd() * .25);
    s.light.pos.copy(C);
    box(C, Ff.x.clone().multiplyScalar(th / 2), Ff.y.clone().multiplyScalar(H / 2), Ff.z.clone().multiplyScalar(bw / 2), c1, [s.w0, C.y]);
    const n = txt.length, hL = Math.min((H - .9) / (n * 1.18), bw * .55 / .7), r = THREE.MathUtils.clamp(hL * .022, .024, .04);
    const period = 4 + rnd() * 2.5, chase = rnd() < .6;
    for (const side of [1, -1]) {
      const nrm = Ff.x.clone().multiplyScalar(side), right = new THREE.Vector3(0, 1, 0).cross(nrm).normalize();
      const F = { o: C.clone().addScaledVector(nrm, th / 2).addScaledVector(Ff.y, -H / 2), x: right, y: Ff.y.clone(), z: nrm };
      const step = (H - .9) / n;
      [...txt].forEach((ch, i) => {
        const g = GLYPHS[ch]; if (!g) return;
        const yy = H - .45 - (i + 1) * step + (step - hL) / 2;
        glyph(F, g, -g.w * hL / 2, yy, hL, .07, r, c1, { mode: 1, seq: (n - 1 - i) / Math.max(n - 1, 1), param: period }, s);   // de baixo p/ cima
      });
      if (chase) bulbs(F, rrect(-bw / 2 + .14, .14, bw / 2 - .14, H - .14, .18), true, mobile ? .38 : .28, .06, .045, 7 + rnd() * 3, s);
      else stroke(F, rrect(-bw / 2 + .12, .12, bw / 2 - .12, H - .12, .25), true, .06, .03, c2, { mode: 6, param: 2.5 }, s);
    }
    // faixa vertical na borda de fora (cometa subindo)
    const E = { o: C.clone().addScaledVector(Ff.z, bw / 2).addScaledVector(Ff.y, -H / 2), x: Ff.x.clone().negate(), y: Ff.y.clone(), z: Ff.z.clone() };
    stroke(E, [[0, .2], [0, H - .2]], false, .04, .035, c2, { mode: 3, y0: E.o.y, y1: E.o.y + H }, s);
    quad(W, Ff, xb - 1.6, y0 - .5, xb + 1.6, y0 + H + .5, .015, c1, [s.w0, C.y], true);
  }

  // ---------- preenche cada fachada ----------
  facades.forEach((fc, fi) => {
    const [px, py, pz] = fc.pos, ry = fc.rotY ?? 0;
    const F = { o: new THREE.Vector3(px, py, pz), x: new THREE.Vector3(Math.cos(ry), 0, -Math.sin(ry)), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(Math.sin(ry), 0, Math.cos(ry)) };
    const { w, h } = fc;
    let xL = -w / 2 + .7, xR = w / 2 - .7;
    if (w >= 8 && h >= 12 && rnd() < .7 * density + .1) {                    // letreiro vertical numa ponta
      const side = rnd() < .5 ? -1 : 1, Hb = Math.min(h - 6, 6 + rnd() * 7), y0 = 3.6 + rnd() * 2;
      if (Hb > 4) { signBlade(F, side * (w / 2 - 1.1), y0, Hb); if (side < 0) xL += 1.8; else xR -= 1.8; }
    }
    if (h >= 14 && rnd() < .55 * density + .1) {                             // escada subindo na outra ponta
      const side = xL > -w / 2 + 1 ? 1 : -1, x = side * (w / 2 - 1.1);
      signLadder(F, x, 3, h - 1.2); if (side < 0) xL += 2.2; else xR -= 2.2;
    }
    let y = 3.2 + rnd() * .8;
    const top = h - 1;
    while (y < top - 1.2) {
      const avail = xR - xL, cx = (xL + xR) / 2, maxH = top - y;
      if (avail < 2) break;
      if (rnd() > density * .85) { y += 2 + rnd() * 2.5; continue; }      // fachada vazia (janelas)
      const t = rnd();
      let used = 0;
      if (maxH > 7 && y > h * .55 && t < .14) { signBars(F, cx, y, top, avail * .8); break; }
      else if (t < .5) used = signWord(F, cx, y, avail, Math.min(maxH, 2.8));
      else if (t < .68) used = signSymbol(F, cx, y, avail, Math.min(maxH - .4, 3));
      else if (t < .82) used = signMarquee(F, cx, y, avail, maxH);
      else if (t < .92) used = signWave(F, cx, y, avail * .9);
      else used = signWord(F, cx, y, avail, Math.min(maxH, 2.2));
      y += (used || 1) + .6 + rnd() * 1.4;
    }
  });

  // ---------- malhas ----------
  const uniforms = {
    uTime: { value: 0 }, uWake: { value: 0 }, uClimb: { value: climb ? climb[0] : 1e4 }, uProgress: { value: 0 },
    uHalo: { value: K }, uGain: { value: gain }, uWash: { value: mobile ? .11 : .14 },
  };
  const mk = (vs, fs, extra) => new THREE.ShaderMaterial({ uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {}]), vertexShader: vs, fragmentShader: fs, fog: true, ...extra });
  const share = (m) => { Object.assign(m.uniforms, uniforms); return m; };   // os três materiais compartilham os mesmos uniforms
  const tubeMat = share(mk(tubeVS, tubeFS, {
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    blending: THREE.CustomBlending, blendEquation: THREE.MaxEquation,     // MAX: emendas e halos sobrepostos não somam manchas
  }));
  const boardMat = share(mk(boardVS, boardFS, { side: THREE.DoubleSide }));
  const washMat = share(mk(washVS, washFS, { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));

  const geo = (buf, attrs) => {
    const g = new THREE.BufferGeometry();
    for (const [name, arr, n] of attrs) g.setAttribute(name, new THREE.Float32BufferAttribute(arr, n));
    g.setIndex(buf.n > 65535 ? new THREE.Uint32BufferAttribute(buf.I, 1) : new THREE.Uint16BufferAttribute(buf.I, 1));
    g.computeBoundingSphere();
    return g;
  };
  const tubeGeo = geo(T, [["position", T.P, 3], ["aQ", T.Q, 4], ["aCol", T.C, 3], ["aA", T.A, 4], ["aB", T.B, 3], ["aR", T.R, 3]]);
  const boardGeo = geo(Bd, [["position", Bd.P, 3], ["aCol", Bd.C, 3], ["aK", Bd.K, 2]]);
  const washGeo = geo(W, [["position", W.P, 3], ["aUv", W.U, 2], ["aCol", W.C, 3], ["aK", W.K, 2]]);

  const group = new THREE.Group(); group.name = "neon";
  const mesh = (g, m, order) => { const o = new THREE.Mesh(g, m); o.frustumCulled = false; o.renderOrder = order; o.matrixAutoUpdate = false; group.add(o); return o; };
  if (boards && Bd.n) mesh(boardGeo, boardMat, 0);
  mesh(washGeo, washMat, 1);
  mesh(tubeGeo, tubeMat, 2);

  // ---------- estado / animação ----------
  let wake = 0, maxWake = 0;
  for (const l of lights) maxWake = Math.max(maxWake, l.w0 + 2);
  const [cFrom, cTo, cEnd] = climb || [1e4, 1e4, 1];
  let override = null;

  function update(t, dt, { progress = 0 } = {}) {
    const awakeNow = override ?? (progress >= wakeAt);
    wake = awakeNow ? Math.min(wake + dt, maxWake + 30) : Math.max(wake - dt * 2.5, 0);
    const climbH = climb ? cFrom + (cTo - cFrom) * Math.min(Math.max(progress / cEnd, 0), 1) : 1e4;
    uniforms.uTime.value = t; uniforms.uWake.value = wake; uniforms.uProgress.value = progress; uniforms.uClimb.value = climbH;
    for (let i = 0; i < lights.length; i++) {
      const l = lights[i], e = Math.min(wake - l.w0, (climbH - l.y) * .3);
      l.intensity = Math.min(Math.max(e * 2, 0), 1) * l.base * gain;
    }
  }

  return {
    group, lights, uniforms,
    stats: { signs: lights.length, segments: T.n / 4, triangles: (T.I.length + Bd.I.length + W.I.length) / 3, drawCalls: group.children.length },
    update,
    ignite() { wake = 0; override = null; },        // reacende a cascata do zero
    setAwake(v) { override = v; },                  // true/false força; null volta a seguir o progress
    setWake(s) { wake = s; },                       // pula a cascata (ex.: setWake(99) = tudo aceso já)
    dispose() {
      for (const o of group.children) { o.geometry.dispose(); o.material.dispose(); }
      group.clear();
    },
  };
}
