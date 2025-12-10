// js/health.js
(function () {
  if (window.__lessonai_health_loaded) {
    console.warn("[LessonAI] health.js já carregado — ignorando duplicata");
    return;
  }
  window.__lessonai_health_loaded = true;

  const badge = document.getElementById("backend-status");
  const dot   = document.getElementById("health-dot");

  const INTERVAL_MS = 15000; // intervalo entre pings
  const TIMEOUT_MS  = 5000;  // timeout só para o ping
  let   timer       = null;
  let   lastStatus  = null;  // 'ok' | 'err' | null

  // Helper: há backend configurado?
  function hasBackendConfigured() {
    // Com env.js novo, ENV.hasBackend já diz se existe BASE
    if (window.ENV && typeof window.ENV.hasBackend === "boolean") {
      return window.ENV.hasBackend && !!window.ENV.API_BASE;
    }
    // fallback: usa window.API_BASE se ENV não existir
    return !!window.API_BASE;
  }

  function setStatus(ok, latencyMs) {
    if (ok) {
      if (badge) {
        badge.textContent = "conectado";
        badge.classList.remove("err");
        badge.classList.add("ok", "badge");
        if (typeof latencyMs === "number") {
          badge.title = `Backend OK • ~${latencyMs} ms`;
        } else {
          badge.title = "Backend OK";
        }
      }
      if (dot) {
        dot.classList.remove("dot-off");
        dot.title = badge?.title || "OK";
      }
      lastStatus = "ok";
    } else {
      if (badge) {
        // Diferencia “sem backend configurado” de “erro de conexão”
        const hasBackend = hasBackendConfigured();
        badge.textContent = hasBackend ? "desconectado" : "não configurado";
        badge.classList.remove("ok");
        badge.classList.add("err", "badge");
        badge.title = hasBackend
          ? "Sem conexão com o backend"
          : "Nenhum backend configurado (API_BASE indefinida)";
      }
      if (dot) {
        dot.classList.add("dot-off");
        dot.title = badge?.title || "Erro";
      }
      lastStatus = "err";
    }
  }

  async function pingOnce() {
    // 1) Se não há backend configurado, não tenta pingar
    if (!hasBackendConfigured()) {
      console.warn(
        "[Health] Nenhum backend configurado — ignorando /api/ping",
        "ENV.API_BASE =", window.ENV?.API_BASE,
        "| API_BASE =", window.API_BASE
      );
      setStatus(false);
      return;
    }

    const t0 = performance.now();
    try {
      // usa helper GET definido em env.js
      // (se quiser forçar timeout menor, pode usar window.http diretamente)
      await GET("/api/ping", {
        retries: 1,
        // se quiser forçar timeout menor, troque GET por http('GET', ...)
        // e passe TIMEOUT_MS lá. Com GET, usa timeout padrão de env.js.
      });
      const dt = Math.round(performance.now() - t0);
      setStatus(true, dt);
    } catch (e) {
      console.error("[Health] Falha no ping /api/ping:", e);
      setStatus(false);
    }
  }

  function start() {
    if (timer) return;

    // Se não há backend, apenas marca como “não configurado” e não cria intervalo
    if (!hasBackendConfigured()) {
      console.warn(
        "[Health] start() chamado sem backend configurado — não será criado intervalo de ping"
      );
      setStatus(false);
      return;
    }

    // dispara um ping imediato ao iniciar
    pingOnce();
    timer = setInterval(pingOnce, INTERVAL_MS);
  }

  function stop() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  // pausa quando aba fica oculta; retoma ao voltar
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      stop();
    } else {
      start();
    }
  });

  // reage ao estado de rede do navegador
  window.addEventListener("online", () => {
    const ok = lastStatus === "ok";
    setStatus(ok, undefined);
    start();
  });
  window.addEventListener("offline", () => {
    setStatus(false);
    stop();
  });

  // inicia
  start();
})();
