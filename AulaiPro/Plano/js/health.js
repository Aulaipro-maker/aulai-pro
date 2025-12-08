// js/health.js
(function(){
  if (window.__lessonai_health_loaded) {
    console.warn("[LessonAI] health.js já carregado — ignorando duplicata");
    return;
  }
  window.__lessonai_health_loaded = true;

  const badge = document.getElementById('backend-status');
  const dot   = document.getElementById('health-dot');

  const INTERVAL_MS = 15000;  // intervalo padrão entre pings
  const TIMEOUT_MS  = 5000;   // timeout curto só para /api/ping
  let   timer       = null;
  let   lastStatus  = null;   // 'ok' | 'err'

  function setStatus(ok, latencyMs){
    if (ok) {
      if (badge){
        badge.textContent = 'conectado';
        badge.classList.remove('err');
        badge.classList.add('ok', 'badge');
        if (typeof latencyMs === 'number') {
          badge.title = `Backend OK • ~${latencyMs} ms`;
        } else {
          badge.title = 'Backend OK';
        }
      }
      if (dot){
        dot.classList.remove('dot-off');
        dot.title = badge?.title || 'OK';
      }
      lastStatus = 'ok';
    } else {
      if (badge){
        badge.textContent = 'desconectado';
        badge.classList.remove('ok');
        badge.classList.add('err', 'badge');
        badge.title = 'Sem conexão com o backend';
      }
      if (dot){
        dot.classList.add('dot-off');
        dot.title = badge?.title || 'Erro';
      }
      lastStatus = 'err';
    }
  }

  async function pingOnce(){
    const t0 = performance.now();
    try{
      // usa helper GET do env.js com timeout específico e 1 retry leve
      await GET('/api/ping', { retries: 1, headers: {}, /* credentials herdado */ });
      const dt = Math.round(performance.now() - t0);
      setStatus(true, dt);
    }catch(e){
      setStatus(false);
    }
  }

  function start(){
    if (timer) return;
    // dispara um ping imediato ao iniciar
    pingOnce();
    timer = setInterval(pingOnce, INTERVAL_MS);
  }

  function stop(){
    if (timer){
      clearInterval(timer);
      timer = null;
    }
  }

  // pausa quando aba fica oculta; retoma ao voltar
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      stop();
    } else {
      start();
    }
  });

  // reage ao estado de rede do navegador
  window.addEventListener('online',  () => { setStatus(lastStatus === 'ok', undefined); start(); });
  window.addEventListener('offline', () => { setStatus(false); stop(); });

  // inicia
  start();
})();
