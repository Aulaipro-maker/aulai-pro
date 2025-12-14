// funnel.js — Prefetch por TEMA + Afunilamento com Cache de Consultas
// - Prefetch paralelo ao escolher TEMA (objetos/títulos/conteúdos/habilidades/aulas)
// - Afunilamento progressivo (pula etapas inexistentes)
// - Cache por TEMA (FunnelStore) e cache por consulta refinada (QueryCache com TTL)
// - Suporte opcional a 'aula' em todo o fluxo
// - Exporta via window.Funnel, CommonJS e AMD

(function () {
  'use strict';

  // ============== FUNÇÕES UTIL ==============
  function toArr(x) {
    if (!x) return [];
    if (Array.isArray(x)) return x.filter(Boolean).map(String);
    if (typeof x === 'string') return x.trim() ? [x] : [];
    return [];
  }

  // Lê corretamente <select multiple> (ou simples)
  function getSelectValues(selectEl) {
    if (!selectEl) return [];
    // Para multiple:
    if (selectEl.multiple && selectEl.selectedOptions) {
      return Array.from(selectEl.selectedOptions).map(o => o.value).filter(Boolean);
    }
    // Para simples:
    return toArr(selectEl.value);
  }

  function joinQS(arr) { return toArr(arr).join('||'); }

  function sanitizeLabel(s) {
    return String(s || '').replace(/\s+/g, ' ').trim();
  }

    function uniq(arr) {
    const list = toArr(arr).map(sanitizeLabel);
    return Array.from(new Set(list));
  }


   function setOptions(selectEl, items, { placeholder = '— selecione —' } = {}) {
    if (!selectEl) return;
    const list = uniq(items); // 👈 AQUI: garante lista única

    selectEl.innerHTML = '';
    const opt0 = document.createElement('option');
    opt0.value = '';
    opt0.textContent = placeholder;
    selectEl.appendChild(opt0);

    list.forEach(v => {
      const op = document.createElement('option');
      op.value = v;
      op.textContent = sanitizeLabel(v);
      selectEl.appendChild(op);
    });

    selectEl.disabled = list.length === 0;

    // DEBUG extra para ver se está realmente povoando os selects
    try {
      const id = selectEl.id || selectEl.name || '(sem-id)';
      console.debug('[Funnel.setOptions]', id, 'itens=', list.length);
    } catch (_) { /* ignore */ }
  }


  function hideField(wrapperSelector, hidden = true) {
    if (!wrapperSelector) return;
    const el = document.querySelector(wrapperSelector);
    if (el) el.style.display = hidden ? 'none' : '';
  }

  function hasAny(items) { return Array.isArray(items) && items.length > 0; }

  /**
 * Monta o texto de Objetivos de Aprendizagem
 *
 * Regra:
 * - Se só houver uma habilidade nas linhas selecionadas:
 *     → junta todos os objetivos em UM parágrafo.
 * - Se houver mais de uma habilidade:
 *     → um parágrafo para cada habilidade.
 *       (cada parágrafo junta os objetivos dos tópicos daquela habilidade)
 */
function buildObjetivosTextoFromRows(rows) {
  if (!Array.isArray(rows) || !rows.length) return '';

  // Mapa: chave da habilidade → { label, partes[] }
  const gruposPorHab = new Map();
  const globalSet = new Set(); // evita duplicar frases idênticas em tudo

  rows.forEach(row => {
    // 1) Descobre qual é a habilidade desta linha
    const habLabel = getFirstNonEmpty(row, [
      'HABILIDADE',
      'Habilidade',
      'Habilidade BNCC',
      'Habilidades',
      'codigo_habilidade',
      'Código Habilidade',
      'codigo',
      'Código'
    ]);

    const habKey = habLabel || '__sem_hab__';

    if (!gruposPorHab.has(habKey)) {
      gruposPorHab.set(habKey, {
        label: habLabel,   // texto que aparece no plano (ex: "EM13MAT403")
        partes: []         // frases de objetivo para essa habilidade
      });
    }

    const grupo = gruposPorHab.get(habKey);

    // 2) Pega o campo de objetivos desta linha
    const raw = getFirstNonEmpty(row, [
      'Objetivos',
      'objetivos',
      'OBJETIVOS',
      'Objetivos de Aprendizagem',
      'Objetivos_de_aprendizagem',
      'Objetivos_aprendizagem'
    ]);

    if (!raw) return;

    // 3) Quebra em frases menores
    const partes = raw
      .split(/[.;]\s+/)
      .map(p => p.trim())
      .filter(Boolean);

    partes.forEach(p => {
      const normalizado = p.replace(/[.;]+$/,'').trim();
      if (!normalizado) return;

      const chaveGlobal = normalizado.toLowerCase();
      if (globalSet.has(chaveGlobal)) return;  // evita duplicar a mesma frase

      globalSet.add(chaveGlobal);
      grupo.partes.push(normalizado);
    });
  });

  // Se não sobrou nada, retorna vazio
  const gruposValidos = Array.from(gruposPorHab.values())
    .filter(g => g.partes.length);

  if (!gruposValidos.length) return '';

  // ===== CASO 1: só UMA habilidade =====
  if (gruposValidos.length === 1) {
    const unico = gruposValidos[0];
    // Junta tudo em um único parágrafo
    return unico.partes
      .map(p => p.replace(/[.;]+$/,''))
      .join('; ') + '.';
  }

  // ===== CASO 2: VÁRIAS habilidades =====
  // Um parágrafo por habilidade
  const paragrafos = gruposValidos.map(g => {
    const frase = g.partes
      .map(p => p.replace(/[.;]+$/,''))
      .join('; ') + '.';

    // Se tiver rótulo de habilidade, prefixa
    if (g.label) {
      return `${g.label}: ${frase}`;
    }
    return frase;
  });

  // Separa parágrafos com linha em branco (textarea → parágrafos)
  return paragrafos.join('\n\n');
}


  function qsParamsBase({ etapa, disciplina, tema, habilidade, objeto, titulo, conteudo, aula }) {
  const containsTema = hasAny(tema);
  const containsHab  = hasAny(habilidade);
  const containsObj  = hasAny(objeto);
  const containsTit  = hasAny(titulo);
  const containsCont = hasAny(conteudo);
  const containsAula = hasAny(aula);

  const p = new URLSearchParams();
  if (etapa)      p.set('etapa', etapa);
  if (disciplina) p.set('disciplina', disciplina);

  if (containsTema) p.set('tema', joinQS(tema));
  if (containsHab)  p.set('habilidade', joinQS(habilidade));
  if (containsObj)  p.set('objeto', joinQS(objeto));
  if (containsTit)  p.set('titulo', joinQS(titulo));
  if (containsCont) p.set('conteudo', joinQS(conteudo));
  if (containsAula) p.set('aula', joinQS(aula));

  const hasFilters = containsTema || containsHab || containsObj || containsTit || containsCont || containsAula;
  if (hasFilters) p.set('contains', '1');
  return p.toString();
}


  const makeKey = (endpoint, ctx) => {
  const norm = {
  endpoint,
  etapa: ctx.etapa || '',
  disciplina: ctx.disciplina || '',
  tema: toArr(ctx.tema).slice().sort(),
  habilidade: toArr(ctx.habilidade).slice().sort(), // <-- AQUI
  objeto: toArr(ctx.objeto).slice().sort(),
  titulo: toArr(ctx.titulo).slice().sort(),
  conteudo: toArr(ctx.conteudo).slice().sort(),
  aula: toArr(ctx.aula).slice().sort(),
};

  return JSON.stringify(norm);
};


  // ================= API Fallback-Safe =================
  async function apiGETList(endpoint, paramsQS, mapKey) {
  const BASE = (window.API_BASE || window.BASE_URL || '');
  const url = `${BASE}${endpoint}?${paramsQS}`;

  // ✅ ADICIONE ESTA LINHA AQUI
  console.debug('[apiGETList] url=', url);

  try {
    let js;
      try {
        if (window.http) {
          js = await window.http('GET', url);
        } else {
          const r = await fetch(url);
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          js = await r.json();
        }
      } catch (e) {
        // tenta um fallback direto se http falhar mas fetch estiver ok
        if (!window.http) throw e;
        const r = await fetch(url);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        js = await r.json();
      }
      if (Array.isArray(js)) return js.map(sanitizeLabel);
      if (js && mapKey && Array.isArray(js[mapKey])) return js[mapKey].map(sanitizeLabel);
      return [];
    } catch (e) {
      console.error('[apiGETList] erro', endpoint, e);
      return [];
    }
  }

  // Wrap de API com cache de consultas refinadas + DEBUG
  const API_WRAP = {
    // ---------------- OBJETOS ----------------
    async objetos(ctx) {
      const cached = QueryCache.get('objetos', ctx);
      if (cached) {
        console.debug('[Funnel.API_WRAP.objetos] cache HIT', ctx, 'qtd=', cached.length);
        return cached;
      }

      console.debug('[Funnel.API_WRAP.objetos] IN', ctx);

      const src = window.API?.objetos
        ? await window.API.objetos(ctx)
        : await apiGETList('/api/dados/objetos', qsParamsBase(ctx), 'objetos');

      const arr = Array.isArray(src) ? src : [];
      const out = arr
        .map(it =>
          (typeof it === 'string'
            ? it
            : String(it?.label ?? it?.full ?? it?.value ?? '').trim())
        )
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));

      QueryCache.set('objetos', ctx, out);
      console.debug('[Funnel.API_WRAP.objetos] OUT qtd=', out.length, 'sample=', out.slice(0, 5));
      return out;
    },

    // ---------------- TÍTULOS ----------------
    async titulos(ctx) {
      const cached = QueryCache.get('titulos', ctx);
      if (cached) {
        console.debug('[Funnel.API_WRAP.titulos] cache HIT', ctx, 'qtd=', cached.length);
        return cached;
      }

      console.debug('[Funnel.API_WRAP.titulos] IN', ctx);

      const fn = async () => {
        if (window.API?.titulos) return window.API.titulos(ctx);
        const qs = qsParamsBase(ctx);
        return apiGETList('/api/dados/titulos', qs, 'titulos');
      };

      const raw = await fn();
      const arr = Array.isArray(raw) ? raw : (raw?.titulos || raw?.items || []);
      const out = arr.map(v => String(v ?? '').trim()).filter(Boolean);

      QueryCache.set('titulos', ctx, out);
      console.debug('[Funnel.API_WRAP.titulos] OUT qtd=', out.length, 'sample=', out.slice(0, 5));
      return out;
    },

    // ---------------- CONTEÚDOS ----------------
    async conteudos(ctx) {
      const cached = QueryCache.get('conteudos', ctx);
      if (cached) {
        console.debug('[Funnel.API_WRAP.conteudos] cache HIT', ctx, 'qtd=', cached.length);
        return cached;
      }

      console.debug('[Funnel.API_WRAP.conteudos] IN', ctx);

      const fn = async () => {
        if (window.API?.conteudos) return window.API.conteudos(ctx);
        return apiGETList('/api/dados/conteudos', qsParamsBase(ctx), 'conteudos');
      };

      const raw = await fn();
      const arr = Array.isArray(raw) ? raw : (raw?.conteudos || raw?.items || []);
      const out = arr.map(v => String(v ?? '').trim()).filter(Boolean);

      QueryCache.set('conteudos', ctx, out);
      console.debug('[Funnel.API_WRAP.conteudos] OUT qtd=', out.length, 'sample=', out.slice(0, 5));
      return out;
    },

        async habilidades(ctx) {
      const cached = QueryCache.get('habilidades', ctx);
      if (cached) {
        console.debug('[Funnel.API_WRAP.habilidades] cache HIT', ctx, 'qtd=', cached.length);
        return cached;
      }

      console.debug('[Funnel.API_WRAP.habilidades] IN', ctx);

      const qs = qsParamsBase(ctx);
      const raw = await apiGETList('/api/dados/habilidades', qs, 'habilidades');

      const arr = Array.isArray(raw) ? raw : (raw?.habilidades || raw?.items || []);
      const out = uniq(arr); // remove duplicadas se você já adicionou uniq()

      QueryCache.set('habilidades', ctx, out);
      console.debug('[Funnel.API_WRAP.habilidades] OUT qtd=', out.length, 'sample=', out.slice(0, 5));
      return out;
    },


    // ---------------- AULAS ----------------
    async aulas(ctx) {
      const cached = QueryCache.get('aulas', ctx);
      if (cached) {
        console.debug('[Funnel.API_WRAP.aulas] cache HIT', ctx, 'qtd=', cached.length);
        return cached;
      }

      console.debug('[Funnel.API_WRAP.aulas] IN', ctx);

      try {
        let src;
        if (window.API?.aulas) {
          src = await window.API.aulas(ctx);
        } else {
          src = await apiGETList('/api/dados/aulas', qsParamsBase(ctx), 'aulas');
        }

        const arr = Array.isArray(src) ? src : (src?.aulas || src?.items || []);
        const out = arr.map(v => String(v ?? '').trim()).filter(Boolean);

        QueryCache.set('aulas', ctx, out);
        console.debug('[Funnel.API_WRAP.aulas] OUT qtd=', out.length, 'sample=', out.slice(0, 5));
        return out;
      } catch (e) {
        console.debug('[Funnel.API_WRAP.aulas] ERRO', e?.message || e);
        return [];
      }
    }
  };

  // ============== CACHE POR TEMA (prefetch) ==============
  const FunnelStore = (() => {
    const store = new Map(); // key -> {objetos, titulos, conteudos, habilidades, aulas, fields}
    function key(etapa, disciplina, temaArr) {
      return JSON.stringify({ e: etapa, d: disciplina, t: toArr(temaArr).slice().sort() });
    }
    return {
      get(etapa, disciplina, temaArr) { return store.get(key(etapa, disciplina, temaArr)); },
      set(etapa, disciplina, temaArr, data) { store.set(key(etapa, disciplina, temaArr), data); },
      clear() { store.clear(); }
    };
  })();

  // ============== DETECÇÃO DE CAMPOS DA DISCIPLINA ==============
  function inferFieldsPresence({ objetos, titulos, conteudos, habilidades }) {
    return {
      objetos:     hasAny(objetos),
      titulos:     hasAny(titulos),
      conteudos:   hasAny(conteudos),
      habilidades: hasAny(habilidades),
      // aulas não define presença (é opcional)
    };
  }

  const IDS = {
    tema: '#seltema',
    objeto: '#selobjeto',
    titulo: '#seltitulo',
    conteudo: '#selconteudo',
    habilidade: '#selhabilidade',
    aula: '#selaula',
  };

  const WRAPS = {
    objeto:     '#wrap-objeto',
    titulo:     '#wrap-titulo',
    conteudo:   '#wrap-conteudo',
    habilidade: '#wrap-habilidade',
    aula:       '#wrap-aula',
  };

  const ALWAYS_SHOW_FIELDS = true;

  // ===== MEMÓRIA DE SELEÇÃO (ADD vs REMOVE por campo) =====
  const LAST_SELECTED = {
    tema: [],
    objeto: [],
    titulo: [],
    conteudo: [],
    habilidade: [],
    aula: [],
  };

  function getSelectedValuesByKey(key) {
    const sel = document.querySelector(IDS[key]);
    return getSelectValues(sel); // reaproveita helper já existente
  }

  function selectionChanged(key) {
    const before = LAST_SELECTED[key] || [];
    const now    = getSelectedValuesByKey(key);

    const removed = before.filter(v => !now.includes(v));
    const added   = now.filter(v => !before.includes(v));

    LAST_SELECTED[key] = now; // atualiza memória

    return { added, removed, now };
  }

  // ============== LIMPEZA EM CASCATA ==============
    // ============== LIMPEZA EM CASCATA ==============
  function clearDownstream(from) {
    const $obj = document.querySelector(IDS.objeto);
    const $tit = document.querySelector(IDS.titulo);
    const $con = document.querySelector(IDS.conteudo);
    const $hab = document.querySelector(IDS.habilidade);
    const $aul = document.querySelector(IDS.aula);

    if (from === 'tema') {
      // TEMA novo: zera TUDO abaixo (habilidade e demais)
      setOptions($hab, []);
      setOptions($obj, []);
      setOptions($tit, []);
      setOptions($con, []);
      if ($aul) setOptions($aul, []);
    } else if (from === 'habilidade') {
      // HABILIDADE nova: zera OBJETO, TÍTULO, CONTEÚDO e AULA
      setOptions($obj, []);
      setOptions($tit, []);
      setOptions($con, []);
      if ($aul) setOptions($aul, []);
    } else if (from === 'objeto') {
      // OBJETO novo: derruba TÍTULO, CONTEÚDO e AULA
      setOptions($tit, []);
      setOptions($con, []);
      if ($aul) setOptions($aul, []);
    } else if (from === 'titulo') {
      // TÍTULO novo: derruba CONTEÚDO e AULA
      setOptions($con, []);
      if ($aul) setOptions($aul, []);
    } else if (from === 'conteudo') {
      // CONTEÚDO novo: derruba apenas AULA
      if ($aul) setOptions($aul, []);
    } else if (from === 'aula') {
      // AULA é o último nível → não derruba mais nada
    }

    hideField(WRAPS.objeto,   false);
    hideField(WRAPS.titulo,   false);
    hideField(WRAPS.conteudo, false);
    hideField(WRAPS.habilidade, false);
    hideField(WRAPS.aula,     false);
  }



  // ============== NÚCLEO: ao escolher TEMA, carrega tudo ==============
