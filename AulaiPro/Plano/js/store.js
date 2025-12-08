// js/store.js
(function(){
  if (window.__lessonai_store_loaded) return;
  window.__lessonai_store_loaded = true;

  // ======== Config ========
  const LS_KEY = "lessonai.store.v2";   // incrementa se mudar schema
  const VERSION = 2;

  // ======== Helpers ========
  const isArr = v => Array.isArray(v);
  const asArray = v => isArr(v) ? v : (v == null ? [] : [v]);
  const uniq = arr => Array.from(new Set(asArray(arr).map(s => (s ?? '').toString().trim()).filter(Boolean)));

  function sanitizeState(s){
    const out = {
      etapa:        (s?.etapa ?? 'medio').toString(),
      disciplina:   (s?.disciplina ?? '').toString(),
      temasSel:     uniq(s?.temasSel),
      titulosSel:   uniq(s?.titulosSel),
      conteudosSel: uniq(s?.conteudosSel),
      objetosSel:   uniq(s?.objetosSel),
      habilidadesSel: uniq(s?.habilidadesSel),
    };
    return out;
  }

  // ======== Persistência ========
  function loadFromLS(){
    try{
      const raw = localStorage.getItem(LS_KEY);
      if(!raw) return null;
      const j = JSON.parse(raw);
      // migração simples por versão
      if (j.version !== VERSION) {
        return sanitizeState(j.state || {});
      }
      return sanitizeState(j.state || {});
    }catch{ return null; }
  }
  function saveToLS(state){
    try{
      localStorage.setItem(LS_KEY, JSON.stringify({ version: VERSION, state }));
    }catch{}
  }

  // ======== Pub/Sub ========
  const listeners = new Set();
  function emit(patch, nextState){
    const ev = new CustomEvent('state:change', { detail: patch });
    document.dispatchEvent(ev);
    for (const fn of listeners) {
      try { fn(nextState, patch); } catch(_){}
    }
  }

  // ======== Store ========
  const initial = sanitizeState(loadFromLS() || {
    etapa: 'medio',
    disciplina: '',
    temasSel: [],
    titulosSel: [],
    conteudosSel: [],
    objetosSel: [],
    habilidadesSel: [],
  });

  const Store = {
    state: initial,

    // merge com validação/dedup; dispara eventos; persiste no LS
    set(patch){
      const next = sanitizeState({ ...this.state, ...patch });
      // evita emitir se nada mudou (shallow compare nos campos do schema)
      let changed = false;
      for (const k of Object.keys(next)) {
        const a = this.state[k], b = next[k];
        if (isArr(a) || isArr(b)) {
          const A = JSON.stringify(a||[]);
          const B = JSON.stringify(b||[]);
          if (A !== B) { changed = true; break; }
        } else if (a !== b) { changed = true; break; }
      }
      if (!changed) return;

      this.state = next;
      saveToLS(this.state);
      emit(patch, this.state);
    },

    // substitui tudo (usa sanitize + persist + evento)
    replace(nextState){
      const next = sanitizeState(nextState);
      this.state = next;
      saveToLS(this.state);
      emit({ __replace: true }, this.state);
    },

    // reset para estado “limpo”
    reset(){
      const clean = sanitizeState({
        etapa: 'medio',
        disciplina: '',
        temasSel: [],
        titulosSel: [],
        conteudosSel: [],
        objetosSel: [],
        habilidadesSel: [],
      });
      this.replace(clean);
    },

    // leitura segura (snapshot imutável)
    get(){
      // retorna cópia rasa (evita mutação externa inadvertida)
      return JSON.parse(JSON.stringify(this.state));
    },

    // assinatura: retorna função para desinscrever
    subscribe(fn){
      if (typeof fn === 'function') listeners.add(fn);
      return () => listeners.delete(fn);
    }
  };

  // ======== Cache com TTL por chave ========
  const Cache = (() => {
    const map = new Map();
    const DEFAULT_TTL = 5 * 60 * 1000; // 5 min

    function kNorm(k){
      // normaliza chaves não-strings para JSON estável
      if (typeof k === 'string') return k;
      try { return JSON.stringify(k); } catch{ return String(k); }
    }

    return {
      get(k){
        const kk = kNorm(k);
        const rec = map.get(kk);
        if (!rec) return null;
        const ttl = rec.ttl ?? DEFAULT_TTL;
        if (ttl > 0 && Date.now() - rec.t > ttl) { map.delete(kk); return null; }
        return rec.v;
      },
      set(k, v, ttlMs = DEFAULT_TTL){
        const kk = kNorm(k);
        map.set(kk, { v, t: Date.now(), ttl: Math.max(0, ttlMs|0) });
      },
      has(k){
        return this.get(k) !== null;
      },
      delete(k){
        const kk = kNorm(k);
        return map.delete(kk);
      },
      clear(){
        map.clear();
      },
      size(){
        return map.size;
      },
      touch(k){
        const kk = kNorm(k);
        const rec = map.get(kk);
        if (rec) rec.t = Date.now();
      }
    };
  })();

  // ======== Exports globais ========
  window.Store = Store;
  window.Cache = Cache;

  // ======== Debug opcional: loga mudanças no console (comente se não quiser) ========
  // Store.subscribe((next, patch) => {
  //   console.log("[Store] change", { patch, next });
  // });

})();
