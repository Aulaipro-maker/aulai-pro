// js/env.js
(function () {
  // PATCH 1: detectar se estamos rodando localmente
  const host = window.location.hostname;
  const isLocalHost = /^(localhost|127\.0\.0\.1)$/.test(host);

  // regex para URLs do tipo localhost/127.0.0.1
  const LOCAL_RE = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i;

  // 1) Base URL: honra <body data-api-base="...">, depois window.API_BASE
  const fromBodyRaw = document.body?.dataset?.apiBase?.trim();
  const currentRaw =
    typeof window.API_BASE === "string" && window.API_BASE.trim()
      ? window.API_BASE.trim()
      : null;

  // ⚠️ Em produção, ignorar valores que apontem para localhost/127.0.0.1
  const fromBody =
    !isLocalHost && fromBodyRaw && LOCAL_RE.test(fromBodyRaw)
      ? null
      : fromBodyRaw;

  const current =
    !isLocalHost && currentRaw && LOCAL_RE.test(currentRaw)
      ? null
      : currentRaw;

  // PATCH 2: Fallback só em ambiente local
  // → Em produção (Vercel) o fallback é null (sem tentar 127.0.0.1)
  const fallback = isLocalHost ? "http://127.0.0.1:8000" : null;

  const baseRaw = fromBody || current || fallback;

  // normaliza para não duplicar barras e nem perder protocolo
  function normalizeBase(url) {
    // remove trailing slash somente do base
    return (url || "").replace(/\/+$/, "");
  }

  const BASE = baseRaw ? normalizeBase(baseRaw) : null;

  // Mantém compatibilidade com o restante do app
  window.API_BASE = BASE;

  // PATCH 3: expõe info de ambiente para outros scripts (api.js, health.js, etc.)
  window.ENV = {
    API_BASE: BASE,
    isLocal: isLocalHost,
    hasBackend: !!BASE,
  };

  // ======================================================
  // 2) Utilitário seguro para juntar base + path
  // ======================================================
  function joinURL(base, path) {
    if (!path) return base;
    const p = String(path);
    if (/^https?:\/\//i.test(p)) return p; // se já é absoluto, retorna como está
    return `${base}/${p.replace(/^\/+/, "")}`;
  }

  // ======================================================
  // 3) fetch com timeout, tratamento 204/205, corpo de erro
  //    legível e opção de retries leves
  // ======================================================
  async function http(
    method,
    path,
    body = null,
    timeoutMs = 20000,
    { retries = 0, credentials = "same-origin", headers = {} } = {}
  ) {
    if (!API_BASE) {
      // Sem backend configurado → falha imediata e mais clara
      const e = new Error(
        `Nenhum API_BASE definido para chamar "${path}". Verifique env.js / data-api-base.`
      );
      e.status = 0;
      e.url = path;
      throw e;
    }

    const url = joinURL(API_BASE, path);

    const attempt = async () => {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), timeoutMs);

      const isJsonBody =
        body !== null &&
        body !== undefined &&
        !(body instanceof FormData) &&
        !(body instanceof Blob) &&
        !(body instanceof ArrayBuffer);

      const opt = {
        method,
        signal: ctrl.signal,
        credentials, // “same-origin” por padrão; mude para “include” se precisar de cookies cross-site
        headers: {
          ...(isJsonBody ? { "Content-Type": "application/json" } : {}),
          ...headers,
        },
        body: isJsonBody ? JSON.stringify(body) : body || undefined,
      };

      try {
        const res = await fetch(url, opt);

        // Trata 204/205 sem corpo
        if (res.status === 204 || res.status === 205) {
          return null;
        }

        const ct = res.headers.get("content-type") || "";
        const isJson = ct.includes("application/json");

        if (!res.ok) {
          // tenta extrair uma mensagem curta do corpo do erro, sem explodir
          let snippet = "";
          try {
            const errBody = isJson ? await res.json() : await res.text();
            snippet =
              typeof errBody === "string"
                ? errBody.slice(0, 300)
                : JSON.stringify(errBody).slice(0, 300);
          } catch (_) {}
          const e = new Error(
            `HTTP ${res.status} em ${url}${snippet ? ` — ${snippet}` : ""}`
          );
          e.status = res.status;
          e.url = url;
          e.bodySnippet = snippet;
          throw e;
        }

        return isJson ? res.json() : res.text();
      } finally {
        // garante que o timeout seja limpo mesmo com throw
        clearTimeout(t);
      }
    };

    let lastErr;
    for (let i = 0; i <= retries; i++) {
      try {
        return await attempt();
      } catch (e) {
        lastErr = e;
        // Retry somente em abort/timeout ou 502/503/504
        const transient =
          e?.name === "AbortError" || [502, 503, 504].includes(e?.status);
        if (!transient || i === retries) break;
        // pequeno backoff linear
        await new Promise((r) => setTimeout(r, 400 * (i + 1)));
      }
    }
    throw lastErr;
  }

  // ======================================================
  // 4) wrappers convenientes (retrocompatíveis)
  // ======================================================
  const GET = (path, opt) => http("GET", path, null, 20000, opt);
  const POST = (path, body, opt) => http("POST", path, body, 20000, opt);
  const PUT = (path, body, opt) => http("PUT", path, body, 20000, opt);
  const PATCH = (path, body, opt) => http("PATCH", path, body, 20000, opt);
  const DELETE = (path, body = null, opt) =>
    http("DELETE", path, body, 20000, opt);

  // ======================================================
  // 5) helpers “seguros” para padrões comuns do app
  // ======================================================
  async function safeGETArr(path, def = []) {
    try {
      const r = await GET(path, { retries: 1 });
      return Array.isArray(r) ? r : Array.isArray(r?.items) ? r.items : def;
    } catch {
      return def;
    }
  }

  async function safeGETObj(path, def = {}) {
    try {
      const r = await GET(path, { retries: 1 });
      return r && typeof r === "object" ? r : def;
    } catch {
      return def;
    }
  }

  // ======================================================
  // 6) exporta no namespace global
  // ======================================================
  window.http = http;
  window.GET = GET;
  window.POST = POST;
  window.PUT = PUT;
  window.PATCH = PATCH;
  window.DELETE = DELETE;
  window.safeGETArr = safeGETArr;
  window.safeGETObj = safeGETObj;
})();
