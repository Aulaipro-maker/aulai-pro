// js/export.js
(function () {
  // --------------------------------------------------
  // Helper: etapa → label amigável
  // --------------------------------------------------
  function etapaLabelFromValue(v) {
    const map = {
      'fundamental_I': 'Fundamental I',
      'fundamental_II': 'Fundamental II',
      'medio': 'Médio',
      'fund1': 'Fundamental I',
      'fund2': 'Fundamental II'
    };
    return map[(v || '').toLowerCase()] || v || '';
  }

  function getEtapaAtual() {
    // tenta pelos botões/tabs
    const tab = document.querySelector('#tipo-switch .seg.active');
    const byData = tab?.dataset?.etapa;      // ex.: medio | fundamental_I | fundamental_II
    if (byData) return etapaLabelFromValue(byData);

    // fallback: espelho oculto
    const hidden = document.getElementById('selEtapa')?.value;
    if (hidden) return etapaLabelFromValue(hidden);

    // último recurso: texto de algum chip/pílula
    const pill = document.getElementById('etapa-pill')?.textContent?.trim();
    return pill || '';
  }

  // === Utils ===
  const uniq = arr =>
    Array.from(new Set((arr || []).map(s => (s || '').toString().trim()).filter(Boolean)));

  function toLines(x) {
    if (Array.isArray(x)) {
      return x.map(s => String(s || '').trim()).filter(Boolean);
    }
    return String(x || '').split('\n').map(s => s.trim()).filter(Boolean);
  }

  function extrairCodigoBNCC(str = '') {
    // EF08MA04 / (EF08MA04) — captura robusta
    const m =
      str.match(/\b[A-Z]{2}\d{2}[A-Z]{2}\d{2}\b/) ||
      str.match(/\(([A-Z]{2}\d{2}[A-Z]{2}\d{2})\)/);
    return m ? (m[1] || m[0]) : '';
  }

  // --------------------------------------------------
  // Coleta TUDO da UI (incluindo textareas do plano)
  // --------------------------------------------------
  function coletarDadosPlano() {
    // etapa: usa helper que já olha tabs, espelho etc.
    const etapa =
      getEtapaAtual() ||
      document.querySelector('#seletapa')?.value ||
      '';

    const identificacao = document.querySelector('#id-escola')?.value || 'Plano de Aula';
    const professor     = document.querySelector('#id-professor')?.value || '';
    const turma         = document.querySelector('#id-turma')?.value || '';
    const data          = document.getElementById('id-data')?.value || '';
    const ano           = document.getElementById('ano-letivo')?.value || '';
    const bimestre      = document.getElementById('bimestre-basico')?.value || '';

    // === Seleções do funil (usando os mesmos IDs do funnel/textarea) ===
    const temas = Array.from(
      document.getElementById('seltema')?.selectedOptions || []
    ).map(o => o.value);

    const objetos = Array.from(
      document.getElementById('selobjeto')?.selectedOptions || []
    ).map(o => o.value);

    const conteudos = Array.from(
      document.getElementById('selconteudo')?.selectedOptions || []
    ).map(o => o.value);

    const titulosDaAula = Array.from(
      document.getElementById('seltitulo')?.selectedOptions || []
    ).map(o => o.value);

    // === Habilidades (texto pronto do textarea) ===
    const habilidadesTexto =
      document.getElementById('txt-hab-bncc')?.value || '';

    const habilidadesLista = habilidadesTexto
      .split('\n')
      .map(s => s.replace(/^[-•]\s*/, '').trim())
      .filter(Boolean);

    // === Objetivos Específicos = checklist + textarea ===
    const oesSelecionados = Array.from(
      document.getElementById('seloe')?.selectedOptions || []
    ).map(o => o.value);

    const oesTextArea = (document.getElementById('txt-obj-esp')?.value || '')
      .split('\n')
      .map(s => s.trim())
      .filter(Boolean);

    const objetivosEspecificos = Array.from(
      new Set([...oesSelecionados, ...oesTextArea])
    );

    // === Textareas do Plano de Aula ===
    const txtBncc          = document.getElementById('txt-bncc')?.value || '';
    const txtObjAprend     = document.getElementById('txt-obj-aprend')?.value || '';
    const txtPrevios       = document.getElementById('txt-previos')?.value || '';
    const txtMetodologia   = document.getElementById('txt-metodologia')?.value || '';
    const txtRecursos      = document.getElementById('txt-recursos')?.value || '';
    const txtAtivDesemp    = document.getElementById('txt-ativ-desempenho')?.value || '';
    const txtCriterios     = document.getElementById('txt-criterios')?.value || '';
    const txtAvaliacao     = document.getElementById('txt-avaliacao')?.value || '';
    const txtConsideracoes = document.getElementById('txt-consideracoes')?.value || '';

    return {
      // Cabeçalho
      identificacao,
      etapa,
      professor,
      turma,
      data,
      ano,
      bimestre,

      // Básico
      componente_curricular: document.querySelector('#seldisciplina')?.value || '',
      tema: temas,

      // Objeto do conhecimento + BNCC combinado
      objetos_do_conhecimento: objetos,
      conteudos_habilidades_bncc: txtBncc,
      titulos_da_aula: titulosDaAula,

      // Habilidades (para o bloco "Habilidades (BNCC)")
      habilidades_bncc: habilidadesLista,
      habilidades_texto: habilidadesTexto,

      // Objetivos
      objetivos_especificos: objetivosEspecificos,
      objetivos_aprendizagem: txtObjAprend,

      // Conhecimentos Prévios
      conhecimentos_previos: txtPrevios,

      // Partes de baixo do plano
      metodologia_estrategias: txtMetodologia,
      recursos_didaticos:      txtRecursos,
      atividades_desempenho:   txtAtivDesemp,
      criterios_avaliacao:     txtCriterios,
      avaliacao_autoavaliacao: txtAvaliacao,
      consideracoes_finais:    txtConsideracoes,

      // Lista “crua” de conteúdos (para o bloco "Conteúdos")
      conteudos
    };
  }

  // --------------------------------------------------
  // Linhas compostas (Plano acumulado / modo-uma-hab)
  // --------------------------------------------------
  function gerarOAfromGrupo(grupo, objetivosSet) {
    const habTxt = (grupo?.habilidade_texto || '').trim();
    const oesArr = Array.isArray(objetivosSet)
      ? objetivosSet
      : Array.from(objetivosSet || []);
    const oes = Array.from(new Set(oesArr)).join('; ');
    if (!habTxt && !oes) return '';
    if (!oes) return habTxt;
    return `${habTxt} — ${oes}`;
  }

  function coletarLinhasCompostas() {
    // 1) Modo “uma habilidade”
    const cont = document.getElementById('habilidades');
    const modoUma = document.getElementById('modo-uma-hab')?.checked;
    if (cont) {
      const marcadas = Array.from(
        cont.querySelectorAll('input[name="hab"]:checked')
      ).map(i => i.value);

      if (modoUma && marcadas.length === 1) {
        const oesSelecionados = Array.from(
          document.getElementById('seloe')?.selectedOptions || []
        ).map(o => o.value);

        const oesTextArea = (document.getElementById('txt-obj-esp')?.value || '')
          .split('\n')
          .map(s => s.trim())
          .filter(Boolean);

        const objetivos = Array.from(new Set([...oesSelecionados, ...oesTextArea]));

        const titulos = Array.from(
          document.getElementById('seltitulo')?.selectedOptions || []
        ).map(o => o.value);

        return [
          {
            habilidade: marcadas[0],
            codigo: extrairCodigoBNCC(marcadas[0]),
            objetivos_especificos: objetivos,
            titulos: Array.from(new Set(titulos)),
            objetivo_aprendizagem: gerarOAfromGrupo(
              { habilidade_texto: marcadas[0] },
              objetivos
            )
          }
        ];
      }
    }

    // 2) Plano acumulado (Map) – se existir
    if (window.Plano instanceof Map && window.Plano.size > 0) {
      const linhas = [];
      for (const g of window.Plano.values()) {
        const objetivos = uniq(
          Array.isArray(g.objetivos) ? g.objetivos : Array.from(g.objetivos || [])
        );
        const titulos = uniq(
          Array.isArray(g.titulos) ? g.titulos : Array.from(g.titulos || [])
        );
        linhas.push({
          habilidade: g.habilidade_texto || g.codigo || '',
          codigo: g.codigo || extrairCodigoBNCC(g.habilidade_texto || ''),
          objetivos_especificos: objetivos,
          titulos: titulos,
          objetivo_aprendizagem: gerarOAfromGrupo(g, objetivos)
        });
      }
      if (linhas.length) return linhas;
    }

    return null;
  }

  // --------------------------------------------------
  // Payload final para o backend de export
  // --------------------------------------------------
  function coletarPayloadExport() {
    // CORREÇÃO: usar a função certa
    const base = coletarDadosPlano();

    // Linha mínima (fallback) — sempre normalize com toLines()
    const linhaMinima = {
      habilidade: (base.conteudos_habilidades_bncc || '').trim(),
      codigo: '',
      objetivos_especificos: uniq(toLines(base.objetivos_especificos)),
      titulos: uniq(toLines(base.titulos_da_aula)),
      objetivo_aprendizagem: (base.objetivos_aprendizagem || '').trim()
    };

    const linhasCompostas = coletarLinhasCompostas();

    const payload = {
      // cabeçalho “legado”
      identificacao: base.identificacao,              // agora = ESCOLA
      etapa: base.etapa,
      disciplina: base.componente_curricular,

      // contexto (para cabeçalho resumido)
      temas: uniq(toLines(base.tema)),
      conteudos: uniq(toLines(base.conteudos)),
      titulos_da_aula: uniq(toLines(base.titulos_da_aula)),
      objetos_do_conhecimento: uniq(toLines(base.objetos_do_conhecimento)),

      // campos textuais do plano (TEXTAREAS, já formatados)
      conteudos_habilidades_bncc: base.conteudos_habilidades_bncc || '',
      objetivos_aprendizagem: base.objetivos_aprendizagem || '',
      conhecimentos_previos: base.conhecimentos_previos || '',
      metodologia_estrategias: base.metodologia_estrategias || '',
      recursos_didaticos: base.recursos_didaticos || '',
      atividades_desempenho: base.atividades_desempenho || '',
      criterios_avaliacao: base.criterios_avaliacao || '',
      avaliacao_autoavaliacao: base.avaliacao_autoavaliacao || '',
      consideracoes_finais: base.consideracoes_finais || '',

      // (opcional) textos auxiliares
      objeto_conhecimento_texto: base.objeto_conhecimento_texto || '',
      habilidades_texto: base.habilidades_texto || '',

      // linhas por habilidade / OA
      linhas:
        linhasCompostas && linhasCompostas.length ? linhasCompostas : [linhaMinima]
    };

    // Cabeçalho estruturado (usado por PDF/DOCX)
    payload.plano = {
      // CORREÇÃO: base.escola não existe, usamos identificacao
      escola: base.identificacao,
      professor: base.professor,
      turma: base.turma,
      data: base.data,
      ano: base.ano,
      bimestre: base.bimestre,
      etapa: base.etapa,
      componente: base.componente_curricular
    };

    return payload;
  }

  // --------------------------------------------------
  // Mapa de formatos para Accept
  // --------------------------------------------------
  const ACCEPTS = {
    pdf: 'application/pdf',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  };

  // --------------------------------------------------
  // Export principal
  // --------------------------------------------------
  let __exportando = false;

  async function exportar(fmt) {
    if (__exportando) return; // evita clique duplo
    __exportando = true;

    const btn = document.querySelector(`#btn-export-${fmt}`);
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Exportando...';
    }

    const payload = coletarPayloadExport();
    if (!payload?.linhas?.length) {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Exportar ' + fmt.toUpperCase();
      }
      __exportando = false;
      alert(
        'Não há linhas para exportar. Selecione uma habilidade/título ou adicione ao plano.'
      );
      return;
    }

    const url = `/export/${fmt}`;
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 60000);

    try {
      // 1) “Prova de vida” usando helper POST (se existir)
      if (window.POST) {
        await window
          .POST(url, payload, {
            headers: { Accept: ACCEPTS[fmt] || 'application/octet-stream' },
            retries: 1
          })
          .catch(() => {
            /* fallback para fetch direto */
          });
      }

      // 2) Download binário (blob)
      let res;
      try {
        const apiBase = window.API_BASE || '';
        res = await fetch(`${apiBase}${url}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json;charset=utf-8',
            Accept: ACCEPTS[fmt] || 'application/octet-stream'
          },
          body: JSON.stringify(payload),
          signal: ctrl.signal
        });
      } finally {
        clearTimeout(to);
      }

      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(`Falha ao exportar (${res.status}): ${txt || res.statusText}`);
      }

      const ct = res.headers.get('content-type') || '';
      if (ct.includes('application/json')) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || JSON.stringify(data).slice(0, 200));
      }

      const blob = await res.blob();

      // Nome do arquivo
      let nome = null;
      const cd = res.headers.get('content-disposition') || '';
      const m =
        cd.match(/filename\*=(?:UTF-8''([^;]+))/i) ||
        cd.match(/filename="?([^";]+)"?/i);
      if (m) nome = decodeURIComponent(m[1]).replace(/[/\\]/g, '').trim();

      if (!nome) {
        const comp = (payload.disciplina || 'Plano')
          .replace(/[^\p{L}\p{N}\s_-]+/gu, '')
          .trim() || 'Plano';
        nome = `${comp}.${fmt}`;
      }

      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = nome;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    } catch (err) {
      console.error('[Export]', err);
      alert(`Erro na exportação: ${err.message || err}`);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Exportar ' + fmt.toUpperCase();
      }
      __exportando = false;
    }
  }

  // --------------------------------------------------
  // Liga os botões
  // --------------------------------------------------
  document
    .getElementById('btn-export-docx')
    ?.addEventListener('click', () => exportar('docx'));
  document
    .getElementById('btn-export-pptx')
    ?.addEventListener('click', () => exportar('pptx'));
  document
    .getElementById('btn-export-xlsx')
    ?.addEventListener('click', () => exportar('xlsx'));
  document
    .getElementById('btn-export-pdf')
    ?.addEventListener('click', () => exportar('pdf'));
})();
