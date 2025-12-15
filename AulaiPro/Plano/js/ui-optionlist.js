// js/ui-optionlist.js
(function () {
  // Compat: se já carregou com a flag antiga ou nova, não carrega de novo
  if (window.__aulaiPro_optionlist_loaded || window.__lessonai_optionlist_loaded) return;

  window.__aulaiPro_optionlist_loaded = true;
  // mantém a antiga também, para evitar duplicação em páginas que ainda usem o nome antigo
  window.__lessonai_optionlist_loaded = true;

  // Util
  const toArr = (x) => Array.from(x || []);
  const text = (s) => (s == null ? "" : String(s));
  const raf = (fn) => (window.requestAnimationFrame || setTimeout)(fn, 0);

  function bind(container) {
    const sel = document.querySelector(container.dataset.source);
    if (!sel || container.__bound) return;
    container.__bound = true;

    // Config via data-*
    const MAX = parseInt(container.dataset.max || "", 10) || 0; // 0 = sem limite
    const SEARCH_INPUT = container.dataset.search
      ? document.querySelector(container.dataset.search)
      : null;

    // Acessibilidade básica
    container.setAttribute("role", "listbox");
    container.setAttribute("aria-multiselectable", String(!!sel.multiple));

    // Estado de foco (preserva foco entre renders)
    let focusValue = null;

    function getVisibleOptions() {
      return toArr(sel.options).filter((opt) => !opt.hidden && !opt.disabled);
    }

    function selectedValues() {
      return getVisibleOptions()
        .filter((o) => o.selected)
        .map((o) => o.value);
    }

    function canSelectMore() {
      if (!sel.multiple || !MAX) return true;
      return selectedValues().length < MAX;
    }

    function toggleOption(opt) {
      if (opt.disabled || opt.hidden) return;

      if (!sel.multiple) {
        // Single select: espelha comportamento do <select>
        toArr(sel.options).forEach((o) => (o.selected = false));
        opt.selected = true;
      } else {
        if (opt.selected) {
          opt.selected = false;
        } else {
          if (canSelectMore()) {
            opt.selected = true;
          } else {
            // feedback leve (shake)
            container.classList.add("ol-limit");
            setTimeout(() => container.classList.remove("ol-limit"), 300);
            return;
          }
        }
      }

      // Dispara change no <select> (bolha)
      sel.dispatchEvent(new Event("change", { bubbles: true }));
      // Evento próprio da option-list
      container.dispatchEvent(
        new CustomEvent("optionlist:change", {
          bubbles: true,
          detail: { values: selectedValues() },
        })
      );
    }

    function makeButton(opt) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "option-item";
      b.dataset.value = opt.value;
      b.textContent = text(opt.textContent || opt.value).trim() || opt.value;
      const isSel = !!opt.selected;

      // A11y
      b.setAttribute("role", "option");
      b.setAttribute("aria-selected", String(isSel));
      b.setAttribute("aria-pressed", String(isSel));
      b.tabIndex = -1;

      if (isSel) b.classList.add("is-selected");
      if (opt.disabled) b.classList.add("is-disabled");

      // Tooltip com label/valor (útil quando há truncamento)
      b.title = opt.label ? `${opt.label}` : `${opt.value}`;

      // Click/touch
      b.addEventListener("click", () => {
        focusValue = opt.value;
        toggleOption(opt);
        render(); // re-render p/ refletir estado
        // após render, restaura foco no mesmo value
        raf(() => focusButtonByValue(focusValue));
      });

      // Teclado: Space/Enter para selecionar
      b.addEventListener("keydown", (ev) => {
        const k = ev.key;
        if (k === " " || k === "Enter") {
          ev.preventDefault();
          focusValue = opt.value;
          toggleOption(opt);
          render();
          raf(() => focusButtonByValue(focusValue));
        }
      });

      return b;
    }

    function focusButtonByValue(val) {
      if (!val) return;
      const btn = container.querySelector(`.option-item[data-value="${CSS.escape(val)}"]`);
      if (btn) btn.focus();
    }

    function moveFocus(dir) {
      const btns = toArr(container.querySelectorAll(".option-item"));
      if (!btns.length) return;
      const idx = Math.max(
        0,
        btns.findIndex((b) => b === document.activeElement)
      );
      let next = idx + dir;
      if (next < 0) next = btns.length - 1;
      if (next >= btns.length) next = 0;
      btns[next].focus();
      focusValue = btns[next].dataset.value;
    }

    function render() {
      // Filtro (opcional) — oculta <option> no SELECT conforme query
      const q = (SEARCH_INPUT?.value || "").trim().toLowerCase();
      if (SEARCH_INPUT) {
        toArr(sel.options).forEach((o) => {
          const str = text(o.textContent || o.value).toLowerCase();
          o.hidden = q ? !str.includes(q) : o.hidden && false; // se vazio, não força hidden
        });
      }

      // Render dos botões (somente visíveis/habilitados aparecem)
      container.innerHTML = "";
      const frag = document.createDocumentFragment();
      const opts = getVisibleOptions();
      opts.forEach((opt) => {
        const b = makeButton(opt);
        frag.appendChild(b);
      });
      container.appendChild(frag);

      // Atribui tabIndex de navegação linear
      const btns = toArr(container.querySelectorAll(".option-item"));
      if (btns.length) {
        // Define primeiro como focalizável se nada focado
        if (!container.contains(document.activeElement)) {
          btns[0].tabIndex = 0;
        }
        // setas para navegar
        container.onkeydown = (ev) => {
          if (ev.key === "ArrowRight" || ev.key === "ArrowDown") {
            ev.preventDefault();
            moveFocus(+1);
          } else if (ev.key === "ArrowLeft" || ev.key === "ArrowUp") {
            ev.preventDefault();
            moveFocus(-1);
          } else if (ev.key === "Home") {
            ev.preventDefault();
            btns[0].focus();
            focusValue = btns[0].dataset.value;
          } else if (ev.key === "End") {
            ev.preventDefault();
            btns[btns.length - 1].focus();
            focusValue = btns[btns.length - 1].dataset.value;
          }
        };
      }

      // Info de limite (classe no container)
      container.classList.toggle("has-limit", !!MAX && sel.multiple);
      container.dataset.count = String(selectedValues().length || 0);
      if (MAX) container.dataset.max = String(MAX);
    }

    // Observadores
    const mo = new MutationObserver(() => render());
    mo.observe(sel, { childList: true, attributes: true, subtree: false, attributeFilter: ["hidden", "disabled", "selected", "label"] });
    sel.addEventListener("change", render);

    // Filtro (opcional)
    if (SEARCH_INPUT) {
      const onInput = () => render();
      SEARCH_INPUT.addEventListener("input", onInput);
      // limpa listener no unload
      window.addEventListener("unload", () => SEARCH_INPUT.removeEventListener("input", onInput));
    }

    // Render inicial
    render();
  }

  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll(".option-list[data-source]").forEach(bind);
  });
})();

