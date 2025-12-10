// js/env.js
(function () {
  // ==============================
  // 1) Detecta ambiente
  // ==============================
  const host = window.location.hostname;
  const isLocalHost = /^(localhost|127\.0\.0\.1)$/.test(host);

  // 2) Lê, SE EXISTIR:
  //    - <body data-api-base="...">
  //    - window.API_BASE (se algum script antigo setar)
  const fromBody = document.body?.dataset?.apiBase?.trim();
  const current =
    typeof window.API_BASE === "string" && window.API_BASE.trim()
      ? window.API_BASE.trim()
      : null;

  // 3) Fallback:
  //    - LOCAL: usa 127.0.0.1:8000 (seu backend rodando no PC)
  //    - PRODUÇÃO: usa seu backend público (ex.: Vercel)
  //
  //    >>> TROQUE AQUI para a URL real do backend quando publicar <<<
  const PROD_BACKEND = "https://aulai-pro-backend.vercel.app"; // ajuste se for outro host

  const fallback = isLocalHost ? "http://127.0.0.1:8000" : PROD_BACKEND;

  // 4) Decide a BASE:
  //    prioridade: data-api-base > window.API_BASE > fallback
  const baseRaw = fromBody || current || fallback;

  // normaliza para não duplicar barras
  function normalizeBase(url) {
    return (url || "").replace(/\/+$/, "");
  }

  const BASE = baseRaw ? normalizeBase(baseRaw) : null;

  // 5) Expõe no escopo global
  window.API_BASE = BASE;

  window.ENV = {
    API_BASE: BASE,
    isLocal: isLocalHost,
    hasBackend: !!BASE,
  };

  console.log(
    "[AulaiPro][ENV] host =", host,
    "| isLocal =", isLocalHost,
    "| API_BASE =", BASE
  );

  // ==============================
  // 6) Helper para montar URLs
  // ==============================
  function joinURL(base, path) {
    if (!path) return base;
    const p = String(path);
    if (/^https?:\/\//i.test(p)) return p; // já é absoluta
    return `${base}/${p.replace(/^\/+/, "")}`;
  }

  // ==============================
  // 7) HTTP com timeout + retries
  // ==============================
  async function http(
    method,
    path,
    body = null,
    timeoutMs = 20000,
    { retries = 0, credentials = "same-origin", headers = {} } = {}
  ) {
    if (!window.API_BASE) {
      throw new Error("API_BASE não definida (nenhum backend configurado)");
    }

    const url = joinURL(window.API_BASE, path);

    const attemptOnce = async () => {
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
        credentials,
        headers: {
          ...(isJsonBody ? { "Content-Type": "application/json" } : {}),
          ...headers,
        },
        body: isJsonBody ? JSON.stringify(body) : body || undefined,
      };

      try {
        const res = await fetch(url, opt);

        // 204/205 → sem corpo
        if (res.status === 204 || res.status === 205) {
          return null;
        }

        const ct = res.headers.get("content-type") || "";
        const isJson = ct.includes("application/json");

        if (!res.ok) {
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
        clearTimeout(t);
      }
    };

    let lastErr;
    for (let i = 0; i <= retries; i++) {
      try {
        return await attemptOnce();
      } catch (e) {
        lastErr = e;
        const transient =
          e?.name === "AbortError" || [502, 503, 504].includes(e?.status);
        if (!transient || i === retries) break;
        await new Promise((r) => setTimeout(r, 400 * (i + 1)));
      }
    }
    throw lastErr;
  }

  // ==============================
  // 8) Aliases convenientes
  // ==============================
  const GET = (path, opt) => http("GET", path, null, 20000, opt);
  const POST = (path, body, opt) => http("POST", path, body, 20000, opt);
  const PUT = (path, body, opt) => http("PUT", path, body, 20000, opt);
  const PATCH = (path, body, opt) => http("PATCH", path, body, 20000, opt);
  const DELETE = (path, body = null, opt) =>
    http("DELETE", path, body, 20000, opt);

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

  // 9) Exporta no window
  window.http = http;
  window.GET = GET;
  window.POST = POST;
  window.PUT = PUT;
  window.PATCH = PATCH;
  window.DELETE = DELETE;
  window.safeGETArr = safeGETArr;
  window.safeGETObj = safeGETObj;
})();
