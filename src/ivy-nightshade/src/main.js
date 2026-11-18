(function () {
  const G = window.G;
  function boot() {
    G.initCanvas();
    const q = new URLSearchParams(location.search);
    if (q.has('level')) G.game.start(parseInt(q.get('level'), 10) || 0, { skipStory: true });
    else G.scenes.set(G.ui.MenuScene);
    G.startLoop();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
