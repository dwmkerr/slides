(() => {
  'use strict';

  const config = {
    editableSelector: '[data-editable], h1, h2, h3, p, li, td, th, blockquote, .label-in, .eyebrow',
    slideSelector: '.slide',
    saveDelay: 650,
    ...window.SLIDES_EDITOR_CONFIG
  };

  const state = {
    editing: false,
    server: false,
    saveTimer: null,
    saving: false,
    dirty: false
  };

  const style = document.createElement('style');
  style.id = 'slides-editor-styles';
  style.textContent = `
    #slides-editor-ui, #slides-comment-dialog { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
    #slides-editor-ui { position: fixed; z-index: 2147483645; left: 50%; bottom: 18px; transform: translateX(-50%); display: none; align-items: center; gap: 8px; max-width: calc(100vw - 24px); padding: 8px; color: #f7f3ea; background: rgba(20,20,21,.96); border: 1px solid rgba(255,255,255,.16); border-radius: 10px; box-shadow: 0 16px 46px rgba(0,0,0,.28); font-size: 12px; line-height: 1; }
    html.slides-editing #slides-editor-ui { display: flex; }
    #slides-editor-ui .slides-editor-mode { padding: 0 7px; color: #f0a34a; font-weight: 800; letter-spacing: .08em; }
    #slides-editor-status { min-width: 105px; color: #c9c5bd; }
    #slides-editor-status[data-state="online"] { color: #7ed894; }
    #slides-editor-status[data-state="warning"], #slides-editor-status[data-state="error"] { color: #ffb357; }
    #slides-editor-ui button, #slides-comment-dialog button { appearance: none; border: 1px solid rgba(255,255,255,.18); border-radius: 6px; padding: 7px 9px; color: inherit; background: rgba(255,255,255,.08); font: inherit; cursor: pointer; white-space: nowrap; }
    #slides-editor-ui button:hover, #slides-comment-dialog button:hover { background: rgba(255,255,255,.15); }
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
    @media (max-width: 620px) { #slides-editor-status { min-width: 0; } #slides-editor-ui button span { display: none; } }
  `;
  document.head.append(style);

  const toolbar = document.createElement('div');
  toolbar.id = 'slides-editor-ui';
  toolbar.innerHTML = `
    <span class="slides-editor-mode">EDIT</span>
    <span id="slides-editor-status" data-state="checking">Checking server…</span>
    <button type="button" data-editor-action="save">Save <span>⌘/Ctrl+Enter</span></button>
    <button type="button" data-editor-action="comment">Comment <span>C</span></button>
    <button type="button" data-editor-action="done">Done <span>Esc</span></button>
  `;
  document.body.append(toolbar);

  const warning = document.createElement('div');
  warning.id = 'slides-editor-warning';
  warning.setAttribute('role', 'status');
  document.body.append(warning);

  const dialog = document.createElement('div');
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
  const commentContext = dialog.querySelector('#slides-comment-context');
  const commentText = dialog.querySelector('#slides-comment-text');
  let warningTimer;

  function setStatus(text, mode) {
    status.textContent = text;
    status.dataset.state = mode;
  }

  function showWarning(text, duration = 6000) {
    clearTimeout(warningTimer);
    warning.textContent = text;
    warning.classList.add('show');
    warningTimer = setTimeout(() => warning.classList.remove('show'), duration);
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
      state.server = Boolean(value?.ok && value?.capabilities?.includes('live-save'));
    } catch {
      state.server = false;
    } finally {
      clearTimeout(timeout);
    }
    return state.server;
  }

  function editableElements() {
    return [...document.querySelectorAll(config.editableSelector)].filter(element => !element.closest('#slides-editor-ui, #slides-comment-dialog'));
  }

  function toggleEditing(enabled) {
    state.editing = enabled;
    document.documentElement.classList.toggle('slides-editing', enabled);
    editableElements().forEach(element => {
      if (enabled) element.setAttribute('contenteditable', 'true');
      else element.removeAttribute('contenteditable');
    });

    if (!enabled) {
      clearTimeout(state.saveTimer);
      if (state.dirty && state.server) save();
      closeComment();
      return;
    }

    setStatus('Checking server…', 'checking');
    ping().then(online => {
      if (online) {
        setStatus('Live save on', 'online');
        if (state.dirty) queueSave();
      } else {
        setStatus('Live save off', 'warning');
        showWarning('Live editing is disconnected. Tell your agent: "Serve the slides."');
      }
    });
  }

  function serialiseDocument() {
    const clone = document.documentElement.cloneNode(true);
    clone.classList.remove('slides-editing');
    clone.querySelectorAll('#slides-editor-styles, #slides-editor-ui, #slides-editor-warning, #slides-comment-dialog').forEach(element => element.remove());
    clone.querySelectorAll('[contenteditable]').forEach(element => element.removeAttribute('contenteditable'));
    clone.querySelectorAll(config.slideSelector).forEach((slide, index) => {
      slide.classList.toggle('active', index === 0);
      slide.removeAttribute('aria-hidden');
    });
    clone.querySelectorAll('.revealable').forEach(element => element.classList.remove('revealed'));
    return `<!doctype html>\n${clone.outerHTML}\n`;
  }

  async function save() {
    if (state.saving) {
      state.dirty = true;
      return;
    }
    if (!state.server && !(await ping())) {
      setStatus('Live save off', 'warning');
      showWarning('Live editing is disconnected. Tell your agent: "Serve the slides."');
      return;
    }

    state.saving = true;
    state.dirty = false;
    setStatus('Saving…', 'checking');
    try {
      const response = await fetch('/__slides/file', {
        method: 'PUT',
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
        body: serialiseDocument()
      });
      if (!response.ok) throw new Error((await response.json().catch(() => null))?.error || 'Save failed');
      setStatus('Saved', 'online');
      state.server = true;
      window.dispatchEvent(new CustomEvent('slides:saved'));
    } catch (error) {
      state.server = false;
      setStatus('Save failed', 'error');
      showWarning(`Live editing disconnected: ${error.message}. Tell your agent: "Serve the slides."`);
    } finally {
      state.saving = false;
      if (state.dirty) {
        if (state.editing) queueSave();
        else save();
      }
    }
  }

  function queueSave() {
    if (!state.editing) return;
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

  document.addEventListener('input', event => {
    if (state.editing && event.target instanceof HTMLElement && event.target.isContentEditable) queueSave();
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
    if (action === 'save') save();
    if (action === 'comment') openComment();
    if (action === 'done') toggleEditing(false);
  });

  dialog.addEventListener('click', event => {
    if (event.target === dialog || event.target.closest('[data-comment-action="cancel"]')) closeComment();
    if (event.target.closest('[data-comment-action="send"]')) sendComment();
  });

  window.SlidesEditor = {
    comments: async () => (await fetch('/__slides/comments', { cache: 'no-store' })).json(),
    edit: () => toggleEditing(true),
    ping,
    save,
    state
  };
})();
