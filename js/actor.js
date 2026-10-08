"use strict";
/* 绣忆 · actor.js — 人物立绘系统
   程序化水墨半身立绘 + 参数化表情 + 病程渲染（人物随遗忘"被拆线"）。
   PNG 替换管线：assets/img/actors/<角色>_<表情>.png 存在即自动覆盖程序化立绘。
     绣云 xiuyun  ：calm / smile / focus / confuse / vacant / sad
     念念 niannian：normal / smile / worried / hurt / cry
   舞台：left / center / right 三站位，说话人高亮，其余压暗；
   入场淡入 + 呼吸微动；绣云立绘随 game.forget 震颤、脱针、局部褪为绣线。 */
XY.Actor = (function () {
  const U = XY.Util, A = XY.Art;

  const CHARS = {
    xiuyun:   { name: '绣云', kind: 'old',   exprs: ['calm', 'smile', 'focus', 'confuse', 'vacant', 'sad'] },
    niannian: { name: '念念', kind: 'young', exprs: ['normal', 'smile', 'worried', 'hurt', 'cry'] }
  };

  const POS_X = { left: 340, center: 640, right: 940 };
  const BASE_Y = 762;   // 立绘底边（沉入画面下缘 / 对话框之后）
  // PNG 立绘绘制高度系数（按角色微调画面占比，Q 版素材可调小）
  const PNG_H = { xiuyun: 520, niannian: 660 };
  // PNG 头部裁切规格（占图宽/高的比例，r 为半径占图宽比例）——供头像与相框裁脸
  const PNG_HEAD = {
    xiuyun:   { cx: 0.50, cy: 0.36, r: 0.26 },
    niannian: { cx: 0.51, cy: 0.34, r: 0.21 }
  };
  const DEFAULT_EXPR = { xiuyun: 'calm', niannian: 'normal' };

  // ---------- PNG 替换管线 ----------
  const skins = {};
  let skinsSettled = 0, skinsTotal = 0, skinsCb = null;
  function init() {
    const keys = [];
    Object.keys(CHARS).forEach(function (ch) {
      CHARS[ch].exprs.forEach(function (ex) { keys.push([ch, ex]); });
    });
    skinsTotal = keys.length;
    keys.forEach(function (pair) {
      const im = new Image();
      im.onload = function () { skins[pair[0] + '_' + pair[1]] = im; settle(); };
      im.onerror = settle;
      im.src = 'assets/img/actors/' + pair[0] + '_' + pair[1] + '.png';
    });
    function settle() {
      if (++skinsSettled >= skinsTotal && skinsCb) { const cb = skinsCb; skinsCb = null; cb(); }
    }
    // 兜底：素材加载异常时也放行
    setTimeout(settle, 4000);
  }
  // 素材全部就绪后回调（用于失效背景缓存，让相框照片重绘）
  function onSkinsReady(cb) { if (skinsSettled >= skinsTotal) cb(); else skinsCb = cb; }

  function skinOf(char, expr) {
    return skins[char + '_' + (expr || DEFAULT_EXPR[char])] || null;
  }
  // 头部裁切源：{img, sx, sy, sw}（正方形裁切区，sw 为边长像素）
  function headSource(char, expr) {
    const spec = PNG_HEAD[char];
    const img = skinOf(char, expr);
    if (!spec || !img) return null;
    const sw = spec.r * 2 * img.naturalWidth;
    return {
      img: img,
      sx: spec.cx * img.naturalWidth - sw / 2,
      sy: spec.cy * img.naturalHeight - sw / 2,
      sw: sw
    };
  }
  // 圆形头像绘制（对话框用）：成功返回 true，无 PNG 素材返回 false（调用方走程序化兜底）
  function drawAvatar(ctx, char, expr, x, y, r) {
    const src = headSource(char, expr);
    if (!src) return false;
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, U.TAU);
    ctx.clip();
    ctx.drawImage(src.img, src.sx, src.sy, src.sw, src.sw, x - r, y - r, r * 2, r * 2);
    ctx.restore();
    return true;
  }

  // ---------- 舞台状态 ----------
  let actors = [];        // {char, expr, pos, x, enter, exit, t}
  let speakerChar = null; // 当前说话角色 key

  function findLive(char) {
    for (let i = 0; i < actors.length; i++) {
      if (actors[i].char === char && !actors[i].exit) return actors[i];
    }
    return null;
  }

  // 全量重排舞台（show 节拍用）：不在列表中的角色开始退场
  function stage(list) {
    (list || []).forEach(function (sp) {
      if (!CHARS[sp.char]) return;
      let a = findLive(sp.char);
      if (!a) {
        a = {
          char: sp.char, expr: sp.expr || defaultExpr(sp.char),
          pos: sp.pos || 'center', x: POS_X[sp.pos || 'center'],
          enter: 0, exit: 0, t: 0
        };
        actors.push(a);
      } else {
        if (sp.expr) a.expr = sp.expr;
        if (sp.pos) a.pos = sp.pos;
      }
    });
    actors.forEach(function (a) {
      const keep = (list || []).some(function (sp) { return sp.char === a.char; });
      if (!keep && !a.exit) a.exit = 0.0001;
    });
  }

  // 确保某角色在台（say 节拍用）：不退场其他人
  function ensure(char, expr, pos) {
    if (!CHARS[char]) return;
    stage([{ char: char, expr: expr, pos: pos }].concat(
      actors.filter(function (a) { return !a.exit && a.char !== char; })
        .map(function (a) { return { char: a.char, expr: a.expr, pos: a.pos }; })
    ));
  }

  function clear() { stage([]); }

  function speaker(name) {
    speakerChar = (name === '绣云') ? 'xiuyun' : (name === '念念') ? 'niannian' : null;
  }
  function exprOf(char) {
    const a = findLive(char);
    return a ? a.expr : null;
  }

  function defaultExpr(char) {
    return char === 'niannian' ? 'normal' : 'calm';
  }

  function update(dt) {
    actors.forEach(function (a) {
      a.t += dt;
      a.enter = Math.min(1, a.enter + dt * 2.2);
      if (a.exit) a.exit = Math.min(1, a.exit + dt * 2.6);
      a.x += (POS_X[a.pos] - a.x) * Math.min(1, dt * 6);
    });
    actors = actors.filter(function (a) { return a.exit < 1; });
  }

  // ---------- 程序化半身立绘 ----------
  // 坐标系：原点 = 底边中心，向上为负 y；头顶约 -600，肩线约 -350
  function drawBody(ctx, a, bob, forget) {
    const f = a.char === 'xiuyun' ? U.clamp(forget || 0, 0, 1) : 0;
    const desat = f * 0.55;
    const trem = { time: a.t, tremble: f * 0.9, gaps: f > 0.35 ? (f - 0.35) * 1.2 : 0 };
    const jacketA = 1 - Math.max(0, f - 0.25) * 0.75;

    ctx.save();
    if (a.char === 'xiuyun') {
      const jacket = A.mixc('#4e5a52', '#6f6f68', desat);
      const jacketHi = A.mixc('#5d6a61', '#7c7c74', desat);
      // 颈
      ctx.fillStyle = A.mixc('#efe3cf', '#d9d2c0', desat);
      ctx.fillRect(-19, -492, 38, 64);
      // 上身：靛青斜襟衫（袖口有绣纹）
      ctx.save();
      ctx.globalAlpha = ctx.globalAlpha * jacketA;
      const g = ctx.createLinearGradient(0, -450, 0, 0);
      g.addColorStop(0, jacketHi); g.addColorStop(1, jacket);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(-158, 40);
      ctx.quadraticCurveTo(-172, -220, -152, -348);
      ctx.quadraticCurveTo(-120, -430, -48, -452);
      ctx.lineTo(48, -452);
      ctx.quadraticCurveTo(122, -426, 156, -336);
      ctx.quadraticCurveTo(172, -190, 158, 40);
      ctx.closePath(); ctx.fill();
      ctx.restore();
      // 衣缘描线
      A.inkStroke(ctx, [
        { x: -158, y: 20 }, { x: -170, y: -220 }, { x: -152, y: -346 },
        { x: -118, y: -428 }, { x: -48, y: -450 }
      ], Object.assign({ w: 2.6, alpha: 0.55, color: A.mixc('#2e2a24', '#56564f', desat), seed: 61 }, trem));
      A.inkStroke(ctx, [
        { x: 48, y: -450 }, { x: 120, y: -424 }, { x: 154, y: -334 }, { x: 170, y: -180 }, { x: 160, y: 20 }
      ], Object.assign({ w: 2.6, alpha: 0.55, color: A.mixc('#2e2a24', '#56564f', desat), seed: 62 }, trem));
      // 斜襟大盘扣
      A.inkStroke(ctx, [{ x: -104, y: -322 }, { x: -20, y: -210 }, { x: 52, y: -96 }],
        Object.assign({ w: 2.4, alpha: 0.8, color: A.mixc('#3a3a34', '#5c5c54', desat), seed: 63 }, trem));
      const knot = function (kx, ky, seedN) {
        ctx.strokeStyle = A.mixc('#c9a86a', '#a09a8a', desat);
        ctx.lineWidth = 2; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.arc(kx, ky, 5.5, 0.6, 5.2); ctx.stroke();
        A.inkStroke(ctx, [{ x: kx - 8, y: ky + 3 }, { x: kx + 8, y: ky - 3 }],
          Object.assign({ w: 1.6, alpha: 0.7, seed: seedN }, trem));
      };
      knot(-78, -282, 64); knot(-26, -226, 65); knot(24, -166, 66);
      // 立领
      ctx.strokeStyle = A.mixc('#3a3a34', '#5c5c54', desat); ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.ellipse(0, -450, 44, 15, 0, Math.PI * 0.05, Math.PI * 0.95); ctx.stroke();
      // 执针的手（右臂自右侧抬起）——病程深时整条手臂"拆"成绣线
      if (f > 0.6) {
        A.stitchPath(ctx, [
          { x: 150, y: -330 }, { x: 128, y: -318 }, { x: 106, y: -326 }, { x: 88, y: -342 }
        ], { color: A.mixc('#b03a2e', '#8f7f76', desat), w: 7, gap: 4.5, alpha: 0.75, seed: 67 });
      } else {
        ctx.save();
        ctx.globalAlpha = ctx.globalAlpha * jacketA;
        ctx.fillStyle = jacketHi;
        ctx.beginPath();
        ctx.moveTo(148, -346);
        ctx.quadraticCurveTo(128, -344, 104, -338);
        ctx.quadraticCurveTo(84, -332, 76, -320);
        ctx.quadraticCurveTo(90, -300, 112, -306);
        ctx.quadraticCurveTo(138, -314, 158, -318);
        ctx.closePath(); ctx.fill();
        ctx.restore();
        A.inkStroke(ctx, [
          { x: 148, y: -346 }, { x: 112, y: -338 }, { x: 84, y: -326 }
        ], Object.assign({ w: 2.2, alpha: 0.55, color: A.mixc('#2e2a24', '#56564f', desat), seed: 68 }, trem));
        // 手
        ctx.fillStyle = A.mixc('#efe3cf', '#d9d2c0', desat);
        ctx.beginPath(); ctx.ellipse(72, -314, 13, 9, -0.5, 0, U.TAU); ctx.fill();
        ctx.strokeStyle = A.mixc('#8a7a62', '#8a8176', desat); ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.ellipse(72, -314, 13, 9, -0.5, 0, U.TAU); ctx.stroke();
        // 针与垂线
        ctx.save();
        ctx.translate(66, -318); ctx.rotate(-1.35);
        A.needle(ctx, 0, 0, f > 0.5 ? A.mixc('#b03a2e', '#8f8078', desat) : '#b03a2e');
        ctx.restore();
      }
      // 袖口绣纹（左袖一圈海棠短针）
      A.stitchPath(ctx, [
        { x: -140, y: -300 }, { x: -128, y: -286 }, { x: -140, y: -272 }, { x: -152, y: -286 }, { x: -140, y: -300 }
      ], { color: A.mixc('#b03a2e', '#8f7f76', desat), w: 6, gap: 4, alpha: 0.7, seed: 69 });
      // 头
      A.inkFace(ctx, 0, -552, 162, { kind: 'old', expr: a.expr, forget: f, t: a.t, talk: a.talk });
    } else {
      // 念念：月白圆领衫
      const blouse = '#e6dfcd', blouseHi = '#efe9da';
      // 颈
      ctx.fillStyle = '#f4e8d4';
      ctx.fillRect(-16, -500, 32, 52);
      ctx.fillStyle = blouse;
      ctx.beginPath();
      ctx.moveTo(-128, 40);
      ctx.quadraticCurveTo(-140, -230, -122, -350);
      ctx.quadraticCurveTo(-96, -432, -44, -456);
      ctx.lineTo(44, -456);
      ctx.quadraticCurveTo(98, -430, 124, -344);
      ctx.quadraticCurveTo(140, -210, 128, 40);
      ctx.closePath(); ctx.fill();
      A.inkStroke(ctx, [
        { x: -128, y: 20 }, { x: -138, y: -228 }, { x: -122, y: -348 }, { x: -92, y: -428 }, { x: -44, y: -454 }
      ], { w: 2.2, alpha: 0.5, color: '#5c5546', seed: 71 });
      A.inkStroke(ctx, [
        { x: 44, y: -454 }, { x: 96, y: -426 }, { x: 122, y: -342 }, { x: 138, y: -200 }, { x: 128, y: 20 }
      ], { w: 2.2, alpha: 0.5, color: '#5c5546', seed: 72 });
      // 圆领口
      ctx.strokeStyle = '#8a9a84'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(0, -452, 40, 14, 0, 0, U.TAU); ctx.stroke();
      ctx.fillStyle = '#f4e8d4';
      ctx.beginPath(); ctx.ellipse(0, -452, 36, 12, 0, 0, Math.PI); ctx.fill();
      // 领口小绣线
      A.backStitch(ctx, [{ x: -30, y: -446 }, { x: 30, y: -446 }], { color: '#9ab08c', alpha: 0.6, w: 2 });
      // 头
      A.inkFace(ctx, 0, -568, 148, { kind: 'young', expr: a.expr, t: a.t, talk: a.talk });
    }
    ctx.restore();
  }

  // ---------- 绘制 ----------
  function draw(ctx, forget) {
    if (!actors.length) return;
    const ordered = actors.slice().sort(function (a, b) {
      return (a.char === speakerChar ? 1 : 0) - (b.char === speakerChar ? 1 : 0);
    });
    ordered.forEach(function (a) {
      const alpha = a.enter * (1 - a.exit);
      if (alpha <= 0.01) return;
      const dim = (speakerChar && a.char !== speakerChar) ? 0.55 : 1;
      const bob = Math.sin(a.t * 0.9 + a.x * 0.01) * 2.2;
      const rise = (1 - a.enter) * 18;
      a.talk = (a.char === speakerChar);
      const skin = skins[a.char + '_' + a.expr];
      ctx.save();
      ctx.globalAlpha = alpha * dim;
      if (skin) {
        // PNG 立绘：等比缩放，底边沉入 BASE_Y
        const h = PNG_H[a.char] || 640, w = h * skin.width / skin.height;
        ctx.drawImage(skin, a.x - w / 2, BASE_Y - h + bob + rise, w, h);
      } else {
        ctx.translate(0, rise);
        ctx.save();
        ctx.translate(a.x, BASE_Y + bob);
        drawBody(ctx, a, 0, forget);
        ctx.restore();
      }
      ctx.restore();
    });
  }

  return {
    init, stage, ensure, clear, speaker, exprOf,
    skinOf, headSource, drawAvatar, onSkinsReady,
    update, draw, CHARS
  };
})();
