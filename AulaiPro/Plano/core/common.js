/* core/common.js — rotinas compartilhadas (Básico + Técnico) */

(() => {
  // ===== helpers mínimos =====
  const $  = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
  const on = (el, ev, fn) => el && el.addEventListener(ev, fn);

  // ===== contexto da página =====
  const PAGE = document.body?.dataset?.page || 'basico';

  // ===== API base & status =====
  if (!window.API_BASE) {
    window.API_BASE =
      document.querySelector('[data-api-base]')?.getAttribute('data-api-base') ||
      (location.port === "8000" ? "" : "http://127.0.0.1:8000");
  }
  const API_BASE = window.API_BASE;
  const statusEl = $('#backend-status');
  const dotEl    = $('#health-dot');

  async function pingBackend() {
    try {
      const r = await fetch(`${API_BASE}/api/health`, { headers:{Accept:'application/json'} });
      const ok = r.ok;
      if (statusEl) {
        statusEl.textContent = ok ? 'conectado' : 'desconectado';
        statusEl.classList.toggle('ok', ok);
        statusEl.classList.toggle('err', !ok);
      }
      if (dotEl) dotEl.className = ok ? 'dot dot-on' : 'dot dot-off';
    } catch {
      if (statusEl) {
        statusEl.textContent = 'desconectado';
        statusEl.classList.remove('ok'); statusEl.classList.add('err');
      }
      if (dotEl) dotEl.className = 'dot dot-off';
    }
  }

  // ===== topbar: só “pluga” handlers se os IDs existirem =====
  function bindTopbarHandlers() {
    on($('#btn-perfil'), 'click', () => $('#dlg-perfil')?.showModal?.());
    on($('#btn-aparencia-top'), 'click', () => $('#dlg-aparencia')?.showModal?.());
    on($('#btn-planos'), 'click', () => {
      const m = $('#menu-planos'); if (!m) return;
      m.hidden = !m.hidden;
    });
    on(document, 'click', (e) => {
      const m = $('#menu-planos');
      if (!m || m.hidden) return;
      if (!m.contains(e.target) && e.target !== $('#btn-planos')) m.hidden = true;
    });
    // Visualizar / Exportar — se você já tem funções globais, apenas chama:
    on($('#btn-visualizar'), 'click', () => window.previewPlano?.());
    // #btn-exportar-top abre um menu/dlg se você tiver — aqui só plugamos se existir.
  }
  
    /* ===== agregador/formatter de objetivos (disponível globalmente) ===== */
  (function(ns){
    // util mínimo local (não conflita com seus $ e on)
    const norm = (s) => (s ?? "")
      .toString()
      .replace(/\u00A0/g, " ")
      .replace(/^\s+|\s+$/g, "")
      .replace(/\s+/g, " ");

    const stripBullet = (s) =>
      norm(s)
        .replace(/^[\s•\-\*]+/, "")
        .replace(/^[\.\;]+/, "")
        .replace(/\s*;\s*/g, "; ")
        .replace(/\s*\.\s*/g, ". ")
        .replace(/(\s*[;\.])+\s*$/,"");

    const firstVal = (row, keys) => {
      for (const k of keys) {
        if (k in row && row[k] != null && String(row[k]).trim() !== "") {
          return String(row[k]);
        }
      }
      return "";
    };

    const K = {
      tema: [
        "UNIDADE TEMÁTICA","Unidade Temática","unidade_temática","unidade tematica","tema","Tema"
      ],
      conteudo: [
        "CONTEÚDO","Conteúdo","conteudo","OBJETO DO CONHECIMENTO","Objeto do Conhecimento","objeto"
      ],
      objeto: [
        "OBJETO DO CONHECIMENTO","Objeto do Conhecimento","objeto","CONTEÚDO","Conteúdo","conteudo"
      ],
      habilidade: [
        "HABILIDADE","Habilidade","habilidade","Código","codigo","CÓDIGO"
      ],
      objetivoEspecifico: [
        "OBJETIVO ESPECÍFICO","Objetivo Específico","objetivo específico","objetivo_especifico","OE","O.E."
      ],
      objetivo: [
        "OBJETIVO","Objetivo","objetivo","Objetivos de Aprendizagem","objetivos_aprendizagem"
      ]
    };

    ns.formatarObjetivosPorSelecao = function(rows, sel = {}) {
      const toArr = (v) => Array.isArray(v) ? v : (v ? [v] : []);
      const temasSel       = toArr(sel.temas).map(norm);
      const objetosSel     = toArr(sel.objetos).map(norm);
      const habsSel        = toArr(sel.habilidades).map(norm);
      const oesSel         = toArr(sel.objetivosEspecificos).map(norm);
      const usarUTComoTema = sel.modoTema === "ut";

      const filtradas = rows.filter((r) => {
        const temaVal = norm(firstVal(r, usarUTComoTema ? K.tema : K.conteudo));
        const objVal  = norm(firstVal(r, K.objeto));
        const habVal  = norm(firstVal(r, K.habilidade));
        const oeVal   = norm(firstVal(r, K.objetivoEspecifico));

        if (temasSel.length   && !temasSel.includes(temaVal))  return false;
        if (objetosSel.length && !objetosSel.includes(objVal))  return false;
        if (habsSel.length    && !habsSel.some(h => habVal.includes(h))) return false;
        if (oesSel.length     && !oesSel.includes(oeVal))       return false;
        return true;
      });

      const map = new Map(); // hab -> (oe -> objetivos[])
      for (const r of filtradas) {
        const hab = norm(firstVal(r, K.habilidade));
        const oe  = norm(firstVal(r, K.objetivoEspecifico));
        const objTexto = stripBullet(firstVal(r, K.objetivo));
        if (!hab || !objTexto) continue;

        if (!map.has(hab)) map.set(hab, new Map());
        const byOE = map.get(hab);
        const keyOE = oe || "—";
        if (!byOE.has(keyOE)) byOE.set(keyOE, new Set());
        byOE.get(keyOE).add(objTexto); // evita duplicatas
      }

      const blocks = [];
      for (const [hab, byOE] of map.entries()) {
        const linhas = [];
        for (const [oe, objetivosSet] of byOE.entries()) {
          const objetivos = Array.from(objetivosSet);
          linhas.push({ objetivoEspecifico: oe, objetivos });
        }
        linhas.sort((a,b) => (a.objetivoEspecifico === "—") - (b.objetivoEspecifico === "—")
                           || a.objetivoEspecifico.localeCompare(b.objetivoEspecifico, 'pt-BR'));
        blocks.push({ habilidade: hab, linhas });
      }
      blocks.sort((a,b)=> a.habilidade.localeCompare(b.habilidade, 'pt-BR'));

      let html = "";
      for (const blk of blocks) {
        let inner = "";
        for (const ln of blk.linhas) {
          // mesma habilidade + mesmo OE → MESMA LINHA, separados por ";"
          inner += `<div class="oe-line">${ln.objetivos.join("; ")}</div>`;
        }
        // habilidades diferentes → OUTRO PARÁGRAFO
        html += `<p class="hab-block"><strong>${blk.habilidade}</strong><br/>${inner}</p>`;
      }

      return { html, blocks, map };
    };

    ns.renderObjetivos = function(container, fmtOut) {
      if (!container) return;
      container.innerHTML = fmtOut.html || "<p>(sem objetivos filtrados)</p>";
    };
  })(window.LessonAI = window.LessonAI || {});


  // ===== boot comum =====
  document.addEventListener('DOMContentLoaded', () => {
    bindTopbarHandlers();
    pingBackend();
    setInterval(pingBackend, 15000); // 15s

    // avisa outras partes que o common terminou
    try { document.dispatchEvent(new CustomEvent('lessonai:common-ready', { detail:{ page: PAGE } })); } catch {}
  });

  // ===== proteção: nunca reescreva a topbar no Técnico =====
  window.__LESSONAI_PAGE = PAGE; // útil para debugar no console
})();
