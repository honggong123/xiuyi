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
        // 头像（表情随台词/舞台状态；PNG 素材优先，程序化兜底）
        const expr = XY.Actor.exprOf(sp.char) || sub.expr || (sp.char === 'niannian' ? 'normal' : 'calm');
        ctx.save();
        ctx.beginPath(); ctx.arc(204, 614, 56, 0, U.TAU);
        ctx.fillStyle = '#efe6cf'; ctx.fill();
        ctx.strokeStyle = 'rgba(107,79,47,0.7)'; ctx.lineWidth = 2.4; ctx.stroke();
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
        A.setFont(ctx, 24, { weight: 'bold', align: 'left' });
        ctx.fillStyle = sp.color;
        ctx.fillText(sub.speaker, 292, 576);
        A.setFont(ctx, game.settings.friendly ? 28 : 25, { align: 'left' });
        ctx.fillStyle = '#3a332b';
        // 病程打字机：直接渲染"当前应显示文本"（含未修正错字）
        const lines = A.wrapText(ctx, shownText(), 820);
        drawTypedLines(ctx, lines, 292, 614, 38, 1e9);
        if (typingDone()) {
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
        opts.forEach(function (opt, i) {
          const r = { x: 380, y: 388 + i * 86, w: 520, h: 62 };
          const hov = hitRect(game.hoverPt, r);
          btn(ctx, r.x, r.y, r.w, r.h, breakText(opt.text, lvl, hov), function () {
            choose.call(self, opt);
          }, { size: 23 });
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
  const HINTS = [
    ['thimble', '窗台上，好像有什么在反光。'],
    ['basket', '笸箩里，丝线该理一理了。'],
    ['medicine', '门边挂着的……是什么？'],
    ['phone', '电话机旁，贴着一张纸条。'],
    ['photos', '照片墙上，落了点灰。'],
    ['peony', '嫁衣上的牡丹，还差最后三段。']
  ];

  STATES.explore = function () {
    const st = { hoverId: null, checked: false };

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
          if (!locked) { game.flags[hs.id] = true; persist(); }
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

      // HUD
      A.setFont(ctx, 24, { weight: 'bold', align: 'left' });
      ctx.fillStyle = 'rgba(58,51,43,0.85)';
      ctx.fillText('春 · 沈家堂屋', 28, 46);
      btn(ctx, 1044, 20, 108, 44, '相册', function () { openAlbum(true); }, { size: 20 });
      btn(ctx, 1164, 20, 92, 44, '设置', function () { game.overlay = { type: 'settings' }; }, { size: 20 });

      // 底部提示
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

    A.setFont(ctx, 22, { align: 'left' });
    ctx.fillStyle = P.ink;
    ctx.fillText('认知友好模式', 400, 250);
    A.setFont(ctx, 15, { align: 'left' });
    ctx.fillStyle = P.inkLight;
    ctx.fillText('（放大文字、放缓拆解、关闭震颤）', 400, 276);
    btn(ctx, 700, 218, 180, 52, game.settings.friendly ? '已开启' : '已关闭', function () {
      game.settings.friendly = !game.settings.friendly;
      persist();
    }, { size: 21, overlay: true });

    A.setFont(ctx, 22, { align: 'left' });
    ctx.fillStyle = P.ink;
    ctx.fillText('自动播放', 400, 336);
    A.setFont(ctx, 15, { align: 'left' });
    ctx.fillStyle = P.inkLight;
    ctx.fillText('（对话自动推进，适合观看剧情/录屏）', 400, 362);
    btn(ctx, 700, 304, 180, 52, game.settings.auto ? '自动' : '手动', function () {
      game.settings.auto = !game.settings.auto;
      persist();
    }, { size: 21, overlay: true });

    A.setFont(ctx, 22, { align: 'left' });
    ctx.fillStyle = P.ink;
    ctx.fillText('声音', 400, 420);
    btn(ctx, 700, 390, 180, 52, game.settings.muted ? '已静音' : '有声音', function () {
      game.settings.muted = !game.settings.muted;
      Au.ensure(); Au.setMuted(game.settings.muted);
      persist();
    }, { size: 21, overlay: true });

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
