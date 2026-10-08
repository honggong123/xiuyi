"use strict";
/* 绣忆 · main.js — 引导、缩放、主循环与输入分发 */
(function () {
  const canvas = document.getElementById('game');
  const loadingEl = document.getElementById('loading');
  const ctx = canvas.getContext('2d');
  const DPR = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = 1280 * DPR;
  canvas.height = 720 * DPR;

  function resize() {
    const ww = window.innerWidth, wh = window.innerHeight;
    const s = Math.min(ww / 1280, wh / 720);
    canvas.style.width = Math.floor(1280 * s) + 'px';
    canvas.style.height = Math.floor(720 * s) + 'px';
  }
  window.addEventListener('resize', resize);
  resize();

  function toLogical(e) {
    const r = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) * 1280 / r.width,
      y: (e.clientY - r.top) * 720 / r.height
    };
  }

  canvas.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    if (XY.Game) XY.Game.onDown(toLogical(e));
  });
  canvas.addEventListener('pointermove', function (e) {
    if (XY.Game) XY.Game.onMove(toLogical(e));
  });
  canvas.addEventListener('pointerup', function (e) {
    if (XY.Game) XY.Game.onUp(toLogical(e));
  });
  window.addEventListener('keydown', function (e) {
    if (XY.Game) XY.Game.onKey(e);
  });

  function boot() {
    if (loadingEl) {
      loadingEl.style.opacity = 0;
      setTimeout(function () { loadingEl.style.display = 'none'; }, 900);
    }
    XY.Actor.init();
    // PNG 素材就绪后失效背景缓存：相框照片改用素材脸重绘
    XY.Actor.onSkinsReady(function () { if (XY.Art.invalidateBackCache) XY.Art.invalidateBackCache(); });
    XY.Album.init();
    XY.Game.start(canvas, ctx, DPR);
    let last = performance.now();
    function frame(now) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      XY.Game.update(dt);
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      XY.Game.draw(ctx);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  window.addEventListener('load', function () {
    if (window.XY && XY.Art && XY.Actor && XY.Album && XY.Game) XY.Art.init(boot);
    else if (loadingEl) loadingEl.textContent = '加载失败，请检查 js/ 目录文件是否完整。';
  });
})();
