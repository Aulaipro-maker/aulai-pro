// js/api.js — CAMADA ROBUSTA E COMPLETA DE ACESSO AO BACKEND (FINAL)
// - Detecta API_BASE (data-attrs → globals → heurística local)
// - HTTP robusto: AbortController (cancela inflights), retries/backoff, timeout
// - Helpers: QS com join 'A||B', sanitização, dedupe/merge, cache com TTL
// - Endpoints: disciplinas, temas, objetos, titulos (c/ aula), conteudos (c/ aula),
//              habilidades, aulas (novo), linhas, partes (fallback), composePlano(POST), exportarPlano(GET → blob)
// - Exposição global: window.API, window.http, window.Cache, window._backend, window.pingBackend

(function () {
  // ===================================
  // 0) CONFIGURAÇÃO E DETECÇÃO DE BASE
  // ===================================
  const _getAttrApiBase = () => {
    try {
      const el = document.querySelector('[data-api-base]');
      const a1 = el?.getAttribute('data-api-base');
      const a2 = document.body?.dataset?.apiBase;
      return (a1 && a1.trim()) || (a2 && a2.trim()) || null;
    } catch { return null; }
  };

  const DETECTED_API_BASE = (() => {
    const attr = (typeof document !== 'undefined') ? _getAttrApiBase() : null;
    if (attr) return attr;

    const gApi  = (typeof window !== 'undefined' && window.API_BASE) ? String(window.API_BASE) : '';
    const gBase = (typeof window !== 'undefined' && window.BASE_URL) ? String(window.BASE_URL) : '';
    if (gApi)  return gApi;
    if (gBase) return gBase;

    try { if (typeof location !== 'undefined' && location.port === '8000') return ''; } catch {}
    return 'http://127.0.0.1:8000';
  })();

  function _joinBasePath(base, path) {
    if (/^https?:\/\//i.test(path)) return path;
    if (!base) return path.startsWith('/') ? path : `/${path}`;
    const b = base.endsWith('/') ? base.slice(0, -1) : base;
    const p = path.startsWith('/') ? path : `/${path}`;
    return b + p;
  }

  if (typeof window !== 'undefined') {
    window.API_BASE = DETECTED_API_BASE;
    window.BASE_URL = DETECTED_API_BASE; // compat
    console.log('[LessonAI] API_BASE =', window.API_BASE);
  }

  // -----------------------------------
  // Backend Status (Health Flags/Badges)
  // -----------------------------------
  const _backend = {
    ok: false,
    set(on) {
      this.ok = !!on;
      try {
        if (document?.body) document.body.dataset.backendOk = this.ok ? '1' : '0';
        const dot = document.getElementById('backend-status-dot');
        if (dot) dot.classList.toggle('is-ok', this.ok);
      } catch {}
    }
  };
  if (typeof window !== 'undefined') window._backend = _backend;

  // ==========================
  // 1) REDE ROBUSTA (HTTP)
  // ==========================
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const _inflight = (typeof window !== 'undefined' && window.__lessonai_inflight) || new Map();
if (typeof window !== 'undefined') window.__lessonai_inflight = _inflight;

const DEFAULT_TIMEOUT_MS = 15000;
const MAX_RETRIES = 2;

async function _fetchWithControl(method, url, { key, timeout = DEFAULT_TIMEOUT_MS, headers, body } = {}) {
  const METHOD = method.toUpperCase();
  const inflightKey = key || `${METHOD}:${url}`;

  // --- função interna que faz o fetch com retries ---
  const doRequest = async () => {
    let lastError = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const controller = new AbortController();
      let timer = null;

      try {
        if (timeout && timeout > 0) {
          timer = setTimeout(() => controller.abort(), timeout);
        }

        const res = await fetch(url, {
          method: METHOD,
          signal: controller.signal,
          headers,
          body
        });

        _backend.set(true);

        if (!res.ok) {
          throw new Error(`HTTP ${res.status} ${res.statusText}`);
        }

        return res;
      } catch (err) {
        lastError = err;

        const isTransient =
          err?.name === 'AbortError' || // timeout/abort de rede
          err?.name === 'TypeError';    // falha de rede genérica

        // Erro não-transitório ou chegou na última tentativa → encerra
        if (!isTransient || attempt === MAX_RETRIES) {
          _backend.set(false);
          throw err;
        }

        // Erro de rede/timeout com tentativas restantes → espera e tenta de novo
        const delay = 300 * (attempt + 1);
        await sleep(delay);
      } finally {
        if (timer) clearTimeout(timer);
      }
    }

    _backend.set(false);
    throw lastError || new Error('HTTP error');
  };

  // --- GET: dedupe por chave, reaproveitando a mesma Promise ---
  if (METHOD === 'GET') {
    const existing = _inflight.get(inflightKey);
    if (existing && existing instanceof Promise) {
      return existing;
    }

    const p = doRequest();
    _inflight.set(inflightKey, p);
    try {
      const res = await p;
      return res;
    } finally {
      _inflight.delete(inflightKey);
    }
  }

  // --- não-GET: sem dedupe, sem registrar em _inflight ---
  return await doRequest();
}


  async function http(method, pathOrUrl, payload) {
  const base = (typeof window !== 'undefined') ? (window.API_BASE || '') : '';
  const url  = _joinBasePath(base, pathOrUrl);
  const METHOD = method.toUpperCase();

  if (METHOD === 'GET') {
    const res = await _fetchWithControl('GET', url, {
      key: `GET:${url}`,
      headers: { 'Accept': 'application/json' }
    });
    const text = await res.text();
    return text ? JSON.parse(text) : {};
  }

  // Métodos não-GET: sem retry extra aqui; quem cuida disso é _fetchWithControl
  const res = await _fetchWithControl(METHOD, url, {
    key: `${METHOD}:${url}`,
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: payload != null ? JSON.stringify(payload) : undefined
  });
  const text = await res.text();
  return text ? JSON.parse(text) : {};
}
if (typeof window !== 'undefined') window.http = window.http || http;

  async function pingBackend() {
    try {
      const base = (typeof window !== 'undefined') ? (window.API_BASE || '') : '';
      await _fetchWithControl('GET', _joinBasePath(base, '/api/ping'), { key: 'PING', headers: { 'Accept': 'application/json' } });
      _backend.set(true);
      return true;
    } catch {
      _backend.set(false);
      return false;
    }
  }
  if (typeof window !== 'undefined') window.pingBackend = window.pingBackend || pingBackend;

  // ==========================
  // 2) QS / CACHE / HELPERS
  // ==========================
  if (typeof window !== 'undefined' && typeof window.toQSJoin !== 'function') {
    window.toQSJoin = function toQSJoin(obj, joinKeys = ['tema','titulo','conteudo','objeto','habilidade','aula']) {
      const qs = new URLSearchParams();
      for (const [k, v] of Object.entries(obj || {})) {
        if (v == null) continue;
        if (Array.isArray(v)) {
          const arr = v.map(x => (x == null ? '' : String(x))).map(s => s.trim()).filter(Boolean);
          if (!arr.length) continue;
          if (joinKeys.includes(k)) qs.append(k, arr.join('||'));
          else arr.forEach(x => qs.append(k, x));
        } else if (typeof v === 'boolean') {
          qs.append(k, v ? '1' : '0');
        } else {
          qs.append(k, String(v));
        }
      }
      return qs.toString();
    };
  }

  const toQSJoin = (typeof window !== 'undefined' && window.toQSJoin) ? window.toQSJoin : (obj)=>new URLSearchParams(obj).toString();
  const JOIN_KEYS = ['tema','objeto','titulo','conteudo','habilidade','aula'];

  const _now = () => Date.now();
  const DEFAULT_TTL_MS = 60_000;
  const Cache = {
    _m: new Map(),
    get(key){
      const hit = this._m.get(key);
      if (!hit) return undefined;
      if (hit.ttl && (_now() - hit.t > hit.ttl)) { this._m.delete(key); return undefined; }
      return hit.v;
    },
    set(key, value, ttl = DEFAULT_TTL_MS){ this._m.set(key, { t: _now(), v: value, ttl }); },
    clear(prefix){
      if (!prefix) { this._m.clear(); return; }
      for (const k of this._m.keys()) if (String(k).startsWith(prefix)) this._m.delete(k);
    }
  };
  if (typeof window !== 'undefined') window.Cache = Cache;

  function buildURL(path, params = {}, joinKeys = JOIN_KEYS) {
    const qs  = toQSJoin(params, joinKeys);
    const rel = qs ? (path + (path.includes('?') ? '&' : '?') + qs) : path;
    const base = (typeof window !== 'undefined') ? (window.API_BASE || '') : '';
    return _joinBasePath(base, rel);
  }

  // ————— Sanitização / Normalização —————
  const normStr = (s) => String(s ?? '').trim();
  const asArr   = (v) => (v == null ? [] : (Array.isArray(v) ? v : [v]));
  const noEmpty = (x) => !!normStr(x);
  const sanitizeLabel = (s) => normStr(s).replace(/['"{}()\[\]\\]/g, '');

  function _sanitizeSelections({ tema, objeto, titulo, conteudo, aula }) {
    const isPlaceholder = (s) => {
      const t = normStr(s);
      if (!t) return true;
      if (t === '— Selecione —') return true;
      if (/^—\s*Selecione\b/i.test(t)) return true;
      if (/^-+\s*Selecione\b/i.test(t)) return true;
      return false;
    };
    const clean = (xs) => asArr(xs).map(sanitizeLabel).filter(z => z && !isPlaceholder(z));
    return {
      tema: clean(tema),
      objeto: clean(objeto),
      titulo: clean(titulo),
      conteudo: clean(conteudo),
      aula: clean(aula)
    };
  }

  // ——— qualidade de dados para Objetos (merge por label e união de temas) ———
  const fold = (s) => normStr(s).normalize('NFD').replace(/\p{Mn}+/gu, '').replace(/\s+/g, ' ').toLowerCase();

  function sortAlphaItems(arr, get = (x)=>x) {
    return [...(arr || [])].sort((a,b)=>{
      const A = fold(get(a)); const B = fold(get(b));
      return A < B ? -1 : (A > B ? 1 : 0);
    });
  }

  function uniqueObjetosMerge(items){
    const map = new Map(); // key -> { value,label,full,themes[] }
    for (const it of asArr(items)) {
      if (it == null) continue;
      const rec = (typeof it === 'string')
        ? { value: it, label: it, full: it, themes: [] }
        : {
            value: normStr(it.value ?? it.full ?? it.label ?? ''),
            label: normStr(it.label ?? it.full ?? it.value ?? ''),
            full:  normStr(it.full  ?? it.label ?? it.value ?? ''),
            themes: Array.isArray(it.themes) ? it.themes.filter(noEmpty).map(normStr) : []
          };
      const key = fold(rec.label || rec.full || rec.value);
      if (!key) continue;
      const prev = map.get(key);
      if (!prev) map.set(key, rec);
      else {
        const st = new Set([...(prev.themes||[]), ...(rec.themes||[])]); prev.themes = Array.from(st);
        if (!prev.full && rec.full)   prev.full  = rec.full;
        if (!prev.label && rec.label) prev.label = rec.label;
        if (!prev.value && rec.value) prev.value = rec.value;
      }
    }
    return sortAlphaItems(Array.from(map.values()), x => x.label || x.full || x.value);
  }

  // ==========================
  // 3) API PÚBLICA
  // ==========================
  const API = {
    // Health util
    async ping(){ return pingBackend(); },

    // ---------- Debug ----------
    async manifestInfo(){ return http('GET', '/api/debug/manifest-info'); },

    // ---------- Disciplinas ----------
    // api.js
 async disciplinas(arg){
  const etapa = (typeof arg === 'string') ? arg : (arg?.etapa ?? '');
  const k = `disc:${etapa || ''}`;
  const c = Cache.get(k); if (Array.isArray(c)) return c;

  const url = buildURL('/api/disciplinas', { etapa });

  // 👇 timeout: 0 → NÃO abortar por tempo
  //     key: k   → mesma chave de cache, se quiser controlar inflight no futuro
  const js  = await http('GET', url, { timeout: 0, key: k });

  const list = Array.isArray(js) ? js : (js?.disciplinas || []);
  const out  = list.map(sanitizeLabel);
  Cache.set(k, out);
  return out;
},




    // ---------- Temas ----------
    async temas({ etapa, disciplina, contains = false } = {}){
      const etapa2      = normStr(etapa);
      const disciplina2 = normStr(disciplina);
      const cacheKey = `temas:${etapa2}:${disciplina2}:${contains ? 1 : 0}`;
      const cached = Cache.get(cacheKey); if (cached) return cached;

      const url = buildURL('/api/dados/temas', { etapa: etapa2, disciplina: disciplina2, contains: contains ? 1 : 0 }, []);
      const js  = await http('GET', url);
      const out = Array.isArray(js) ? js : (js?.temas || []);
      Cache.set(cacheKey, out);
      return out;
    },

    // ---------- Objetos do Conhecimento ----------
    // tolera ausência de tema/título/conteúdo (carga ampla); usa contains quando objeto for filtro forte
    async objetos({ etapa, disciplina, tema = [], titulo = [], conteudo = [], contains = true } = {}){
      const etapa2      = normStr(etapa);
      const disciplina2 = normStr(disciplina);
      const { tema: temaOk, titulo: tituloOk, conteudo: conteudoOk } =
        _sanitizeSelections({ tema, titulo, conteudo });

      const cacheKey = [ 'objetos', etapa2, disciplina2, temaOk.join('||'), tituloOk.join('||'), conteudoOk.join('||'), contains ? 1 : 0 ].join(':');
      const cached = Cache.get(cacheKey); if (cached) return cached;

      const url = buildURL('/api/dados/objetos', {
        etapa: etapa2, disciplina: disciplina2,
        ...(temaOk.length ? { tema: temaOk } : {}),
        ...(tituloOk.length ? { titulo: tituloOk } : {}),
        ...(conteudoOk.length ? { conteudo: conteudoOk } : {}),
        contains: contains ? 1 : 0
      }, ['tema','titulo','conteudo']);

      const js  = await http('GET', url);
      const arr = Array.isArray(js) ? js : (js?.objetos || []);
      // merge/dedupe inteligente
      try {
        const normalized = arr.map(it => (typeof it === 'string') ? { value: it, label: it, full: it, themes: [] } : it);
        const merged = uniqueObjetosMerge(normalized);
        Cache.set(cacheKey, merged);
        return merged;
      } catch {
        Cache.set(cacheKey, arr);
        return arr;
      }
    },

    // ---------- Títulos ----------
    // aceita aula (novo) e tolera carga ampla (sem tema/objeto/conteúdo)
    // ---------- Títulos (agora com aula) ----------
    async titulos({ etapa, disciplina, objeto = [], tema = [], conteudo = [], aula = [], contains = true } = {}){
      const etapa2      = normStr(etapa);
      const disciplina2 = normStr(disciplina);
      const { tema: temaOk, objeto: objetoOk, conteudo: conteudoOk, aula: aulaOk } =
        _sanitizeSelections({ tema, objeto, conteudo, aula });

      const url = buildURL('/api/dados/titulos', {
        etapa: etapa2, disciplina: disciplina2,
        ...(temaOk.length ? { tema: temaOk } : {}),
        ...(objetoOk.length ? { objeto: objetoOk } : {}),
        ...(conteudoOk.length ? { conteudo: conteudoOk } : {}),
        ...(aulaOk.length ? { aula: aulaOk } : {}),
        contains: contains ? 1 : 0
      }, ['tema','objeto','conteudo','aula']);

      const js  = await http('GET', url);

      // 🔒 normaliza para array (aceita backend que responde [] ou { titulos: [] })
      const arrOut = Array.isArray(js) ? js : (Array.isArray(js?.titulos) ? js.titulos : []);

      // 🔧 sanitiza e uniformiza forma de cada item
      const out = arrOut.map(t => String((t && (t.label ?? t.titulo ?? t.value)) ?? t).trim());

      return out; // <<< agora retorna ARRAY, não objeto
    },

    /** @deprecated Use `API.titulos(...)` (retorna array). Alias de compat para código legado. */
    async titulosObj(params){
      const arr = await this.titulos(params);
      return { titulos: arr };
    },

    // ---------- Conteúdos ----------
    // aceita aula (novo) e tolera carga ampla
    // ---------- Conteúdos (agora com aula) ----------
    async conteudos({ etapa, disciplina, tema = [], titulo = [], objeto = [], aula = [], contains = true } = {}){
      const etapa2      = normStr(etapa);
      const disciplina2 = normStr(disciplina);
      const { tema: temaOk, objeto: objetoOk, titulo: tituloOk, aula: aulaOk } =
        _sanitizeSelections({ tema, objeto, titulo, aula });

      const cacheKey = [ 'conteudos', etapa2, disciplina2, temaOk.join('||'), objetoOk.join('||'), tituloOk.join('||'), aulaOk.join('||'), contains ? 1 : 0 ].join(':');
      const cached = Cache.get(cacheKey); if (cached) return cached;

      const url = buildURL('/api/dados/conteudos', {
        etapa: etapa2, disciplina: disciplina2,
        ...(temaOk.length ? { tema: temaOk } : {}),
        ...(objetoOk.length ? { objeto: objetoOk } : {}),
        ...(tituloOk.length ? { titulo: tituloOk } : {}),
        ...(aulaOk.length ? { aula: aulaOk } : {}),
        contains: contains ? 1 : 0
      }, ['tema','objeto','titulo','aula']);

      const js  = await http('GET', url);
      const out = Array.isArray(js) ? js : (Array.isArray(js?.conteudos) ? js.conteudos : []);
      const arr = out.map(sanitizeLabel);
      Cache.set(cacheKey, arr);
      return arr; // <<< ARRAY

    },

        /** @deprecated Use `API.conteudos(...)` (retorna array). Alias de compat para código legado. */
    async conteudosObj(params){
      const arr = await this.conteudos(params);
      return { conteudos: arr };
    },

    // ---------- Aulas (para filtro inicial e prévia) ----------
    async aulas({ etapa, disciplina, tema = [], objeto = [], titulo = [], conteudo = [], contains = false } = {}) {
      const etapa2 = normStr(etapa);
      const disc2  = normStr(disciplina);
      const { tema: tOk, objeto: oOk, titulo: tiOk, conteudo: cOk } =
        _sanitizeSelections({ tema, objeto, titulo, conteudo });

      const cacheKey = [ 'aulas', etapa2, disc2, tOk.join('||'), oOk.join('||'), tiOk.join('||'), cOk.join('||'), contains ? 1 : 0 ].join(':');
      const cached = Cache.get(cacheKey); if (cached) return cached;

      const url = buildURL('/api/dados/aulas', {
        etapa: etapa2, disciplina: disc2,
        ...(tOk.length ? { tema: tOk } : {}),
        ...(oOk.length ? { objeto: oOk } : {}),
        ...(tiOk.length ? { titulo: tiOk } : {}),
        ...(cOk.length ? { conteudo: cOk } : {}),
        contains: contains ? 1 : 0
      }, ['tema', 'objeto', 'titulo', 'conteudo']);

      const js = await http('GET', url);
      const out = Array.isArray(js) ? js : (js?.aulas || []);
      Cache.set(cacheKey, out);
      return out;
    },

    // ---------- Habilidades ----------
    async habilidades({ etapa, disciplina, tema = [], objeto = [], titulo = [], conteudo = [], aula = [], contains = false, only_codes = false } = {}) {
      const etapa2      = normStr(etapa);
      const disciplina2 = normStr(disciplina);
      const { tema: temaOk, objeto: objetoOk, titulo: tituloOk, conteudo: conteudoOk, aula: aulaOk } =
        _sanitizeSelections({ tema, objeto, titulo, conteudo, aula });

      const cacheKey = [ 'habilidades', etapa2, disciplina2, temaOk.join('||'), objetoOk.join('||'), tituloOk.join('||'), conteudoOk.join('||'), aulaOk.join('||'), contains ? 1 : 0, only_codes ? 1 : 0 ].join(':');
      const cached = Cache.get(cacheKey); if (cached) return cached;

      const url = buildURL('/api/dados/habilidades', {
        etapa: etapa2, disciplina: disciplina2,
        ...(temaOk.length ? { tema: temaOk } : {}),
        ...(objetoOk.length ? { objeto: objetoOk } : {}),
        ...(tituloOk.length ? { titulo: tituloOk } : {}),
        ...(conteudoOk.length ? { conteudo: conteudoOk } : {}),
        ...(aulaOk.length ? { aula: aulaOk } : {}),
        contains: contains ? 1 : 0,
        only_codes: only_codes ? 1 : 0
      }, ['tema','objeto','titulo','conteudo','aula']);

      const js  = await http('GET', url);
      const out = (js && Array.isArray(js.habilidades)) ? js.habilidades : (Array.isArray(js) ? js : []);
      Cache.set(cacheKey, out);
      return out;
    },

    // ---------- Linhas (prévia/export) ----------
    // ---------- Linhas (prévia/export) ----------
async linhas({
  etapa,
  disciplina,
  tema = [],
  titulo = [],
  conteudo = [],
  objeto = [],
  aula = [],
  contains // sem default aqui!
} = {}) {
  const etapa2      = normStr(etapa);
  const disciplina2 = normStr(disciplina);

  // Sanitiza seleções (converte objeto → string, tira vazios etc.)
  const {
    tema: temaOk,
    objeto: objetoOk,
    titulo: tituloOk,
    conteudo: conteudoOk,
    aula: aulaOk
  } = _sanitizeSelections({ tema, objeto, titulo, conteudo, aula });

  // Detecta se há múltiplas seleções em algum campo
  const isMultiSelection =
    (temaOk.length > 1) ||
    (objetoOk.length > 1) ||
    (tituloOk.length > 1) ||
    (conteudoOk.length > 1) ||
    (aulaOk.length > 1);

  // Se o chamador não mandou 'contains', usamos o isMultiSelection como padrão
  const containsFlag =
    (typeof contains !== 'undefined' && contains !== null)
      ? contains
      : isMultiSelection;

  // Converte para 1/0 para a QS
  const containsQS = (containsFlag && containsFlag !== 0) ? 1 : 0;

  const cacheKey = [
    'linhas',
    etapa2,
    disciplina2,
    temaOk.join('||'),
    objetoOk.join('||'),
    tituloOk.join('||'),
    conteudoOk.join('||'),
    aulaOk.join('||'),
    containsQS
  ].join(':');

  const cached = Cache.get(cacheKey);
  if (cached) return cached;

  const url = buildURL(
    '/api/dados/linhas',
    {
      etapa: etapa2,
      disciplina: disciplina2,
      ...(temaOk.length     ? { tema: temaOk }     : {}),
      ...(objetoOk.length   ? { objeto: objetoOk } : {}),
      ...(tituloOk.length   ? { titulo: tituloOk } : {}),
      ...(conteudoOk.length ? { conteudo: conteudoOk } : {}),
      ...(aulaOk.length     ? { aula: aulaOk }     : {}),
      contains: containsQS
    },
    ['tema', 'objeto', 'titulo', 'conteudo', 'aula']
  );

  console.debug('[API.linhas] GET', url);

  const js  = await http('GET', url);
  const out = Array.isArray(js) ? js : (js?.items || js?.linhas || []);

  Cache.set(cacheKey, out);
  return out;
},


    // ---------- Partes (fallback para conteúdos) ----------
    async partes({ etapa, disciplina, tema = [], titulo = [], conteudo = [], objeto = [], aula = [], contains = false } = {}){
      const etapa2      = normStr(etapa);
      const disciplina2 = normStr(disciplina);
      const { tema: temaOk, objeto: objetoOk, titulo: tituloOk, conteudo: conteudoOk, aula: aulaOk } =
        _sanitizeSelections({ tema, objeto, titulo, conteudo, aula });

      const url = buildURL('/api/dados/partes', {
        etapa: etapa2, disciplina: disciplina2,
        ...(temaOk.length ? { tema: temaOk } : {}),
        ...(objetoOk.length ? { objeto: objetoOk } : {}),
        ...(tituloOk.length ? { titulo: tituloOk } : {}),
        ...(conteudoOk.length ? { conteudo: conteudoOk } : {}),
        ...(aulaOk.length ? { aula: aulaOk } : {}),
        contains: contains ? 1 : 0
      }, ['tema','objeto','titulo','conteudo','aula']);

      const js = await http('GET', url);
      return Array.isArray(js?.partes) ? js.partes : (Array.isArray(js) ? js : []);
    },

    // ---------- Compose do plano ----------
    async composePlano({ aulas } = {}) {
      return http('POST', '/api/compose/plano', { aulas });
    },

    // ---------- Exportar plano (blob) ----------
    async exportarPlano({ aulas, format = 'docx' } = {}) {
      const sAulas = (Array.isArray(aulas) ? aulas : [aulas])
        .map(x => String(x ?? '').trim())
        .filter(Boolean)
        .join('||');
      if (!sAulas) return null;

      const url = buildURL('/api/plano/exportar', { aulas: sAulas, format }, ['aulas']);
      const res = await fetch(url, { method: 'GET' });
      if (!res.ok) throw new Error(`Export failed: ${res.status} ${res.statusText}`);
      return res; // caller: await res.blob()
    }
  };

  // ==========================
  // 4) EXPOSIÇÃO GLOBAL
  // ==========================
  if (typeof window !== 'undefined') {
    window.API = API;
    window.http = window.http || http;
    window.Cache = window.Cache || Cache;
    window._backend = window._backend || _backend;
    window.pingBackend = window.pingBackend || pingBackend;
  } else if (typeof module !== 'undefined') {
    module.exports = API;
  }

  
} )();

