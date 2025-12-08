// js/TextareaUI.js
// Preenche automaticamente os textareas do Plano
// a partir das seleções do funil BNCC.

(function (window, document) {
  'use strict';

  console.log('[TextareaUI] script carregado.');
  window.TEXTAREA_DEBUG = true;
  console.warn('[TextareaUI][DEBUG] Modo debug ativado.');

  // ---------------------------
  // Utilitário simples de query
  // ---------------------------
  function $(id) {
    return document.getElementById(id);
  }

  // ===========================================
  // Checklists do painel (Metod, Recursos, Ativ)
  // ===========================================
  function getChecklistValues(listId) {
    const list = document.getElementById(listId);
    if (!list) return [];

    return Array.from(list.querySelectorAll('input[type="checkbox"]:checked'))
      .map(cb => cb.getAttribute('data-label') || cb.value || cb.id || '')
      .filter(Boolean);
  }

  function getChecklistFromPainel(dropdownId) {
    const root = document.getElementById(dropdownId);
    if (!root) {
      console.warn('[TextareaUI] painel checklist NÃO encontrado:', dropdownId);
      return [];
    }

    const itens = Array.from(root.querySelectorAll('input[type="checkbox"]'))
      .filter(cb => cb.checked)
      .map(cb => {
        const li = cb.closest('li');
        const labelEl = li && li.querySelector('.item-label');
        const txt = labelEl && labelEl.textContent
          ? labelEl.textContent.trim()
          : (cb.value || cb.id || '').trim();
        return txt;
      })
      .filter(Boolean);

    console.log('[TextareaUI] getChecklistFromPainel', dropdownId, itens);
    return itens;
  }

  // ---------------------------------------------
  // Lê labels dos <select>, ignorando placeholders
  // ---------------------------------------------
  function getSelectedLabels(selectId) {
    const el = $(selectId);
    if (!el) {
      console.warn('[TextareaUI] select NÃO encontrado:', selectId);
      return [];
    }

    const opts = el.selectedOptions && el.selectedOptions.length
      ? Array.from(el.selectedOptions)
      : Array.from(el.options || []).filter(o => o.selected);

    const labels = opts
      .filter(o => {
        const v = (o.value || '').trim();
        const t = (o.textContent || '').trim();
        if (!v) return false;
        const lower = t.toLowerCase();
        if (lower.includes('selecione')) return false;
        if (lower === 'none' || lower === 'nenhum') return false;
        return true;
      })
      .map(o => (o.textContent || o.value || '').trim())
      .filter(Boolean);

    console.log(`[TextareaUI] getSelectedLabels(${selectId})`, {
      totalOptions: el.options?.length ?? 0,
      selectedCount: labels.length,
      labels
    });

    return labels;
  }

  // ---------------------------------------
  // Objetos do Conhecimento: sempre via <select>
  // ---------------------------------------
  function getObjetosFromChecklist() {
    const labels = getSelectedLabels('selobjeto');
    console.log('[TextareaUI] getObjetosFromChecklist() via <select>', {
      qtd: labels.length,
      labels
    });
    return labels;
  }

  // --------------------------------------------------
  // Campo combinado: Temas + Títulos + Conteúdos (BNCC)
  // --------------------------------------------------
  function buildTemasTitulosConteudos({ temas, titulos, conteudos }) {
    const blocos = [];

    if (temas.length) {
      blocos.push('Temas / Unidades Temáticas:\n- ' + temas.join('\n- '));
    }
    if (titulos.length) {
      blocos.push('Títulos das aulas:\n- ' + titulos.join('\n- '));
    }
    if (conteudos.length) {
      blocos.push('Conteúdos / Conhecimentos:\n- ' + conteudos.join('\n- '));
    }

    return blocos.join('\n\n');
  }

  // ------------------------------------------------------
  // Remove código BNCC no início do texto da habilidade.
  // ------------------------------------------------------
  function limparCodigoBncc(texto) {
    if (!texto) return '';
    let s = String(texto).trim();

    // (EF07MA12) ...
    s = s.replace(/^\s*\([^)]*\)\s*[-–:]?\s*/, '');
    // EF07MA12 - ...
    s = s.replace(/^\s*[A-Z]{2}\d{2}[A-Z0-9]{2,6}\s*[-–:]?\s+/, '');
    // fallback genérico
    s = s.replace(/^\s*[A-Z0-9\.]{4,12}\s*[-–:]?\s+/, '');

    return s.trim();
  }

  // ======================================================
  // HELPERS GENÉRICOS PARA TEXTO FIXO EM BLOCO
  // ======================================================
  function montarBlocoFixado(intro, itens) {
    const arr = (itens || []).map(t => (t || '').trim()).filter(Boolean);
    if (!arr.length) return '';
    return intro + '\n\n' + arr.map(i => `• ${i}`).join('\n');
  }

  // ---------------------------------------------------------
  // Monta uma frase única a partir de uma lista de frases
  // ---------------------------------------------------------
  function montarFraseLista(frases, intro) {
    const arr = (frases || [])
      .map(f => (f || '').trim())
      .filter(Boolean);

    if (!arr.length) return '';

    const inicio = intro || '';
    if (arr.length === 1) {
      return inicio + arr[0] + '.';
    }

    const ultima = arr[arr.length - 1];
    const meio = arr.slice(0, -1);

    return inicio + meio.join('; ') + ' e ' + ultima + '.';
  }

  // ===============================
  // HELPERS PARA LER DO JSON
  // ===============================

  // devolve o primeiro campo não-vazio de uma lista de chaves
  function getFirstNonEmpty(row, keys) {
    if (!row || typeof row !== 'object') return '';
    for (const k of keys) {
      if (row[k] && String(row[k]).trim()) {
        return String(row[k]).trim();
      }
    }
    return '';
  }

  /**
   * Objetivos de Aprendizagem a partir das linhas JSON
   * - Procura qualquer coluna de "objetivos"
   * - Agrupa por habilidade: uma habilidade → um parágrafo
   * - Evita repetição de frases
   */
  function buildObjetivosFromRows(rows) {
    if (!Array.isArray(rows) || !rows.length) return '';

    // mapa: chaveHabilidade -> { habTexto, objetivos: [], seen:Set }
    const porHabilidade = new Map();

    rows.forEach(row => {
      if (row == null) return;

      // Caso 1: linha é string pura → objetivos "gerais", sem habilidade
      if (typeof row === 'string') {
        const normal = row.toString().trim();
        if (!normal) return;

        const chaveHab = '__geral__';
        if (!porHabilidade.has(chaveHab)) {
          porHabilidade.set(chaveHab, {
            habTexto: '',
            objetivos: [],
            seen: new Set()
          });
        }
        const grupo = porHabilidade.get(chaveHab);
        const texto = normal.replace(/[.;]+$/, '').trim();
        if (!texto) return;

        const key = texto.toLowerCase();
        if (grupo.seen.has(key)) return;
        grupo.seen.add(key);
        grupo.objetivos.push(texto);
        return;
      }

      // Caso 2: linha é objeto
      if (typeof row !== 'object') return;

      // 1) texto da habilidade (pode servir para o parágrafo)
      let habBruta =
        row.HABILIDADE ||
        row.Habilidades ||
        row.habilidade ||
        row.Habilidade ||
        row['Habilidade BNCC'] ||
        '';

      habBruta = (habBruta || '').toString().trim();
      const habTexto = limparCodigoBncc(habBruta) || ''; // sem o código na frente

      const chaveHab = habBruta || '__geral__';

      if (!porHabilidade.has(chaveHab)) {
        porHabilidade.set(chaveHab, {
          habTexto: habTexto,
          objetivos: [],
          seen: new Set()
        });
      }
      const grupo = porHabilidade.get(chaveHab);

      // 2) localizar coluna de objetivos (por nome aproximado)
      let textoObjetivos = '';

      // primeiro: qualquer coluna cujo nome normalize para algo começando com "objetiv"
      for (const [col, val] of Object.entries(row)) {
        if (!val) continue;
        const nomeNorm = col
          .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
          .toLowerCase();
        if (nomeNorm.startsWith('objetiv')) {
          const s = String(val).trim();
          if (s) {
            textoObjetivos = s;
            break;
          }
        }
      }

      // fallback: alguns nomes comuns
      if (!textoObjetivos) {
        const colunasPossiveis = [
          'Objetivos',
          'objetivos',
          'OBJETIVOS',
          'Objetivos da aprendizagem',
          'Objetivos de Aprendizagem',
          'OBJETIVOS DA APRENDIZAGEM',
          'Objetivo de Aprendizagem',
          'OBJETIVO DA APRENDIZAGEM'
        ];
        for (const col of colunasPossiveis) {
          if (row[col] && String(row[col]).trim()) {
            textoObjetivos = String(row[col]).trim();
            break;
          }
        }
      }

      if (!textoObjetivos) return;

      // 3) quebrar em frases
      const partes = textoObjetivos
        .split(/[.;]\s+|;\s+|\n+/)
        .map(p => p.trim())
        .filter(Boolean);

      partes.forEach(obj => {
        const normal = obj.replace(/[.;]+$/, '').trim();
        if (!normal) return;
        const key = normal.toLowerCase();
        if (grupo.seen.has(key)) return; // evita repetido
        grupo.seen.add(key);
        grupo.objetivos.push(normal);
      });
    });

    // 4) montar texto final
    const paragrafos = [];
    porHabilidade.forEach((grupo, chaveHab) => {
      if (!grupo.objetivos.length) return;

      let intro;
      if (chaveHab === '__geral__' || !grupo.habTexto) {
        intro = 'Para esta aula, os objetivos de aprendizagem são:\n';
      } else {
        intro =
          'Para esta aula, em relação à habilidade "' +
          grupo.habTexto +
          '", os objetivos de aprendizagem são:\n';
      }

      const linhas = grupo.objetivos.map(o => `- ${o}`);
      paragrafos.push(intro + linhas.join('\n'));
    });

    return paragrafos.join('\n\n');
  }

  // ---------------------------------------------------
  // Conhecimentos Prévios a partir de frases de hab.
  // ---------------------------------------------------
  function buildPreviosFromFrases(frases) {
    const arr = (frases || [])
      .map(f => (f || '').trim())
      .filter(Boolean);

    if (!arr.length) return '';

    if (arr.length === 1) {
      return 'Para esta aula, é preciso que os alunos tenham conhecimento prévio e sejam capazes de ' +
        arr[0] + '.';
    }

    const ultima = arr[arr.length - 1];
    const meio = arr.slice(0, -1);

    return 'Para esta aula, é preciso que os alunos tenham conhecimentos prévios e sejam capazes de ' +
      meio.join('; ') + ' e ' + ultima + '.';
  }

  /**
   * Conhecimentos Prévios a partir das linhas JSON (ainda disponível se precisar)
   */
  function buildPreviosFromRows(rows) {
    if (!Array.isArray(rows) || !rows.length) return '';

    const frasesHab = [];
    const seenHab = new Set();

    rows.forEach(row => {
      let hab = getFirstNonEmpty(row, [
        'HABILIDADE',
        'Habilidades',
        'habilidade',
        'Habilidade',
        'Habilidade BNCC',
        'descricao_habilidade',
        'Descrição Habilidade'
      ]);
      if (!hab) return;

      hab = limparCodigoBncc(hab);
      if (!hab) return;

      const key = hab.toLowerCase();
      if (seenHab.has(key)) return;
      seenHab.add(key);

      frasesHab.push(hab.replace(/[.;]+$/, ''));
    });

    return buildPreviosFromFrases(frasesHab);
  }

  // =======================================
  // DEBUG: inspeciona linhas vindas do JSON
  // =======================================
  function debugDumpRowsForPlano(rows, contexto) {
    if (!Array.isArray(rows)) {
      console.warn('[TextareaUI][DEBUG] rows não é array em', contexto, rows);
      return;
    }

    const total = rows.length;
    const keysSet = new Set();
    rows.forEach(r => {
      if (!r || typeof r !== 'object') return;
      Object.keys(r).forEach(k => keysSet.add(k));
    });

    const keys = Array.from(keysSet).sort();
    console.log('[TextareaUI][DEBUG] linhas JSON recebidas para', contexto, {
      total,
      chaves: keys,
    });

    const amostra = rows.slice(0, 3).map((r, idx) => ({
      idx,
      HABILIDADE: r.HABILIDADE || r.Habilidades || r.habilidade || '',
      OBJ_CONHEC:
        r['OBJETOS DO CONHECIMENTO'] ||
        r['Objeto do Conhecimento'] ||
        r['Objetos do Conhecimento'] ||
        '',
      TITULO:
        r['TÍTULO '] ||
        r['TÍTULO'] ||
        r['Titulo'] ||
        '',
      CONTEUDO:
        r['CONTEÚDO'] ||
        r['Conteudo'] ||
        r['Conteúdo'] ||
        '',
      OBJETIVOS:
        r.OBJETIVOS ||
        r.Objetivos ||
        r['Objetivos de Aprendizagem'] ||
        '',
      CONHEC_PREVIOS:
        r['Conhecimentos prévios'] ||
        r['Conhecimentos Prévios'] ||
        ''
    }));

    if (console.table) {
      console.table(amostra);
    } else {
      console.log('[TextareaUI][DEBUG] amostra linhas JSON:', amostra);
    }
  }

    // ===============================
  // MONTA QS A PARTIR DO SNAPSHOT
  // ===============================
  function buildQSFromSnapshot(snap) {
    if (!snap || typeof snap !== 'object') return '';

    const p = new URLSearchParams();

    if (snap.etapa)      p.set('etapa', snap.etapa);
    if (snap.disciplina) p.set('disciplina', snap.disciplina);

    if (Array.isArray(snap.tema) && snap.tema.length) {
      p.set('tema', snap.tema.join('||'));
    }
    if (Array.isArray(snap.objeto) && snap.objeto.length) {
      p.set('objeto', snap.objeto.join('||'));
    }
    if (Array.isArray(snap.titulo) && snap.titulo.length) {
      p.set('titulo', snap.titulo.join('||'));
    }
    if (Array.isArray(snap.conteudo) && snap.conteudo.length) {
      p.set('conteudo', snap.conteudo.join('||'));
    }
    if (Array.isArray(snap.habilidade) && snap.habilidade.length) {
      p.set('habilidade', snap.habilidade.join('||'));
    }
    // aula é opcional
    if (Array.isArray(snap.aula) && snap.aula.length) {
      p.set('aula', snap.aula.join('||'));
    }

    // importantíssimo pro backend usar OR nos filtros múltiplos
    p.set('contains', '1');

    return p.toString();
  }

function extrairCodigoBncc(str) {
  if (!str) return null;
  const s = String(str);

  // Pega padrões EF01MA11, EF09CI02, EM13CNT101 etc.
  const m = s.match(/[A-Z]{2}\d{2}[A-Z]{2}\d+/);
  return m ? m[0] : null;
}


async function buscarHabilidadesAnterioresInteligente(snap) {
  if (!snap || !Array.isArray(snap.habilidade) || !snap.habilidade.length) {
    return [];
  }

  const base = (window.LESSON && window.LESSON.API_BASE) || window.API_BASE || '';
  if (!base) return [];

  const disciplina = snap.disciplina || '';
  const habilidadeAtualStr = snap.habilidade[snap.habilidade.length - 1] || '';

  // extrai código BNCC da habilidade atual, ex: (EF02CI01) ou EM13CNT101
  function extrairCodigo(hab) {
    if (!hab) return null;
    const mPar = hab.match(/\(([A-Z0-9]+)\)/); // pega o que está entre parênteses
    if (mPar) return mPar[1];
    const mSeco = hab.match(/\b(EF\d{2}[A-Z0-9]{2,}|EM13[A-Z0-9]{2,})\b/);
    return mSeco ? mSeco[1] : null;
  }

  const codigoAtual = extrairCodigo(habilidadeAtualStr);
  if (!codigoAtual) {
    console.warn('[TextareaUI] Não foi possível extrair código da habilidade atual:', habilidadeAtualStr);
  }

  // converte código BNCC em "ordem" numérica para comparação
  function ordemCodigo(cod) {
    if (!cod) return 999;

    // EF01.. a EF09.. → 1 a 9
    const mEF = cod.match(/^EF(\d{2})/);
    if (mEF) {
      const ano = parseInt(mEF[1], 10); // 1..9
      return ano; // Fundamental
    }

    // EM13... → tratar como 10+ (médio, posterior ao 9º)
    if (/^EM13/.test(cod)) {
      return 10;
    }

    return 999;
  }

  const ordemAtual = ordemCodigo(codigoAtual);

  // helper de matching por tema/objeto/conteúdo
  function someMatch(texto, lista) {
    if (!texto || !Array.isArray(lista) || !lista.length) return false;
    const lower = String(texto).toLowerCase();
    return lista.some(item =>
      item && lower.includes(String(item).toLowerCase())
    );
  }

  // Vamos buscar em todas as etapas, não só na etapa atual
  const etapasBusca = ['fundamental_I', 'fundamental_II', 'medio'];

  const candidatos = [];

  for (const etapaBusca of etapasBusca) {
    try {
      const url = `${base}/api/dados/habilidades?etapa=${encodeURIComponent(etapaBusca)}&disciplina=${encodeURIComponent(disciplina)}`;
      console.log('[TextareaUI] Buscando HABILIDADES para conhecimentos prévios em:', url);

      const resp = await fetch(url);
      if (!resp.ok) {
        console.warn('[TextareaUI] Falha ao buscar habilidades em', etapaBusca, resp.status);
        continue;
      }

      const data = await resp.json();
      const rows = Array.isArray(data) ? data : (data.rows || data.data || []);
      if (!rows.length) continue;

      rows.forEach(row => {
        const habBruta =
          row.HABILIDADE ||
          row.Habilidades ||
          row.habilidade ||
          row.Habilidade ||
          row['Habilidade BNCC'] ||
          '';

        if (!habBruta) return;

        const codigo = extrairCodigo(habBruta);
        const ord = ordemCodigo(codigo);

        // precisa ser de série ANTERIOR ao código atual
        if (codigoAtual && !(ord < ordemAtual)) return;

        // tenta pegar tema/objeto/conteúdo da linha
        const temaRow =
          row['Tema'] ||
          row['TEMA'] ||
          row['Temas'] ||
          row['Unidade temática'] ||
          row['Unidade Temática'] ||
          '';

        const objRow =
          row['Objeto do Conhecimento'] ||
          row['OBJETO DO CONHECIMENTO'] ||
          row['Objetos do Conhecimento'] ||
          row['OBJETOS DO CONHECIMENTO'] ||
          '';

        const contRow =
          row['Conteúdo'] ||
          row['CONTEÚDO'] ||
          row['Conteudos'] ||
          row['CONTEUDOS'] ||
          '';

        const matchTema     = someMatch(temaRow, snap.tema);
        const matchObjeto   = someMatch(objRow, snap.objeto);
        const matchConteudo = someMatch(contRow, snap.conteudo);

        // precisa bater pelo menos em um dos três
        if (!(matchTema || matchObjeto || matchConteudo)) return;

        candidatos.push(habBruta);
      });
    } catch (e) {
      console.error('[TextareaUI] Erro ao buscar habilidades para conhecimentos prévios em', etapaBusca, e);
    }
  }

  // limpar + deduplicar
  const vistos = new Set();
  const saida = [];

  candidatos.forEach(hab => {
    const limpa = limparCodigoBncc(hab);
    if (!limpa) return;

    const key = limpa.toLowerCase();
    // NUNCA incluir a habilidade atual
    if (habilidadeAtualStr && habilidadeAtualStr.toLowerCase().includes(key)) return;

    if (!vistos.has(key)) {
      vistos.add(key);
      saida.push(limpa);
    }
  });

  console.log('[TextareaUI] Habilidades anteriores encontradas para conhecimentos prévios:', saida.length);

  return saida;
}



// ==========================
// Atualização dos textareas
// ==========================
function updateFromSelections() {
  console.group('[TextareaUI.updateFromSelections]');

  const temas       = getSelectedLabels('seltema');
  const objetos     = getObjetosFromChecklist();
  const titulos     = getSelectedLabels('seltitulo');
  const conteudos   = getSelectedLabels('selconteudo');
  const habilidades = getSelectedLabels('selhabilidade');
  const aulas       = getSelectedLabels('selaula');

  // Checklists do painel superior
  const metodologiasSelecionadas  = getChecklistFromPainel('metod-dropdown');
  const recursosSelecionados      = getChecklistFromPainel('recursos-dropdown');
  const atividadesSelecionadas    = getChecklistFromPainel('ativ-dropdown');

  // ===============================
  // Habilidades atuais x anteriores
  // ===============================

  // habilidade da aula (a última selecionada)
  const habilidadeAtual = habilidades.length
    ? habilidades[habilidades.length - 1]
    : null;

  // habilidades anteriores (conhecimentos prévios)
  const habilidadesPrevias = habilidades.slice(0, -1);

  // descrições para CONHECIMENTOS PRÉVIOS (somente habilidades anteriores)
  const habDescricoesPrevias = habilidadesPrevias
    .map(limparCodigoBncc)
    .filter(Boolean);

  console.log('[TextareaUI] Seleções capturadas:', {
    temas: temas.length,
    objetos: objetos.length,
    titulos: titulos.length,
    conteudos: conteudos.length,
    habilidades: habilidades.length,
    aulas: aulas.length,
    metodologiasSelecionadas: metodologiasSelecionadas.length,
    recursosSelecionados: recursosSelecionados.length,
    atividadesSelecionadas: atividadesSelecionadas.length,
    habilidadeAtual,
    habilidadesPrevias: habilidadesPrevias.length
  });

  // === IDs dos textareas, conforme index.html ===
  const txtBncc          = $('txt-bncc');
  const txtHabBncc       = $('txt-hab-bncc');

  const txtObjConhec     = $('txt-obj-conhec') || $('txt-obj-conhecimento');
  const txtObjAprend     = $('txt-obj-aprend');
  const txtPrevios       = $('txt-previos');

  const txtMetodologia   = $('txt-metodologia');
  const txtRecursos      = $('txt-recursos');
  const txtAtivDesempenho= $('txt-ativ-desempenho');
  const txtCriterios     = $('txt-criterios');
  const txtAvaliacao     = $('txt-avaliacao');
  const txtConsideracoes = $('txt-consideracoes');

  console.log('[TextareaUI] Textareas encontrados?', {
    'txt-bncc': !!txtBncc,
    'txt-hab-bncc': !!txtHabBncc,
    'txt-obj-conhec': !!txtObjConhec,
    'txt-obj-aprend': !!txtObjAprend,
    'txt-previos': !!txtPrevios,
    'txt-metodologia': !!txtMetodologia,
    'txt-recursos': !!txtRecursos,
    'txt-ativ-desempenho': !!txtAtivDesempenho,
    'txt-criterios': !!txtCriterios,
    'txt-avaliacao': !!txtAvaliacao,
    'txt-consideracoes': !!txtConsideracoes
  });

  // 1) Temas + Títulos + Conteúdos (BNCC)
  if (txtBncc) {
    txtBncc.value = buildTemasTitulosConteudos({
      temas,
      titulos,
      conteudos
    });
  }

  // 2) Habilidades (somente habilidades selecionadas, para exibição)
  if (txtHabBncc) {
    txtHabBncc.value = habilidades.map(h => `• ${h}`).join('\n');
  }

  // 3) Objeto do Conhecimento
  if (txtObjConhec) {
    txtObjConhec.value = objetos.join('\n');
  }

  // 4) Objetivos de Aprendizagem + Conhecimentos Prévios
  if (txtObjAprend || txtPrevios) {
    const snap = (window.Funnel && typeof window.Funnel.getCurrentSelectionSnapshot === 'function')
      ? window.Funnel.getCurrentSelectionSnapshot()
      : null;

    if (!snap) {
      console.warn('[TextareaUI] Snapshot do funil indisponível para objetivos/prévios.');
    }

    // Normaliza possíveis formatos de retorno da API de objetivos
    function normalizeObjetivosRows(data) {
      if (!data) return [];

      let rows = [];
      if (Array.isArray(data)) {
        rows = data;
      } else if (typeof data === 'object') {
        rows =
          data.objetivos ||
          data.Objetivos ||
          data.OBJETIVOS ||
          data.items ||
          data.rows ||
          data.data ||
          [];

        if (!Array.isArray(rows)) {
          const firstArray = Object.values(data).find(v => Array.isArray(v));
          if (Array.isArray(firstArray)) rows = firstArray;
        }
      }

      if (!Array.isArray(rows)) return [];
      return rows;
    }

    // Conhecimentos prévios SEMPRE a partir das HABILIDADES ANTERIORES
    // Conhecimentos prévios SEMPRE a partir das HABILIDADES ANTERIORES
function buildPreviosFromHabilidadesNova(lista) {
  const arr = (lista || [])
    .map(t => String(t || '').trim())
    .filter(Boolean)
    .map(t => t.replace(/[.;]+$/, ''));

  if (!arr.length) return '';

  const bullets = arr.map(l => `• ${l}`);

  return [
    'Para que o aluno tenha um bom aproveitamento desta aula, é necessário que ele tenha conhecimento em:',
    '',
    ...bullets
  ].join('\n');
}

// descrições de TODAS as habilidades selecionadas (para fallback)
const habDescricoesTodas = habilidades
  .map(limparCodigoBncc)
  .filter(Boolean);

// habilidade atual limpa, para poder excluir dos prévios
const habilidadeAtualLimpa = habilidadeAtual ? limparCodigoBncc(habilidadeAtual) : '';

(async () => {
      // 4.1 OBJETIVOS – se não tiver txtObjAprend ou snapshot, pula direto para prévios
      if (!txtObjAprend || !snap) {
        // 4.2 CONHECIMENTOS PRÉVIOS – sempre via habilidades ANTERIORES (automáticas)
if (txtPrevios) {
  const anterioresInteligentes = await buscarHabilidadesAnterioresInteligente(snap);

  let fontePrevios = [];

  if (anterioresInteligentes.length) {
    // caso ideal: achou habilidades anteriores similares em Fund I/II/Médio
    fontePrevios = anterioresInteligentes;
  } else if (habDescricoesPrevias.length) {
    // se no futuro você permitir selecionar mais de uma habilidade no funil,
    // usamos as anteriores selecionadas (sem a atual)
    fontePrevios = habDescricoesPrevias;
  } else {
    // Fallback pedagógico: montar pré-requisitos a partir do tema/objeto
    const lista = [];
    if (temas.length) {
      lista.push(`noções introdutórias sobre o tema "${temas.join(', ')}"`);
    }
    if (objetos.length) {
      lista.push(`conhecimentos básicos relacionados a "${objetos.join(', ')}"`);
    }
    if (!lista.length && conteudos.length) {
      lista.push(`experiências prévias com conteúdos como "${conteudos.join(', ')}"`);
    }
    if (!lista.length) {
      lista.push('noções essenciais relacionadas aos conteúdos que serão trabalhados nesta aula');
    }

    fontePrevios = lista;
  }

  txtPrevios.value = buildPreviosFromHabilidadesNova(fontePrevios);
}
 return;
      }

      // ===== OBJETIVOS via API (mantido igual) =====
      try {
        const base = (window.LESSON && window.LESSON.API_BASE) || window.API_BASE || '';
        if (!base) {
          console.warn('[TextareaUI] API_BASE não definido; objetivos não serão carregados.');
          txtObjAprend.value = '';
        } else {
          const qs  = buildQSFromSnapshot(snap);
          const url = `${base}/api/dados/objetivos?${qs}`;
          console.log('[TextareaUI] Buscando OBJETIVOS em:', url);

          const resp = await fetch(url);
          if (!resp.ok) {
            console.warn('[TextareaUI] Resposta não-OK para OBJETIVOS:', resp.status, resp.statusText);
            txtObjAprend.value = '';
          } else {
            const data = await resp.json();
            const rows = normalizeObjetivosRows(data);
            console.log(
              '[TextareaUI] Linhas de OBJETIVOS recebidas:',
              Array.isArray(rows) ? rows.length : '(não-array)'
            );

            const textoObj = buildObjetivosFromRows(rows);
            txtObjAprend.value = textoObj || '';
          }
        }
      } catch (e) {
        console.error('[TextareaUI] Erro ao buscar OBJETIVOS via API:', e);
        txtObjAprend.value = '';
      }

      // 4.2 CONHECIMENTOS PRÉVIOS – sempre via habilidades ANTERIORES (ou, em último caso, algo da atual SEM repetir igual)
      if (txtPrevios) {
        const anterioresInteligentes = await buscarHabilidadesAnterioresInteligente(snap);

        const habAtualLimpa = limparCodigoBncc(habilidadeAtual || '');

        let fontePrevios = [];
        if (anterioresInteligentes && anterioresInteligentes.length) {
          fontePrevios = anterioresInteligentes;
        } else if (habDescricoesPrevias.length) {
          // se o usuário selecionou mais de uma habilidade, usamos só as anteriores
          fontePrevios = habDescricoesPrevias;
        } else {
          // fallback extremo: usa descrição da própria habilidade,
          // mas vamos filtrar para não repetir igualzinho
          fontePrevios = habilidades.map(limparCodigoBncc);
        }

        const filtrada = (fontePrevios || [])
          .map(t => String(t || '').trim())
          .filter(Boolean)
          .filter(t => {
            if (!habAtualLimpa) return true;
            return t.toLowerCase() !== habAtualLimpa.toLowerCase();
          });

        txtPrevios.value = buildPreviosFromHabilidadesNova(filtrada);
      }

    })();
  } // <-- fecha o if (txtObjAprend || txtPrevios)

  // 5) Metodologia e Estratégias
  if (txtMetodologia) {
    txtMetodologia.value = montarBlocoFixado(
      'A aula será desenvolvida utilizando as seguintes estratégias:',
      metodologiasSelecionadas
    );
  }

  // 6) Recursos Didáticos
  if (txtRecursos) {
    txtRecursos.value = montarBlocoFixado(
      'Para esta aula, serão utilizados os seguintes recursos:',
      recursosSelecionados
    );
  }

  // 7) Atividades de Desempenho
  if (txtAtivDesempenho) {
    txtAtivDesempenho.value = montarBlocoFixado(
      'Como atividades de desempenho, os estudantes irão realizar:',
      atividadesSelecionadas
    );
  }

  // 8) Critérios de Avaliação
  if (txtCriterios) {
    const texto = montarFraseLista(
      [
        'participação nas discussões e nas atividades propostas',
        'realização das tarefas em sala e/ou em casa dentro do prazo combinado',
        'qualidade dos registros e das justificativas apresentados pelos estudantes'
      ],
      'Os critérios de avaliação considerados para esta aula são: '
    );
    txtCriterios.value = texto || '';
  }

  // 9) Avaliação e Autoavaliação
  if (txtAvaliacao) {
    const texto = montarFraseLista(
      [
        'observação sistemática da participação dos estudantes durante a aula',
        'análise das produções individuais e em grupo',
        'autoavaliação dos estudantes sobre suas dificuldades e avanços'
      ],
      'A avaliação da aprendizagem será realizada por meio de '
    );
    txtAvaliacao.value = texto || '';
  }

  // 10) Considerações Finais
  if (txtConsideracoes) {
    const texto = montarFraseLista(
      [
        'retomada dos principais conceitos trabalhados na aula',
        'registro dos avanços observados e das dificuldades da turma',
        'planejamento de intervenções para as aulas seguintes, a partir das evidências coletadas'
      ],
      'Como considerações finais, destaca-se a importância de '
    );
    txtConsideracoes.value = texto || '';
  }

  console.groupEnd();
} // fecha updateFromSelections


  // =====================================
  // Liga auto-update nos selects do funil
  // =====================================
  function wireAutoUpdate() {
    const selectIds = [
      'seltema',
      'selobjeto',
      'seltitulo',
      'selconteudo',
      'selhabilidade',
      'selaula'
    ];

    selectIds.forEach(id => {
      const el = $(id);
      if (!el) {
        console.warn('[TextareaUI] select para auto-update NÃO encontrado:', id);
        return;
      }
      el.addEventListener('change', () => {
        console.log('[TextareaUI] change em', id, '→ atualizando textareas');
        updateFromSelections();
      });
    });

    const checklistSelectors = [
      '#metod-dropdown input[type="checkbox"]',
      '#recursos-dropdown input[type="checkbox"]',
      '#ativ-dropdown input[type="checkbox"]',
      '#criterios-dropdown input[type="checkbox"]',
      '#ava-dropdown input[type="checkbox"]'
    ];

    checklistSelectors.forEach(sel => {
      const nodes = document.querySelectorAll(sel);
      if (!nodes.length) {
        console.warn('[TextareaUI] checkboxes para auto-update NÃO encontrados:', sel);
        return;
      }
      nodes.forEach(node => {
        node.addEventListener('change', () => {
          console.log('[TextareaUI] change em', sel, '→ atualizando textareas');
          updateFromSelections();
        });
      });
    });
  }

  // =====================
  // Inicialização geral
  // =====================
  function init() {
    console.log('[TextareaUI.init] Iniciando…');

    const btn = $('btn-atualizar-hab');
    console.log('[TextareaUI.init] Botão #btn-atualizar-hab existe?', !!btn);

    if (btn) {
      btn.addEventListener('click', function () {
        console.log('[TextareaUI] Clique no botão "Atualizar por tema" detectado.');
        updateFromSelections();
      });
      console.log('[TextareaUI] Handler de clique registrado no botão.');
    } else {
      console.warn('[TextareaUI] botão #btn-atualizar-hab NÃO encontrado.');
    }

    const extraButtons = [
      'btn-metodologia',
      'btn-recursos',
      'btn-ativ-desempenho',
      'btn-atividades',
      'btn-criterios',
      'btn-avaliacao',
      'btn-consideracoes'
    ];

    extraButtons.forEach(function (id) {
      const b = $(id);
      if (!b) {
        console.warn('[TextareaUI] botão extra NÃO encontrado:', id);
        return;
      }
      b.addEventListener('click', function () {
        console.log('[TextareaUI] Clique no botão extra', id, '→ updateFromSelections()');
        updateFromSelections();
      });
    });

    wireAutoUpdate();

    window.TextareaUI = {
      updateFromSelections,
      init
    };

    console.log('[TextareaUI] API global disponível em window.TextareaUI');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})(window, document);
