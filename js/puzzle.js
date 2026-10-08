"use strict";
/* 绣忆 · puzzle.js — 核心玩法「引线解谜」
   沿针眼依次引线，线绷太紧会断（leash 机制）；
   断线次数计入 Game.stats.snaps，决定尾声文案。 */
XY.Puzzle = (function () {
  const U = XY.Util, A = XY.Art, Au = XY.Audio;

  function Puzzle(defId, opts) {
    opts = opts || {};
    const def = XY.Story.PUZZLES[defId];
    this.def = def;
    this.friendly = !!opts.friendly;
    this.paths = def.paths.map(function (pts, i) {
      return {
        pts: pts,
        color: (def.threads && def.threads[i]) || def.thread,
        done: false,
        confirmed: 0,        // 已穿过的针眼数（含起针点）
        trail: [],           // 自由拖拽的线迹
        shimmer: 0
      };
    });
    this.active = -1;
    this.cursor = null;
    this.hoverStart = null;  // 悬停吸附的起针点 {x,y,i}
    this.snaps = 0;
    this.snapFx = null;      // {x,y,t}
    this.shake = 0;
    this.done = false;
    this.doneDelay = 0;
    this.t = 0;
    this.tol = 40;
    this.leash = 175;
    this.onComplete = null;
  }

  Puzzle.prototype._firstTodo = function () {
    for (let i = 0; i < this.paths.length; i++) {
      if (!this.paths[i].done && !(this.active >= 0)) return i;
    }
    return -1;
  };

  Puzzle.prototype.down = function (p) {
    if (this.done) return;
    if (this.active < 0) {
      for (let i = 0; i < this.paths.length; i++) {
        const path = this.paths[i];
        if (path.done) continue;
        const start = path.pts[0];
        if (U.dist(p.x, p.y, start.x, start.y) < this.tol * 1.6) {
          this.active = i;
          path.confirmed = 1;
          path.trail = [{ x: start.x, y: start.y }];
          this.cursor = p;
          Au.sfx.stitch();
          return;
        }
      }
    } else {
      this.move(p);
    }
  };

  Puzzle.prototype.move = function (p) {
    this.cursor = p;
    // 悬停时检测起针点吸附（未按下的状态下给出可视反馈）
    this.hoverStart = null;
    if (!this.done && this.active < 0) {
      for (let i = 0; i < this.paths.length; i++) {
        const hpath = this.paths[i];
        if (hpath.done) continue;
        const hs = hpath.pts[0];
        if (U.dist(p.x, p.y, hs.x, hs.y) < this.tol * 1.6) {
          this.hoverStart = { x: hs.x, y: hs.y, i: i };
          break;
        }
      }
    }
    if (this.done || this.active < 0) return;
    const path = this.paths[this.active];
    if (!path || path.done) return;
    const last = path.pts[path.confirmed - 1];
    // 线绷太紧 → 断线
    if (U.dist(p.x, p.y, last.x, last.y) > this.leash) {
      this.snaps++;
      XY.Game.stats.snaps++;
      Au.sfx.snap();
      this.snapFx = { x: last.x, y: last.y, t: 0 };
      if (!this.friendly) this.shake = 0.35;
      path.trail = [{ x: last.x, y: last.y }];
      return;
    }
    // 穿过下一个针眼
    const next = path.pts[path.confirmed];
    if (next && U.dist(p.x, p.y, next.x, next.y) < this.tol) {
      path.confirmed++;
      Au.sfx.stitch();
      if (path.confirmed >= path.pts.length) {
        path.done = true;
        path.shimmer = 1;
        path.trail = [];
        this.active = -1;
        Au.sfx.chime();
        if (this.paths.every(function (pp) { return pp.done; })) {
          this.done = true;
          this.doneDelay = 1.5;
        }
      }
      return;
    }
    // 记录线迹
    const tl = path.trail[path.trail.length - 1];
    if (!tl || U.dist(p.x, p.y, tl.x, tl.y) > 7) path.trail.push({ x: p.x, y: p.y });
    if (path.trail.length > 160) path.trail.shift();
  };

  Puzzle.prototype.up = function () {
    if (this.active >= 0) {
      const path = this.paths[this.active];
      if (path && !path.done) {
        const last = path.pts[path.confirmed - 1];
        path.trail = [{ x: last.x, y: last.y }];
      }
    }
  };

  Puzzle.prototype.update = function (dt) {
    this.t += dt;
    this.paths.forEach(function (p) {
      if (p.shimmer > 0) p.shimmer = Math.max(0, p.shimmer - dt * 0.8);
    });
    if (this.snapFx) {
      this.snapFx.t += dt * 2.4;
      if (this.snapFx.t > 1) this.snapFx = null;
    }
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt);
    if (this.done && this.doneDelay > 0) {
      this.doneDelay -= dt;
      if (this.doneDelay <= 0 && this.onComplete) {
        const cb = this.onComplete; this.onComplete = null; cb();
      }
    }
  };

  Puzzle.prototype.draw = function (ctx) {
    const P = A.PALETTE;
    ctx.save();
    if (this.shake > 0) {
      ctx.translate((Math.random() - 0.5) * 8 * this.shake, (Math.random() - 0.5) * 8 * this.shake);
    }
    // 缎面
    ctx.fillStyle = A.grad(ctx, 0, 0, 0, 720, [[0, '#f4eedd'], [1, '#e5d8ba']]);
    ctx.fillRect(0, 0, 1280, 720);
    const pat = ctx.createPattern(XY.Art._silkTex(), 'repeat');
    ctx.save(); ctx.globalAlpha = 0.5; ctx.fillStyle = pat; ctx.fillRect(0, 0, 1280, 720); ctx.restore();
    // 绷架木框
    ctx.strokeStyle = P.wood; ctx.lineWidth = 16;
    ctx.strokeRect(150, 118, 980, 510);
    ctx.strokeStyle = P.woodDark; ctx.lineWidth = 4;
    ctx.strokeRect(142, 110, 996, 526);
    // 标题与提示
    A.setFont(ctx, 30, { weight: 'bold', align: 'center' });
    ctx.fillStyle = P.ink;
    ctx.fillText(this.def.name, 640, 70);
    A.setFont(ctx, 17, { align: 'center' });
    ctx.fillStyle = P.inkLight;
    ctx.fillText(this.def.hint, 640, 96);
    // 进度
    const doneN = this.paths.filter(function (p) { return p.done; }).length;
    A.setFont(ctx, 18, { align: 'right' });
    ctx.fillStyle = P.inkLight;
    ctx.fillText('第 ' + Math.min(doneN + 1, this.paths.length) + ' / ' + this.paths.length + ' 段', 1250, 676);
    A.setFont(ctx, 15, { align: 'left' });
    ctx.fillText('从 ◉ 起针，按顺序穿过针眼；线绷太直会断', 172, 676);

    const firstTodo = this._firstTodo();
    for (let i = 0; i < this.paths.length; i++) {
      const path = this.paths[i];
      if (path.done) {
        A.stitchPath(ctx, path.pts, { color: path.color, w: 13, gap: 3.6, seed: 30 + i });
        if (path.shimmer > 0) {
          ctx.save();
          ctx.globalAlpha = path.shimmer * 0.8;
          ctx.strokeStyle = '#fff8e8'; ctx.lineWidth = 3;
          const pt = path.pts[Math.min(path.pts.length - 1, Math.floor((1 - path.shimmer) * path.pts.length))];
          ctx.beginPath(); ctx.arc(pt.x, pt.y, 14 + path.shimmer * 10, 0, U.TAU); ctx.stroke();
          ctx.restore();
        }
        continue;
      }
      const isActive = (this.active === i);
      // 针眼与底稿
      const guideAlpha = isActive ? 0.85 : (i === firstTodo ? 0.55 : 0.3);
      path.pts.forEach(function (pt, j) {
        if (j < path.confirmed) return;
        A.prickedDot(ctx, pt.x, pt.y, 3, 'rgba(58,51,43,' + guideAlpha + ')');
      });
      ctx.save();
      ctx.globalAlpha = guideAlpha * 0.35;
      ctx.setLineDash([4, 7]);
      ctx.strokeStyle = P.ink; ctx.lineWidth = 1.2;
      ctx.beginPath();
      path.pts.forEach(function (pt, j) {
        if (j < path.confirmed) return;
        j === path.confirmed ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y);
      });
      ctx.stroke();
      ctx.restore();
      // 起针点高亮
      if (i === firstTodo && !isActive) {
        const s = path.pts[0];
        const pulse = 0.5 + 0.5 * Math.sin(this.t * 3);
        ctx.save();
        ctx.strokeStyle = 'rgba(176,58,46,' + (0.5 + pulse * 0.4) + ')';
        ctx.lineWidth = 2.4;
        ctx.beginPath(); ctx.arc(s.x, s.y, 12 + pulse * 6, 0, U.TAU); ctx.stroke();
        A.setFont(ctx, 15, { align: 'center' });
        ctx.fillStyle = P.red;
        ctx.fillText('起针', s.x, s.y - 22);
        ctx.restore();
      }
      // 已确认部分 + 线迹
      if (path.confirmed > 1) {
        A.stitchPath(ctx, path.pts.slice(0, path.confirmed), { color: path.color, w: 13, gap: 3.6, seed: 30 + i });
      }
      if (isActive && path.trail.length > 1) {
        A.stitchPath(ctx, path.trail, { color: path.color, w: 8, gap: 5, alpha: 0.85, seed: 40 + i });
      }
    }
    // 悬停吸附高亮：靠近起针点时给一圈醒目的“可下针”提示
    if (this.hoverStart && this.active < 0 && !this.done) {
      const hs = this.hoverStart;
      ctx.save();
      ctx.fillStyle = 'rgba(176,58,46,0.16)';
      ctx.beginPath(); ctx.arc(hs.x, hs.y, 22, 0, U.TAU); ctx.fill();
      ctx.strokeStyle = P.red; ctx.lineWidth = 2.6;
      ctx.beginPath(); ctx.arc(hs.x, hs.y, 16, 0, U.TAU); ctx.stroke();
      ctx.setLineDash([4, 4]); ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(hs.x, hs.y, 24, 0, U.TAU); ctx.stroke();
      ctx.setLineDash([]);
      A.setFont(ctx, 14, { align: 'center' });
      ctx.fillStyle = P.redDeep;
      ctx.fillText('按住拖拽', hs.x, hs.y + 40);
      ctx.restore();
    }
    // 松弛的线：最后针眼 → 光标
    if (this.active >= 0 && this.cursor) {
      const path = this.paths[this.active];
      const last = path.pts[path.confirmed - 1];
      ctx.save();
      ctx.strokeStyle = path.color; ctx.lineWidth = 2; ctx.lineCap = 'round';
      ctx.globalAlpha = 0.9;
      const mx = (last.x + this.cursor.x) / 2, my = (last.y + this.cursor.y) / 2 + 30;
      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.quadraticCurveTo(mx, my, this.cursor.x, this.cursor.y);
      ctx.stroke();
      ctx.restore();
      A.needle(ctx, this.cursor.x, this.cursor.y, path.color);
    } else if (this.cursor && !this.done) {
      // 未拖拽时也显示绣针光标（无线），保证光标始终可见
      A.needle(ctx, this.cursor.x, this.cursor.y, null);
    }
    // 断线特效
    if (this.snapFx) {
      const fx = this.snapFx;
      ctx.save();
      ctx.globalAlpha = 1 - fx.t;
      ctx.strokeStyle = P.red; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(fx.x, fx.y, 10 + fx.t * 40, 0, U.TAU); ctx.stroke();
      ctx.font = 'bold 20px serif'; ctx.fillStyle = P.red; ctx.textAlign = 'center';
      ctx.fillText('断线', fx.x, fx.y - 26 - fx.t * 20);
      ctx.restore();
    }
    // 全部完成
    if (this.done) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, (1.5 - this.doneDelay) * 0.9);
      A.setFont(ctx, 40, { weight: 'bold', align: 'center' });
      ctx.fillStyle = P.redDeep;
      ctx.fillText('—— 收针 ——', 640, 660);
      ctx.restore();
    }
    ctx.restore();
    A.vignette(ctx, 0.22);
  };

  return Puzzle;
})();
