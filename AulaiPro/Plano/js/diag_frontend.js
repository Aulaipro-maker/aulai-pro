// js/diag_frontend.js
// ============================================
// Diagnóstico centralizado para o frontend
// - Captura erros JS e promessas rejeitadas
// - Destaca arquivos api.js, funnel.js, index.html
// ============================================

(function () {
  const FILES_INTERESSE = ["api.js", "funnel.js", "index.html"];

  function _filtrarStack(stack) {
    if (!stack || typeof stack !== "string") return [];
    const linhas = stack.split("\n");
    const relevantes = [];

    for (const ln of linhas) {
      const trimmed = ln.trim();
      if (!trimmed) continue;
      const achou = FILES_INTERESSE.some((f) => trimmed.includes(f));
      if (achou) relevantes.push(trimmed);
    }

    // Se não achou nada "nosso", devolve as primeiras linhas mesmo assim
    if (!relevantes.length) {
      return linhas.slice(0, 5).map((ln) => ln.trim());
    }
    return relevantes;
  }

  function logErroJS(tag, msg, source, lineno, colno, error) {
    console.group(`[FRONT][${tag}] Erro capturado`);

    console.log("Mensagem:", msg);
    if (source) console.log("Arquivo:", source, "linha:", lineno, "coluna:", colno);

    const stack =
      (error && error.stack) ||
      (typeof msg === "string" && msg) ||
      "(sem stack disponível)";

    const relevantes = _filtrarStack(stack);
    console.log("Stack relevante:");
    relevantes.forEach((ln) => console.log("  ", ln));

    console.groupEnd();
  }

  // window.onerror: erros não capturados
  window.onerror = function (msg, source, lineno, colno, error) {
    logErroJS("onerror", msg, source, lineno, colno, error);
    // retornar false deixa o navegador continuar o tratamento padrão
    return false;
  };

  // Promessas rejeitadas sem catch
  window.addEventListener("unhandledrejection", function (event) {
    const error = event.reason;
    const msg =
      (error && error.message) ||
      (typeof error === "string" && error) ||
      "Unhandled rejection";

    logErroJS("unhandledrejection", msg, "(promise)", 0, 0, error);
  });

  // Helper opcional para interpretar o JSON de erro do backend (detail.debug)
  function logBackendDebug(detail) {
    if (!detail || !detail.debug) {
      console.warn("[FRONT][BackendDebug] detail.debug ausente ou inválido:", detail);
      return;
    }
    const dbg = detail.debug;
    console.group("[FRONT][BackendDebug] Erro backend");
    console.log("Tipo:", dbg.type);
    console.log("Mensagem:", dbg.message);
    console.log("Contexto:", dbg.context);
    if (Array.isArray(dbg.frames) && dbg.frames.length) {
      console.log("Frames relevantes:");
      console.table(dbg.frames);
    }
    console.groupEnd();
  }

  // expõe para uso manual no console, se quiser
  window.DIAG_FRONT = {
    logBackendDebug,
  };
})();
