"use strict";
/* 绣忆 · audio.js — Web Audio 全程序化合成配乐与音效
   江南丝竹意象：Karplus-Strong 拨弦（古筝）、雨声（滤波噪声）、低音铺底（正弦）
   「配器即遗忘」：章节末通过 thin 参数让乐器逐件消失 */
XY.Audio = (function () {
  const U = XY.Util;
  let ctx = null, master = null;
  let rainNodes = null, padNodes = null;
  let muted = false;
  const PENTA = [261.63, 293.66, 329.63, 392.0, 440.0]; // 宫商角徵羽
  const pluckCache = {};

  function ensure() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return true; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.9;
      master.connect(ctx.destination);
    } catch (e) { ctx = null; }
    return !!ctx;
  }

  function setMuted(m) { muted = m; if (master) master.gain.value = m ? 0 : 0.9; }
  function isMuted() { return muted; }

  // ---------- Karplus-Strong 拨弦 ----------
  // soft>0 时对激励噪声做滑动平均预平滑：削掉起振高频毛刺，音色更温润
  // 全部音频调用均含 try/catch 兜底：标签页切后台等场景 AudioContext 状态变化
  // 不允许中断游戏主循环
  function ksBuffer(freq, dur, decay, soft) {
    try {
      const sr = ctx.sampleRate;
      const N = Math.max(2, Math.round(sr / freq));
      const len = Math.floor(sr * dur);
      const data = new Float32Array(len);
      const ring = new Float32Array(N);
      for (let i = 0; i < N; i++) ring[i] = Math.random() * 2 - 1;
      if (soft > 0) {
        // soft: 0..1，迭代平滑激励（1 次 = 2 点均值）
        const passes = 1 + Math.round(soft * 5);
        for (let p = 0; p < passes; p++) {
          let prev = ring[N - 1];
          for (let i = 0; i < N; i++) {
            const cur = ring[i];
            ring[i] = (prev + cur) * 0.5;
            prev = cur;
          }
        }
      }
      let idx = 0;
      for (let i = 0; i < len; i++) {
        const cur = ring[idx];
        const nxt = ring[(idx + 1) % N];
        ring[idx] = decay * 0.5 * (cur + nxt);
        data[i] = cur;
        idx = (idx + 1) % N;
      }
      const fade = Math.min(3000, len);
      for (let i = 0; i < fade; i++) data[len - 1 - i] *= i / fade;
      const buf = ctx.createBuffer(1, len, sr);
      buf.getChannelData(0).set(data);
      return buf;
    } catch (e) { return null; }
  }

  // warm: 低通 + 柔激励 + 淡入 —— 用于引线等需要"温润"质感的音
  function pluck(freq, vel, when, opts) {
    try {
      if (!ctx || muted) return;
      opts = opts || {};
      const key = Math.round(freq * 10) + (opts.soft ? 's' : '');
      let buf = pluckCache[key];
      if (!buf) { buf = ksBuffer(freq, 2.4, 0.9945, opts.soft || 0); if (!buf) return; pluckCache[key] = buf; }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const g = ctx.createGain();
      const t0 = when || ctx.currentTime;
      if (opts.attack) {
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.linearRampToValueAtTime(vel == null ? 0.3 : vel, t0 + opts.attack);
      } else {
        g.gain.value = vel == null ? 0.3 : vel;
      }
      let tail = g;
      if (opts.lp) {
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass'; lp.frequency.value = opts.lp; lp.Q.value = 0.5;
        g.connect(lp); tail = lp;
      }
      src.connect(g); tail.connect(master);
      src.start(t0);
    } catch (e) {}
  }

  // ---------- 雨声 ----------
  function noiseBuffer(dur) {
    const b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  function rain(on) {
    if (!ensure()) return;
    if (on && !rainNodes) {
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer(3); src.loop = true;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 850; lp.Q.value = 0.4;
      const g = ctx.createGain(); g.gain.value = 0;
      src.connect(lp); lp.connect(g); g.connect(master);
      src.start();
      g.gain.linearRampToValueAtTime(0.075, ctx.currentTime + 2.5);
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.13;
      const lfoG = ctx.createGain(); lfoG.gain.value = 180;
      lfo.connect(lfoG); lfoG.connect(lp.frequency); lfo.start();
      rainNodes = { src, g, lfo };
    } else if (!on && rainNodes) {
      const n = rainNodes; rainNodes = null;
      n.g.gain.linearRampToValueAtTime(0, ctx.currentTime + 1.2);
      setTimeout(function () { try { n.src.stop(); n.lfo.stop(); } catch (e) {} }, 1500);
    }
  }

  // ---------- 低音铺底 ----------
  function pad(on) {
    if (!ensure()) return;
    if (on && !padNodes) {
      const g = ctx.createGain(); g.gain.value = 0;
      g.gain.linearRampToValueAtTime(0.035, ctx.currentTime + 3);
      g.connect(master);
      const oscs = [];
      [110, 164.81, 220.5].forEach(function (f, i) {
        const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
        const og = ctx.createGain(); og.gain.value = i === 2 ? 0.35 : 0.8;
        o.connect(og); og.connect(g); o.start();
        oscs.push(o);
      });
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07;
      const lg = ctx.createGain(); lg.gain.value = 0.012;
      lfo.connect(lg); lg.connect(g.gain); lfo.start();
      padNodes = { oscs, g, lfo };
    } else if (!on && padNodes) {
      const n = padNodes; padNodes = null;
      n.g.gain.linearRampToValueAtTime(0, ctx.currentTime + 1.5);
      setTimeout(function () {
        n.oscs.forEach(function (o) { try { o.stop(); } catch (e) {} });
        try { n.lfo.stop(); } catch (e) {}
      }, 1800);
    }
  }

  // ---------- 主题旋律（thin: 1 完整 → 0 只剩单音/无声，乐器逐件消失） ----------
  function motif(thin) {
    if (!ctx || muted) return;
    const t0 = ctx.currentTime + 0.1;
    const mel = [PENTA[2], PENTA[3], PENTA[4], PENTA[3], PENTA[2], PENTA[1], PENTA[0], PENTA[1]];
    const gaps = [0, .6, 1.2, 2.1, 2.7, 3.6, 4.2, 5.1];
    const keep = thin == null ? 1 : thin;
    mel.forEach(function (f, i) {
      // 音符按索引逐渐丢失：keep 越低，保留越少
      if (i / mel.length > keep) return;
      const oct = (i === 5 || i === 7) ? 1 : 0;
      pluck(f * (oct ? 1 : 0.5) * 2 * (oct ? 1 : 1), 0.22 - i * 0.012, t0 + gaps[i]);
    });
    if (keep > 0.35) pluck(PENTA[0] * 0.5, 0.18, t0 + 0.05);
  }

  function stopMusic() { pad(false); }

  // ---------- 音效 ----------
  const sfx = {
    // 引线（扯线）：温润低音区拨弦 + 一缕极轻的"线滑"气声，不再尖锐
    stitch: function () {
      if (!ctx || muted) return;
      const t = ctx.currentTime;
      pluck(PENTA[Math.floor(Math.random() * 5)], 0.13, t, { soft: 0.7, lp: 1500, attack: 0.012 });
      // 线被拉动的柔和滑动声（带通噪声，音量很低）
      const src = ctx.createBufferSource(); src.buffer = noiseBuffer(0.12);
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 950; bp.Q.value = 1.2;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.035, t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      src.connect(bp); bp.connect(g); g.connect(master); src.start(t);
    },
    chime: function () {
      if (!ctx || muted) return;
      pluck(PENTA[2] * 2, 0.24, ctx.currentTime, { soft: 0.4, lp: 2600, attack: 0.008 });
      pluck(PENTA[4] * 2, 0.19, ctx.currentTime + 0.18, { soft: 0.4, lp: 2600, attack: 0.008 });
    },
    snap: function () {
      if (!ctx || muted) return;
      const t = ctx.currentTime;
      const src = ctx.createBufferSource(); src.buffer = noiseBuffer(0.08);
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1400;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.38, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
      src.connect(hp); hp.connect(g); g.connect(master); src.start(t);
      const o = ctx.createOscillator(); o.type = 'triangle';
      o.frequency.setValueAtTime(220, t);
      o.frequency.exponentialRampToValueAtTime(70, t + 0.12);
      const og = ctx.createGain();
      og.gain.setValueAtTime(0.25, t);
      og.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
      o.connect(og); og.connect(master); o.start(t); o.stop(t + 0.16);
    },
    page: function () {
      if (!ctx || muted) return;
      const t = ctx.currentTime;
      const src = ctx.createBufferSource(); src.buffer = noiseBuffer(0.25);
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 3200; bp.Q.value = 0.7;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.12, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
      src.connect(bp); bp.connect(g); g.connect(master); src.start(t);
    },
    sweep: function (dur) {
      if (!ctx || muted) return;
      const t = ctx.currentTime, d = dur || 5;
      const src = ctx.createBufferSource(); src.buffer = noiseBuffer(d); src.loop = true;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
      lp.frequency.setValueAtTime(6000, t);
      lp.frequency.exponentialRampToValueAtTime(220, t + d);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.16, t + d * 0.35);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      src.connect(lp); lp.connect(g); g.connect(master); src.start(t); src.stop(t + d + 0.1);
    },
    thud: function () {
      if (!ctx || muted) return;
      const t = ctx.currentTime;
      [0, 0.45].forEach(function (dt) {
        const o = ctx.createOscillator(); o.type = 'sine';
        o.frequency.setValueAtTime(68, t + dt);
        o.frequency.exponentialRampToValueAtTime(40, t + dt + 0.3);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.5, t + dt);
        g.gain.exponentialRampToValueAtTime(0.001, t + dt + 0.35);
        o.connect(g); g.connect(master); o.start(t + dt); o.stop(t + dt + 0.4);
      });
    }
  };

  return { ensure, setMuted, isMuted, rain, pad, motif, stopMusic, sfx };
})();
