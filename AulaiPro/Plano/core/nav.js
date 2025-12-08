/* core/nav.js — força navegação dura no switch */
(() => {
  function hardLink(id, tipo, href){
    const el = document.getElementById(id);
    if (!el || !href) return;
    el.addEventListener('click', (ev) => {
      try { localStorage.setItem('lessonai.tipo', tipo); } catch {}
      ev.preventDefault();
      ev.stopImmediatePropagation();
      window.location.assign(href);
    }, { capture: true });
  }

  document.addEventListener('DOMContentLoaded', () => {
    const PAGE = document.body?.dataset?.page || 'basico';
    if (PAGE === 'basico')  hardLink('btn-tecnico', 'tecnico', '/app/tecnico/index.html');
    if (PAGE === 'tecnico') hardLink('btn-basico',  'basico',  '/app/basico/index.html');
  });
})();