let __temaInflight = false;
let __temaLastKey = '';
let __temaReqSeq = 0;

// normaliza valores para key e para query
function normalizeSel(v) {
  // aceita string, number, {value}, etc.
  if (v && typeof v === 'object') {
    if ('value' in v) return String(v.value).trim();
    if ('id' in v) return String(v.id).trim();
    return String(v).trim();
  }
  return String(v ?? '').trim();
}

function temaKey({ etapa, disciplina }, temasSel) {
  const norm = toArr(temasSel)
    .map(normalizeSel)
    .filter(Boolean)
    .sort();

  return JSON.stringify({ e: String(etapa||''), d: String(disciplina||''), t: norm });
}

async function onTemaChangeLoadAll({ etapa, disciplina }) {
  const $tema = document.querySelector(IDS.tema);
  const temasSelRaw = getSelectValues($tema);

  // normaliza também para ctxBase (evita mandar lixo/objetos)
  const temasSel = toArr(temasSelRaw)
    .map(normalizeSel)
    .filter(Boolean);

  const key = temaKey({ etapa, disciplina }, temasSel);

  if (__temaInflight && __temaLastKey === key) {
    console.debug('[Funnel.tema] chamada ignorada (inflight mesmo contexto)', key);
    return;
  }

  __temaInflight = true;
  __temaLastKey = key;

  // token anti-stale
  const reqId = ++__temaReqSeq;

  console.debug('[Funnel.tema] IN', { etapa, disciplina, temasSel, key, reqId });

  try {
    const ctxBase = hasAny(temasSel)
  ? { etapa, disciplina, tema: (temasSel.length === 1 ? temasSel[0] : temasSel) }
  : { etapa, disciplina };


    console.debug('[Funnel.tema] ctxBase', ctxBase);

    const results = await Promise.allSettled([
      API_WRAP.objetos(ctxBase),
      API_WRAP.titulos(ctxBase),
      API_WRAP.conteudos(ctxBase),
      API_WRAP.habilidades(ctxBase),
      API_WRAP.aulas(ctxBase)
    ]);

    // se chegou depois de uma seleção mais nova, descarta
    if (reqId !== __temaReqSeq) {
      console.warn('[Funnel.tema] resposta descartada (stale)', { reqId, current: __temaReqSeq, key });
      return;
    }

    const [objP, titP, contP, habP, aulaP] = results;

    // loga rejeições para você enxergar 422/404/CORS
    const logRejected = (label, p) => {
      if (p.status === 'rejected') {
        console.error(`[Funnel.tema] ${label} REJECTED`, p.reason);
      }
    };
    logRejected('objetos', objP);
    logRejected('titulos', titP);
    logRejected('conteudos', contP);
    logRejected('habilidades', habP);
    logRejected('aulas', aulaP);

    const objetos     = objP.status  === 'fulfilled' ? toArr(objP.value)   : [];
    const titulos     = titP.status  === 'fulfilled' ? toArr(titP.value)   : [];
    const conteudos   = contP.status === 'fulfilled' ? toArr(contP.value)  : [];
    const habilidades = habP.status  === 'fulfilled' ? toArr(habP.value)   : [];
    const aulas       = aulaP.status === 'fulfilled' ? toArr(aulaP.value)  : [];

    console.debug('[Funnel.tema] prefetch totals', {
      objetos: objetos.length,
      titulos: titulos.length,
      conteudos: conteudos.length,
      habilidades: habilidades.length,
      aulas: aulas.length,
      reqId
    });

    // inclua aulas no infer (melhora diagnóstico de “só disciplina carrega”)
    const fields = inferFieldsPresence({ objetos, titulos, conteudos, habilidades, aulas });
    const pack = { objetos, titulos, conteudos, habilidades, aulas, fields };

    FunnelStore.set(etapa, disciplina, temasSel, pack);
    applyPrefetchToUI(pack);
  } catch (e) {
    // se for erro velho, não polui
    if (reqId !== __temaReqSeq) {
      console.warn('[Funnel.tema] erro descartado (stale)', { reqId, current: __temaReqSeq }, e);
      return;
    }
    console.error('[Funnel.tema] ERRO', e?.message || e, e);
  } finally {
    // só libera inflight se for a requisição mais recente
    if (reqId === __temaReqSeq) {
      __temaInflight = false;
    }
  }
}


    function applyPrefetchToUI({ objetos, titulos, conteudos, habilidades, aulas, fields }) {
    const $obj = document.querySelector(IDS.objeto);
    const $tit = document.querySelector(IDS.titulo);
    const $con = document.querySelector(IDS.conteudo);
    const $hab = document.querySelector(IDS.habilidade);
    const $aul = document.querySelector(IDS.aula);

    console.debug('[Funnel.applyPrefetchToUI] elementos encontrados?', {
      objeto: !!$obj,
      titulo: !!$tit,
      conteudo: !!$con,
      habilidade: !!$hab,
      aula: !!$aul,
    });

    // 1) HABILIDADE – é o próximo passo após TEMA
    if ($hab) {
      if (fields.habilidades) {
        hideField(WRAPS.habilidade, false);
        setOptions($hab, habilidades, { placeholder: '— selecione a habilidade —' });
        $hab.disabled = false;
      } else {
        if (!ALWAYS_SHOW_FIELDS) {
          hideField(WRAPS.habilidade, true);
        } else {
          // campo não existente para esta disciplina
          hideField(WRAPS.habilidade, false);
          setOptions($hab, [], { placeholder: '— campo não existente para esta disciplina —' });
          $hab.disabled = true;
        }
      }
    }

    // 2) OBJETO – só será realmente povoado após escolher HABILIDADE
    if ($obj) {
      if (fields.objetos) {
        hideField(WRAPS.objeto, false);
        setOptions($obj, [], { placeholder: '— selecione uma habilidade primeiro —' });
        $obj.disabled = true;
      } else if (!ALWAYS_SHOW_FIELDS) {
        hideField(WRAPS.objeto, true);
      } else {
        hideField(WRAPS.objeto, false);
        setOptions($obj, [], { placeholder: '— campo não existente para esta disciplina —' });
        $obj.disabled = true;
      }
    }

    // 3) TÍTULO
    if ($tit) {
      if (fields.titulos) {
        hideField(WRAPS.titulo, false);
        setOptions($tit, [], { placeholder: '— aguarde filtros anteriores —' });
        $tit.disabled = true;
      } else if (!ALWAYS_SHOW_FIELDS) {
        hideField(WRAPS.titulo, true);
      } else {
        hideField(WRAPS.titulo, false);
        setOptions($tit, [], { placeholder: '— campo não existente para esta disciplina —' });
        $tit.disabled = true;
      }
    }

    // 4) CONTEÚDO
    if ($con) {
      if (fields.conteudos) {
        hideField(WRAPS.conteudo, false);
        setOptions($con, [], { placeholder: '— aguarde filtros anteriores —' });
        $con.disabled = true;
      } else if (!ALWAYS_SHOW_FIELDS) {
        hideField(WRAPS.conteudo, true);
      } else {
        hideField(WRAPS.conteudo, false);
        setOptions($con, [], { placeholder: '— campo não existente para esta disciplina —' });
        $con.disabled = true;
      }
    }

    // 5) AULA (opcional)
    if ($aul) {
      const hasAulas = hasAny(aulas);
      if (hasAulas) {
        hideField(WRAPS.aula, false);
        setOptions($aul, [], { placeholder: '— aguarde filtros anteriores —' });
        $aul.disabled = true;
      } else if (!ALWAYS_SHOW_FIELDS) {
        hideField(WRAPS.aula, true);
      } else {
        hideField(WRAPS.aula, false);
        setOptions($aul, [], { placeholder: '— campo não existente para esta disciplina —' });
        $aul.disabled = true;
      }
    }

    console.debug('[Funnel] Prefetch aplicado (foco em habilidade):', {
      objetos: objetos.length,
      titulos: titulos.length,
      conteudos: conteudos.length,
      habilidades: habilidades.length,
      aulas: aulas.length,
      fields
    });
  }

    // ============== AÇÃO DOS FILTROS SEGUINTES (afunilar) ==============
  async function onObjetoChange({ etapa, disciplina }) {
    const $tema = document.querySelector(IDS.tema);
    const $obj  = document.querySelector(IDS.objeto);
    const $aul  = document.querySelector(IDS.aula);

    const temasSel = getSelectValues($tema);
    const objsSel  = getSelectValues($obj);
    const aulaSel  = getSelectValues($aul);

    const ctx = { etapa, disciplina, tema: temasSel, objeto: objsSel, aula: aulaSel };

    console.debug('[Funnel.objeto] IN', ctx);

    // OBJETO agora só refina TÍTULO e CONTEÚDO
    const [titP, conP] = await Promise.allSettled([
      API_WRAP.titulos(ctx),
      API_WRAP.conteudos(ctx),
    ]);

    const tit = titP.status === 'fulfilled' ? toArr(titP.value) : [];
    const con = conP.status === 'fulfilled' ? toArr(conP.value) : [];

    console.debug('[Funnel.objeto] OUT', {
      titulos: tit.length,
      conteudos: con.length,
    });

    if (hasAny(tit)) {
      hideField(WRAPS.titulo, false);
      setOptions(document.querySelector(IDS.titulo), tit);
    } else if (!ALWAYS_SHOW_FIELDS) {
      hideField(WRAPS.titulo, true);
    }

    if (hasAny(con)) {
      hideField(WRAPS.conteudo, false);
      setOptions(document.querySelector(IDS.conteudo), con);
    } else if (!ALWAYS_SHOW_FIELDS) {
      hideField(WRAPS.conteudo, true);
    }
    // ⚠️ NÃO mexer em habilidades aqui.
  }


    async function onTituloChange({ etapa, disciplina }) {
    const $tema = document.querySelector(IDS.tema);
    const $obj  = document.querySelector(IDS.objeto);
    const $tit  = document.querySelector(IDS.titulo);
    const $aul  = document.querySelector(IDS.aula);

    const ctx = {
      etapa, disciplina,
      tema: getSelectValues($tema),
      objeto: getSelectValues($obj),
      titulo: getSelectValues($tit),
      aula: getSelectValues($aul),
    };

    console.debug('[Funnel.titulo] IN', ctx);

    const [conP] = await Promise.allSettled([
      API_WRAP.conteudos(ctx),
    ]);

    const con = conP.status === 'fulfilled' ? toArr(conP.value) : [];

    console.debug('[Funnel.titulo] OUT', {
      conteudos: con.length,
    });

    if (hasAny(con)) {
      hideField(WRAPS.conteudo, false);
      setOptions(document.querySelector(IDS.conteudo), con);
    } else if (!ALWAYS_SHOW_FIELDS) {
      hideField(WRAPS.conteudo, true);
    }
    // ⚠️ HABILIDADE não é recalculada aqui.
  }


    async function onConteudoChange({ etapa, disciplina }) {
    const $tema = document.querySelector(IDS.tema);
    const $obj  = document.querySelector(IDS.objeto);
    const $tit  = document.querySelector(IDS.titulo);
    const $con  = document.querySelector(IDS.conteudo);
    const $aul  = document.querySelector(IDS.aula);

    const ctx = {
      etapa, disciplina,
      tema: getSelectValues($tema),
      objeto: getSelectValues($obj),
      titulo: getSelectValues($tit),
      conteudo: getSelectValues($con),
      aula: getSelectValues($aul),
    };

    console.debug('[Funnel.conteudo] IN', ctx);
    // Fluxo novo: CONTEÚDO NÃO recalcula habilidades.
    console.debug('[Funnel.conteudo] OUT (sem recarga de habilidades)');
  }


    // NOVO — refino a partir de HABILIDADE
  async function onHabilidadeChange({ etapa, disciplina }) {
    const $tema = document.querySelector(IDS.tema);
    const $hab  = document.querySelector(IDS.habilidade);
    const $obj  = document.querySelector(IDS.objeto);
    const $tit  = document.querySelector(IDS.titulo);
    const $con  = document.querySelector(IDS.conteudo);
    const $aul  = document.querySelector(IDS.aula);

    const ctx = {
      etapa, disciplina,
      tema: getSelectValues($tema),
      habilidade: getSelectValues($hab),
    };

    console.debug('[Funnel.habilidade] IN', ctx);

    // Se nenhuma habilidade estiver selecionada, não há o que refinar
    if (!hasAny(ctx.habilidade)) {
      console.debug('[Funnel.habilidade] nenhuma habilidade selecionada');
      return;
    }

    const [objP, titP, conP, aulaP] = await Promise.allSettled([
      API_WRAP.objetos(ctx),
      API_WRAP.titulos(ctx),
      API_WRAP.conteudos(ctx),
      API_WRAP.aulas(ctx),
    ]);

    const objs = objP.status === 'fulfilled' ? toArr(objP.value) : [];
    const tits = titP.status === 'fulfilled' ? toArr(titP.value) : [];
    const cons = conP.status === 'fulfilled' ? toArr(conP.value) : [];
    const auls = aulaP.status === 'fulfilled' ? toArr(aulaP.value) : [];

    console.debug('[Funnel.habilidade] OUT', {
      objetos: objs.length,
      titulos: tits.length,
      conteudos: cons.length,
      aulas: auls.length,
    });

    // Preenche OBJETO
    if ($obj) {
      if (hasAny(objs)) {
        hideField(WRAPS.objeto, false);
        setOptions($obj, objs, { placeholder: '— filtre por objeto —' });
        $obj.disabled = false;
      } else if (!ALWAYS_SHOW_FIELDS) {
        hideField(WRAPS.objeto, true);
      } else {
        hideField(WRAPS.objeto, false);
        setOptions($obj, [], { placeholder: '— nenhum objeto para esta habilidade —' });
        $obj.disabled = true;
      }
    }

    // Preenche TÍTULO
    if ($tit) {
      if (hasAny(tits)) {
        hideField(WRAPS.titulo, false);
        setOptions($tit, tits, { placeholder: '— filtre por título —' });
        $tit.disabled = false;
      } else if (!ALWAYS_SHOW_FIELDS) {
        hideField(WRAPS.titulo, true);
      } else {
        hideField(WRAPS.titulo, false);
        setOptions($tit, [], { placeholder: '— nenhum título para esta habilidade —' });
        $tit.disabled = true;
      }
    }

    // Preenche CONTEÚDO
    if ($con) {
      if (hasAny(cons)) {
        hideField(WRAPS.conteudo, false);
        setOptions($con, cons, { placeholder: '— filtre por conteúdo —' });
        $con.disabled = false;
      } else if (!ALWAYS_SHOW_FIELDS) {
        hideField(WRAPS.conteudo, true);
      } else {
        hideField(WRAPS.conteudo, false);
        setOptions($con, [], { placeholder: '— nenhum conteúdo para esta habilidade —' });
        $con.disabled = true;
      }
    }

    // Preenche AULA
    if ($aul) {
      if (hasAny(auls)) {
        hideField(WRAPS.aula, false);
        setOptions($aul, auls, { placeholder: '— filtre por aula —' });
        $aul.disabled = false;
      } else if (!ALWAYS_SHOW_FIELDS) {
        hideField(WRAPS.aula, true);
      } else {
        hideField(WRAPS.aula, false);
        setOptions($aul, [], { placeholder: '— nenhuma aula para esta habilidade —' });
        $aul.disabled = true;
      }
    }
  }


  // NOVO — refino por AULA (opcional)
    async function onAulaChange({ etapa, disciplina }) {
    const $tema = document.querySelector(IDS.tema);
    const $obj  = document.querySelector(IDS.objeto);
    const $tit  = document.querySelector(IDS.titulo);
    const $con  = document.querySelector(IDS.conteudo);
    const $aul  = document.querySelector(IDS.aula);

    const ctx = {
      etapa, disciplina,
      tema: getSelectValues($tema),
      objeto: getSelectValues($obj),
      titulo: getSelectValues($tit),
      conteudo: getSelectValues($con),
      aula: getSelectValues($aul),
    };

    console.debug('[Funnel.aula] IN', ctx);

    // IMPORTANTE: não chamamos mais clearDownstream('aula') aqui
    // para não apagar as habilidades já carregadas.

    const hab = await API_WRAP.habilidades(ctx);
    const habArr = toArr(hab);

    console.debug('[Funnel.aula] OUT habilidades=', habArr.length);

    if (hasAny(habArr)) {
      hideField(WRAPS.habilidade, false);
      setOptions(document.querySelector(IDS.habilidade), habArr);
    } else if (!ALWAYS_SHOW_FIELDS) {
      hideField(WRAPS.habilidade, true);
    }
  }


  // debounce (ainda não usado, mas deixo pronto se precisar)
  function debounce(fn, ms = 120) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  }

  // Normalização de etapa
  function _normEtapa(v) {
    const t = String(v || '').trim().toLowerCase();
    if (t === 'médio' || t === 'medio') return 'medio';
    if (t === 'fundamental i' || t === 'fundamental_i') return 'fundamental_I';
    if (t === 'fundamental ii' || t === 'fundamental_ii') return 'fundamental_II';
    return t || '';
  }

  // Lê sempre o contexto vivo da página
  function getLiveCtx() {
    const selEtapa = document.querySelector('#selEtapa');
    const selDisc  = document.querySelector('#seldisciplina');

    const etapaSel = selEtapa && selEtapa.value ? _normEtapa(selEtapa.value) : '';
    const discSel  = selDisc  && selDisc.value  ? String(selDisc.value).trim() : '';

    const be = (!etapaSel && document.body?.dataset?.etapa)
      ? _normEtapa(document.body.dataset.etapa)
      : etapaSel;
    const bd = (!discSel && document.body?.dataset?.disciplina)
      ? String(document.body.dataset.disciplina).trim()
      : discSel;

    return { etapa: be, disciplina: bd };
  }

  // ============== WIRING (conectar aos eventos) ==============
     // ============== WIRING (conectar aos eventos) ==============
  function wireFunnelHandlers() {
    const $tema = document.querySelector(IDS.tema);
    const $obj  = document.querySelector(IDS.objeto);
    const $tit  = document.querySelector(IDS.titulo);
    const $con  = document.querySelector(IDS.conteudo);
    const $hab  = document.querySelector(IDS.habilidade);
    const $aul  = document.querySelector(IDS.aula);

    const ctxNow = () => getLiveCtx();

    // --- TEMA ---
    if ($tema) {
      // inicializa memória
      LAST_SELECTED.tema = getSelectedValuesByKey('tema');
      $tema.addEventListener('change', () => {
        const diff = selectionChanged('tema');

        // Só limpa se houve REMOÇÃO ou se não sobrou nada selecionado
        if (diff.removed.length > 0 || diff.now.length === 0) {
          clearDownstream('tema');
        }

        // TEMA agora só faz o prefetch geral e prepara HABILIDADE
        onTemaChangeLoadAll(ctxNow());
      });
    }

    // --- HABILIDADE (novo segundo nível do funil) ---
    if ($hab) {
      LAST_SELECTED.habilidade = getSelectedValuesByKey('habilidade');
      $hab.addEventListener('change', () => {
        const diff = selectionChanged('habilidade');

        // Se removeu habilidade ou ficou vazio, derruba OBJ/TIT/CONT/AULA
        if (diff.removed.length > 0 || diff.now.length === 0) {
          clearDownstream('habilidade');
        }

        // HABILIDADE passa a ser o "cérebro" que refina os demais campos
        onHabilidadeChange(ctxNow());
      });
    }

    // --- OBJETO ---
    if ($obj) {
      LAST_SELECTED.objeto = getSelectedValuesByKey('objeto');
      $obj.addEventListener('change', () => {
        const diff = selectionChanged('objeto');
        if (diff.removed.length > 0 || diff.now.length === 0) {
          clearDownstream('objeto');
        }
        onObjetoChange(ctxNow());
      });
    }

    // --- TÍTULO ---
    if ($tit) {
      LAST_SELECTED.titulo = getSelectedValuesByKey('titulo');
      $tit.addEventListener('change', () => {
        const diff = selectionChanged('titulo');
        if (diff.removed.length > 0 || diff.now.length === 0) {
          clearDownstream('titulo');
        }
        onTituloChange(ctxNow());
      });
    }

    // --- CONTEÚDO ---
    if ($con) {
      LAST_SELECTED.conteudo = getSelectedValuesByKey('conteudo');
      $con.addEventListener('change', () => {
        const diff = selectionChanged('conteudo');
        if (diff.removed.length > 0 || diff.now.length === 0) {
          clearDownstream('conteudo');
        }
        onConteudoChange(ctxNow());
      });
    }

    // --- AULA ---
    if ($aul) {
      LAST_SELECTED.aula = getSelectedValuesByKey('aula');
      $aul.addEventListener('change', () => {
        const diff = selectionChanged('aula');
        // Aula é o último nível → por enquanto NÃO limpamos nada.
        // Se no futuro quiser, dá pra refinar habilidades por aula.
        onAulaChange(ctxNow());
      });
    }

    const $etapa = document.querySelector('#selEtapa');
const $disc  = document.querySelector('#seldisciplina');

const onScopeChange = () => {
  console.debug('[Funnel] onScopeChange (etapa/disciplina mudou)');

  // 1) Limpa apenas os CACHES internos
  Funnel.QueryCache.clear();
  Funnel.FunnelStore.clear();

  // 2) Zera só a MEMÓRIA de seleção (para o selectionChanged funcionar certo)
  LAST_SELECTED.tema = [];
  LAST_SELECTED.objeto = [];
  LAST_SELECTED.titulo = [];
  LAST_SELECTED.conteudo = [];
  LAST_SELECTED.habilidade = [];
  LAST_SELECTED.aula = [];

  // 3) (Opcional) limpa visualmente os selects, sem derrubar nada depois do prefetch
  const $tema = document.querySelector(IDS.tema);
  const $obj  = document.querySelector(IDS.objeto);
  const $tit  = document.querySelector(IDS.titulo);
  const $con  = document.querySelector(IDS.conteudo);
  const $hab  = document.querySelector(IDS.habilidade);
  const $aul  = document.querySelector(IDS.aula);

  if ($tema) setOptions($tema, [], { placeholder: '— selecione o tema —' });
  if ($hab)  setOptions($hab,  [], { placeholder: '— selecione a habilidade —' });
  if ($obj)  setOptions($obj,  [], { placeholder: '— selecione uma habilidade primeiro —' });
  if ($tit)  setOptions($tit,  [], { placeholder: '— aguarde filtros anteriores —' });
  if ($con)  setOptions($con,  [], { placeholder: '— aguarde filtros anteriores —' });
  if ($aul)  setOptions($aul,  [], { placeholder: '— aguarde filtros anteriores —' });
};

if ($etapa) $etapa.addEventListener('change', onScopeChange);
if ($disc)  $disc.addEventListener('change', onScopeChange);
}




  async function fetchAulasSafe(ctx) {
    console.debug('[Funnel.fetchAulasSafe] delegando para API_WRAP.aulas', ctx);
    try {
      const aulas = await API_WRAP.aulas(ctx);
      return toArr(aulas);
    } catch (e) {
      console.debug('[Funnel.fetchAulasSafe] erro ao carregar aulas:', e?.message || e);
      return [];
    }
  }

  // =====================================================
  // SNAPSHOT ATUAL DO FUNIL (para TextareaUI / Plano)
  // =====================================================
  function getCurrentSelectionSnapshot() {
    const ctx = getLiveCtx();

    const $tema = document.querySelector(IDS.tema);
    const $obj  = document.querySelector(IDS.objeto);
    const $tit  = document.querySelector(IDS.titulo);
    const $con  = document.querySelector(IDS.conteudo);
    const $hab  = document.querySelector(IDS.habilidade);
    const $aul  = document.querySelector(IDS.aula);

    return {
      etapa: ctx.etapa || '',
      disciplina: ctx.disciplina || '',
      tema: getSelectValues($tema),
      objeto: getSelectValues($obj),
      titulo: getSelectValues($tit),
      conteudo: getSelectValues($con),
      habilidade: getSelectValues($hab),
      aula: getSelectValues($aul),
    };
  }

  // garante que QueryCache exista
