// preview.js — diálogo de pré-visualização do plano (não altera exportar/collect do core)
(() => {
  if (window.__lessonai_preview_loaded) return;
  window.__lessonai_preview_loaded = true;

  // Converte string multi-linha em array (elimina vazios)
  function toArr(v){
    if (Array.isArray(v)) return v.filter(Boolean);
    const s = String(v||'').trim();
    return s ? s.split(/\r?\n/).map(x=>x.trim()).filter(Boolean) : [];
  }

  // Garante "-" nas seções vazias para a visualização (sem afetar dados salvos)
  function ensureTopicPlaceholders(p){
    const fields = [
      'conhecimentos_previos',
      'metodologia_estrategias',
      'recursos_didaticos',
      'atividades_desempenho',
      'criterios_avaliacao',
      'avaliacao_autoavaliacao',
      'consideracoes_finais'
    ];
    fields.forEach(k => { p[k] = toArr(p[k]).length ? toArr(p[k]) : ['-']; });
    return p;
  }

  // Formata texto de preview
  function getPreviewText(p){
    const titulo = p.identificacao || 'Plano de Aula';
    const joinComma = a => (a||[]).join(', ');
    const bullets   = a => (a||[]).map(s => `• ${s}`).join('\n') || '• -';

    const bnccLines = toArr(
      p.conteudos_habilidades_bncc_paragrafos || p.conteudos_habilidades_bncc
    );


    return [
      `${titulo}`,
      `Componente(s): ${joinComma(p.componente_curricular)}`,
      `Tema(s): ${joinComma(p.tema)}`,
      ``,
      `Habilidades/BNCC`,
      bullets(bnccLines),
      ``,
      `Objetivos de Aprendizagem`,
      bullets(p.objetivos_aprendizagem && p.objetivos_aprendizagem.length ? p.objetivos_aprendizagem : ['-']),
      ``,
      `objeto`,
      bullets(p.objetivos_especificos && p.objetivos_especificos.length ? p.objetivos_especificos : ['-']),
      ``,
      `Conhecimentos Prévios`,
      bullets(p.conhecimentos_previos),
      ``,
      `Metodologias e Estratégias`,
      bullets(p.metodologia_estrategias),
      ``,
      `Recursos Didáticos`,
      bullets(p.recursos_didaticos),
      ``,
      `Atividades/Desempenho`,
      bullets(p.atividades_desempenho),
      ``,
      `Critérios de Avaliação`,
      bullets(p.criterios_avaliacao),
      ``,
      `Avaliação/Autoavaliação`,
      bullets(p.avaliacao_autoavaliacao),
      ``,
      `Considerações Finais`,
      bullets(p.consideracoes_finais),
    ].join('\n');
  }

  // Cria <dialog> se não existir
  function ensurePreviewDialog(){
    let dlg = document.getElementById('dlg-preview-plano');
    if (dlg) return dlg;

    dlg = document.createElement('dialog');
    dlg.id = 'dlg-preview-plano';
    dlg.style.cssText = 'width:min(900px,90vw);padding:0;border:0;overflow:hidden;border-radius:12px;';
    dlg.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid #e5e7eb;background:#f8fafc">
        <strong>Pré-visualização do Plano</strong>
        <button id="preview-close" class="btn sm">Fechar</button>
      </div>
      <div style="padding:16px;max-height:70vh;overflow:auto;background:#fff;">
        <pre id="preview-content" style="white-space:pre-wrap;margin:0;font:14px/1.45 ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Cantarell,Noto Sans,sans-serif;"></pre>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;padding:12px 16px;border-top:1px solid #e5e7eb;background:#f8fafc">
        <button id="preview-export-docx" class="btn">Exportar DOCX</button>
        <button id="preview-export-pdf"  class="btn ghost">Exportar PDF</button>
      </div>
    `;
    document.body.appendChild(dlg);

    dlg.querySelector('#preview-close')?.addEventListener('click', () => dlg.close());
    dlg.querySelector('#preview-export-docx')?.addEventListener('click', () => { dlg.close(); window.exportar?.('docx'); });
    dlg.querySelector('#preview-export-pdf') ?.addEventListener('click', () => { dlg.close(); window.exportar?.('pdf');  });

    return dlg;
  }

  // Abre o preview a partir do estado atual do formulário
  function abrirPreviewPlano(){
    // coleta e sanitiza com o core, quando disponível
    let payload = {};
    if (typeof window.coletarPlano === 'function') payload = window.coletarPlano();
    if (typeof window.sanitizePayload === 'function') payload = window.sanitizePayload(payload);

    // garante placeholders para seções vazias
    payload = ensureTopicPlaceholders(payload);

    // render
    const dlg = ensurePreviewDialog();
    dlg.querySelector('#preview-content').textContent = getPreviewText(payload);
    dlg.showModal();
  }

  // Liga botões existentes no HTML (se houver)
  function wirePreviewButtons(){
    // no menu perfil (sugestão do seu requisito)
    document.getElementById('perfil-visualizar')?.addEventListener('click', (e)=>{ e.preventDefault(); abrirPreviewPlano(); });
    // botão solto de topo
    document.getElementById('btn-visualizar')?.addEventListener('click', (e)=>{ e.preventDefault(); abrirPreviewPlano(); });
    // expõe no global para reutilizar
    window.abrirPreviewPlano = abrirPreviewPlano;
  }

  document.addEventListener('DOMContentLoaded', wirePreviewButtons);
})();
