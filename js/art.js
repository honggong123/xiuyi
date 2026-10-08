"use strict";
/* 绣忆 · art.js — 程序化水墨与刺绣渲染
   所有画面均由 Canvas 代码绘制：宣纸噪点、抖动墨线、缎面绣针脚、
   光影与粒子。assets/img/<场景名>.png 存在时自动作为手绘替换图层。 */
XY.Art = (function () {
  const U = XY.Util;
  const W = 1280, H = 720;

  const PALETTE = {
    paper: '#f3ead8', ink: '#3a332b', inkLight: '#6b5f4e',
    silk: '#f5efdf', silkShade: '#e2d5b8', silkDeep: '#cfc0a0',
    red: '#b03a2e', redDeep: '#8c2b22', redLight: '#d46a5f',
    gold: '#c9a86a', goldDeep: '#a5854a', moss: '#7a8a5f', mossDeep: '#55613f',
    wood: '#6b4a2f', woodDark: '#453020', wall: '#ece1c8', wallShade: '#dccfae'
  };

  // ---------- 缓存纹理 ----------
  const paperCv = document.createElement('canvas');
  const silkCv = document.createElement('canvas');
  const img = {};

  function buildPaper() {
    paperCv.width = 256; paperCv.height = 256;
    const c = paperCv.getContext('2d');
    const r = U.rng(42);
    for (let i = 0; i < 2600; i++) {
      const x = r() * 256, y = r() * 256;
      const a = r() * 0.05;
      c.fillStyle = r() > 0.5 ? 'rgba(60,50,35,' + a + ')' : 'rgba(255,255,255,' + (a * 1.4) + ')';
      c.fillRect(x, y, 1 + r() * 1.6, 1 + r() * 1.2);
    }
    // 纤维丝
    for (let i = 0; i < 90; i++) {
      c.strokeStyle = 'rgba(90,75,50,' + (0.02 + r() * 0.04) + ')';
      c.lineWidth = 0.7;
      const x = r() * 256, y = r() * 256;
      c.beginPath(); c.moveTo(x, y);
      c.quadraticCurveTo(x + r() * 30 - 15, y + r() * 30 - 15, x + r() * 60 - 30, y + r() * 50 - 25);
      c.stroke();
    }
  }

  function buildSilk() {
    silkCv.width = 128; silkCv.height = 128;
    const c = silkCv.getContext('2d');
    const r = U.rng(77);
    for (let y = 0; y < 128; y += 3) {
      c.fillStyle = 'rgba(200,185,150,' + (0.05 + r() * 0.05) + ')';
      c.fillRect(0, y, 128, 1);
    }
    for (let x = 0; x < 128; x += 4) {
      c.fillStyle = 'rgba(255,255,255,' + (0.03 + r() * 0.04) + ')';
      c.fillRect(x, 0, 1, 128);
    }
  }

  function paperPattern(ctx) {
    const p = ctx.createPattern(paperCv, 'repeat');
    ctx.save(); ctx.globalAlpha = 0.85; ctx.fillStyle = p; ctx.fillRect(0, 0, W, H); ctx.restore();
  }

  function init(cb) {
    buildPaper(); buildSilk();
    const names = ['rain', 'hoop', 'dress', 'room', 'photowall', 'silk', 'black'];
    let total = names.length, settled = 0, called = false;
    function done() { if (++settled >= total && !called) { called = true; if (cb) cb(); } }
    names.forEach(function (n) {
      const im = new Image();
      im.onload = function () { img[n] = im; done(); };
      im.onerror = done;
      im.src = 'assets/img/' + n + '.png';
    });
    setTimeout(function () { if (!called) { called = true; if (cb) cb(); } }, 4000);
  }

  // ---------- 通用绘制 ----------
  function setFont(ctx, size, opts) {
    opts = opts || {};
    const fam = '"KaiTi","Kaiti SC","STKaiti","FZKai-Z03S","Noto Serif SC",serif';
    ctx.font = (opts.weight ? opts.weight + ' ' : '') + size + 'px ' + fam;
    ctx.textBaseline = opts.baseline || 'alphabetic';
    ctx.textAlign = opts.align || 'left';
  }

  function wrapText(ctx, text, maxW) {
    const out = [];
    String(text).split('\n').forEach(function (para) {
      if (para === '') { out.push(''); return; }
      let line = '';
      for (let i = 0; i < para.length; i++) {
        const test = line + para[i];
        if (ctx.measureText(test).width > maxW && line) { out.push(line); line = para[i]; }
        else line = test;
      }
      out.push(line);
    });
    return out;
  }

  function inkStroke(ctx, pts, o) {
    if (!pts || pts.length < 2) return;
    o = o || {};
    const w = o.w || 2, color = o.color || PALETTE.ink;
    const alpha = o.alpha == null ? 0.75 : o.alpha, seed = o.seed || 7;
    const wob = o.wobble == null ? 2.0 : o.wobble;
    const tm = o.time || 0;            // 时间（供病程震颤）
    const trem = o.tremble || 0;       // 震颤幅度 0..1（病程渲染）
    const gaps = o.gaps || 0;          // 脱针缺口 0..1
    ctx.save();
    ctx.globalAlpha = alpha; ctx.strokeStyle = color;
    ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (gaps > 0.04) {
      ctx.setLineDash([9 + (seed % 4) * 4, 2.5 + gaps * 8]);
      ctx.lineDashOffset = (seed * 13) % 11;
    }
    ctx.beginPath();
    let prev = null;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      let dx = 0, dy = -1;
      if (prev) {
        dx = p.x - prev.x; dy = p.y - prev.y;
        const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
      }
      let off = (U.noise2(i * 0.4, seed * 0.13, 3) - 0.5) * wob;
      if (trem > 0) off += Math.sin(tm * 6.3 + i * 1.7 + seed) * 2.4 * trem
        + (U.noise2(i * 0.9 + tm * 2.4, seed * 0.31, 3) - 0.5) * 3.2 * trem;
      const px = p.x - dy * off, py = p.y + dx * off;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      prev = p;
    }
    ctx.stroke();
    ctx.restore();
  }

  // 颜色混合（用于病程去饱和）：hex → rgb 插值
  function mixc(c1, c2, k) {
    k = U.clamp(k || 0, 0, 1);
    const a = parseInt(c1.slice(1), 16), b = parseInt(c2.slice(1), 16);
    const r = Math.round(((a >> 16) & 255) * (1 - k) + ((b >> 16) & 255) * k);
    const g = Math.round(((a >> 8) & 255) * (1 - k) + ((b >> 8) & 255) * k);
    const bl = Math.round((a & 255) * (1 - k) + (b & 255) * k);
    return 'rgb(' + r + ',' + g + ',' + bl + ')';
  }

  // 缎面绣：沿路径铺排垂直短针，双层（底色+高光）
  function stitchPath(ctx, pts, o) {
    if (!pts || pts.length < 2) return;
    o = o || {};
    const gap = o.gap || 3.4, sw = o.w || 11;
    const color = o.color || PALETTE.red, hi = o.hi || lighten(color);
    const seed = o.seed || 3, alpha = o.alpha == null ? 0.95 : o.alpha;
    const rs = U.resample(pts, gap);
    if (rs.length < 2) return;
    ctx.save();
    ctx.lineCap = 'round';
    // 底层连线（弱）
    ctx.globalAlpha = alpha * 0.3;
    ctx.strokeStyle = color; ctx.lineWidth = Math.max(1, sw * 0.15);
    ctx.beginPath();
    rs.forEach(function (p, i) { i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); });
    ctx.stroke();
    // 针脚主体
    ctx.globalAlpha = alpha;
    ctx.lineWidth = Math.max(1.1, sw * 0.15);
    for (let i = 0; i < rs.length; i++) {
      const p = rs[i], q = rs[Math.min(rs.length - 1, i + 1)];
      let dx = q.x - p.x, dy = q.y - p.y;
      const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
      const half = (sw / 2) * (0.82 + 0.36 * U.noise2(i * 0.8, seed, 5));
      const j = (U.noise2(i * 0.5, seed, 9) - 0.5) * 1.4;
      ctx.strokeStyle = color;
      ctx.beginPath();
      ctx.moveTo(p.x - dy * half + dx * j, p.y + dx * half + dy * j);
      ctx.lineTo(p.x + dy * half + dx * j, p.y - dx * half + dy * j);
      ctx.stroke();
      if (i % 2 === 0) {
        ctx.strokeStyle = hi;
        ctx.lineWidth = Math.max(0.7, sw * 0.07);
        ctx.beginPath();
        ctx.moveTo(p.x - dy * half * 0.45 + dx * j, p.y + dx * half * 0.45 + dy * j);
        ctx.lineTo(p.x + dy * half * 0.1 + dx * j, p.y - dx * half * 0.1 + dy * j);
        ctx.stroke();
        ctx.lineWidth = Math.max(1.1, sw * 0.15);
      }
    }
    ctx.restore();
  }

  // 轮廓绣（回针）：虚线缝
  function backStitch(ctx, pts, o) {
    o = o || {};
    ctx.save();
    ctx.globalAlpha = o.alpha == null ? 0.8 : o.alpha;
    ctx.strokeStyle = o.color || PALETTE.redDeep;
    ctx.lineWidth = o.w || 2.4;
    ctx.lineCap = 'round';
    ctx.setLineDash(o.dash || [7, 5]);
    ctx.beginPath();
    (pts || []).forEach(function (p, i) { i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); });
    ctx.stroke();
    ctx.restore();
  }

  function prickedDot(ctx, x, y, r, color) {
    ctx.save();
    ctx.fillStyle = color || 'rgba(58,51,43,0.85)';
    ctx.beginPath(); ctx.arc(x, y, r || 2.6, 0, U.TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(x, y, (r || 2.6) + 1.2, 0, U.TAU); ctx.stroke();
    ctx.restore();
  }

  function lighten(hex) {
    return PALETTE.redLight; // 针脚高光统一用浅红，保持绣线观感
  }

  function vignette(ctx, strength) {
    const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.42, W / 2, H / 2, H * 0.85);
    g.addColorStop(0, 'rgba(30,22,12,0)');
    g.addColorStop(1, 'rgba(30,22,12,' + (strength == null ? 0.34 : strength) + ')');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  // 缎面面板（对话框/卡片/按钮底）
  function panel(ctx, x, y, w, h, o) {
    o = o || {};
    ctx.save();
    ctx.shadowColor = 'rgba(30,20,10,0.45)';
    ctx.shadowBlur = 18; ctx.shadowOffsetY = 6;
    ctx.fillStyle = o.fill || 'rgba(245,239,223,0.94)';
    roundRect(ctx, x, y, w, h, o.r == null ? 10 : o.r);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    const p = ctx.createPattern(silkCv, 'repeat');
    ctx.globalAlpha = 0.35; ctx.fillStyle = p;
    roundRect(ctx, x, y, w, h, o.r == null ? 10 : o.r); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = o.border || 'rgba(107,79,47,0.8)';
    ctx.lineWidth = o.bw || 2;
    roundRect(ctx, x + 1, y + 1, w - 2, h - 2, (o.r == null ? 10 : o.r) - 1); ctx.stroke();
    ctx.restore();
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // 绣针光标
  function needle(ctx, x, y, threadColor) {
    ctx.save();
    ctx.translate(x, y); ctx.rotate(-0.7);
    const g = ctx.createLinearGradient(-26, 0, 26, 0);
    g.addColorStop(0, '#cfd2d6'); g.addColorStop(0.5, '#f2f4f6'); g.addColorStop(1, '#9fa3a8');
    ctx.strokeStyle = g; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-26, 0); ctx.lineTo(20, 0); ctx.stroke();
    ctx.strokeStyle = '#7d8186'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(16, 0, 4.5, 2.2, 0, 0, U.TAU); ctx.stroke();
    if (threadColor) {
      ctx.strokeStyle = threadColor; ctx.lineWidth = 2; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(16, 2);
      ctx.quadraticCurveTo(24, 14, 18, 26);
      ctx.quadraticCurveTo(14, 36, 22, 44);
      ctx.stroke();
    }
    ctx.restore();
  }

  // 缝字标题：progress 0..1，红线随行，过处成字
  function titleStitch(ctx, text, cx, y, size, progress, color) {
    setFont(ctx, size, { weight: 'bold', align: 'center' });
    const chars = String(text).split('');
    const totalW = ctx.measureText(String(text)).width;
    const startX = cx - totalW / 2;
    const n = chars.length;
    const reveal = U.clamp(progress, 0, 1) * n;
    let acc = startX;
    chars.forEach(function (ch, i) {
      const cw = ctx.measureText(ch).width;
      const frac = U.clamp(reveal - i, 0, 1);
      if (frac > 0) {
        ctx.save();
        ctx.globalAlpha = 0.25 + 0.75 * frac;
        ctx.fillStyle = PALETTE.ink;
        ctx.textAlign = 'left';
        ctx.fillText(ch, acc, y);
        ctx.restore();
      }
      acc += cw;
    });
    // 红线与针
    if (progress > 0 && progress < 1.02) {
      const tx = startX + totalW * U.clamp(progress, 0, 1);
      ctx.save();
      ctx.strokeStyle = color || PALETTE.red; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(startX - 40, y + 14); ctx.lineTo(tx, y + 14); ctx.stroke();
      // 行针虚线
      ctx.setLineDash([6, 5]); ctx.lineWidth = 1.2; ctx.globalAlpha = 0.7;
      ctx.beginPath(); ctx.moveTo(startX - 40, y + 18); ctx.lineTo(tx, y + 18); ctx.stroke();
      ctx.restore();
      needle(ctx, tx, y + 14, color || PALETTE.red);
    }
    ctx.textAlign = 'left';
  }

  // ---------- 人物：国漫风参数化水墨表情 ----------
  // 风格基调：大而透明的眼睛（上睫毛线+虹膜+双高光）、分层发型、干净的轮廓线。
  // 表情参数：brow 眉(+/−)、eye 眼形、lid 上睑下垂、iris 虹膜缩放、gaze 视线、
  //          mouth 嘴角(+/−)、blush 腮红、tilt 眉不对称、tears 泪、crow 鱼尾纹
  const EXPR_DEFS = {
    old: {
      calm:    { brow: 0.06, eye: 'open',  iris: 0.95, lid: 0.18, mouth: 0.32, crow: 1 },
      smile:   { brow: 0.06, eye: 'smile', mouth: 0.66, crow: 1 },
      focus:   { brow: -0.34, eye: 'open', iris: 0.9, lid: 0.34, mouth: 0.04, gaze: [1, 1], crow: 1 },
      confuse: { brow: 0.42, tilt: 0.4, eye: 'open', iris: 0.82, lid: 0.1, mouth: -0.1, gaze: [2.5, -1.5], crow: 1, headTilt: 0.05 },
      vacant:  { brow: 0.12, eye: 'open', iris: 0.85, lid: 0.5, pale: 1, mouth: 0.1, open: 0.22, crow: 1 },
      sad:     { brow: 0.6, eye: 'open', iris: 0.95, lid: 0.3, mouth: -0.5, gaze: [0, 2], crow: 1 }
    },
    young: {
      normal:  { brow: 0.10, eye: 'open', iris: 1.0, lid: 0, mouth: 0.28, blush: 0.35 },
      smile:   { brow: 0.16, eye: 'smile', mouth: 0.70, blush: 0.45 },
      worried: { brow: 0.55, eye: 'open', iris: 0.86, lid: 0.04, mouth: -0.06, blush: 0.15 },
      hurt:    { brow: 0.68, eye: 'open', iris: 0.94, lid: 0.32, mouth: -0.44, blush: 0.22, gaze: [0, 1.6] },
      cry:     { brow: 0.78, eye: 'shut', mouth: -0.55, blush: 0.25, tears: 1 }
    }
  };

  // spec = { kind:'old'|'young', expr, forget:0..1, t:时间, talk:是否说话中, alpha }
  function inkFace(ctx, x, y, s, spec) {
    spec = spec || {};
    const kind = spec.kind === 'young' ? 'young' : 'old';
    const E = (EXPR_DEFS[kind] || EXPR_DEFS.old)[spec.expr] || EXPR_DEFS[kind][Object.keys(EXPR_DEFS[kind])[0]];
    const t = spec.t || 0;
    const forget = kind === 'old' ? U.clamp(spec.forget || 0, 0, 1) : 0;
    const trem = forget, gaps = forget > 0.35 ? (forget - 0.35) * 1.1 : 0;
    const desat = forget * 0.55;
    ctx.save();
    ctx.globalAlpha = spec.alpha == null ? 1 : spec.alpha;
    ctx.translate(x, y);
    if (E.headTilt) ctx.rotate(E.headTilt * Math.sin(t * 0.5) * 0.5 + E.headTilt);
    ctx.scale(s / 100, s / 100); // 以 100 为基准尺寸
    const ink = mixc(PALETTE.ink, '#6e6e68', desat);
    const trembleOpts = { time: t, tremble: trem * 0.8, gaps: gaps, seed: 1 };
    const blinkNow = kind === 'young' && (E.eye === 'open') && (t % 3.4) < 0.12;

    if (kind === 'old') {
      const skin = mixc('#efe3cf', '#d9d2c0', desat);
      const hairC = mixc('#7d766a', '#8f8a80', desat);
      // 脑后发（银灰，向后拢起）
      ctx.fillStyle = hairC;
      ctx.beginPath();
      ctx.moveTo(-37, 2);
      ctx.quadraticCurveTo(-40, -42, 0, -50);
      ctx.quadraticCurveTo(40, -42, 37, 2);
      ctx.quadraticCurveTo(30, -22, 0, -26);
      ctx.quadraticCurveTo(-30, -22, -37, 2);
      ctx.fill();
      // 发髻
      ctx.beginPath(); ctx.arc(0, -47, 14, 0, U.TAU); ctx.fill();
      // 发髻发丝
      inkStroke(ctx, [{ x: -8, y: -54 }, { x: -2, y: -58 }, { x: 5, y: -55 }], Object.assign({ w: 1, alpha: 0.4, color: mixc('#a8a296', '#b5b0a6', desat), seed: 33 }, trembleOpts));
      // 玉簪：斜穿过髻，尾端垂一颗玉珠（标志物）
      ctx.strokeStyle = mixc('#c9a86a', '#a89f90', desat); ctx.lineWidth = 2; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-19, -42); ctx.lineTo(24, -55); ctx.stroke();
      ctx.fillStyle = mixc('#7a8a5f', '#8f9585', desat);
      ctx.beginPath(); ctx.arc(25.5, -55.5, 3, 0, U.TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.beginPath(); ctx.arc(24.5, -56.5, 1, 0, U.TAU); ctx.fill();
      // 碎发
      inkStroke(ctx, [{ x: -30, y: -30 }, { x: -33, y: -18 }, { x: -31, y: -8 }], Object.assign({ w: 1.2, alpha: 0.5, color: hairC, seed: 34 }, trembleOpts));
      inkStroke(ctx, [{ x: 30, y: -30 }, { x: 33, y: -18 }, { x: 31, y: -8 }], Object.assign({ w: 1.2, alpha: 0.5, color: hairC, seed: 35 }, trembleOpts));
      // 脸
      ctx.fillStyle = skin;
      ctx.beginPath(); ctx.ellipse(0, 6, 33, 39, 0, 0, U.TAU); ctx.fill();
      ctx.strokeStyle = ink; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(0, 6, 33, 39, 0, 0, U.TAU); ctx.stroke();
      // 眉（细而缓，外端略垂）
      const gx = E.gaze ? E.gaze[0] : 0, gy = E.gaze ? E.gaze[1] : 0;
      const drawBrow = function (sx, wing, seedN, tilt) {
        const lift = E.brow || 0, tl = tilt || 0;
        inkStroke(ctx, [
          { x: sx - wing * 8, y: -11 - lift * 5 + tl * 3 },
          { x: sx, y: -13.5 - lift * 1.5 },
          { x: sx + wing * 8, y: -12.5 - lift * 0.5 - tl * 3 }
        ], Object.assign({ w: 1.5, alpha: 0.6 + Math.abs(lift) * 0.3, seed: seedN }, trembleOpts));
      };
      drawBrow(-12 + gx * 0.6, -1, 31, E.tilt || 0);
      drawBrow(12 + gx * 0.6, 1, 32, -(E.tilt || 0));
      // 额纹（极淡）
      inkStroke(ctx, [{ x: -13, y: -22 }, { x: 13, y: -22 }], Object.assign({ w: 0.9, alpha: 0.25, seed: 36 }, trembleOpts));
      // 眼
      const oldEye = function (cx, wing, seedN) {
        const a = (E.eyeA == null ? 1 : E.eyeA);
        if (E.eye === 'smile') {
          // 眯眯笑眼：上扬弧 + 睫毛感
          inkStroke(ctx, [
            { x: cx - 6.5, y: 5 }, { x: cx, y: 1.5 }, { x: cx + 6.5, y: 5 }
          ], Object.assign({ w: 2.2, alpha: 0.9 * a, seed: seedN }, trembleOpts));
          return;
        }
        const lid = E.lid == null ? 0.18 : E.lid;
        // 眼白底（杏仁形）
        ctx.fillStyle = mixc('#fdf8ec', '#e6e0d2', desat);
        ctx.beginPath(); ctx.ellipse(cx + gx * 0.5, 6, 6, 4, 0, 0, U.TAU); ctx.fill();
        // 虹膜（clip 进眼形）
        ctx.save();
        ctx.beginPath(); ctx.ellipse(cx + gx * 0.5, 6, 6, 4, 0, 0, U.TAU); ctx.clip();
        const ir = 3.6 * (E.iris || 1);
        const pale = E.pale;
        ctx.fillStyle = pale ? mixc('#8f8570', '#9a938a', desat) : mixc('#4a3a28', '#6e6a60', desat);
        ctx.beginPath(); ctx.arc(cx + gx, 6 + gy * 0.6, ir, 0, U.TAU); ctx.fill();
        ctx.fillStyle = '#241c14';
        ctx.beginPath(); ctx.arc(cx + gx, 6 + gy * 0.6, ir * 0.45, 0, U.TAU); ctx.fill();
        if (!pale) {
          ctx.fillStyle = 'rgba(255,255,255,0.85)';
          ctx.beginPath(); ctx.arc(cx + gx - ir * 0.3, 6 + gy * 0.6 - ir * 0.35, ir * 0.22, 0, U.TAU); ctx.fill();
        }
        // 上睑下垂：皮肤色带自上方遮盖
        if (lid > 0.02) {
          ctx.fillStyle = skin;
          ctx.fillRect(cx + gx * 0.5 - 7, 6 - 4.6, 14, lid * 5.2);
        }
        ctx.restore();
        // 上睑缘线
        inkStroke(ctx, [
          { x: cx - wing * 6, y: 6 - 2.2 + lid * 3.4 },
          { x: cx, y: 6 - 4 + lid * 3.6 },
          { x: cx + wing * 6, y: 6 - 2.4 + lid * 3.2 }
        ], Object.assign({ w: 1.7, alpha: 0.85 * a, seed: seedN }, trembleOpts));
        // 眼睑褶（中年以上的关键特征）
        inkStroke(ctx, [
          { x: cx - wing * 4.5, y: 6 - 6.5 + lid * 2 },
          { x: cx + wing * 3.5, y: 6 - 7.2 + lid * 2 }
        ], Object.assign({ w: 1, alpha: 0.4, seed: seedN + 10 }, trembleOpts));
        // 鱼尾纹
        if (E.crow) {
          inkStroke(ctx, [
            { x: cx + wing * 6.5, y: 4.5 }, { x: cx + wing * 10, y: 3.2 }
          ], Object.assign({ w: 0.9, alpha: 0.4, seed: seedN + 20 }, trembleOpts));
        }
      };
      oldEye(-13, -1, 1);
      oldEye(13, 1, 2);
      // 鼻
      inkStroke(ctx, [{ x: 0, y: 8 }, { x: -2.5, y: 17 }], Object.assign({ w: 1.7, alpha: 0.55, seed: 5 }, trembleOpts));
      // 法令纹（淡）
      inkStroke(ctx, [{ x: -9, y: 16 }, { x: -11, y: 24 }], Object.assign({ w: 0.9, alpha: 0.28, seed: 37 }, trembleOpts));
      inkStroke(ctx, [{ x: 9, y: 16 }, { x: 11, y: 24 }], Object.assign({ w: 0.9, alpha: 0.28, seed: 38 }, trembleOpts));
      // 口：mouth 曲线 + open 张口（说话时开合）
      const open = spec.talk ? 0.2 + 0.18 * Math.sin(t * 10.5) : (E.open || 0);
      if (open > 0.05) {
        ctx.fillStyle = mixc('#8a5a4a', '#8a7a6e', desat);
        ctx.beginPath(); ctx.ellipse(0, 27, 4.5 + open * 2, 2 + open * 5.5, 0, 0, U.TAU); ctx.fill();
        ctx.strokeStyle = ink; ctx.lineWidth = 1.3;
        ctx.beginPath(); ctx.ellipse(0, 27, 4.5 + open * 2, 2 + open * 5.5, 0, 0, U.TAU); ctx.stroke();
      } else {
        inkStroke(ctx, [
          { x: -8, y: 26 - (E.mouth || 0) * 4 },
          { x: 0, y: 27 + (E.mouth || 0) * 4 },
          { x: 8, y: 26 - (E.mouth || 0) * 4 }
        ], Object.assign({ w: 1.9, seed: 6 }, trembleOpts));
      }
    } else {
      // young：念念 —— 国漫少女
      const hairC = '#3d3428';
      // 脑后发量（比脸宽半圈，垂至下颌）
      ctx.fillStyle = hairC;
      ctx.beginPath();
      ctx.moveTo(-35, 16);
      ctx.quadraticCurveTo(-39, -40, 0, -50);
      ctx.quadraticCurveTo(39, -40, 35, 16);
      ctx.quadraticCurveTo(33, 26, 28, 30);
      ctx.quadraticCurveTo(31, 18, 29, 6);
      ctx.quadraticCurveTo(26, -18, 0, -24);
      ctx.quadraticCurveTo(-26, -18, -29, 6);
      ctx.quadraticCurveTo(-31, 18, -28, 30);
      ctx.quadraticCurveTo(-33, 26, -35, 16);
      ctx.fill();
      // 脸
      ctx.fillStyle = '#f6ecd8';
      ctx.beginPath(); ctx.ellipse(0, 8, 29, 33, 0, 0, U.TAU); ctx.fill();
      ctx.strokeStyle = ink; ctx.lineWidth = 1.9;
      ctx.beginPath(); ctx.ellipse(0, 8, 29, 33, 0, 0, U.TAU); ctx.stroke();
      // 刘海：中分拱形，三段圆弧发尖
      ctx.fillStyle = hairC;
      ctx.beginPath();
      ctx.moveTo(-29, 2);
      ctx.quadraticCurveTo(-31, -28, 0, -33);
      ctx.quadraticCurveTo(31, -28, 29, 2);
      // 三段发尖（右→左）
      ctx.quadraticCurveTo(24, -6, 19, -2);
      ctx.quadraticCurveTo(15, -12, 9, -8);
      ctx.quadraticCurveTo(4, -14, 0, -9);
      ctx.quadraticCurveTo(-4, -14, -9, -8);
      ctx.quadraticCurveTo(-15, -12, -19, -2);
      ctx.quadraticCurveTo(-24, -6, -29, 2);
      ctx.fill();
      // 侧发：两缕过颌的长发，尾端外卷
      ctx.beginPath();
      ctx.moveTo(-28, -4);
      ctx.quadraticCurveTo(-33, 14, -30, 30);
      ctx.quadraticCurveTo(-29, 36, -24, 34);
      ctx.quadraticCurveTo(-27, 18, -25, 0);
      ctx.quadraticCurveTo(-24, -6, -28, -4);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(28, -4);
      ctx.quadraticCurveTo(33, 14, 30, 30);
      ctx.quadraticCurveTo(29, 36, 24, 34);
      ctx.quadraticCurveTo(27, 18, 25, 0);
      ctx.quadraticCurveTo(24, -6, 28, -4);
      ctx.fill();
      // 发丝高光：头顶一道弧光 + 两缕细丝
      ctx.strokeStyle = 'rgba(255,244,220,0.22)'; ctx.lineWidth = 2.6; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(0, -8, 22, Math.PI * 1.25, Math.PI * 1.75); ctx.stroke();
      inkStroke(ctx, [{ x: -14, y: -28 }, { x: -16, y: -18 }], { w: 1.1, alpha: 0.3, color: 'rgba(255,244,220,0.5)', seed: 51 });
      inkStroke(ctx, [{ x: 14, y: -28 }, { x: 16, y: -18 }], { w: 1.1, alpha: 0.3, color: 'rgba(255,244,220,0.5)', seed: 52 });
      // 顶上的呆毛（一缕翘起的小发梢）
      inkStroke(ctx, [{ x: 2, y: -49 }, { x: 7, y: -58 }, { x: 1, y: -56 }], { w: 1.6, alpha: 0.9, color: hairC, seed: 53 });
      // 眉（细）
      if (E.brow) {
        const lift = E.brow;
        inkStroke(ctx, [{ x: -19, y: -9 - lift * 2 }, { x: -8, y: -7.5 - lift * 4.5 }], Object.assign({ w: 1.4, alpha: 0.8, seed: 41 }, trembleOpts || {}));
        inkStroke(ctx, [{ x: 19, y: -9 - lift * 2 }, { x: 8, y: -7.5 - lift * 4.5 }], Object.assign({ w: 1.4, alpha: 0.8, seed: 42 }, trembleOpts || {}));
      }
      // 眼：大眼（睫毛线+虹膜+双高光）/ 笑弧 / 闭眼
      const gy2 = E.gaze ? E.gaze[1] : 0;
      const youngEye = function (cx, wing, seedN) {
        if (E.eye === 'smile') {
          inkStroke(ctx, [
            { x: cx - 6, y: 8 }, { x: cx, y: 4 }, { x: cx + 6, y: 8 }
          ], Object.assign({ w: 2.2, alpha: 0.95, seed: seedN }, trembleOpts || {}));
          return;
        }
        if (E.eye === 'shut' || blinkNow) {
          // 闭眼：下弯睫线（哭/眨）
          const down = E.eye === 'shut' ? 1 : -0.4;
          inkStroke(ctx, [
            { x: cx - 6, y: 5 + down * 2.5 }, { x: cx, y: 7.5 + down * 1.5 }, { x: cx + 6, y: 5 + down * 2.5 }
          ], Object.assign({ w: 2.2, alpha: 0.95, seed: seedN }, trembleOpts || {}));
          inkStroke(ctx, [{ x: cx - 2, y: 10 }, { x: cx - 1, y: 12.5 }], { w: 1.2, alpha: 0.7, seed: seedN + 5 });
          return;
        }
        const lid = E.lid || 0;
        const iris = 5.6 * (E.iris || 1);
        const ey = 7 + gy2;
        // 眼白
        ctx.fillStyle = '#fdf9ee';
        ctx.beginPath(); ctx.ellipse(cx, ey, 7, 5.6, 0, 0, U.TAU); ctx.fill();
        // 虹膜（clip 进眼形）
        ctx.save();
        ctx.beginPath(); ctx.ellipse(cx, ey, 7, 5.6, 0, 0, U.TAU); ctx.clip();
        ctx.fillStyle = '#6b4f33';
        ctx.beginPath(); ctx.arc(cx, ey + 0.5, iris, 0, U.TAU); ctx.fill();
        // 虹膜外环（深）与内透（亮）
        ctx.strokeStyle = '#3f2e1c'; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.arc(cx, ey + 0.5, iris, 0, U.TAU); ctx.stroke();
        ctx.fillStyle = 'rgba(90,66,40,0.85)';
        ctx.beginPath(); ctx.arc(cx, ey + 0.5, iris * 0.55, 0, U.TAU); ctx.fill();
        ctx.fillStyle = '#241a10';
        ctx.beginPath(); ctx.arc(cx, ey + 0.5, iris * 0.34, 0, U.TAU); ctx.fill();
        // 双高光（国漫眼神的关键：大上高光 + 小下高光）
        ctx.fillStyle = 'rgba(255,255,255,0.95)';
        ctx.beginPath(); ctx.arc(cx - iris * 0.34, ey - iris * 0.4, iris * 0.3, 0, U.TAU); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.65)';
        ctx.beginPath(); ctx.arc(cx + iris * 0.32, ey + iris * 0.4, iris * 0.15, 0, U.TAU); ctx.fill();
        // 上睑下垂
        if (lid > 0.02) {
          ctx.fillStyle = '#f6ecd8';
          ctx.fillRect(cx - 7.5, ey - 6, 15, lid * 7);
        }
        ctx.restore();
        // 上睫毛线（粗，外眼角带小翼）
        inkStroke(ctx, [
          { x: cx - wing * 4.5, y: ey - 3.4 },
          { x: cx, y: ey - 5.6 },
          { x: cx + wing * 6.6, y: ey - 3.6 },
          { x: cx + wing * 8.2, y: ey - 4.6 }
        ], Object.assign({ w: 2.3, alpha: 0.95, seed: seedN }, trembleOpts || {}));
        // 下睑线（极淡）
        inkStroke(ctx, [
          { x: cx - wing * 4, y: ey + 4.6 }, { x: cx + wing * 4, y: ey + 4.6 }
        ], { w: 1, alpha: 0.28, seed: seedN + 3 });
      };
      youngEye(-13, -1, 43);
      youngEye(13, 1, 44);
      // 腮红
      const bl = E.blush == null ? 0.4 : E.blush;
      if (bl > 0.02) {
        ctx.fillStyle = 'rgba(212,106,95,' + bl + ')';
        ctx.beginPath(); ctx.ellipse(-19, 16, 5.5, 3.4, 0.15, 0, U.TAU); ctx.fill();
        ctx.beginPath(); ctx.ellipse(19, 16, 5.5, 3.4, -0.15, 0, U.TAU); ctx.fill();
      }
      // 泪（cry）：眼角水光 + 下颌将坠的泪珠
      if (E.tears) {
        ctx.strokeStyle = 'rgba(120,150,170,0.65)'; ctx.lineWidth = 2; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(-16, 12); ctx.lineTo(-17.5, 24); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(16, 12); ctx.lineTo(17.5, 24); ctx.stroke();
        const dropY = 30 + (t * 26) % 14;
        ctx.fillStyle = 'rgba(150,180,200,0.8)';
        ctx.beginPath(); ctx.ellipse(-17.5, 8 + dropY, 2.2, 3, 0, 0, U.TAU); ctx.fill();
      }
      // 口
      const open2 = spec.talk ? 0.3 + 0.25 * Math.sin(t * 11) : 0;
      if (open2 > 0.05) {
        ctx.fillStyle = '#a86a5c';
        ctx.beginPath(); ctx.ellipse(0, 23, 4, 2 + open2 * 4, 0, 0, U.TAU); ctx.fill();
      } else {
        inkStroke(ctx, [
          { x: -6.5, y: 20.5 - (E.mouth || 0) * 3 },
          { x: 0, y: 22.5 + (E.mouth || 0) * 4 },
          { x: 6.5, y: 20.5 - (E.mouth || 0) * 3 }
        ], Object.assign({ w: 2.1, seed: 8 }, trembleOpts || {}));
      }
    }
    ctx.restore();
  }

  // 兼容旧接口：kind 'old'|'young' 的默认脸
  function drawInkFace(ctx, x, y, s, kind, alpha) {
    inkFace(ctx, x, y, s, {
      kind: kind, expr: kind === 'young' ? 'smile' : 'calm', alpha: alpha
    });
  }

  // 人脸 → 未绣完的缎面（prog 0..1）；headSrc 可选：{img,sx,sy,sw[,dx,dy,dw]}
  // 带 dx/dy/dw 时淡出的 PNG 脸按该矩形绘制（与相框照片对位），并做圆形裁切
  function faceHoop(ctx, cx, cy, s, prog, headSrc) {
    const p = U.clamp(prog, 0, 1);
    if (p < 1) {
      if (headSrc && headSrc.img) {
        ctx.save();
        ctx.globalAlpha = 1 - p;
        const hasRect = headSrc.dx != null;
        if (hasRect) {
          const fcx = headSrc.dx + headSrc.dw / 2, fcy = headSrc.dy + headSrc.dw / 2;
          ctx.beginPath();
          ctx.arc(fcx, fcy, headSrc.dw * 0.52, 0, U.TAU);
          ctx.clip();
          ctx.drawImage(headSrc.img, headSrc.sx, headSrc.sy, headSrc.sw, headSrc.sw,
            headSrc.dx, headSrc.dy, headSrc.dw, headSrc.dw);
        } else {
          const dw = s * 0.86, dh = dw;
          ctx.drawImage(headSrc.img, headSrc.sx, headSrc.sy, headSrc.sw, headSrc.sw,
            cx - dw / 2, cy - dh / 2, dw, dh);
        }
        ctx.restore();
      } else {
        drawInkFace(ctx, cx, cy, s, 'young', 1 - p);
      }
    }
    if (p <= 0) return;
    ctx.save();
    // 缎面（肤色布）
    const rx = s * 0.34, ry = s * 0.4;
    ctx.globalAlpha = U.clamp(p * 1.4, 0, 1);
    const g = ctx.createRadialGradient(cx, cy - ry * 0.3, ry * 0.2, cx, cy, ry * 1.1);
    g.addColorStop(0, '#f2e6cd'); g.addColorStop(1, '#dfcfa8');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, U.TAU); ctx.fill();
    const pat = ctx.createPattern(silkCv, 'repeat');
    ctx.globalAlpha = 0.5 * U.clamp(p * 1.4, 0, 1);
    ctx.fillStyle = pat;
    ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, U.TAU); ctx.fill();
    ctx.globalAlpha = U.clamp(p * 1.4, 0, 1);
    // 绷子环
    ctx.strokeStyle = PALETTE.wood; ctx.lineWidth = 7;
    ctx.beginPath(); ctx.ellipse(cx, cy, rx + 6, ry + 6, 0, 0, U.TAU); ctx.stroke();
    // 已绣部分：一只眼（弧）、半道眉
    const vis = U.clamp((p - 0.3) / 0.4, 0, 1);
    if (vis > 0) {
      stitchPath(ctx, [
        { x: cx - s * 0.16, y: cy - s * 0.02 },
        { x: cx - s * 0.11, y: cy - s * 0.06 * vis },
        { x: cx - s * 0.05, y: cy - s * 0.02 }
      ], { color: PALETTE.ink, w: 6, gap: 2.6, alpha: vis, seed: 11 });
      stitchPath(ctx, [
        { x: cx + s * 0.06, y: cy - s * 0.02 },
        { x: cx + s * 0.11, y: cy - s * 0.05 * vis },
        { x: cx + s * 0.16, y: cy - s * 0.02 }
      ], { color: PALETTE.ink, w: 6, gap: 2.6, alpha: vis * 0.8, seed: 12 });
    }
    // 半道眉（只绣左边）
    const browVis = U.clamp((p - 0.15) / 0.3, 0, 1);
    if (browVis > 0) {
      backStitch(ctx, [
        { x: cx - s * 0.2, y: cy - s * 0.16 },
        { x: cx - s * 0.08, y: cy - s * 0.19 }
      ], { color: PALETTE.ink, alpha: browVis, w: 2 });
    }
    // 悬着的一根线
    if (p > 0.5) {
      ctx.globalAlpha = U.clamp((p - 0.5) * 2, 0, 1);
      ctx.strokeStyle = PALETTE.red; ctx.lineWidth = 1.8; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx + rx * 0.5, cy + ry * 0.2);
      ctx.quadraticCurveTo(cx + rx * 0.7, cy + ry * 0.8, cx + rx * 0.4, cy + ry * 1.15);
      ctx.stroke();
    }
    ctx.restore();
  }

  // ---------- 场景 ----------
  function grad(ctx, x0, y0, x1, y1, stops) {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    stops.forEach(function (s) { g.addColorStop(s[0], s[1]); });
    return g;
  }

  function drawFramePhoto(ctx, x, y, w, h, kind, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    ctx.fillStyle = PALETTE.woodDark;
    roundRect(ctx, x, y, w, h, 4); ctx.fill();
    ctx.fillStyle = '#e8dcc2';
    ctx.fillRect(x + 6, y + 6, w - 12, h - 12);
    // 人物相片：优先用 PNG 素材的头部裁切（加老照片做旧色调），无素材走程序化脸
    const headSrc = (kind === 'face' && XY.Actor) ? XY.Actor.headSource('niannian')
      : (kind === 'old' && XY.Actor) ? XY.Actor.headSource('xiuyun') : null;
    if (headSrc) {
      const ix = x + 6, iy = y + 6, iw = w - 12, ih = h - 12;
      ctx.save();
      ctx.beginPath(); ctx.rect(ix, iy, iw, ih); ctx.clip();
      // cover 适配：裁切方形铺满相框内区
      const s = Math.max(iw / headSrc.sw, ih / headSrc.sw);
      const dw = headSrc.sw * s, dh = headSrc.sw * s;
      ctx.drawImage(headSrc.img, headSrc.sx, headSrc.sy, headSrc.sw, headSrc.sw,
        ix + (iw - dw) / 2, iy + (ih - dh) / 2 - h * 0.04, dw, dh);
      // 老照片做旧：暖褐罩色 + 轻暗角
      ctx.fillStyle = 'rgba(122,88,42,0.22)';
      ctx.fillRect(ix, iy, iw, ih);
      const og = ctx.createRadialGradient(ix + iw / 2, iy + ih / 2, ih * 0.3, ix + iw / 2, iy + ih / 2, ih * 0.75);
      og.addColorStop(0, 'rgba(60,40,20,0)');
      og.addColorStop(1, 'rgba(60,40,20,0.28)');
      ctx.fillStyle = og;
      ctx.fillRect(ix, iy, iw, ih);
      ctx.restore();
    } else if (kind === 'face') drawInkFace(ctx, x + w / 2, y + h / 2 + 6, Math.min(w, h) * 0.62, 'young', 1);
    else if (kind === 'old') drawInkFace(ctx, x + w / 2, y + h / 2 + 6, Math.min(w, h) * 0.62, 'old', 1);
    else {
      ctx.fillStyle = 'rgba(150,130,95,0.5)';
      ctx.fillRect(x + 6, y + 6, w - 12, h - 12);
      ctx.fillStyle = 'rgba(90,75,50,0.6)';
      ctx.fillRect(x + w * 0.2, y + h * 0.35, w * 0.6, h * 0.45);
    }
    ctx.restore();
  }

  // 柳影（动态层：随风摆动，画在窗玻璃之上、窗棂之下）
  function windowDyn(ctx, t) {
    const wx = 830, wy = 90;
    ctx.save();
    ctx.globalAlpha = 0.5;
    const sway = Math.sin(t * 0.4) * 6;
    inkStroke(ctx, [{ x: wx + 70 + sway, y: wy + 10 }, { x: wx + 60 + sway, y: wy + 140 }], { w: 4, color: '#8fa27c', seed: 21 });
    for (let i = 0; i < 5; i++) {
      const ox = 30 + i * 14 + sway * (0.4 + i * 0.1);
      inkStroke(ctx, [{ x: wx + 70 + sway, y: wy + 18 + i * 6 }, { x: wx + 70 + ox - 40, y: wy + 150 + i * 12 }], { w: 2, color: '#9db389', alpha: 0.5, seed: 22 + i });
    }
    ctx.restore();
  }

  function drawHoopStand(ctx, cx, cy, t) {
    const P = PALETTE;
    // 立杆与底座
    ctx.fillStyle = P.woodDark;
    roundRect(ctx, cx - 7, cy + 80, 14, 210, 6); ctx.fill();
    roundRect(ctx, cx - 70, cy + 286, 140, 16, 8); ctx.fill();
    // 绣绷外环
    ctx.strokeStyle = P.wood; ctx.lineWidth = 12;
    ctx.beginPath(); ctx.ellipse(cx, cy, 168, 120, 0, 0, U.TAU); ctx.stroke();
    // 绷内缎面
    const g = ctx.createRadialGradient(cx - 40, cy - 40, 30, cx, cy, 180);
    g.addColorStop(0, '#f7f1e0'); g.addColorStop(1, '#e6d9ba');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(cx, cy, 162, 114, 0, 0, U.TAU); ctx.fill();
    const pat = ctx.createPattern(silkCv, 'repeat');
    ctx.save(); ctx.globalAlpha = 0.4; ctx.fillStyle = pat;
    ctx.beginPath(); ctx.ellipse(cx, cy, 162, 114, 0, 0, U.TAU); ctx.fill(); ctx.restore();
    // 绣到一半的牡丹（红缎面绣，左下方向）
    const petal = function (px, py, len, wid, angDeg, color) {
      const a = angDeg * Math.PI / 180;
      const d = { x: Math.cos(a), y: Math.sin(a) }, pr = { x: -d.y, y: d.x };
      const tip = { x: px + d.x * len / 2, y: py + d.y * len / 2 };
      const base = { x: px - d.x * len / 2, y: py - d.y * len / 2 };
      const s1 = U.sampleBezier(base,
        { x: base.x + pr.x * wid / 2 + d.x * len * .25, y: base.y + pr.y * wid / 2 + d.y * len * .25 },
        { x: tip.x + pr.x * wid * .32, y: tip.y + pr.y * wid * .32 }, tip, 12);
      const s2 = U.sampleBezier(tip,
        { x: tip.x - pr.x * wid * .32, y: tip.y - pr.y * wid * .32 },
        { x: base.x - pr.x * wid / 2 + d.x * len * .25, y: base.y - pr.y * wid / 2 + d.y * len * .25 }, base, 12);
      stitchPath(ctx, s1.concat(s2.slice(1)), { color: color, w: 12, gap: 3.6, seed: 31 });
    };
    petal(cx - 30, cy + 34, 92, 62, 150, P.red);
    petal(cx - 62, cy + 8, 78, 52, 190, P.redDeep);
    petal(cx + 6, cy + 46, 70, 46, 120, P.redLight);
    backStitch(ctx, [{ x: cx - 96, y: cy + 30 }, { x: cx - 20, y: cy + 82 }, { x: cx + 40, y: cy + 66 }], { color: P.redDeep, alpha: 0.6 });
    // 铅笔底稿（未绣区域）
    ctx.save();
    ctx.globalAlpha = 0.25; ctx.strokeStyle = P.ink; ctx.lineWidth = 1.6; ctx.setLineDash([5, 6]);
    ctx.beginPath(); ctx.ellipse(cx + 44, cy + 6, 52, 60, 0.5, 0, U.TAU); ctx.stroke();
    ctx.restore();
    // 夹子
    ctx.fillStyle = P.woodDark;
    roundRect(ctx, cx + 150, cy - 26, 14, 52, 5); ctx.fill();
    // 微微的绣线从绷边垂下
    ctx.strokeStyle = P.red; ctx.lineWidth = 1.6; ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.moveTo(cx - 150, cy + 80);
    ctx.quadraticCurveTo(cx - 158, cy + 130 + Math.sin(t * 0.8) * 3, cx - 146, cy + 168);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  function drawThreadBasket(ctx, x, y) {
    const P = PALETTE;
    ctx.save();
    ctx.fillStyle = '#b98d54';
    ctx.beginPath();
    ctx.ellipse(x, y, 92, 44, 0, 0, Math.PI); ctx.fill();
    ctx.strokeStyle = '#8a6236'; ctx.lineWidth = 3;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.ellipse(x, y, 92 - i * 3, 44 - i * 10, 0, Math.PI * 0.05, Math.PI * 0.95);
      ctx.stroke();
    }
    ctx.fillStyle = '#a97f48';
    ctx.beginPath(); ctx.ellipse(x, y - 34, 92, 30, 0, Math.PI, U.TAU); ctx.fill();
    // 线轴
    const cols = [P.red, P.moss, P.gold, P.redLight, '#7f5f9e', P.mossDeep];
    for (let i = 0; i < 6; i++) {
      const sx = x - 60 + i * 24, sy = y - 44 - (i % 2) * 8;
      ctx.fillStyle = '#d9c9a3';
      roundRect(ctx, sx - 6, sy - 10, 12, 26, 4); ctx.fill();
      ctx.fillStyle = cols[i];
      roundRect(ctx, sx - 4, sy - 6, 8, 18, 3); ctx.fill();
    }
    ctx.restore();
  }

  function drawOldPhone(ctx, x, y) {
    const P = PALETTE;
    ctx.save();
    ctx.fillStyle = '#3d4a3a';
    roundRect(ctx, x - 46, y - 34, 92, 68, 16); ctx.fill();
    ctx.fillStyle = '#2f3a2e';
    roundRect(ctx, x - 52, y - 52, 104, 22, 11); ctx.fill();
    ctx.strokeStyle = '#20281f'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x - 24, y + 8, 9, 0, U.TAU); ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y + 8, 9, 0, U.TAU); ctx.stroke();
    ctx.beginPath(); ctx.arc(x + 24, y + 8, 9, 0, U.TAU); ctx.stroke();
    // 便签
    ctx.fillStyle = '#f5efdf';
    ctx.save(); ctx.translate(x + 68, y - 10); ctx.rotate(0.06);
    ctx.fillRect(-16, -20, 32, 44);
    ctx.fillStyle = 'rgba(58,51,43,0.75)';
    ctx.font = '10px serif';
    ctx.fillText('念念', -12, -4);
    ctx.fillText('139…', -12, 8);
    ctx.restore();
    ctx.restore();
  }

  const BACKS = {};     // 静态层：只画一次，缓存到离屏画布
  const BACK_DYN = {};  // 动态层：每帧叠加
  const BACK_VIG = { silk: 0, black: 0, rain: 0.5, hoop: 0.28, dress: 0.5, room: 0.3, photowall: 0.32 };

  BACKS.silk = function (ctx) {
    ctx.fillStyle = grad(ctx, 0, 0, 0, H, [[0, '#f6f0e0'], [1, '#e9dec4']]);
    ctx.fillRect(0, 0, W, H);
    const pat = ctx.createPattern(silkCv, 'repeat');
    ctx.save(); ctx.globalAlpha = 0.5; ctx.fillStyle = pat; ctx.fillRect(0, 0, W, H); ctx.restore();
    paperPattern(ctx);
  };
  BACK_DYN.silk = function (ctx, t) {
    // 缓慢移动的缎面光泽
    const sx = (Math.sin(t * 0.18) * 0.5 + 0.5) * W;
    const g = ctx.createLinearGradient(sx - 300, 0, sx + 300, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.5, 'rgba(255,252,240,0.25)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  };

  BACKS.black = function (ctx) {
    ctx.fillStyle = '#0e0c0a';
    ctx.fillRect(0, 0, W, H);
    const pat = ctx.createPattern(paperCv, 'repeat');
    ctx.save(); ctx.globalAlpha = 0.25; ctx.fillStyle = pat; ctx.fillRect(0, 0, W, H); ctx.restore();
  };

  BACKS.rain = function (ctx) {
    ctx.fillStyle = grad(ctx, 0, 0, 0, H, [[0, '#232b33'], [0.7, '#2c333a'], [1, '#1b2026']]);
    ctx.fillRect(0, 0, W, H);
    // 远处屋脊
    ctx.fillStyle = '#151a1f';
    ctx.beginPath();
    ctx.moveTo(0, H);
    ctx.lineTo(0, 560);
    for (let x = 0; x <= W; x += 80) {
      ctx.quadraticCurveTo(x + 40, 520 - ((x / 80) % 2) * 26, x + 80, 548 - ((x / 80) % 2) * 14);
    }
    ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
    // 一扇亮着的窗
    const wx = 920, wy = 260;
    ctx.fillStyle = 'rgba(255,214,140,0.85)';
    ctx.fillRect(wx, wy, 74, 96);
    ctx.strokeStyle = '#0d1114'; ctx.lineWidth = 6;
    ctx.strokeRect(wx, wy, 74, 96);
    ctx.beginPath();
    ctx.moveTo(wx + 37, wy); ctx.lineTo(wx + 37, wy + 96);
    ctx.moveTo(wx, wy + 48); ctx.lineTo(wx + 74, wy + 48);
    ctx.lineWidth = 4; ctx.stroke();
    const gl = ctx.createRadialGradient(wx + 37, wy + 48, 20, wx + 37, wy + 48, 260);
    gl.addColorStop(0, 'rgba(255,210,130,0.18)'); gl.addColorStop(1, 'rgba(255,210,130,0)');
    ctx.fillStyle = gl; ctx.fillRect(0, 0, W, H);
  };
  BACK_DYN.rain = function (ctx, t) {
    // 窗光呼吸
    const wx = 920, wy = 260;
    const flick = 0.15 + 0.15 * Math.sin(t * 2.7);
    ctx.fillStyle = 'rgba(255,214,140,' + flick + ')';
    ctx.fillRect(wx, wy, 74, 96);
    // 雨丝
    ctx.strokeStyle = 'rgba(200,215,225,0.20)';
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 90; i++) {
      const rx = U.noise2(i, 1, 9) * W;
      const speed = 420 + U.noise2(i, 2, 9) * 300;
      const ry = ((U.noise2(i, 3, 9) * H + t * speed) % (H + 60)) - 30;
      const len = 14 + U.noise2(i, 4, 9) * 16;
      ctx.beginPath();
      ctx.moveTo(rx, ry);
      ctx.lineTo(rx - len * 0.22, ry + len);
      ctx.stroke();
    }
  };

  BACKS.hoop = function (ctx) {
    ctx.fillStyle = grad(ctx, 0, 0, 0, H, [[0, '#e9dec6'], [1, '#d9cbab']]);
    ctx.fillRect(0, 0, W, H);
    paperPattern(ctx);
    drawHoopStand(ctx, 620, 340, 0);
    // 顶针与针
    ctx.save();
    ctx.translate(880, 470);
    ctx.rotate(0.5);
    ctx.fillStyle = '#c9a86a';
    roundRect(ctx, -10, -16, 20, 32, 8); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(-6, -12, 4, 24);
    ctx.restore();
    needle(ctx, 820, 420, PALETTE.red);
  };

  BACKS.dress = function (ctx) {
    ctx.fillStyle = grad(ctx, 0, 0, 0, H, [[0, '#241b16'], [1, '#170f0c']]);
    ctx.fillRect(0, 0, W, H);
    const gl = ctx.createRadialGradient(640, 300, 60, 640, 340, 520);
    gl.addColorStop(0, 'rgba(255,220,170,0.22)'); gl.addColorStop(1, 'rgba(255,220,170,0)');
    ctx.fillStyle = gl; ctx.fillRect(0, 0, W, H);
    // 衣架
    ctx.strokeStyle = '#5a4126'; ctx.lineWidth = 8;
    ctx.beginPath(); ctx.moveTo(640, 60); ctx.lineTo(640, 120); ctx.stroke();
    ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(560, 96); ctx.lineTo(720, 96); ctx.stroke();
    // 红嫁衣（旗袍式轮廓）
    ctx.fillStyle = grad(ctx, 500, 0, 780, 0, [[0, '#8c2b22'], [0.5, '#c04336'], [1, '#8c2b22']]);
    ctx.beginPath();
    ctx.moveTo(600, 108);
    ctx.quadraticCurveTo(560, 220, 578, 360);
    ctx.quadraticCurveTo(566, 500, 600, 640);
    ctx.lineTo(680, 640);
    ctx.quadraticCurveTo(714, 500, 702, 360);
    ctx.quadraticCurveTo(720, 220, 680, 108);
    ctx.closePath(); ctx.fill();
    // 领口
    ctx.strokeStyle = '#e8b96a'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(640, 130, 26, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
    // 领口海棠（未完）
    const petal = U.sampleBezier({ x: 628, y: 170 }, { x: 616, y: 196 }, { x: 620, y: 216 }, { x: 634, y: 226 }, 10)
      .concat(U.sampleBezier({ x: 634, y: 226 }, { x: 646, y: 214 }, { x: 648, y: 192 }, { x: 628, y: 170 }, 10).slice(1));
    stitchPath(ctx, petal, { color: '#e8dfc8', w: 8, gap: 3, seed: 41 });
    backStitch(ctx, [{ x: 640, y: 226 }, { x: 652, y: 250 }], { color: '#e8dfc8', alpha: 0.7 });
  };

  BACKS.room = function (ctx) {
    const P = PALETTE;
    // 墙与地板
    ctx.fillStyle = grad(ctx, 0, 0, 0, H, [[0, '#eee3ca'], [0.72, '#e6d8bb'], [0.74, '#c8b28a'], [1, '#b39b72']]);
    ctx.fillRect(0, 0, W, H);
    // 地板条纹
    ctx.strokeStyle = 'rgba(122,94,60,0.35)'; ctx.lineWidth = 2;
    for (let i = 0; i < 7; i++) {
      const y = 536 + i * 26;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y + 6); ctx.stroke();
    }
    // 踢脚线
    ctx.fillStyle = 'rgba(107,79,47,0.5)';
    ctx.fillRect(0, 524, W, 10);
    // 窗（右）——玻璃底色+窗棂+光柱为静态，柳影在动态层
    ctx.fillStyle = grad(ctx, 830, 90, 830, 420, [[0, '#dce8d2'], [1, '#c4d4b8']]);
    ctx.fillRect(830, 90, 330, 330);
    ctx.strokeStyle = P.wood; ctx.lineWidth = 10;
    ctx.strokeRect(830, 90, 330, 330);
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(830 + 165, 90); ctx.lineTo(830 + 165, 90 + 330);
    ctx.moveTo(830, 90 + 165); ctx.lineTo(830 + 330, 90 + 165);
    ctx.stroke();
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(830 + 82, 90); ctx.lineTo(830 + 82, 90 + 330);
    ctx.moveTo(830 + 248, 90); ctx.lineTo(830 + 248, 90 + 330);
    ctx.moveTo(830, 90 + 82); ctx.lineTo(830 + 330, 90 + 82);
    ctx.moveTo(830, 90 + 248); ctx.lineTo(830 + 330, 90 + 248);
    ctx.stroke();
    ctx.save();
    const lg = grad(ctx, 830, 130, 510, H, [[0, 'rgba(255,246,214,0.28)'], [1, 'rgba(255,246,214,0)']]);
    ctx.fillStyle = lg;
    ctx.beginPath();
    ctx.moveTo(830, 110); ctx.lineTo(950, 110);
    ctx.lineTo(630, H); ctx.lineTo(470, H);
    ctx.closePath(); ctx.fill();
    ctx.restore();
    // 照片墙（左）
    drawFramePhoto(ctx, 100, 160, 110, 140, 'old');
    drawFramePhoto(ctx, 232, 130, 150, 190, 'face');
    drawFramePhoto(ctx, 406, 168, 104, 128, 'group');
    ctx.save();
    ctx.globalAlpha = 0.5; ctx.fillStyle = P.inkLight;
    setFont(ctx, 13, { align: 'center' });
    ctx.fillText('念念 · 满月', 307, 342);
    ctx.restore();
    // 门（最左）与药袋
    ctx.fillStyle = grad(ctx, 0, 0, 60, 0, [[0, '#5a4534'], [1, '#7a5d40']]);
    ctx.fillRect(-20, 60, 100, 470);
    ctx.strokeStyle = 'rgba(40,28,18,0.6)'; ctx.lineWidth = 3;
    ctx.strokeRect(30, 90, 40, 200);
    ctx.beginPath(); ctx.arc(62, 320, 4, 0, U.TAU); ctx.fillStyle = '#d9c9a3'; ctx.fill();
    // 药袋挂在门边
    ctx.save();
    ctx.translate(78, 430); ctx.rotate(0.05);
    ctx.fillStyle = '#f0ead8';
    ctx.beginPath();
    ctx.moveTo(-26, -34); ctx.lineTo(26, -34); ctx.lineTo(30, 40); ctx.lineTo(-30, 40);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(107,79,47,0.6)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.strokeStyle = P.red; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-8, -10); ctx.lineTo(8, -10); ctx.moveTo(0, -18); ctx.lineTo(0, -2); ctx.stroke();
    ctx.restore();
    // 绣架（中）
    drawHoopStand(ctx, 660, 300, 0);
    // 线笸箩（左下）
    drawThreadBasket(ctx, 250, 560);
    // 电话桌（右下）
    ctx.fillStyle = P.woodDark;
    roundRect(ctx, 920, 500, 190, 18, 6); ctx.fill();
    roundRect(ctx, 936, 518, 14, 60, 4); ctx.fill();
    roundRect(ctx, 1100, 518, 14, 60, 4); ctx.fill();
    drawOldPhone(ctx, 1010, 478);
    // 窗台（右，放顶针）
    ctx.fillStyle = P.wood;
    roundRect(ctx, 820, 402, 360, 16, 5); ctx.fill();
    ctx.fillStyle = '#c9a86a';
    ctx.save(); ctx.translate(1070, 394); ctx.rotate(0.35);
    roundRect(ctx, -9, -13, 18, 26, 8); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.fillRect(-5, -9, 4, 18);
    ctx.restore();
  };
  BACK_DYN.room = function (ctx, t) {
    // 柳影
    windowDyn(ctx, t);
    // 光柱中的浮尘
    ctx.save();
    for (let i = 0; i < 16; i++) {
      const seedX = U.noise2(i, 7, 12), seedY = U.noise2(i, 8, 12);
      const px = 560 - seedX * 380 + Math.sin(t * 0.5 + i) * 8;
      const py = 140 + seedY * 440;
      ctx.globalAlpha = 0.16 + 0.14 * Math.sin(t * 1.2 + i * 2.2);
      ctx.fillStyle = '#fff6dc';
      ctx.beginPath(); ctx.arc(px, py, 1.6 + U.noise2(i, 9, 12) * 1.6, 0, U.TAU); ctx.fill();
    }
    ctx.restore();
  };

  BACKS.photowall = function (ctx, t) {
    ctx.fillStyle = grad(ctx, 0, 0, 0, H, [[0, '#e8dcbf'], [1, '#d6c6a0']]);
    ctx.fillRect(0, 0, W, H);
    paperPattern(ctx);
    drawFramePhoto(ctx, 130, 200, 220, 280, 'old');
    drawFramePhoto(ctx, 460, 160, 300, 380, 'face');
    drawFramePhoto(ctx, 880, 210, 220, 280, 'group');
    ctx.save();
    ctx.globalAlpha = 0.55; ctx.fillStyle = PALETTE.inkLight;
    setFont(ctx, 16, { align: 'center' });
    ctx.fillText('一九六八 · 出嫁', 240, 512);
    ctx.fillText('念念 · 满月', 610, 572);
    ctx.restore();
  };

  // ---------- 氛围层：季节着色 / 傍晚 / 回忆滤镜 / 暗角 ----------
  function applyMood(ctx, opts, name) {
    opts = opts || {};
    // 色彩即病程：四季着色（夏蝉金 / 秋褐 / 冬灰白）
    if (opts.season === 'summer') {
      ctx.fillStyle = 'rgba(255,196,90,0.10)'; ctx.fillRect(0, 0, W, H);
    } else if (opts.season === 'autumn') {
      ctx.fillStyle = 'rgba(150,92,38,0.14)'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(60,40,20,0.06)'; ctx.fillRect(0, 0, W, H);
    } else if (opts.season === 'winter') {
      ctx.fillStyle = 'rgba(128,148,166,0.16)'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(250,250,255,0.05)'; ctx.fillRect(0, 0, W, H);
    }
    if (opts.evening) {
      ctx.fillStyle = 'rgba(90,45,15,0.20)';
      ctx.fillRect(0, 0, W, H);
      const lamp = ctx.createRadialGradient(660, 330, 30, 660, 330, 420);
      lamp.addColorStop(0, 'rgba(255,196,110,0.30)'); lamp.addColorStop(1, 'rgba(255,196,110,0)');
      ctx.fillStyle = lamp; ctx.fillRect(0, 0, W, H);
    }
    if (opts.flashback) {
      // 回忆滤镜：泛白 + 白边
      ctx.fillStyle = 'rgba(250,246,234,0.16)'; ctx.fillRect(0, 0, W, H);
      const fe = 70;
      const tg = grad(ctx, 0, 0, 0, fe, [[0, 'rgba(250,246,234,0.9)'], [1, 'rgba(250,246,234,0)']]);
      ctx.fillStyle = tg; ctx.fillRect(0, 0, W, fe);
      const bg2 = grad(ctx, 0, H - fe, 0, H, [[0, 'rgba(250,246,234,0)'], [1, 'rgba(250,246,234,0.9)']]);
      ctx.fillStyle = bg2; ctx.fillRect(0, H - fe, W, fe);
    }
    const v = BACK_VIG[name];
    if (v) vignette(ctx, v);
  }

  // ---------- 粒子层：夏夜光斑 / 秋落叶 / 冬雪 ----------
  let partKind = '', partPool = [], partLastT = 0;
  function rebuildParts(kind) {
    partKind = kind; partPool = [];
    const r = U.rng(kind === 'snow' ? 5 : kind === 'leaves' ? 9 : 13);
    const n = kind === 'snow' ? 46 : kind === 'leaves' ? 18 : 26;
    for (let i = 0; i < n; i++) {
      partPool.push({
        x: r() * W,
        y: r() * H,
        v: 0.5 + r() * 1,
        ph: r() * U.TAU,
        s: 0.6 + r() * 0.9
      });
    }
  }
  function drawParts(ctx, kind, t) {
    if (kind !== partKind) rebuildParts(kind);
    const dt = U.clamp(t - partLastT, 0, 0.1);
    partLastT = t;
    if (kind === 'cicada') {
      // 夏夜光斑：缓慢上浮、明灭
      for (let i = 0; i < partPool.length; i++) {
        const p = partPool[i];
        p.y -= p.v * 14 * dt; p.x += Math.sin(t * 0.6 + p.ph) * 8 * dt;
        if (p.y < -10) p.y = H + 10;
        const a = 0.10 + 0.16 * (0.5 + 0.5 * Math.sin(t * (1.4 + p.s) + p.ph * 3));
        ctx.fillStyle = 'rgba(255,232,150,' + a.toFixed(3) + ')';
        ctx.beginPath(); ctx.arc(p.x, p.y, (1.2 + p.s * 1.8) * p.s, 0, U.TAU); ctx.fill();
      }
    } else if (kind === 'leaves') {
      // 秋落叶：旋转下坠
      for (let i = 0; i < partPool.length; i++) {
        const p = partPool[i];
        p.y += (34 + p.v * 30) * dt; p.x += Math.sin(t * 1.1 + p.ph) * 26 * dt;
        if (p.y > H + 20) { p.y = -20; p.x = Math.random() * W; }
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(t * (0.8 + p.v) + p.ph);
        ctx.fillStyle = p.s > 0.9 ? 'rgba(176,130,74,0.55)' : 'rgba(140,107,62,0.45)';
        ctx.beginPath(); ctx.ellipse(0, 0, 7 * p.s + 3, 3 * p.s + 1.4, 0, 0, U.TAU); ctx.fill();
        ctx.restore();
      }
    } else if (kind === 'snow') {
      // 冬雪：飘摇下落
      for (let i = 0; i < partPool.length; i++) {
        const p = partPool[i];
        p.y += (16 + p.v * 22) * dt; p.x += Math.sin(t * 0.7 + p.ph) * 14 * dt;
        if (p.y > H + 8) { p.y = -8; p.x = Math.random() * W; }
        ctx.fillStyle = 'rgba(250,250,252,' + (0.35 + p.s * 0.4).toFixed(3) + ')';
        ctx.beginPath(); ctx.arc(p.x, p.y, (1 + p.s * 2.2) * p.s, 0, U.TAU); ctx.fill();
      }
    }
  }

  // ---------- 场景总绘制 ----------
  const backCache = {};
  function draw(ctx, name, t, opts) {
    opts = opts || {};
    if (img[name]) {
      const im = img[name];
      const s = Math.max(W / im.width, H / im.height);
      const dw = im.width * s, dh = im.height * s;
      ctx.drawImage(im, (W - dw) / 2, (H - dh) / 2, dw, dh);
      applyMood(ctx, opts, name);
      if (opts.particles) drawParts(ctx, opts.particles, t);
      return;
    }
    // 静态层缓存：只渲染一次
    let cv = backCache[name];
    if (!cv) {
      cv = document.createElement('canvas');
      cv.width = W; cv.height = H;
      (BACKS[name] || BACKS.silk)(cv.getContext('2d'), t, opts);
      backCache[name] = cv;
    }
    ctx.drawImage(cv, 0, 0);
    if (BACK_DYN[name]) BACK_DYN[name](ctx, t, opts);
    applyMood(ctx, opts, name);
    if (opts.particles) drawParts(ctx, opts.particles, t);
  }

  return {
    init, draw, inkStroke, stitchPath, backStitch, prickedDot,
    setFont, wrapText, panel, roundRect, vignette, paperPattern, mixc,
    inkFace, drawInkFace, faceHoop, needle, titleStitch, grad,
    invalidateBackCache: function () { for (var k in backCache) delete backCache[k]; },
    _silkTex: function () { return silkCv; },
    PALETTE, W, H, img
  };
})();