const QueryCache = (typeof window !== 'undefined' && window.QueryCache)
  ? window.QueryCache
  : {
      _m: new Map(),
      get(k) { return this._m.get(k); },
      set(k, v) { this._m.set(k, v); return v; },
      has(k) { return this._m.has(k); },
      clear() { this._m.clear(); }
    };

if (typeof window !== 'undefined') {
  window.QueryCache = QueryCache;
}



  // ============== EXPORTS (browser + módulos) ==============
  const Funnel = {
    // utilitários
    toArr, getSelectValues, joinQS, sanitizeLabel, setOptions, hideField, hasAny, qsParamsBase,
    // api/fallback + cache
    apiGETList, API_WRAP, QueryCache,
    // cache por tema
    FunnelStore,
    // ids/wraps
    IDS, WRAPS,
    // contexto vivo
    getLiveCtx,
    getCurrentSelectionSnapshot,
    // handlers principais
    wireFunnelHandlers,
    onTemaChangeLoadAll, onObjetoChange, onTituloChange, onConteudoChange, onAulaChange,
    // helpers de UI
    applyPrefetchToUI, clearDownstream, inferFieldsPresence,
    // util aulas
    fetchAulasSafe,
  };

  if (typeof window !== 'undefined') {
    window.Funnel = Funnel;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Funnel;
  } else if (typeof define === 'function' && define.amd) {
    define(function () { return Funnel; });
  }
})();

