"use strict";
/* 绣忆 · util.js — 基础工具：数学、缓动、噪声、贝塞尔采样 */
const XY = window.XY = window.XY || {};

XY.Util = (function () {
  const TAU = Math.PI * 2;

  const clamp = function (v, a, b) { return v < a ? a : (v > b ? b : v); };
  const lerp = function (a, b, t) { return a + (b - a) * t; };
  const dist = function (ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); };

  const ease = {
    outQuad: function (t) { return 1 - (1 - t) * (1 - t); },
    inQuad: function (t) { return t * t; },
    outCubic: function (t) { return 1 + Math.pow(t - 1, 3); },
    inOutCubic: function (t) { return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; },
    outBack: function (t) { const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); }
  };

  // 确定性随机（xorshift），保证画面抖动帧间稳定可复现
  function rng(seed) {
    let s = (seed >>> 0) || 88675123;
    return function () {
      s ^= s << 13; s >>>= 0;
      s ^= s >>> 17;
      s ^= s << 5; s >>>= 0;
      return (s % 1000000) / 1000000;
    };
  }

  function hash2(x, y, seed) {
    let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed || 0, 1274126177)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  }

  // 值噪声，用于墨线的自然抖动
  function noise2(x, y, seed) {
    const ix = Math.floor(x), iy = Math.floor(y);
    const fx = x - ix, fy = y - iy;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = hash2(ix, iy, seed), b = hash2(ix + 1, iy, seed);
    const c = hash2(ix, iy + 1, seed), d = hash2(ix + 1, iy + 1, seed);
    return lerp(lerp(a, b, sx), lerp(c, d, sx), sy);
  }

  function sampleBezier(p0, p1, p2, p3, n) {
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, u = 1 - t;
      pts.push({
        x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
        y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y
      });
    }
    return pts;
  }

  // 沿折线按固定步长重采样（刺绣针脚的基础）
  function resample(pts, step) {
    if (!pts || pts.length < 2) return pts ? pts.slice() : [];
    const out = [pts[0]];
    let prev = pts[0], carry = 0;
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i];
      let segLen = Math.hypot(p.x - prev.x, p.y - prev.y);
      let t0 = 0;
      while (carry + (segLen - t0) >= step) {
        t0 += step - carry;
        const t = t0 / segLen;
        out.push({ x: lerp(prev.x, p.x, t), y: lerp(prev.y, p.y, t) });
        carry = 0;
      }
      carry += segLen - t0;
      prev = p;
    }
    out.push(pts[pts.length - 1]);
    return out;
  }

  function pick(arr, r) { return arr[Math.floor((r ? r() : Math.random()) * arr.length) % arr.length]; }

  return { TAU, clamp, lerp, dist, ease, rng, noise2, sampleBezier, resample, pick };
})();
