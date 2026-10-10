"use strict";
/* 绣忆 · game.js — 游戏主流程状态机
   状态：title / script（剧本播放器，内含 card·say·choice·puzzle·
   facehoop·dissolve·album·titlecard 子模式）/ explore（堂屋探索）
   覆盖层：记忆相册 / 设置 */
XY.Game = (function () {
  const U = XY.Util, A = XY.Art, S = XY.Story, Au = XY.Audio, Al = XY.Album;

  const SPEAKERS = {
    '绣云': { char: 'xiuyun', face: 'old', color: '#8c2b22' },
    '念念': { char: 'niannian', face: 'young', color: '#4a6741' }
  };

  // 病程打字机：绣云的台词按 forget 概率出现"错字闪现后修正"
  const SLIP_MAP = { '念': '珍', '珍': '念', '绿': '灰', '红': '灰', '线': '钱', '顶': '钉', '绷': '崩', '绣': '锈' };

  const game = {
    canvas: null, ctx: null, dpr: 1,
    state: null, stateName: '',
    time: 0,
    flags: {}, stats: { snaps: 0 },
    forget: 0,
    settings: { friendly: false, muted: false, auto: false },
    started: false, demoComplete: false,
    overlay: null,
    toasts: [],
    fadeIn: 1,
    hoverPt: null, hoverPointer: false, forceCursor: ''
  };

  let btns = []; // 本帧按钮（draw 时注册，onDown 命中）

  // ---------- 持久化 ----------
  function persist() {
    Al.persistExtra({
      started: game.started,
      chapter: 'spring',
      flags: game.flags,
      stats: game.stats,
      settings: game.settings,
      forget: game.forget,
      demoComplete: game.demoComplete
    });
  }
  function restore() {
    const d = Al.payload;
    if (!d) return false;
    game.flags = d.flags || {};
    game.stats = d.stats || { snaps: 0 };
    game.settings = d.settings || game.settings;
    game.forget = d.forget || 0;
    game.started = !!d.started;
    game.demoComplete = !!d.demoComplete;
    Al.restoreFrom(d.memories);
    Au.setMuted(!!game.settings.muted);
    return true;
  }

  // ---------- 按钮 ----------
  function hitRect(p, r) {
    return !!p && p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
  }
  function btn(ctx, x, y, w, h, label, cb, opts) {
    opts = opts || {};
    btns.push({ x: x, y: y, w: w, h: h, cb: cb, overlay: !!opts.overlay });
    const hov = hitRect(game.hoverPt, { x: x, y: y, w: w, h: h });
    if (hov && !opts.disabled) game.hoverPointer = true;
    A.panel(ctx, x, y, w, h, {
      border: opts.danger ? 'rgba(140,43,34,0.9)' : (hov && !opts.disabled ? A.PALETTE.red : 'rgba(107,79,47,0.75)'),
      fill: opts.disabled ? 'rgba(225,216,196,0.8)' : (hov ? 'rgba(248,243,229,0.97)' : undefined)
    });
    A.setFont(ctx, opts.size || 22, { align: 'center' });
    ctx.fillStyle = opts.danger ? A.PALETTE.redDeep : (hov && !opts.disabled ? A.PALETTE.redDeep : A.PALETTE.ink);
    ctx.fillText(label, x + w / 2, y + h / 2 + (opts.size || 22) * 0.35);
    // 可选状态点：贴在居中文字左侧，用颜色而非读字来表达开/关
    if (opts.dot) {
      const tw = ctx.measureText(label).width;
      const dx = x + w / 2 - tw / 2 - 15, dy = y + h / 2;
      ctx.save();
      ctx.beginPath(); ctx.arc(dx, dy, 5, 0, U.TAU);
      if (opts.dot === 'on') {
        ctx.fillStyle = A.PALETTE.moss; ctx.fill();
        ctx.globalAlpha = 0.35;
        ctx.beginPath(); ctx.arc(dx, dy, 8.5, 0, U.TAU);
        ctx.strokeStyle = A.PALETTE.moss; ctx.lineWidth = 1.4; ctx.stroke();
      } else {
        ctx.fillStyle = A.PALETTE.surfaceLo; ctx.fill();
        ctx.strokeStyle = 'rgba(107,79,47,0.45)'; ctx.lineWidth = 1.2; ctx.stroke();
      }
      ctx.restore();
    }
  }
  function fireBtns(p, overlayOnly) {
    for (let i = btns.length - 1; i >= 0; i--) {
      const b = btns[i];
      if (!!b.overlay !== !!overlayOnly) continue;
      if (hitRect(p, b)) { b.cb(); return true; }
    }
    return false;
  }

  function toast(text) {
    game.toasts.push({ text: text, t: 0 });
    if (game.toasts.length > 3) game.toasts.shift();
  }

  // ---------- 交互即症状：选项脱线 ----------
  function breakText(text, level, reveal) {
    if (!level || reveal) return text;
    let out = '';
    for (let i = 0; i < text.length; i++) {
      const hit = (((i * 40503 + level * 97) >>> 0) % 100) < (level >= 2 ? 34 : 16);
      out += hit ? '▢' : text[i];
    }
    if (level >= 2) out += '……';
    return out;
  }

  // ---------- 物件演出：纸条/诊断单 ----------
  function drawLetter(ctx, def) {
    ctx.fillStyle = 'rgba(16,12,8,0.5)'; ctx.fillRect(0, 0, 1280, 720);
    ctx.save();
    ctx.translate(640, 368);
    ctx.rotate(-0.012);
    A.panel(ctx, -352, -224, 704, 448, { fill: 'rgba(246,240,222,0.98)', r: 4, border: 'rgba(107,79,47,0.5)' });
    ctx.strokeStyle = 'rgba(107,79,47,0.16)'; ctx.lineWidth = 1;
    for (let i = 1; i < 8; i++) {
      ctx.beginPath(); ctx.moveTo(-320, -134 + i * 44); ctx.lineTo(320, -134 + i * 44); ctx.stroke();
    }
    A.setFont(ctx, 26, { weight: 'bold', align: 'left' });
    ctx.fillStyle = A.PALETTE.redDeep;
    ctx.fillText(def.title || '', -320, -176);
    if (def.stamp !== false) {
      ctx.save();
      ctx.translate(272, -180);
      ctx.strokeStyle = 'rgba(140,43,34,0.5)'; ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.arc(0, 0, 32, 0, U.TAU); ctx.stroke();
      ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(-12, 0); ctx.lineTo(12, 0); ctx.moveTo(0, -12); ctx.lineTo(0, 12); ctx.stroke();
      A.setFont(ctx, 12, { align: 'center' });
      ctx.fillStyle = 'rgba(140,43,34,0.55)';
      ctx.fillText('初 诊', 0, 48);
      ctx.restore();
    }
    A.setFont(ctx, 24, { align: 'left' });
    ctx.fillStyle = 'rgba(58,51,43,0.95)';
    const lines = A.wrapText(ctx, def.text || '', 620);
    lines.forEach(function (ln, i) { ctx.fillText(ln, -320, -106 + i * 42); });
    ctx.save();
    ctx.globalAlpha = 0.5 + 0.5 * Math.sin(game.time * 4);
    A.setFont(ctx, 16, { align: 'center' });
    ctx.fillStyle = 'rgba(107,95,78,0.9)';
    ctx.fillText('▼ 空格 / 点按 继续', 0, 208);
    ctx.restore();
    ctx.restore();
  }

  // ---------- 物件演出：电话 ----------
  function drawPhone(ctx, def) {
    ctx.fillStyle = 'rgba(10,8,6,0.6)'; ctx.fillRect(0, 0, 1280, 720);
    ctx.save();
    ctx.translate(640, 290);
    if (def.ring) {
      const pulse = 0.5 + 0.5 * Math.sin(game.time * 5);
      ctx.strokeStyle = 'rgba(212,106,95,' + (0.3 + pulse * 0.4).toFixed(3) + ')';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, 96 + pulse * 10, 0, U.TAU); ctx.stroke();
      ctx.strokeStyle = 'rgba(212,106,95,' + (0.15 + pulse * 0.25).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(0, 0, 130 + pulse * 14, 0, U.TAU); ctx.stroke();
    }
    ctx.fillStyle = '#2f3a2e';
    A.roundRect(ctx, -110, -34, 220, 46, 22); ctx.fill();
    A.roundRect(ctx, -128, -46, 60, 70, 18); ctx.fill();
    A.roundRect(ctx, 68, -46, 60, 70, 18); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    A.roundRect(ctx, -122, -40, 30, 58, 12); ctx.fill();
    A.roundRect(ctx, 74, -40, 30, 58, 12); ctx.fill();
    ctx.restore();
    A.setFont(ctx, 28, { align: 'center' });
    ctx.fillStyle = '#f4ecdc';
    const lines = A.wrapText(ctx, def.text || '', 800);
    lines.forEach(function (ln, i) { ctx.fillText(ln, 640, 430 + i * 44); });
    ctx.save();
    ctx.globalAlpha = 0.5 + 0.5 * Math.sin(game.time * 4);
    A.setFont(ctx, 16, { align: 'center' });
    ctx.fillStyle = 'rgba(244,236,220,0.8)';
    ctx.fillText('▼ 空格 / 点按 继续', 640, 690);
    ctx.restore();
  }

  // ---------- 状态机 ----------
  const STATES = {};
  function setState(name, params) {
    game.stateName = name;
    game.state = STATES[name](params || {});
    game.fadeIn = 0.9;
    persist();
  }

  function gotoScriptTarget(name) {
    if (name === 'explore') { XY.Actor.clear(); setState('explore'); return; }
    if (name === 'night') { setState('script', { beats: S.NIGHT, bg: 'room', bgOpts: { evening: true } }); return; }
    if (name === 'chapterEnd') { setState('script', { beats: S.CHAPTER_END, bg: 'black' }); return; }
    if (name === 'outro') { setState('script', { beats: S.outro(game), bg: 'black' }); return; }
    if (name === 'title') { game.demoComplete = true; persist(); XY.Actor.clear(); setState('title'); return; }
    XY.Actor.clear();
    setState('title');
  }

  function openAlbum(modal) {
    Al.open({ modal: modal !== false });
    game.overlay = { type: 'album' };
  }

  // ================= 标题 =================
  let titleAudio = false;
  function ensureTitleAudio() {
    if (titleAudio) return;
    titleAudio = true;
    Au.ensure();
    Au.setMuted(!!game.settings.muted);
    Au.rain(true);
    Au.pad(true);
    Au.motif(1);
  }

  STATES.title = function () {
    const st = { t: 0 };
    st.update = function (dt) { st.t += dt; };
    st.draw = function (ctx) {
      A.draw(ctx, 'silk', game.time);
      // 飘絮：极轻的丝线浮尘，打破缎面背景的绝对静止
      ctx.save();
      for (let i = 0; i < 14; i++) {
        const sd = i * 7.31;
        const px = ((Math.sin(sd) * 0.5 + 0.5) * 1.1 - 0.05) * 1280;
        const py = ((Math.cos(sd * 1.7) * 0.5 + 0.5) * 760 + st.t * (5 + (i % 3) * 3)) % 780 - 30;
        ctx.globalAlpha = 0.09 + 0.06 * Math.sin(st.t * 0.7 + sd);
        ctx.fillStyle = '#fffaf0';
        ctx.beginPath(); ctx.arc(px, py, 1.2 + (i % 3) * 0.7, 0, U.TAU); ctx.fill();
      }
      ctx.restore();
      const prog = Math.min(1.18, st.t / 2.8);
      A.titleStitch(ctx, S.TITLES.game, 640, 200, 150, prog, A.PALETTE.red);
      A.setFont(ctx, 21, { align: 'center' });
      ctx.fillStyle = A.PALETTE.inkLight;
      ctx.fillText(S.TITLES.sub, 640, 258);
      A.setFont(ctx, 15, { align: 'center' });
      ctx.fillStyle = 'rgba(107,95,78,0.85)';
      ctx.fillText('一段会随你一同遗忘的绣事', 640, 296);

      const canContinue = Al.hasSave() && game.started && !game.demoComplete;
      btn(ctx, 510, 372, 260, 58, game.started ? '重新开始' : '开始新绣', function () {
        ensureTitleAudio();
        Al.reset();
        game.flags = {}; game.stats = { snaps: 0 };
        game.forget = 0;
        game.started = true; game.demoComplete = false;
        persist();
        setState('script', { beats: S.PROLOGUE, bg: 'rain' });
      }, { size: 24 });
      if (canContinue) {
        btn(ctx, 510, 448, 260, 58, '继续绣', function () {
          ensureTitleAudio();
          setState('script', { beats: S.CONTINUE_BEATS, bg: 'room' });
        }, { size: 24 });
      }
      btn(ctx, 510, canContinue ? 524 : 448, 260, 46, '设 置', function () {
        game.overlay = { type: 'settings' };
      }, { size: 20 });

      // 按钮组左侧朱砂竖线：给按钮一个视觉锚点，两端渐隐
      const bgTop = 372, bgBot = canContinue ? 570 : 494;
      const lg = ctx.createLinearGradient(0, bgTop, 0, bgBot);
      lg.addColorStop(0, 'rgba(176,58,46,0)');
      lg.addColorStop(0.22, 'rgba(176,58,46,0.45)');
      lg.addColorStop(0.78, 'rgba(176,58,46,0.45)');
      lg.addColorStop(1, 'rgba(176,58,46,0)');
      ctx.save();
      ctx.strokeStyle = lg; ctx.lineWidth = 3; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(486, bgTop); ctx.lineTo(486, bgBot); ctx.stroke();
      ctx.restore();

      // 页脚分隔绣线：把页脚与主体分开
      A.divider(ctx, 380, 668, 520, { alpha: 0.22 });

      A.setFont(ctx, 13, { align: 'center' });
      ctx.fillStyle = 'rgba(107,95,78,0.7)';
      ctx.fillText('全国大学生数字媒体科技作品及创意竞赛 · 参赛演示 · 团队协作开发 · v0.5', 640, 692);
    };
    st.onDown = function () { ensureTitleAudio(); };
    return st;
  };

  // ================= 剧本播放器 =================
  STATES.script = function (params) {
    const st = {
      beats: params.beats.slice(),
      i: 0,
      bg: params.bg || 'silk',
      bgOpts: params.bgOpts || {},
      onEnd: params.onEnd || null,
      sub: null,
      typing: null,
      flashback: false,
      shake: 0
    };

    function startType(text, speaker) {
      const f = (speaker === '绣云') ? game.forget : 0;
      const speed = (game.settings.friendly ? 44 : 34) * (1 - f * 0.3);
      const typing = { full: String(text), n: 0, speed: speed, slipsMap: null };
      // 病程打字机：错字闪现后修正
      if (f >= 0.35) {
        const map = {};
        const full = typing.full;
        for (let i = 0; i < full.length; i++) {
          const w = SLIP_MAP[full[i]];
          if (w && (((i * 2654435761) >>> 0) % 100) < f * 70) map[i] = w;
        }
        if (Object.keys(map).length) typing.slipsMap = map;
      }
      st.typing = typing;
    }
    // 当前应显示的文本（含未修正的错字）
    function shownText() {
      const t = st.typing;
      if (!t) return '';
      const k = Math.floor(t.n);
      let s = t.full.slice(0, k);
      if (t.slipsMap && k > 0) {
        let out = '';
        for (let i = 0; i < s.length; i++) {
          out += (t.slipsMap[i] !== undefined && t.n < i + 4) ? t.slipsMap[i] : s[i];
        }
        s = out;
      }
      return s;
    }
    function typingDone() {
      return !st.typing || st.typing.n >= st.typing.full.length;
    }
    function advance() {
      st.sub = null; st.typing = null;
      step();
    }
    function step() {
      while (st.i < st.beats.length) {
        const b = st.beats[st.i++];
        if (b.bg !== undefined) { st.bg = b.bg; if (b.bgOpts) st.bgOpts = b.bgOpts; continue; }
        if (b.bgOpts !== undefined) { st.bgOpts = b.bgOpts; continue; }
        if (b.flag !== undefined) { game.flags[b.flag] = true; persist(); continue; }
        if (b.memory !== undefined) {
          if (Al.add(b.memory)) {
            toast('收进记忆相册 ·「' + S.MEMORIES[b.memory].title + '」');
            Au.sfx.page();
          }
          persist();
          continue;
        }
        if (b.music !== undefined) {
          const m = b.music;
          if (m.action === 'pad') Au.pad(!!m.on);
          else if (m.action === 'rain') Au.rain(!!m.on);
          else if (m.action === 'motif') Au.motif(m.thin == null ? 1 : m.thin);
          else if (m.action === 'thud') Au.sfx.thud();
          continue;
        }
        if (b.wait !== undefined) { st.sub = { kind: 'wait', t: b.wait }; return; }
        if (b.show !== undefined) { XY.Actor.stage(b.show); continue; }
        if (b.clear !== undefined) { XY.Actor.clear(); continue; }
        if (b.forget !== undefined) { game.forget = U.clamp(b.forget, 0, 1); persist(); continue; }
        if (b.flashback !== undefined) { st.flashback = !!b.flashback; continue; }
        if (b.shake !== undefined) { st.shake = b.shake; continue; }
        if (b.card !== undefined) { XY.Actor.speaker(null); st.sub = { kind: 'card', text: b.card }; startType(b.card); return; }
        if (b.say !== undefined) {
          const sp = SPEAKERS[b.say.speaker];
          if (sp) XY.Actor.ensure(sp.char, b.say.expr, b.say.pos);
          XY.Actor.speaker(b.say.speaker);
          st.sub = { kind: 'say', speaker: b.say.speaker, expr: b.say.expr };
          startType(b.say.text, b.say.speaker);
          return;
        }
        if (b.choice !== undefined) { XY.Actor.speaker(null); st.sub = { kind: 'choice', def: b.choice }; return; }
        if (b.letter !== undefined) { XY.Actor.speaker(null); st.sub = { kind: 'letter', def: b.letter }; return; }
        if (b.phone !== undefined) { XY.Actor.speaker(null); st.sub = { kind: 'phone', def: b.phone }; return; }
        if (b.puzzle !== undefined) {
          const pz = new XY.Puzzle(b.puzzle, { friendly: game.settings.friendly });
          const self = st;
          pz.onComplete = function () { advance.call(self); };
          st.sub = { kind: 'puzzle', pz: pz };
          return;
        }
        if (b.facehoop !== undefined) { st.sub = { kind: 'facehoop', t: 0, dur: b.facehoop }; return; }
        if (b.dissolve !== undefined) {
          const dur = b.dissolve * (game.settings.friendly ? 1.35 : 1);
          const bg = st.bg === 'black' ? 'room' : st.bg;
          st.sub = { kind: 'dissolve', fx: new XY.DissolveFX({ dur: dur, bg: bg, bgOpts: st.bgOpts }) };
          return;
        }
        if (b.album !== undefined) {
          Al.applyCorruption(S.CORRUPT_SPRING);
          persist();
          const self = st;
          Al.open({ onDone: function () { advance.call(self); }, revealCorrupt: true });
          game.overlay = { type: 'album' };
          st.sub = { kind: 'block' };
          return;
        }
        if (b.titlecard !== undefined) { st.sub = { kind: 'titlecard', def: b.titlecard, t: 0 }; return; }
        if (b.goto !== undefined) { gotoScriptTarget(b.goto); return; }
        continue;
      }
      if (st.onEnd) st.onEnd();
      else setState('title');
    }

    function choose(opt) {
      const insert = opt.then || [];
      st.beats.splice.apply(st.beats, [st.i, 0].concat(insert));
      advance();
    }

    function drawTypedLines(ctx, lines, x, y, lh, budget) {
      let left = budget;
      let yy = y;
      let total = 0, shown = 0;
      lines.forEach(function (ln) {
        total += ln.length;
        if (left <= 0) return;
        const show = ln.slice(0, Math.floor(left));
        ctx.fillText(show, x, yy);
        shown += show.length;
        left -= ln.length;
        yy += lh;
      });
      return shown >= total;
    }

    st.update = function (dt) {
      if (st.shake > 0) st.shake = Math.max(0, st.shake - dt);
      if (st.typing) st.typing.n = Math.min(st.typing.full.length, st.typing.n + st.typing.speed * dt);
      const sub = st.sub;
      if (!sub) return;
      // 自动播放：打字完成后稍候片刻自动翻页
      if (game.settings.auto && (sub.kind === 'card' || sub.kind === 'say') && typingDone()) {
        sub.autoWait = (sub.autoWait || 0) + dt;
        if (sub.autoWait > 1.1) { sub.autoWait = 0; advance(); return; }
      }
      if (sub.kind === 'wait') {
        sub.t -= dt;
        if (sub.t <= 0) advance();
      } else if (sub.kind === 'puzzle') {
        game.forceCursor = sub.pz.done ? '' : 'none';
        sub.pz.update(dt);
      } else if (sub.kind === 'facehoop') {
        sub.t += dt;
        if (sub.t > sub.dur + 0.6) advance();
      } else if (sub.kind === 'dissolve') {
        sub.fx.update(dt);
        if (sub.fx.done && sub.fx.doneT > 1.6) advance();
      } else if (sub.kind === 'titlecard') {
        sub.t += dt;
        if (sub.t > 3.2) advance();
      }
    };

    st.onDown = function (p) {
      const sub = st.sub;
      if (!sub) return;
      if (sub.kind === 'card' || sub.kind === 'say' || sub.kind === 'letter' || sub.kind === 'phone') {
        if (!typingDone()) st.typing.n = st.typing.full.length;
        else advance();
        return;
      }
      if (sub.kind === 'titlecard') { advance(); return; }
      if (sub.kind === 'dissolve') { if (sub.fx.done) advance(); return; }
      if (sub.kind === 'puzzle') { sub.pz.down(p); return; }
    };
    st.onKey = function () {
      const sub = st.sub;
      if (!sub) return;
      if (sub.kind === 'card' || sub.kind === 'say' || sub.kind === 'letter' || sub.kind === 'phone') {
        if (!typingDone()) st.typing.n = st.typing.full.length;
        else advance();
      } else if (sub.kind === 'titlecard') advance();
      else if (sub.kind === 'dissolve' && sub.fx.done) advance();
    };
    st.onMove = function (p) {
      if (st.sub && st.sub.kind === 'puzzle') st.sub.pz.move(p);
    };
    st.onUp = function (p) {
      if (st.sub && st.sub.kind === 'puzzle') st.sub.pz.up(p);
    };

    st.draw = function (ctx) {
      const P = A.PALETTE;
      const sub = st.sub;

      ctx.save();
      if (st.shake > 0) {
        const k = st.shake / 0.35;
        ctx.translate((Math.random() - 0.5) * 11 * k, (Math.random() - 0.5) * 11 * k);
      }

      if (sub && sub.kind === 'puzzle') {
        sub.pz.draw(ctx);
      } else if (sub && sub.kind === 'dissolve') {
        sub.fx.draw(ctx);
      } else if (sub.kind === 'facehoop') {
        A.draw(ctx, 'photowall', game.time);
        ctx.fillStyle = 'rgba(20,14,8,0.28)';
        ctx.fillRect(0, 0, 1280, 720);
        const prog = U.ease.inOutCubic(U.clamp(sub.t / sub.dur, 0, 1));
        // 淡出的脸与照片墙中央相框里的照片对位（几何随 drawFramePhoto 的 cover 适配）
        const hs = XY.Actor.headSource('niannian', 'smile');
        if (hs) {
          const frame = { x: 460, y: 160, w: 300, h: 380 };   // BACKS.photowall 中央相框
          const sFit = Math.max((frame.w - 12) / hs.sw, (frame.h - 12) / hs.sw);
          const dw = hs.sw * sFit;
          hs.dx = frame.x + 6 + (frame.w - 12 - dw) / 2;
          hs.dy = frame.y + 6 + (frame.h - 12 - dw) / 2 - frame.h * 0.04;
          hs.dw = dw;
        }
        A.faceHoop(ctx, 640, 330, 330, prog, hs);
        A.setFont(ctx, 20, { align: 'center' });
        ctx.fillStyle = 'rgba(58,51,43,0.75)';
        ctx.fillText('（她盯着的，是念念小时候的脸。）', 640, 600);
      } else {
        A.draw(ctx, st.bg, game.time, Object.assign({}, st.bgOpts, { flashback: st.flashback }));
        // 人物层（谜题/溶解/特写时不出现）
        XY.Actor.draw(ctx, game.forget);
      }

      if (!sub || sub.kind === 'wait' || sub.kind === 'block') {
        ctx.restore();
        return;
      }

      if (sub.kind === 'card') {
        ctx.fillStyle = 'rgba(16,12,8,0.44)';
        ctx.fillRect(0, 0, 1280, 720);
        const fs = game.settings.friendly ? 34 : 30;
        A.setFont(ctx, fs, { align: 'center' });
        ctx.fillStyle = '#f4ecdc';
        const lines = A.wrapText(ctx, sub.text, 860);
        const lh = fs * 1.6;
        const y0 = 350 - (lines.length - 1) * lh / 2;
        const allShown = drawTypedLines(ctx, lines, 640, y0, lh, st.typing ? st.typing.n : 1e9);
        if (allShown) {
          ctx.save();
          ctx.globalAlpha = 0.5 + 0.5 * Math.sin(game.time * 4);
          A.setFont(ctx, 16, { align: 'right' });
          ctx.fillStyle = 'rgba(244,236,220,0.8)';
          ctx.fillText('▼ 空格 / 点按 继续', 1200, 690);
          ctx.restore();
        }
      } else if (sub.kind === 'say') {
        const sp = SPEAKERS[sub.speaker] || { char: 'xiuyun', face: 'old', color: P.ink };
        A.panel(ctx, 120, 538, 1040, 154);
        // 左上角针脚角标：手工装裱感，弱化「这是一块色板」
        ctx.save();
        ctx.strokeStyle = 'rgba(176,58,46,0.5)';
        ctx.lineWidth = 2; ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(132, 550); ctx.lineTo(132, 564); ctx.lineTo(146, 564);
        ctx.stroke();
        ctx.restore();
        // 头像（表情随台词/舞台状态；PNG 素材优先，程序化兜底）
        const expr = XY.Actor.exprOf(sp.char) || sub.expr || (sp.char === 'niannian' ? 'normal' : 'calm');
        ctx.save();
        ctx.beginPath(); ctx.arc(204, 614, 56, 0, U.TAU);
        ctx.fillStyle = '#efe6cf'; ctx.fill();
        ctx.strokeStyle = 'rgba(107,79,47,0.7)'; ctx.lineWidth = 2.4; ctx.stroke();
        ctx.restore();
        // 头像针脚环：让头像像「绣」在框上，与整体刺绣语言一致
        ctx.save();
        ctx.strokeStyle = 'rgba(176,58,46,0.4)';
        ctx.lineWidth = 1.8; ctx.lineCap = 'round';
        for (let ti = 0; ti < 28; ti++) {
          const ta = ti / 28 * U.TAU;
          ctx.beginPath();
          ctx.moveTo(204 + Math.cos(ta) * 60.5, 614 + Math.sin(ta) * 60.5);
          ctx.lineTo(204 + Math.cos(ta) * 65.5, 614 + Math.sin(ta) * 65.5);
          ctx.stroke();
        }
        ctx.restore();
        if (!XY.Actor.drawAvatar(ctx, sp.char, expr, 204, 614, 54)) {
          ctx.save();
          ctx.beginPath(); ctx.arc(204, 614, 54, 0, U.TAU); ctx.clip();
          A.inkFace(ctx, 204, 608, 92, {
            kind: sp.face, expr: expr,
            forget: sp.char === 'xiuyun' ? game.forget : 0,
            t: game.time, talk: !typingDone()
          });
          ctx.restore();
        }
        A.icon(ctx, 'needle', 272, 568, 16, sp.color);
        A.setFont(ctx, 24, { weight: 'bold', align: 'left' });
        ctx.fillStyle = sp.color;
        ctx.fillText(sub.speaker, 292, 576);
        A.setFont(ctx, game.settings.friendly ? 28 : 25, { align: 'left' });
        ctx.fillStyle = '#3a332b';
        // 病程打字机：直接渲染"当前应显示文本"（含未修正错字）
        const lines = A.wrapText(ctx, shownText(), 820);
        drawTypedLines(ctx, lines, 292, 614, 38, 1e9);
        if (typingDone()) {
          // 继续提示：加一层极淡圆底，让闪烁的 ▼ 更容易被注意到
          ctx.save();
          ctx.globalAlpha = 0.18 + 0.30 * (0.5 + 0.5 * Math.sin(game.time * 4));
          ctx.fillStyle = P.silkDeep;
          ctx.beginPath(); ctx.arc(1121, 662, 16, 0, U.TAU); ctx.fill();
          ctx.restore();
          ctx.save();
          ctx.globalAlpha = 0.5 + 0.5 * Math.sin(game.time * 4);
          A.setFont(ctx, 18, { align: 'right' });
          ctx.fillStyle = 'rgba(58,51,43,0.7)';
          ctx.fillText('▼', 1130, 668);
          ctx.restore();
        }
      } else if (sub.kind === 'choice') {
        ctx.fillStyle = 'rgba(16,12,8,0.5)';
        ctx.fillRect(0, 0, 1280, 720);
        A.setFont(ctx, 26, { align: 'center' });
        ctx.fillStyle = '#f4ecdc';
        ctx.fillText(sub.def.prompt, 640, 320);
        const opts = sub.def.options;
        const self = st;
        // 交互即症状：forget 高时选项脱线，悬停可见全文
        const lvl = sub.def.broken != null ? sub.def.broken
          : (game.forget >= 0.6 ? 2 : (game.forget >= 0.35 ? 1 : 0));
        const NUM = ['壹', '贰', '叁', '肆', '伍'];
        opts.forEach(function (opt, i) {
          const r = { x: 380, y: 388 + i * 86, w: 520, h: 62 };
          const hov = hitRect(game.hoverPt, r);
          btn(ctx, r.x, r.y, r.w, r.h, breakText(opt.text, lvl, hov), function () {
            choose.call(self, opt);
          }, { size: 23 });
          // 序号：明确「这是第几个选择」，降低决策成本
          A.setFont(ctx, 20, { align: 'left' });
          ctx.fillStyle = 'rgba(176,58,46,' + (hov ? 0.85 : 0.5) + ')';
          ctx.fillText(NUM[i] || String(i + 1), r.x + 24, r.y + r.h / 2 + 7);
          // 悬停引线箭头：强化可点击感
          if (hov) {
            ctx.save();
            ctx.strokeStyle = 'rgba(140,43,34,0.85)';
            ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
            const ax = r.x + r.w - 42, ay = r.y + r.h / 2;
            ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ax + 13, ay); ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(ax + 7, ay - 5); ctx.lineTo(ax + 13, ay); ctx.lineTo(ax + 7, ay + 5);
            ctx.stroke();
            ctx.restore();
          }
        });
      } else if (sub.kind === 'letter') {
        drawLetter(ctx, sub.def);
      } else if (sub.kind === 'phone') {
        drawPhone(ctx, sub.def);
      } else if (sub.kind === 'titlecard') {
        ctx.fillStyle = 'rgba(10,8,6,0.82)';
        ctx.fillRect(0, 0, 1280, 720);
        const prog = Math.min(1.18, sub.t / 1.5);
        A.titleStitch(ctx, sub.def.char, 640, 380, 240, prog, P.red);
        if (sub.t > 1.5) {
          A.setFont(ctx, 22, { align: 'center' });
          ctx.fillStyle = 'rgba(244,236,220,0.85)';
          ctx.fillText(sub.def.sub || '', 640, 500);
        }
      }
      ctx.restore();
    };

    step();
    return st;
  };

  // ================= 堂屋探索 =================
  // 注意：这里的 key 必须与 story.js 的 HOTSPOTS[].id 一致。
  // 绣绷热点的 id 是 'hoopCenter'（不是它 beats 内部设的 'peony' 标志），
  // 早期误写成 'peony' 会导致全部探索后底部提示仍停留在绣绷那句。
  const HINTS = [
    ['thimble', '窗台上，好像有什么在反光。'],
    ['basket', '笸箩里，丝线该理一理了。'],
    ['medicine', '门边挂着的……是什么？'],
    ['phone', '电话机旁，贴着一张纸条。'],
    ['photos', '照片墙上，落了点灰。'],
    ['hoopCenter', '嫁衣上的牡丹，还差最后三段。']
  ];

  // 回忆进度指示器：六枚针脚排成一道短绣线，
  // 已收针（已探索）的回忆用朱砂实针 + 中心点，未收的只留虚针。
  // 目的：探索阶段给玩家明确的「还差几件」目标感，避免全屋找完仍不知进度。
  function drawMemoryProgress(ctx) {
    const P = A.PALETTE;
    const n = S.HOTSPOTS.length;
    const gap = 24;
    const x0 = 28;
    const y = 92;
    // 以热点 id 为准统计（与 HOTSPOTS 一一对应），
    // 不能用 S.REQUIRED——那里的 'peony' 是绣绷热点的内部标志，不是热点 id。
    const done = S.HOTSPOTS.filter(function (h) { return game.flags[h.id]; }).length;

    ctx.save();
    // 半透明衬底：避免压到门框/照片等深色背景时看不清
    A.panel(ctx, x0 - 12, y - 34, 36 + n * gap + 20, 54,
      { fill: 'rgba(248,243,229,0.82)' });

    A.setFont(ctx, 16, { align: 'left' });
    ctx.globalAlpha = 1;
    ctx.fillStyle = P.ink;
    ctx.fillText('回忆', x0, y + 5);

    for (let i = 0; i < n; i++) {
      const cx = x0 + 52 + i * gap;
      const hit = !!game.flags[S.HOTSPOTS[i].id];
      ctx.save();
      ctx.lineCap = 'round';
      if (hit) {
        ctx.globalAlpha = 0.9;
        ctx.strokeStyle = P.red;
        ctx.lineWidth = 3.4;
      } else {
        ctx.globalAlpha = 0.32;
        ctx.strokeStyle = P.ink;
        ctx.lineWidth = 2;
        ctx.setLineDash([3, 4]);
      }
      ctx.beginPath();
      ctx.moveTo(cx - 6, y + 5);
      ctx.lineTo(cx + 6, y - 5);
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }

  STATES.explore = function () {
    const st = { hoverId: null, checked: false, marks: [] };

    function allDone() {
      return S.REQUIRED.every(function (f) { return game.flags[f]; });
    }
    function triggerDaughter() {
      game.flags.daughter = true;
      persist();
      setState('script', { beats: S.DAUGHTER, bg: 'room' });
    }

    st.update = function (dt) {
      Au.pad(true);
      // 收针痕迹：刚探索完的热点原位留一枚朱砂针脚，随时间淡出。
      // 作用：玩家从记忆回到堂屋时，能立刻看见"刚才那处在哪、已收针"，
      // 而不是让热点无声消失（此前热点直接不见，回场景后容易失去方位感）。
      for (let i = st.marks.length - 1; i >= 0; i--) {
        st.marks[i].t -= dt;
        if (st.marks[i].t <= 0) st.marks.splice(i, 1);
      }
      if (!st.checked) {
        st.checked = true;
        if (allDone() && !game.flags.daughter) triggerDaughter();
      }
    };

    st.onMove = function (p) {
      st.hoverId = null;
      for (let i = 0; i < S.HOTSPOTS.length; i++) {
        const hs = S.HOTSPOTS[i];
        if (game.flags[hs.id]) continue;
        if (U.dist(p.x, p.y, hs.x, hs.y) < hs.r) { st.hoverId = hs.id; game.hoverPointer = true; return; }
      }
    };

    st.onDown = function (p) {
      for (let i = 0; i < S.HOTSPOTS.length; i++) {
        const hs = S.HOTSPOTS[i];
        if (game.flags[hs.id]) continue;
        if (U.dist(p.x, p.y, hs.x, hs.y) < hs.r) {
          const locked = hs.requires && hs.requires.some(function (f) { return !game.flags[f]; });
          if (!locked) {
            game.flags[hs.id] = true;
            persist();
            st.marks.push({ x: hs.x, y: hs.y, r: hs.r, t: 2.4, life: 2.4 });
          }
          setState('script', {
            beats: locked ? hs.lockedBeats : hs.beats,
            bg: 'room',
            onEnd: function () { setState('explore'); }
          });
          return;
        }
      }
    };

    st.draw = function (ctx) {
      const P = A.PALETTE;
      A.draw(ctx, 'room', game.time);

      S.HOTSPOTS.forEach(function (hs) {
        // 已探索的热点直接消失（原设计）。
        // 曾试过在热点中心补一枚「已收针」十字以维持空间记忆，但 photos 热点的中心
        // 正好落在念念的照片脸上，看着像瑕疵，故移除。
        if (game.flags[hs.id]) return;
        const pulse = 0.5 + 0.5 * Math.sin(game.time * 2.2 + hs.x * 0.05);
        ctx.save();
        const g = ctx.createRadialGradient(hs.x, hs.y, 2, hs.x, hs.y, hs.r * 0.42);
        g.addColorStop(0, 'rgba(255,250,230,0.95)');
        g.addColorStop(0.4, 'rgba(226,186,110,0.5)');
        g.addColorStop(1, 'rgba(226,186,110,0)');
        ctx.globalAlpha = 0.55 + 0.4 * pulse;
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(hs.x, hs.y, hs.r * 0.42, 0, U.TAU); ctx.fill();
        ctx.globalAlpha = 0.35 + 0.35 * pulse;
        ctx.strokeStyle = P.red; ctx.lineWidth = 1.8;
        ctx.beginPath(); ctx.arc(hs.x, hs.y, 12 + 5 * pulse, 0, U.TAU); ctx.stroke();
        ctx.restore();
        if (st.hoverId === hs.id) {
          A.panel(ctx, hs.x - 84, hs.y - 66, 168, 44, { fill: 'rgba(248,243,229,0.95)' });
          A.setFont(ctx, 19, { align: 'center' });
          ctx.fillStyle = P.ink;
          ctx.fillText(hs.label, hs.x, hs.y - 37);
        }
      });

      // 收针痕迹：刚探索完的热点原位留一圈渐隐的"收针环"，
      // 给玩家"这里刚收过针"的空间确认（热点本身已按原设计消失）。
      //
      // 设计取舍：**不画十字/叉**。热点中心往往正落在物体（甚至人物脸）中心，
      // 在中心画交叉记号会像给物体打了个叉（photos 热点更是直接压在人脸上，
      // 上一版十字标记即因此被移除）。改为沿热点外缘描一圈针脚环，
      // 既不遮挡物体，又能明确圈出"这处已收针"。
      st.marks.forEach(function (mk) {
        const k = Math.max(0, mk.t / mk.life);
        const R = mk.r * 0.34 + (1 - k) * mk.r * 0.16;   // 随淡出微微外扩
        const nSeg = 12;
        ctx.save();
        ctx.lineCap = 'round';
        ctx.strokeStyle = P.red;
        ctx.lineWidth = 2.6;
        for (let i = 0; i < nSeg; i++) {
          const a0 = (U.TAU / nSeg) * i + 0.14;
          const a1 = a0 + (U.TAU / nSeg) * 0.62;
          ctx.globalAlpha = (0.5 + 0.35 * Math.sin(i * 1.7)) * k;
          ctx.beginPath();
          ctx.arc(mk.x, mk.y, R, a0, a1);
          ctx.stroke();
        }
        ctx.restore();
      });

      // HUD
      A.setFont(ctx, 24, { weight: 'bold', align: 'left' });
      ctx.fillStyle = 'rgba(58,51,43,0.85)';
      ctx.fillText('春 · 沈家堂屋', 28, 46);
      btn(ctx, 1044, 20, 108, 44, '相册', function () { openAlbum(true); }, { size: 20 });
      btn(ctx, 1164, 20, 92, 44, '设置', function () { game.overlay = { type: 'settings' }; }, { size: 20 });

      // 回忆进度：绣绷上的六针（收针的回忆用朱砂实针，未收的留虚针）
      drawMemoryProgress(ctx);

      // 底部提示：指向第一个尚未探索的热点。
      // 注：六件找齐的瞬间 allDone() 即触发女儿回家剧情并切走本状态，
      // 因此这里无需（也来不及）处理"全部收齐"的文案。
      let hint = '（点击发光处，走进她的记忆。按 Esc 打开相册。）';
      for (let i = 0; i < HINTS.length; i++) {
        if (!game.flags[HINTS[i][0]]) { hint = HINTS[i][1]; break; }
      }
      A.setFont(ctx, 18, { align: 'center' });
      ctx.save();
      ctx.globalAlpha = 0.8;
      ctx.fillStyle = '#f4ecdc';
      ctx.shadowColor = 'rgba(30,20,10,0.8)'; ctx.shadowBlur = 6;
      ctx.fillText(hint, 640, 700);
      ctx.restore();
    };
    return st;
  };

  // ================= 设置覆盖层 =================
  let resetArm = 0;
  function drawSettings(ctx) {
    const P = A.PALETTE;
    ctx.fillStyle = 'rgba(20,14,8,0.55)';
    ctx.fillRect(0, 0, 1280, 720);
    A.panel(ctx, 340, 130, 600, 468);
    A.setFont(ctx, 30, { weight: 'bold', align: 'left' });
    ctx.fillStyle = P.ink;
    ctx.fillText('设 置', 400, 186);
    // 标题下朱砂短线（与答辩 PPT 母版同一套视觉语言）
    A.divider(ctx, 400, 199, 62, { color: P.red, alpha: 0.85, w: 2.4, n: 4 });

    // 三个设置项：卡片化 + 左侧图标 + 右侧控件 + 状态点
    const rows = [
      {
        y: 204, icon: 'eye', label: '认知友好模式', desc: '（放大文字、放缓拆解、关闭震颤）',
        on: !!game.settings.friendly, onTxt: '已开启', offTxt: '已关闭',
        toggle: function () { game.settings.friendly = !game.settings.friendly; persist(); }
      },
      {
        y: 290, icon: 'play', label: '自动播放', desc: '（对话自动推进，适合观看剧情/录屏）',
        on: !!game.settings.auto, onTxt: '自动', offTxt: '手动',
        toggle: function () { game.settings.auto = !game.settings.auto; persist(); }
      },
      {
        y: 376, icon: 'sound', label: '声音', desc: null,
        on: !game.settings.muted, onTxt: '有声音', offTxt: '已静音',
        toggle: function () {
          game.settings.muted = !game.settings.muted;
          Au.ensure(); Au.setMuted(game.settings.muted);
          persist();
        }
      }
    ];
    rows.forEach(function (r) {
      // 卡片底：比面板亮一档 + 1px 淡描边，把「标签 + 控件」圈成一组
      // 面板为 340..940，左右各留 36px 内边距，故卡片宽 528
      ctx.save();
      ctx.fillStyle = 'rgba(250,245,233,0.55)';
      A.roundRect(ctx, 376, r.y, 528, 78, 6); ctx.fill();
      ctx.strokeStyle = 'rgba(107,79,47,0.14)'; ctx.lineWidth = 1;
      A.roundRect(ctx, 376.5, r.y + 0.5, 527, 77, 6); ctx.stroke();
      ctx.restore();

      // 左侧图标：开启态朱砂、关闭态淡墨，不读字也能分辨状态
      A.icon(ctx, r.icon, 406, r.y + 39, 24, r.on ? P.redDeep : P.inkLight);

      A.setFont(ctx, 22, { align: 'left' });
      ctx.fillStyle = P.ink;
      ctx.fillText(r.label, 432, r.y + 44);
      if (r.desc) {
        A.setFont(ctx, 15, { align: 'left' });
        ctx.fillStyle = P.inkLight;
        ctx.fillText(r.desc, 432, r.y + 68);
      }

      btn(ctx, 700, r.y + 14, 180, 52, r.on ? r.onTxt : r.offTxt, r.toggle,
        { size: 21, overlay: true, dot: r.on ? 'on' : 'off' });
    });

    btn(ctx, 400, 462, 480, 48, resetArm > 0 ? '再点一次，确认清除存档' : '清除存档并回到开头', function () {
      if (resetArm > 0) {
        Al.reset();
        game.flags = {}; game.stats = { snaps: 0 };
        game.forget = 0;
        game.started = false; game.demoComplete = false;
        game.overlay = null;
        setState('title');
      } else {
        resetArm = 2.5;
      }
    }, { size: 20, danger: true, overlay: true });
    // 危险操作加警示图标
    A.icon(ctx, 'warn', 424, 486, 18, P.red);

    btn(ctx, 490, 522, 300, 44, '关 闭', function () {
      game.overlay = null;
    }, { size: 20, overlay: true });
  }

  // ---------- 主循环接口 ----------
  function start(canvas, ctx, dpr) {
    game.canvas = canvas;
    game.ctx = ctx;
    game.dpr = dpr;
    restore();
    setState('title');
  }

  function update(dt) {
    game.time += dt;
    game.hoverPointer = false;
    game.forceCursor = '';
    btns = [];
    XY.Actor.update(dt);
    if (resetArm > 0) resetArm -= dt;
    if (game.overlay && game.overlay.type === 'album' && !Al.isOpen()) game.overlay = null;
    if (game.overlay && game.overlay.type === 'album') Al.update(dt);
    if (game.state && game.state.update) game.state.update(dt);
    game.toasts.forEach(function (t) { t.t += dt; });
    game.toasts = game.toasts.filter(function (t) { return t.t < 3.0; });
    if (game.fadeIn > 0) game.fadeIn = Math.max(0, game.fadeIn - dt * 1.5);
    if (game.canvas) {
      game.canvas.style.cursor = game.forceCursor || (game.hoverPointer ? 'pointer' : 'default');
    }
  }

  function draw(ctx) {
    if (game.state && game.state.draw) game.state.draw(ctx);
    if (game.overlay && game.overlay.type === 'album') Al.draw(ctx);
    if (game.overlay && game.overlay.type === 'settings') drawSettings(ctx);
    // 提示条
    game.toasts.forEach(function (t, i) {
      const a = t.t < 0.25 ? t.t / 0.25 : (t.t > 2.4 ? Math.max(0, (3.0 - t.t) / 0.6) : 1);
      ctx.save();
      ctx.globalAlpha = a;
      A.panel(ctx, 640 - 220, 76 + i * 62, 440, 48, { fill: 'rgba(58,45,30,0.88)', border: 'rgba(212,106,95,0.8)' });
      A.setFont(ctx, 18, { align: 'center' });
      ctx.fillStyle = '#f4ecdc';
      ctx.fillText(t.text, 640, 76 + i * 62 + 31);
      ctx.restore();
    });
    if (game.fadeIn > 0) {
      ctx.fillStyle = 'rgba(8,6,4,' + Math.min(1, game.fadeIn) + ')';
      ctx.fillRect(0, 0, 1280, 720);
    }
  }

  function onDown(p) {
    game.hoverPt = p;
    if (game.overlay) {
      fireBtns(p, true);
      if (game.overlay.type === 'album') Al.down(p);
      return;
    }
    if (fireBtns(p, false)) return;
    if (game.state && game.state.onDown) game.state.onDown(p);
  }
  function onMove(p) {
    game.hoverPt = p;
    if (game.overlay) {
      if (game.overlay.type === 'album') Al.move(p);
      return;
    }
    if (game.state && game.state.onMove) game.state.onMove(p);
  }
  function onUp(p) {
    if (game.overlay) return;
    if (game.state && game.state.onUp) game.state.onUp(p);
  }
  function onKey(e) {
    if (e.key === 'Escape') {
      if (game.overlay) {
        if (game.overlay.type === 'album') Al.close();
        game.overlay = null;
      } else if (game.stateName === 'explore') {
        openAlbum(true);
      }
      return;
    }
    if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowRight') {
      if (!game.overlay && game.state && game.state.onKey) {
        e.preventDefault();
        game.state.onKey();
      }
    }
  }

  // 直接把方法挂到 game 对象上返回，保持外部引用（如 XY.Game.stats）始终有效
  game.start = start;
  game.setState = setState;
  game.update = update;
  game.draw = draw;
  game.onDown = onDown;
  game.onMove = onMove;
  game.onUp = onUp;
  game.onKey = onKey;
  game.toast = toast;
  game.persist = persist;
  return game;
})();
