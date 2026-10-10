"use strict";
/* 绣忆 · album.js — 记忆相册与「存档即遗忘」
   收集的记忆会在章节末被悄悄拆改（corrupted）：
   文字被改写、影像褪色、原文只剩一道鬼影划痕。 */
XY.Album = (function () {
  const U = XY.Util, A = XY.Art, Au = XY.Audio;
  const KEY = 'xiuyi_save_v2';
  const KEY_V1 = 'xiuyi_save_v1';

  let collected = {};   // id -> { corrupted: bool }
  let order = [];
  let payload = null;   // 最近一次读档数据

  let isOpen_ = false, modal = true, onDoneCb = null;
  let view = 'grid', detailId = null;
  let revealT = 0, hoverCell = -1;

  // ---------- 存档 ----------
  function init() {
    try {
      const raw = localStorage.getItem(KEY) || localStorage.getItem(KEY_V1); // 旧档自动迁移
      payload = raw ? JSON.parse(raw) : null;
    } catch (e) { payload = null; }
  }
  function persistExtra(extra) {
    try {
      const data = Object.assign({}, extra, { memories: serialize() });
      payload = data;
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch (e) {}
  }
  function serialize() {
    const m = {};
    order.forEach(function (id) { m[id] = { corrupted: !!collected[id].corrupted }; });
    return m;
  }
  function restoreFrom(mem) {
    collected = {}; order = [];
    if (mem) Object.keys(mem).forEach(function (id) {
      if (XY.Story.MEMORIES[id]) { collected[id] = { corrupted: !!mem[id].corrupted }; order.push(id); }
    });
  }
  function reset() {
    collected = {}; order = [];
    try { localStorage.removeItem(KEY); } catch (e) {}
    payload = null;
  }
  function hasSave() { return !!payload && !!payload.started; }

  // ---------- 收集 ----------
  function has(id) { return !!collected[id]; }
  function add(id) {
    if (collected[id] || !XY.Story.MEMORIES[id]) return false;
    collected[id] = { corrupted: false };
    order.push(id);
    return true;
  }
  function applyCorruption(ids) {
    (ids || []).forEach(function (id) {
      if (collected[id]) collected[id].corrupted = true;
    });
  }
  function count() { return order.length; }

  // ---------- 覆盖层 ----------
  const CLOSE = { x: 1024, y: 118, w: 46, h: 46 };
  const BACK = { x: 240, y: 586, w: 130, h: 46 };
  function cellRect(i) {
    return { x: 240 + (i % 3) * 275, y: 200 + Math.floor(i / 3) * 212, w: 250, h: 182 };
  }

  function open(opts) {
    opts = opts || {};
    isOpen_ = true; modal = opts.modal !== false;
    onDoneCb = opts.onDone || null;
    view = 'grid'; detailId = null;
    revealT = opts.revealCorrupt ? 2.2 : 0;
  }
  function isOpen() { return isOpen_; }
  function close() {
    if (!isOpen_) return;
    isOpen_ = false;
    if (onDoneCb) { const cb = onDoneCb; onDoneCb = null; cb(); }
  }

  function update(dt) { if (revealT > 0) revealT = Math.max(0, revealT - dt); }

  // ---------- 小图标 ----------
  function glyph(ctx, type, x, y, s, alpha) {
    const P = A.PALETTE;
    ctx.save();
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    ctx.translate(x, y); ctx.scale(s / 60, s / 60);
    ctx.lineWidth = 3; ctx.strokeStyle = P.ink; ctx.fillStyle = 'rgba(0,0,0,0)';
    if (type === 'hoop') {
      ctx.strokeStyle = P.wood;
      ctx.beginPath(); ctx.ellipse(0, 0, 30, 24, 0, 0, U.TAU); ctx.stroke();
      ctx.fillStyle = '#efe6cd';
      ctx.beginPath(); ctx.ellipse(0, 0, 24, 18, 0, 0, U.TAU); ctx.fill();
      ctx.strokeStyle = P.red; ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.arc(0, 0, 9, 0.4, Math.PI - 0.4); ctx.stroke();
    } else if (type === 'thimble') {
      ctx.fillStyle = P.gold;
      A.roundRect(ctx, -14, -20, 28, 40, 10); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.fillRect(-8, -14, 5, 26);
      ctx.fillStyle = 'rgba(90,70,40,0.5)';
      for (let r = 0; r < 3; r++) for (let c = 0; c < 2; c++) {
        ctx.beginPath(); ctx.arc(-4 + c * 8, -10 + r * 8, 1.6, 0, U.TAU); ctx.fill();
      }
    } else if (type === 'basket') {
      ctx.fillStyle = '#b98d54';
      ctx.beginPath(); ctx.ellipse(0, 6, 30, 18, 0, 0, Math.PI); ctx.fill();
      ctx.strokeStyle = '#8a6236';
      ctx.beginPath(); ctx.ellipse(0, 6, 22, 11, 0, 0, Math.PI); ctx.stroke();
      ctx.strokeStyle = P.red;
      ctx.beginPath(); ctx.moveTo(-8, 2); ctx.lineTo(8, -4); ctx.stroke();
      ctx.strokeStyle = P.moss;
      ctx.beginPath(); ctx.moveTo(-10, -6); ctx.lineTo(6, -10); ctx.stroke();
    } else if (type === 'photo') {
      ctx.fillStyle = P.woodDark;
      ctx.fillRect(-26, -22, 52, 44);
      ctx.fillStyle = '#e8dcc2';
      ctx.fillRect(-20, -16, 40, 32);
      ctx.strokeStyle = P.ink; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 2, 8, 0, U.TAU); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, -8, 6, Math.PI, U.TAU); ctx.stroke();
    } else if (type === 'phone') {
      ctx.fillStyle = '#3d4a3a';
      A.roundRect(ctx, -22, -16, 44, 32, 8); ctx.fill();
      ctx.fillStyle = '#2f3a2e';
      A.roundRect(ctx, -26, -26, 52, 12, 6); ctx.fill();
      ctx.strokeStyle = '#20281f';
      ctx.beginPath(); ctx.arc(-9, 4, 4, 0, U.TAU); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 4, 4, 0, U.TAU); ctx.stroke();
      ctx.beginPath(); ctx.arc(9, 4, 4, 0, U.TAU); ctx.stroke();
    } else if (type === 'medicine') {
      ctx.fillStyle = '#f0ead8';
      ctx.beginPath();
      ctx.moveTo(-16, -18); ctx.lineTo(16, -18); ctx.lineTo(19, 20); ctx.lineTo(-19, 20);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(107,79,47,0.6)'; ctx.lineWidth = 2; ctx.stroke();
      ctx.strokeStyle = P.red; ctx.lineWidth = 3.4;
      ctx.beginPath(); ctx.moveTo(-5, -6); ctx.lineTo(5, -6); ctx.moveTo(0, -11); ctx.lineTo(0, -1); ctx.stroke();
    }
    ctx.restore();
  }

  function draw(ctx) {
    const P = A.PALETTE;
    // 遮罩
    ctx.save();
    ctx.fillStyle = 'rgba(20,14,8,0.55)';
    ctx.fillRect(0, 0, 1280, 720);
    A.panel(ctx, 190, 76, 900, 574);
    A.setFont(ctx, 30, { weight: 'bold', align: 'left' });
    ctx.fillStyle = P.ink;
    ctx.fillText('记忆相册', 240, 132);
    A.setFont(ctx, 15, { align: 'left' });
    ctx.fillStyle = P.inkLight;
    ctx.fillText(count() + ' / ' + Object.keys(XY.Story.MEMORIES).length + ' 页', 376, 130);

    // 收集进度：底衬 + 已完成段，用绣线表达「收针了几件」
    const memTotal = Object.keys(XY.Story.MEMORIES).length;
    const memPct = memTotal ? Math.min(1, count() / memTotal) : 0;
    A.divider(ctx, 240, 154, 240, { color: P.inkLight, alpha: 0.16, w: 2, n: 16, fade: false });
    if (memPct > 0) {
      A.divider(ctx, 240, 154, 240 * memPct,
        { color: P.red, alpha: 0.72, w: 2.6, n: Math.max(1, Math.round(16 * memPct)), fade: false });
    }
    if (revealT > 0) {
      ctx.fillStyle = 'rgba(140,43,34,' + Math.min(0.85, revealT) + ')';
      A.setFont(ctx, 17, { align: 'left' });
      ctx.fillText('……有哪几页，不大对劲了。', 470, 130);
    }
    // 关闭
    A.panel(ctx, CLOSE.x, CLOSE.y, CLOSE.w, CLOSE.h, { fill: 'rgba(240,232,214,0.9)' });
    A.setFont(ctx, 22, { align: 'center' });
    ctx.fillStyle = P.ink;
    ctx.fillText('✕', CLOSE.x + CLOSE.w / 2, CLOSE.y + 31);

    if (view === 'grid') {
      const total = Math.max(6, count());
      for (let i = 0; i < total; i++) {
        const r = cellRect(i);
        const id = order[i];
        if (!id) {
          ctx.save();
          ctx.globalAlpha = 0.35;
          ctx.setLineDash([6, 6]);
          ctx.strokeStyle = P.inkLight; ctx.lineWidth = 1.6;
          A.roundRect(ctx, r.x, r.y, r.w, r.h, 8); ctx.stroke();
          A.setFont(ctx, 15, { align: 'center' });
          ctx.fillStyle = P.inkLight;
          ctx.fillText('（未收针）', r.x + r.w / 2, r.y + r.h / 2);
          ctx.restore();
          continue;
        }
        const mem = XY.Story.MEMORIES[id];
        const cor = collected[id].corrupted;
        const fade = cor ? 0.6 : 1;
        const hov = hoverCell === i;
        ctx.save();
        if (hov) {
          ctx.translate(0, -3);
          // 悬停：卡片下方补一层更深的投影，强化「浮起」手感
          ctx.save();
          ctx.shadowColor = 'rgba(30,20,10,0.55)';
          ctx.shadowBlur = 26; ctx.shadowOffsetY = 12;
          ctx.fillStyle = 'rgba(0,0,0,0.4)';
          A.roundRect(ctx, r.x, r.y, r.w, r.h, 10); ctx.fill();
          ctx.restore();
        }
        A.panel(ctx, r.x, r.y, r.w, r.h, {
          fill: cor ? 'rgba(238,226,203,' + fade + ')' : (hov ? 'rgba(250,245,233,0.97)' : undefined),
          border: cor ? 'rgba(140,43,34,0.55)' : (hov ? 'rgba(176,58,46,0.5)' : undefined),
          bw: hov ? 1.6 : 2
        });
        // 状态徽章：左上角小圆点，完好=苔绿、已拆改=朱砂
        ctx.save();
        ctx.beginPath(); ctx.arc(r.x + 17, r.y + 17, 5, 0, U.TAU);
        ctx.fillStyle = cor ? P.red : P.moss; ctx.fill();
        ctx.globalAlpha = 0.3;
        ctx.beginPath(); ctx.arc(r.x + 17, r.y + 17, 8.5, 0, U.TAU);
        ctx.strokeStyle = cor ? P.red : P.moss; ctx.lineWidth = 1.4; ctx.stroke();
        ctx.restore();
        glyph(ctx, mem.icon, r.x + r.w / 2, r.y + 74, 78, cor ? 0.55 : 1);
        A.setFont(ctx, 21, { weight: 'bold', align: 'center' });
        ctx.fillStyle = cor ? 'rgba(107,79,47,' + (0.75) + ')' : P.ink;
        ctx.fillText(mem.title, r.x + r.w / 2, r.y + r.h - 24);
        if (cor) {
          // 红线拆封 ×
          A.stitchPath(ctx, [
            { x: r.x + r.w - 54, y: r.y + 18 }, { x: r.x + r.w - 22, y: r.y + 46 }
          ], { color: P.red, w: 8, gap: 4, alpha: 0.9, seed: 51 });
          A.stitchPath(ctx, [
            { x: r.x + r.w - 54, y: r.y + 46 }, { x: r.x + r.w - 22, y: r.y + 18 }
          ], { color: P.red, w: 8, gap: 4, alpha: 0.9, seed: 52 });
          if (revealT > 0) {
            ctx.globalAlpha = Math.min(1, revealT) * (0.6 + 0.4 * Math.sin(U.TAU * revealT * 3));
            ctx.strokeStyle = P.red; ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(r.x + r.w / 2, r.y + r.h / 2, 96, 0, U.TAU);
            ctx.stroke();
          }
        }
        ctx.restore();
      }
    } else {
      // 详情页
      const mem = XY.Story.MEMORIES[detailId];
      const cor = collected[detailId] && collected[detailId].corrupted;
      A.panel(ctx, 240, 170, 800, 396, { fill: cor ? 'rgba(236,222,196,0.96)' : undefined });

      // 元信息行：填住面板顶部空白，同时给出编号与状态
      const memIdx = order.indexOf(detailId) + 1;
      A.setFont(ctx, 13, { align: 'left' });
      ctx.fillStyle = cor ? P.redDeep : P.inkLight;
      ctx.fillText('第 ' + memIdx + ' 件 · ' + (cor ? '已拆改' : '已收针'), 440, 214);

      // 标题下绣线：把元信息与标题分隔开
      A.divider(ctx, 440, 232, 300, { color: P.inkLight, alpha: 0.3, w: 1.6 });

      // 右侧缠枝纹样：填充面板右缘的空白，呼应苏绣缠枝纹（正弦取点保证曲线平滑）
      const vine = [];
      for (let vi = 0; vi <= 12; vi++) {
        const vt = vi / 12;
        vine.push({ x: 990 + Math.sin(vt * Math.PI * 3) * 16, y: 250 + vt * 258 });
      }
      A.stitchPath(ctx, vine, { color: P.mossDeep, w: 4, gap: 7, alpha: 0.13, seed: 91 });

      // 左下角针脚装饰：与对话框角标同一套语言
      ctx.save();
      ctx.strokeStyle = 'rgba(176,58,46,0.4)';
      ctx.lineWidth = 2; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(262, 538); ctx.lineTo(262, 544); ctx.lineTo(268, 544);
      ctx.stroke();
      ctx.restore();

      glyph(ctx, mem.icon, 330, 300, 120, cor ? 0.5 : 1);
      A.setFont(ctx, 30, { weight: 'bold', align: 'left' });
      ctx.fillStyle = A.PALETTE.ink;
      ctx.fillText(mem.title, 440, 250);
      A.setFont(ctx, 24, { align: 'left' });
      const showText = cor ? mem.corruptText : mem.text;
      const lines = A.wrapText(ctx, showText, 640);
      ctx.fillStyle = cor ? 'rgba(122,84,50,0.95)' : 'rgba(58,51,43,0.95)';
      lines.forEach(function (ln, i) { ctx.fillText(ln, 440, 306 + i * 40); });
      if (cor) {
        // 原文鬼影（划掉）
        const orig = A.wrapText(ctx, mem.text, 640);
        ctx.save();
        ctx.globalAlpha = 0.34;
        ctx.fillStyle = 'rgba(140,43,34,0.8)';
        ctx.font = '18px serif';
        ctx.fillText('—— 原来写的，好像不是这样 ——', 440, 500);
        orig.slice(0, 2).forEach(function (ln, i) {
          ctx.fillText(ln, 440, 524 + i * 26);
          const w = ctx.measureText(ln).width;
          ctx.strokeStyle = 'rgba(140,43,34,0.7)'; ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.moveTo(438, 518 + i * 26);
          ctx.lineTo(440 + w, 518 + i * 26);
          ctx.stroke();
        });
        ctx.restore();
      }
      // 返回
      A.panel(ctx, BACK.x, BACK.y, BACK.w, BACK.h);
      A.setFont(ctx, 20, { align: 'center' });
      ctx.fillStyle = A.PALETTE.ink;
      ctx.fillText('← 返回', BACK.x + BACK.w / 2, BACK.y + 30);
    }
    ctx.restore();
  }

  function down(p) {
    if (p.x >= CLOSE.x && p.x <= CLOSE.x + CLOSE.w && p.y >= CLOSE.y && p.y <= CLOSE.y + CLOSE.h) {
      Au.sfx.page();
      close();
      return;
    }
    if (view === 'grid') {
      for (let i = 0; i < order.length; i++) {
        const r = cellRect(i);
        if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) {
          detailId = order[i];
          view = 'detail';
          Au.sfx.page();
          return;
        }
      }
    } else if (p.x >= BACK.x && p.x <= BACK.x + BACK.w && p.y >= BACK.y && p.y <= BACK.y + BACK.h) {
      view = 'grid';
      Au.sfx.page();
    }
  }

  function move(p) {
    hoverCell = -1;
    if (view !== 'grid') return;
    for (let i = 0; i < order.length; i++) {
      const r = cellRect(i);
      if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) { hoverCell = i; return; }
    }
  }

  return {
    init, persistExtra, restoreFrom, reset, hasSave,
    // payload 为模块私有变量，以只读 getter 暴露（game.js restore() 依赖）
    get payload() { return payload; },
    has, add, applyCorruption, count,
    open, isOpen, close, update, draw, down, move, glyph
  };
})();
