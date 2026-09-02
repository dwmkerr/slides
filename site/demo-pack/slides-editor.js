(() => {
  'use strict';

  if (window.SlidesEditor) return;

  const config = {
    editableSelector: '[data-editable], h1, h2, h3, p, li, td, th, blockquote, .label-in, .eyebrow',
    slideSelector: '.slide',
    saveDelay: 650,
    toolbarHideDelay: 1600,
    toolbarInitialDelay: 2800,
    toolbarRevealRatio: 0.2,
    ...window.SLIDES_EDITOR_CONFIG
  };

  const state = {
    editing: false,
    server: false,
    revision: document.querySelector('meta[name="slides-source-revision"]')?.content || null,
    source: null,
    records: [],
    saveTimer: null,
    saving: false,
    dirty: false,
    conflict: false
  };

  const markOwned = element => {
    element.setAttribute('data-slides-editor-owned', '');
    return element;
  };

  const style = markOwned(document.createElement('style'));
  style.id = 'slides-editor-styles';
  style.textContent = `
    #slides-editor-ui, #slides-comment-dialog { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
    #slides-editor-ui { position: fixed; z-index: 2147483645; left: 50%; bottom: 16px; transform: translate(-50%, 8px); display: flex; align-items: center; gap: 5px; max-width: calc(100vw - 24px); padding: 6px; color: #f7f3ea; background: rgba(20,20,21,.92); border: 1px solid rgba(255,255,255,.16); border-radius: 9px; box-shadow: 0 12px 34px rgba(0,0,0,.25); font-size: 12px; line-height: 1; opacity: 0; pointer-events: none; transition: opacity .18s ease, transform .18s ease; }
    html.slides-toolbar-visible #slides-editor-ui, #slides-editor-ui:focus-within, html.slides-editing #slides-editor-ui { transform: translate(-50%, 0); opacity: .82; pointer-events: auto; }
    html #slides-editor-ui:hover, html #slides-editor-ui:focus-within, html.slides-editing #slides-editor-ui { opacity: 1; }
    #slides-editor-ui button, #slides-comment-dialog button { appearance: none; border: 1px solid rgba(255,255,255,.16); border-radius: 5px; min-height: 30px; padding: 7px 9px; color: inherit; background: rgba(255,255,255,.07); font: inherit; cursor: pointer; white-space: nowrap; }
    #slides-editor-ui button:hover, #slides-comment-dialog button:hover { background: rgba(255,255,255,.14); }
    #slides-editor-ui button:disabled { opacity: .32; cursor: default; }
    #slides-editor-ui button:disabled:hover { background: rgba(255,255,255,.07); }
    #slides-editor-ui [data-editor-action="previous"], #slides-editor-ui [data-editor-action="next"] { width: 32px; padding-inline: 0; font-size: 16px; }
    #slides-editor-ui [data-editor-action="edit"][aria-pressed="true"] { color: #1f1609; background: #f0a34a; border-color: #f0a34a; font-weight: 900; }
    #slides-editor-ui .slides-toolbar-divider { width: 1px; height: 20px; margin: 0 2px; background: rgba(255,255,255,.15); }
    #slides-editor-status { display: none; max-width: 110px; overflow: hidden; padding: 0 6px; color: #c9c5bd; text-overflow: ellipsis; white-space: nowrap; }
    html.slides-editing #slides-editor-status { display: inline-block; }
    #slides-editor-status[data-state="online"] { color: #7ed894; }
    #slides-editor-status[data-state="warning"], #slides-editor-status[data-state="error"] { color: #ffb357; }
    #slides-editor-warning { position: fixed; z-index: 2147483646; left: 50%; top: 18px; transform: translateX(-50%); display: none; width: min(620px, calc(100vw - 28px)); padding: 12px 16px; color: #2a1b0a; background: #ffd69b; border: 1px solid #d28b34; border-radius: 8px; box-shadow: 0 12px 36px rgba(0,0,0,.18); font: 600 13px/1.45 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; text-align: center; }
    #slides-editor-warning.show { display: block; }
    html.slides-editing [contenteditable="true"] { outline: 1px dashed transparent; outline-offset: 5px; cursor: text; }
    html.slides-editing [contenteditable="true"]:hover { outline-color: rgba(217,119,6,.45); }
    html.slides-editing [contenteditable="true"]:focus { outline: 2px solid #d97706; background: rgba(217,119,6,.07); }
    #slides-comment-dialog { position: fixed; z-index: 2147483647; inset: 0; display: none; place-items: center; padding: 20px; background: rgba(0,0,0,.48); }
    #slides-comment-dialog.open { display: grid; }
    #slides-comment-card { width: min(520px, 100%); padding: 18px; color: #f7f3ea; background: #171718; border: 1px solid rgba(255,255,255,.18); border-radius: 12px; box-shadow: 0 22px 70px rgba(0,0,0,.38); }
    #slides-comment-card strong { display: block; margin-bottom: 5px; color: #f0a34a; font-size: 12px; letter-spacing: .08em; text-transform: uppercase; }
    #slides-comment-context { margin-bottom: 12px; color: #aaa59d; font-size: 12px; }
    #slides-comment-text { box-sizing: border-box; width: 100%; min-height: 105px; resize: vertical; padding: 11px; color: #f7f3ea; background: #0e0e0f; border: 1px solid rgba(255,255,255,.2); border-radius: 7px; font: 14px/1.45 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
    #slides-comment-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; }
    #slides-comment-actions [data-primary] { color: #1f1609; background: #f0a34a; border-color: #f0a34a; font-weight: 800; }
    #slides-print-root { display: none; }
    @media (max-width: 620px) { #slides-editor-ui { gap: 3px; } #slides-editor-ui button { padding-inline: 7px; } #slides-editor-status { display: none !important; } }
    @media print {
      @page { size: 13.333333in 7.5in; margin: 0; }
      html, body { width: 1280px !important; height: auto !important; margin: 0 !important; padding: 0 !important; overflow: visible !important; background: transparent !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      body > *:not(#slides-print-root) { display: none !important; }
      #slides-print-root { display: block !important; position: static !important; width: 1280px !important; margin: 0 !important; padding: 0 !important; }
      .slides-print-page { position: relative !important; width: 1280px !important; height: 720px !important; margin: 0 !important; padding: 0 !important; overflow: hidden !important; break-after: page; page-break-after: always; }
      .slides-print-page:last-child { break-after: auto; page-break-after: auto; }
      .slides-print-shell { position: absolute !important; inset: 0 auto auto 0 !important; width: 1920px !important; height: 1080px !important; min-width: 1920px !important; min-height: 1080px !important; max-width: 1920px !important; max-height: 1080px !important; margin: 0 !important; padding: 0 !important; overflow: hidden !important; zoom: .666666667 !important; transform: none !important; }
      .slides-print-shell .slide { width: 1920px !important; height: 1080px !important; min-width: 1920px !important; min-height: 1080px !important; max-width: 1920px !important; max-height: 1080px !important; }
    }
  `;
  document.head.append(style);

  const toolbar = markOwned(document.createElement('div'));
  toolbar.id = 'slides-editor-ui';
  toolbar.setAttribute('role', 'toolbar');
  toolbar.setAttribute('aria-label', 'Slide controls');
  toolbar.innerHTML = `
    <button type="button" data-editor-action="previous" aria-label="Previous slide" title="Previous slide (Left arrow)">←</button>
    <button type="button" data-editor-action="next" aria-label="Next slide" title="Next slide (Right arrow)">→</button>
    <span class="slides-toolbar-divider" aria-hidden="true"></span>
    <button type="button" data-editor-action="edit" aria-pressed="false" title="Edit slide text (E)">Edit</button>
    <button type="button" data-editor-action="save" disabled title="Save changes now (Cmd/Ctrl+Enter)">Save</button>
    <span class="slides-toolbar-divider" aria-hidden="true"></span>
    <button type="button" data-editor-action="print" title="Print the current slide">Print</button>
    <button type="button" data-editor-action="export" title="Export all slides using Save as PDF">Export</button>
    <span id="slides-editor-status" data-state="checking">Checking…</span>
  `;
  document.body.append(toolbar);

  const warning = markOwned(document.createElement('div'));
  warning.id = 'slides-editor-warning';
  warning.setAttribute('role', 'status');
  document.body.append(warning);

  const dialog = markOwned(document.createElement('div'));
  dialog.id = 'slides-comment-dialog';
  dialog.innerHTML = `
    <div id="slides-comment-card" role="dialog" aria-modal="true" aria-labelledby="slides-comment-title">
      <strong id="slides-comment-title">Comment for your agent</strong>
      <div id="slides-comment-context"></div>
      <textarea id="slides-comment-text" placeholder="What should change on this slide?"></textarea>
      <div id="slides-comment-actions">
        <button type="button" data-comment-action="cancel">Cancel</button>
        <button type="button" data-comment-action="send" data-primary>Send comment</button>
      </div>
    </div>
  `;
  document.body.append(dialog);

  const status = toolbar.querySelector('#slides-editor-status');
  const editButton = toolbar.querySelector('[data-editor-action="edit"]');
  const saveButton = toolbar.querySelector('[data-editor-action="save"]');
  const previousButton = toolbar.querySelector('[data-editor-action="previous"]');
  const nextButton = toolbar.querySelector('[data-editor-action="next"]');
  const commentContext = dialog.querySelector('#slides-comment-context');
  const commentText = dialog.querySelector('#slides-comment-text');
  let pointerInToolbarZone = false;
  let toolbarTimer;
  let warningTimer;

  function toolbarIsPinned() {
    return state.editing || toolbar.matches(':hover') || toolbar.contains(document.activeElement);
  }

  function hideToolbarAfter(delay = config.toolbarHideDelay) {
    clearTimeout(toolbarTimer);
    toolbarTimer = setTimeout(() => {
      if (!toolbarIsPinned()) document.documentElement.classList.remove('slides-toolbar-visible');
    }, delay);
  }

  function revealToolbar(delay = config.toolbarHideDelay) {
    document.documentElement.classList.add('slides-toolbar-visible');
    clearTimeout(toolbarTimer);
    if (delay !== null) hideToolbarAfter(delay);
  }

  function isInToolbarZone(event) {
    return event.clientY >= window.innerHeight * (1 - config.toolbarRevealRatio);
  }

  function handlePointerMove(event) {
    const inZone = isInToolbarZone(event);
    if (inZone) revealToolbar(null);
    else if (pointerInToolbarZone && !toolbarIsPinned()) hideToolbarAfter();
    pointerInToolbarZone = inZone;
  }

  function setStatus(text, mode) {
    status.textContent = text;
    status.dataset.state = mode;
  }

  function showWarning(text, duration = 6000) {
    clearTimeout(warningTimer);
    warning.textContent = text;
    warning.classList.add('show');
    if (duration !== null) warningTimer = setTimeout(() => warning.classList.remove('show'), duration);
  }

  function conflictWarning() {
    state.conflict = true;
    state.dirty = true;
    setStatus('Source changed', 'error');
    showWarning('This deck changed outside the browser. Copy any unsaved text, then refresh and reconcile before saving.', null);
  }

  async function ping() {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 900);
    try {
      const response = await fetch('/__slides/ping', {
        cache: 'no-store',
        headers: { Accept: 'application/json' },
        signal: controller.signal
      });
      const value = response.ok ? await response.json() : null;
      state.server = Boolean(value?.ok && value?.capabilities?.includes('revision-save'));
    } catch {
      state.server = false;
    } finally {
      clearTimeout(timeout);
    }
    return state.server;
  }

  function editableElements(root = document) {
    const all = [...root.querySelectorAll(config.editableSelector)]
      .filter(element => !element.closest('[data-slides-editor-owned]'));
    return all.filter(element => !all.some(other => other !== element && element.contains(other)));
  }

  function editableRecords(root = document) {
    const elements = editableElements(root);
    const slides = [...root.querySelectorAll(config.slideSelector)];
    const ordinals = new Map();
    return elements.map(element => {
      const slide = element.closest(config.slideSelector);
      const scope = slide
        ? slide.dataset.name || slide.id || `slide-${slides.indexOf(slide) + 1}`
        : 'document';
      const ordinal = ordinals.get(scope) || 0;
      ordinals.set(scope, ordinal + 1);
      const key = element.dataset.slidesEditId || `${scope}:${ordinal + 1}`;
      return { element, key };
    });
  }

  function markOriginalDescendants(element) {
    element.querySelectorAll('*').forEach(descendant => descendant.setAttribute('data-slides-editor-original-node', ''));
  }

  async function loadSource() {
    if (!state.revision) throw new Error('The served source revision is missing. Refresh the deck before editing.');
    const response = await fetch('/__slides/source', {
      cache: 'no-store',
      headers: { 'If-Match': `"${state.revision}"` }
    });
    if (response.status === 409) {
      conflictWarning();
      return false;
    }
    if (!response.ok) throw new Error((await response.json().catch(() => null))?.error || 'Could not load the deck source');
    const source = await response.text();
    const sourceDocument = new DOMParser().parseFromString(source, 'text/html');
    const liveRecords = editableRecords();
    const sourceRecords = editableRecords(sourceDocument);
    const sourceKeys = new Set(sourceRecords.map(record => record.key));
    if (sourceKeys.size !== sourceRecords.length) throw new Error('Editable element identifiers are not unique');
    if (liveRecords.length !== sourceRecords.length || liveRecords.some(record => !sourceKeys.has(record.key))) {
      throw new Error(`Editable element mismatch (${liveRecords.length} in the page, ${sourceRecords.length} in the source)`);
    }
    state.source = source;
    state.records = liveRecords.map(record => {
      record.element.dataset.slidesEditId = record.key;
      markOriginalDescendants(record.element);
      return record;
    });
    return true;
  }

  async function startEditing() {
    setStatus('Checking server…', 'checking');
    if (!(await ping())) {
      setStatus('Live save off', 'warning');
      showWarning('Live editing is disconnected. Tell your agent: "Serve the slides."');
      return;
    }
    try {
      if (!(await loadSource()) || !state.editing) return;
      state.records.forEach(({ element }) => element.setAttribute('contenteditable', 'true'));
      setStatus('Live save on', 'online');
      if (state.dirty) queueSave();
    } catch (error) {
      state.server = false;
      setStatus('Live save off', 'warning');
      showWarning(error.message);
    }
  }

  function toggleEditing(enabled) {
    state.editing = enabled;
    document.documentElement.classList.toggle('slides-editing', enabled);
    editButton.textContent = enabled ? 'Done' : 'Edit';
    editButton.setAttribute('aria-pressed', String(enabled));
    editButton.title = enabled ? 'Finish editing (Esc)' : 'Edit slide text (E)';
    saveButton.disabled = !enabled;
    previousButton.disabled = enabled;
    nextButton.disabled = enabled;
    if (enabled) {
      state.conflict = false;
      warning.classList.remove('show');
      startEditing();
      return;
    }

    clearTimeout(state.saveTimer);
    state.records.forEach(({ element }) => element.removeAttribute('contenteditable'));
    if (state.dirty && state.server && !state.conflict) save();
    closeComment();
  }

  function unwrap(element) {
    element.replaceWith(...element.childNodes);
  }

  function replaceTag(element, tagName) {
    const replacement = element.ownerDocument.createElement(tagName);
    replacement.append(...element.childNodes);
    element.replaceWith(replacement);
  }

  function safeLink(element) {
    const href = element.getAttribute('href') || '';
    return !href || /^(?:https?:|mailto:|tel:|#|\/|\.\.?\/)/i.test(href);
  }

  function sanitiseEditable(element) {
    const clone = element.cloneNode(true);
    const descendants = [...clone.querySelectorAll('*')].reverse();
    for (const descendant of descendants) {
      const original = descendant.hasAttribute('data-slides-editor-original-node');
      descendant.removeAttribute('data-slides-editor-original-node');
      descendant.removeAttribute('contenteditable');
      descendant.removeAttribute('spellcheck');
      if (original) continue;

      for (const attribute of [...descendant.attributes]) {
        if (descendant.tagName === 'A' && ['href', 'title', 'target', 'rel'].includes(attribute.name)) continue;
        descendant.removeAttribute(attribute.name);
      }

      if (['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED'].includes(descendant.tagName)) {
        descendant.remove();
      } else if (descendant.tagName === 'B') {
        replaceTag(descendant, 'strong');
      } else if (descendant.tagName === 'I') {
        replaceTag(descendant, 'em');
      } else if (['FONT', 'SPAN'].includes(descendant.tagName)) {
        unwrap(descendant);
      } else if (['DIV', 'P'].includes(descendant.tagName)) {
        const br = descendant.ownerDocument.createElement('br');
        descendant.replaceWith(br, ...descendant.childNodes);
      } else if (descendant.tagName === 'A' && !safeLink(descendant)) {
        descendant.removeAttribute('href');
      }
    }
    clone.querySelectorAll('[data-slides-editor-original-node], [contenteditable], [spellcheck]').forEach(node => {
      node.removeAttribute('data-slides-editor-original-node');
      node.removeAttribute('contenteditable');
      node.removeAttribute('spellcheck');
    });
    return clone.innerHTML;
  }

  function serialiseDocument() {
    if (!state.source) throw new Error('The clean deck source is unavailable');
    const sourceDocument = new DOMParser().parseFromString(state.source, 'text/html');
    const sourceRecords = editableRecords(sourceDocument);
    const sourceByKey = new Map(sourceRecords.map(record => [record.key, record.element]));
    if (sourceByKey.size !== state.records.length) throw new Error('The editable source structure changed');
    state.records.forEach(({ element, key }) => {
      const sourceElement = sourceByKey.get(key);
      if (!sourceElement) throw new Error(`Editable element is missing from the source: ${key}`);
      sourceElement.innerHTML = sanitiseEditable(element);
    });
    sourceDocument.querySelectorAll('[data-slides-editor-owned], [data-slides-editor-original-node], [contenteditable]').forEach(element => {
      if (element.hasAttribute('data-slides-editor-owned')) element.remove();
      else {
        element.removeAttribute('data-slides-editor-original-node');
        element.removeAttribute('contenteditable');
      }
    });
    const doctype = state.source.match(/^\s*(<!doctype[^>]*>)/i)?.[1] || '<!doctype html>';
    return `${doctype}\n${sourceDocument.documentElement.outerHTML}\n`;
  }

  async function save() {
    if (state.conflict) {
      conflictWarning();
      return;
    }
    if (state.saving) {
      state.dirty = true;
      return;
    }
    if (!state.server && !(await ping())) {
      setStatus('Live save off', 'warning');
      showWarning('Live editing is disconnected. Tell your agent: "Serve the slides."');
      return;
    }
    if (!state.source && !(await loadSource())) return;

    state.saving = true;
    state.dirty = false;
    setStatus('Saving…', 'checking');
    try {
      const html = serialiseDocument();
      const response = await fetch('/__slides/file', {
        method: 'PUT',
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'If-Match': `"${state.revision}"`
        },
        body: html
      });
      const value = await response.json().catch(() => null);
      if (response.status === 409) {
        conflictWarning();
        return;
      }
      if (!response.ok) throw new Error(value?.error || 'Save failed');
      state.revision = value.revision;
      state.source = html;
      state.server = true;
      setStatus('Saved', 'online');
      window.dispatchEvent(new CustomEvent('slides:saved'));
    } catch (error) {
      state.server = false;
      state.dirty = true;
      setStatus('Save failed', 'error');
      showWarning(`Live editing disconnected: ${error.message}. Tell your agent: "Serve the slides."`);
    } finally {
      state.saving = false;
      if (state.dirty && !state.conflict) {
        if (state.editing) queueSave();
        else save();
      }
    }
  }

  function queueSave() {
    if (!state.editing || state.conflict) return;
    state.dirty = true;
    if (!state.server) return;
    clearTimeout(state.saveTimer);
    setStatus('Unsaved change', 'checking');
    state.saveTimer = setTimeout(save, config.saveDelay);
  }

  function activeSlide() {
    const slides = [...document.querySelectorAll(config.slideSelector)];
    return slides.find(slide => slide.classList.contains('active') || slide.getAttribute('aria-hidden') === 'false') || slides[0] || document.body;
  }

  function updatePrintChrome(shell, index, total) {
    const slideCount = shell.querySelector('#slide-count');
    if (slideCount) slideCount.textContent = `${index + 1} / ${total}`;
    const pageNumber = shell.querySelector('#pageno');
    if (pageNumber) pageNumber.textContent = `${String(index + 1).padStart(2, '0')} / ${String(total).padStart(2, '0')}`;
    const progress = shell.querySelector('#progress-bar');
    if (progress) progress.style.width = `${((index + 1) / total) * 100}%`;
  }

  function cleanupPrintPages() {
    document.querySelector('#slides-print-root')?.remove();
  }

  function buildPrintPages(mode = 'all') {
    cleanupPrintPages();
    const slides = [...document.querySelectorAll(config.slideSelector)];
    const current = activeSlide();
    const selected = mode === 'current' ? slides.filter(slide => slide === current) : slides;
    const root = markOwned(document.createElement('div'));
    root.id = 'slides-print-root';
    root.dataset.mode = mode;

    selected.forEach(slide => {
      const globalIndex = slides.indexOf(slide);
      const parent = slide.parentElement;
      const sourceSiblings = [...parent.querySelectorAll(config.slideSelector)];
      const localIndex = sourceSiblings.indexOf(slide);
      const shell = parent.cloneNode(true);
      const clonedSlides = [...shell.querySelectorAll(config.slideSelector)];
      clonedSlides.forEach((candidate, index) => {
        if (index !== localIndex) candidate.remove();
      });
      const printable = [...shell.querySelectorAll(config.slideSelector)][0];
      if (!printable) return;
      printable.classList.add('active');
      printable.removeAttribute('aria-hidden');
      printable.querySelectorAll('.revealable').forEach(element => element.classList.add('revealed'));
      shell.querySelectorAll('[data-slides-editor-owned]').forEach(element => element.remove());
      shell.querySelectorAll('[contenteditable], [data-slides-edit-id], [data-slides-editor-original-node]').forEach(element => {
        element.removeAttribute('contenteditable');
        element.removeAttribute('data-slides-edit-id');
        element.removeAttribute('data-slides-editor-original-node');
      });
      shell.classList.add('slides-print-shell');
      updatePrintChrome(shell, globalIndex, slides.length);

      const page = document.createElement('div');
      page.className = 'slides-print-page';
      page.dataset.slide = slide.dataset.name || String(globalIndex + 1);
      page.append(shell);
      root.append(page);
    });

    document.body.append(root);
    return root;
  }

  function printSlides(mode = 'all') {
    buildPrintPages(mode);
    window.dispatchEvent(new CustomEvent('slides:print', { detail: { mode } }));
    setTimeout(() => {
      window.print();
      cleanupPrintPages();
    }, 0);
  }

  function selectedText() {
    const selection = window.getSelection();
    return selection && !selection.isCollapsed ? selection.toString().trim().slice(0, 500) : '';
  }

  async function openComment() {
    if (!(state.server || await ping())) {
      showWarning('Comments are unavailable while live editing is disconnected. Tell your agent: "Serve the slides."');
      return;
    }
    const slide = activeSlide();
    const slideName = slide.dataset.name || slide.id || `slide-${[...document.querySelectorAll(config.slideSelector)].indexOf(slide) + 1}`;
    dialog.dataset.slide = slideName;
    dialog.dataset.selection = selectedText();
    commentContext.textContent = dialog.dataset.selection ? `${slideName} · “${dialog.dataset.selection}”` : slideName;
    commentText.value = '';
    dialog.classList.add('open');
    setTimeout(() => commentText.focus(), 0);
  }

  function closeComment() {
    dialog.classList.remove('open');
    delete dialog.dataset.slide;
    delete dialog.dataset.selection;
  }

  async function sendComment() {
    const text = commentText.value.trim();
    if (!text) return;
    try {
      const response = await fetch('/__slides/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slide: dialog.dataset.slide,
          selection: dialog.dataset.selection,
          text
        })
      });
      if (!response.ok) throw new Error('Comment request failed');
      closeComment();
      setStatus('Comment sent', 'online');
      window.dispatchEvent(new CustomEvent('slides:commented'));
    } catch {
      showWarning('The comment did not reach the agent. Tell your agent: "Serve the slides."');
    }
  }

  function isTyping(target) {
    return target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
  }

  function insertPlainText(target, text) {
    if (!text) return;
    const selection = window.getSelection();
    if (!selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    range.deleteContents();
    const fragment = document.createDocumentFragment();
    let lastNode;
    text.replace(/\r\n?/g, '\n').split('\n').forEach((line, index) => {
      if (index) {
        lastNode = document.createElement('br');
        fragment.append(lastNode);
      }
      if (line) {
        lastNode = document.createTextNode(line);
        fragment.append(lastNode);
      }
    });
    if (!lastNode) return;
    range.insertNode(fragment);
    range.setStartAfter(lastNode);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    target.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
  }

  document.addEventListener('input', event => {
    if (state.editing && event.target instanceof HTMLElement && event.target.isContentEditable) queueSave();
  });

  document.addEventListener('paste', event => {
    if (!state.editing || !(event.target instanceof HTMLElement) || !event.target.isContentEditable) return;
    event.preventDefault();
    insertPlainText(event.target, event.clipboardData?.getData('text/plain') || '');
  });

  document.addEventListener('beforeinput', event => {
    if (!state.editing || event.inputType !== 'insertParagraph' || !(event.target instanceof HTMLElement) || !event.target.isContentEditable) return;
    event.preventDefault();
    insertPlainText(event.target, '\n');
  });

  document.addEventListener('keydown', event => {
    const typing = isTyping(event.target);

    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter' && state.editing) {
      event.preventDefault();
      save();
      return;
    }
    if (event.key === 'Escape') {
      if (dialog.classList.contains('open')) {
        event.preventDefault();
        closeComment();
      } else if (state.editing) {
        event.preventDefault();
        toggleEditing(false);
      }
      return;
    }
    if ((event.key === 'e' || event.key === 'E') && !state.editing && !typing && !event.metaKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault();
      toggleEditing(true);
      return;
    }
    if ((event.key === 'c' || event.key === 'C') && !typing && !event.metaKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault();
      openComment();
    }
  });

  toolbar.addEventListener('click', event => {
    const action = event.target.closest('[data-editor-action]')?.dataset.editorAction;
    if (action === 'previous') document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    if (action === 'next') document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    if (action === 'edit') toggleEditing(!state.editing);
    if (action === 'save') save();
    if (action === 'print') printSlides('current');
    if (action === 'export') printSlides('all');
  });

  dialog.addEventListener('click', event => {
    if (event.target === dialog || event.target.closest('[data-comment-action="cancel"]')) closeComment();
    if (event.target.closest('[data-comment-action="send"]')) sendComment();
  });

  document.addEventListener('pointermove', handlePointerMove, { passive: true });
  document.addEventListener('pointerdown', event => {
    if (isInToolbarZone(event)) revealToolbar(event.pointerType === 'mouse' ? null : config.toolbarInitialDelay);
  }, { passive: true });
  toolbar.addEventListener('mouseenter', () => revealToolbar(null));
  toolbar.addEventListener('mouseleave', () => {
    if (!pointerInToolbarZone) hideToolbarAfter();
  });
  toolbar.addEventListener('focusin', () => revealToolbar(null));
  toolbar.addEventListener('focusout', () => setTimeout(() => {
    if (!toolbar.contains(document.activeElement)) hideToolbarAfter();
  }, 0));
  document.addEventListener('fullscreenchange', () => revealToolbar(config.toolbarInitialDelay));
  window.addEventListener('afterprint', cleanupPrintPages);
  revealToolbar(config.toolbarInitialDelay);

  window.SlidesEditor = {
    version: 6,
    comments: async () => (await fetch('/__slides/comments', { cache: 'no-store' })).json(),
    edit: () => toggleEditing(true),
    ping,
    preparePrint: buildPrintPages,
    print: printSlides,
    save,
    state
  };
})();
