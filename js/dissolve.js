"use strict";
/* 绣忆 · dissolve.js — 章节末「拆线溶解」
   整个场景沿针脚被一针一针拆开：前沿是一道行进的缝线，
   拆下的线头散落飘坠，身后只剩空白缎面。 */
XY.DissolveFX = (function () {
  const U = XY.Util, A = XY.Art, Au = XY.Audio;

  function DissolveFX(opts) {
    opts = opts || {};
    this.dur = opts.dur || 7;
    this.t = 0;
    this.done = false;
    this.doneT = 0;
    this.seed = 13;
    // 快照
    this.snap = document.createElement('canvas');
    this.snap.width = 1280; this.snap.height = 720;
    const sc = this.snap.getContext('2d');
    A.draw(sc, opts.bg || 'room', 0, opts.bgOpts || { evening: true });
    this.particles = [];
    this.spawnedX = {};
    Au.sfx.sweep(this.dur);
    Au.pad(false);
  }

  DissolveFX.prototype.frontY = function (x) {
    const p = this.t;
    return p * (720 + 260) - 130
      + (U.noise2(x * 0.006, 7, this.seed) - 0.5) * 70
      + Math.sin(x * 0.02 + this.t * 9) * 9;
  };

  DissolveFX.prototype.update = function (dt) {
    this.t += dt / this.dur;
    // 沿前沿散落线头
    for (let band = 0; band < 14; band++) {
      const x = 40 + band * 90;
      const fy = this.frontY(x);
      if (fy > -20 && fy < 740 && !this.spawnedX[band + '_' + Math.floor(this.t * 20)]) {
        if (Math.random() < 0.5) {
          this.spawnedX[band + '_' + Math.floor(this.t * 20)] = true;
          const cols = ['#b03a2e', '#c9a86a', '#8c2b22', '#7a8a5f'];
          this.particles.push({
            x: x + (Math.random() - 0.5) * 40,
            y: fy,
            vx: (Math.random() - 0.5) * 24,
            vy: 26 + Math.random() * 40,
            rot: Math.random() * U.TAU,
            vr: (Math.random() - 0.5) * 3,
            len: 7 + Math.random() * 12,
            color: cols[Math.floor(Math.random() * cols.length)],
            life: 1.6 + Math.random() * 0.8
          });
        }
      }
    }
    this.particles.forEach(function (p2) {
      p2.x += p2.vx * dt; p2.y += p2.vy * dt;
      p2.vy += 26 * dt; p2.rot += p2.vr * dt;
      p2.life -= dt;
    });
    this.particles = this.particles.filter(function (p2) { return p2.life > 0 && p2.y < 780; });
    if (this.t >= 1.16) {
      this.t = 1.16;
      this.done = true;
      this.doneT += dt;
    }
  };

  DissolveFX.prototype.draw = function (ctx) {
    const P = A.PALETTE;
    // 空白缎面
    ctx.fillStyle = A.grad(ctx, 0, 0, 0, 720, [[0, '#f1ead7'], [1, '#e0d3b2']]);
    ctx.fillRect(0, 0, 1280, 720);
    const pat = ctx.createPattern(A._silkTex(), 'repeat');
    ctx.save(); ctx.globalAlpha = 0.45; ctx.fillStyle = pat; ctx.fillRect(0, 0, 1280, 720); ctx.restore();

    // 场景（被裁剪在前沿之上）
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(-10, -10);
    ctx.lineTo(1290, -10);
    for (let x = 1280; x >= 0; x -= 16) {
      ctx.lineTo(x, this.frontY(x));
    }
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(this.snap, 0, 0);
    ctx.restore();

    // 拆线前沿：一道行进的红色行缝
    const frontPts = [];
    for (let x = 0; x <= 1280; x += 18) frontPts.push({ x: x, y: this.frontY(x) });
    if (!this.done || this.doneT < 1.2) {
      A.stitchPath(ctx, frontPts, { color: P.red, w: 9, gap: 3.4, seed: 77, alpha: 0.95 });
    }
    // 线头粒子
    this.particles.forEach(function (p2) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, p2.life);
      ctx.translate(p2.x, p2.y); ctx.rotate(p2.rot);
      ctx.strokeStyle = p2.color; ctx.lineWidth = 2; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-p2.len / 2, 0);
      ctx.quadraticCurveTo(0, p2.len * 0.4, p2.len / 2, 0);
      ctx.stroke();
      ctx.restore();
    });

    A.vignette(ctx, 0.3);
    if (this.done && this.doneT > 1.0) {
      ctx.save();
      ctx.globalAlpha = Math.min(0.7, (this.doneT - 1.0));
      A.setFont(ctx, 20, { align: 'center' });
      ctx.fillStyle = P.inkLight;
      ctx.fillText('……（点按继续）', 640, 660);
      ctx.restore();
    }
  };

  return DissolveFX;
})();