// ===== BOOT DO FUNNEL (auto-wire com diagnóstico) =====
(function bootFunnel(){
  if (window.__FUNNEL_BOOTED__) return;
  window.__FUNNEL_BOOTED__ = true;

  const log = (...a) => console.log('[Funnel.boot]', ...a);
  const err = (...a) => console.error('[Funnel.boot]', ...a);

  function pickEtapa() {
    const d = document.body?.dataset?.etapa;
    if (d && d.trim()) return d.trim();
    const s = document.querySelector('#selEtapa');
    if (s && s.value) return s.value;
    return '';
  }

  function pickDisciplina() {
    const s = document.querySelector('#seldisciplina');
    if (s) return s.value || '';
    const d = document.body?.dataset?.disciplina;
    return d?.trim() || '';
  }

  function checkSelectors() {
    const ids = window.Funnel?.IDS || {};
    const found = Object.entries(ids).map(([k, sel]) => [k, sel, !!document.querySelector(sel)]);
    const missing = found.filter(([, , ok]) => !ok);
    if (missing.length) {
      err('Selects/IDs ausentes na página:', missing.map(([k, sel]) => `${k} -> ${sel}`).join(' | '));
      err('Ajuste os IDs em Funnel.IDS ou no HTML. O funil continuará, mas pulará campos ausentes.');
    } else {
      log('Todos os selects encontrados:', found.map(([k]) => k).join(', '));
    }
  }

  // =========================

// =========================
// ======================================================
// BOOT DO FUNIL (IIFE) – roda 1x ao carregar o script
// ======================================================


  // =========================
  // FUNÇÃO DE INICIALIZAÇÃO
  // =========================
  function start() {
    // 1) Checa se os selects do funil existem na página
    if (typeof window.Funnel?.IDS !== 'undefined') {
      const ids = window.Funnel.IDS;
      const found = Object.entries(ids).map(([k, sel]) => [k, sel, !!document.querySelector(sel)]);
      const missing = found.filter(([, , ok]) => !ok);

      if (missing.length) {
        err(
          'Selects/IDs ausentes na página:',
          missing.map(([k, sel]) => `${k} -> ${sel}`).join(' | ')
        );
      } else {
        log('Todos os selects encontrados:', found.map(([k]) => k).join(', '));
      }
    } else {
      console.warn('[Funnel.boot] window.Funnel.IDS não definido.');
    } // <- fim do if(window.Funnel?.IDS)

    // 2) Liga os handlers do funil
    if (window.Funnel?.wireFunnelHandlers) {
      window.Funnel.wireFunnelHandlers(); // não passe {etapa,disciplina}
      console.log('[Funnel.boot] Handlers ligados.');
    } else {
      console.warn('[Funnel.boot] wireFunnelHandlers não encontrado em window.Funnel.');
    } // <- fim do if(window.Funnel?.wireFunnelHandlers)

    // 3) Se já houver TEMA selecionado, faz prefetch automático
    const temaSelector = window.Funnel?.IDS?.tema;
    const temaEl = temaSelector ? document.querySelector(temaSelector) : null;

    if (temaEl && (temaEl.value || (temaEl.selectedOptions && temaEl.selectedOptions.length))) {
      const ctx = window.Funnel.getLiveCtx ? window.Funnel.getLiveCtx() : null;
      log('Tema já selecionado — prefetch...', ctx);
      if (ctx && window.Funnel?.onTemaChangeLoadAll) {
        window.Funnel.onTemaChangeLoadAll(ctx);
      }
    } else {
      log('Aguardando seleção de TEMA para prefetch.');
    } // <- fim do if(temaEl ... ) / else

    // 4) Atualiza textareas do plano, se a função existir
    if (window.PlanoUI?.atualizarTextareasPlano) {
      window.PlanoUI.atualizarTextareasPlano();
      console.log('[Funnel.boot] PlanoUI.atualizarTextareasPlano chamado no start().');
    } else if (window.Textarea?.atualizarTextareasPlano) {
      window.Textarea.atualizarTextareasPlano();
      console.log('[Funnel.boot] Textarea.atualizarTextareasPlano chamado no start().');
    } // <- fim do if/else-if de atualizarTextareasPlano
  } // <- FIM da função start()

  // =========================
  // BOOTSTRAP NA CARGA DA PÁGINA
  // =========================
  if (document.readyState === 'loading') {
    // garante que o start será chamado uma única vez quando o DOM estiver pronto
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    // DOM já está pronto
    start();
  }
})(); // <- FIM da IIFE bootFunnel
