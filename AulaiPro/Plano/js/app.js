// js/app.js — binds de busca + aparência
(function(){

  function bindSearchToSelect(inputEl, selectEl){
    if (!inputEl || !selectEl) return;

    const snapshot = () => {
      selectEl._allOptions = Array.from(selectEl.options).map(o => ({
        text: o.text,
        value: o.value
      }));
    };
    if (!selectEl._allOptions || !selectEl._allOptions.length) snapshot();

    inputEl.addEventListener('input', ()=>{
      const q = (inputEl.value || '').toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g,'');
      const base = selectEl._allOptions || [];
      selectEl.innerHTML = '';
      for(const {text,value} of base){
        const k = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
        if(!q || k.includes(q)){
          selectEl.add(new Option(text,value));
        }
      }
    });

    if (selectEl) selectEl.refreshSearchCache = snapshot;
  }

  document.addEventListener('DOMContentLoaded', ()=> {
    bindSearchToSelect(document.getElementById('search-tema'), document.getElementById('seltema'));
    bindSearchToSelect(document.getElementById('search-titulo'), document.getElementById('selTitulo'));
    bindSearchToSelect(document.getElementById('search-conteudo'), document.getElementById('selconteudo'));
    bindSearchToSelect(document.getElementById('search-obj'), document.getElementById('selobj'));

    document.getElementById('btn-aparencia')?.addEventListener('click', ()=>{
      document.getElementById('dlg-aparencia')?.showModal();
    });
  });

})();




