(() => {
  'use strict';

  // Optional controller for decks with alternative layouts. Load before slides-editor.js.
  if (window.SlidesNavigation) return;
  const stage = document.querySelector('.stage');
  const slides = [...document.querySelectorAll('.slide')];
  if (!stage || !slides.length) return;
  const pages = [];
  slides.forEach(slide => {
    const key = slide.dataset.page || slide.dataset.name;
    let page = pages.find(candidate => candidate.key === key);
    if (!page) pages.push(page = { key, alternatives: [] });
    page.alternatives.push(slide);
  });

  const storageKey = `slides-alternatives:${location.pathname}`;
  let choices = {};
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey));
    if (stored && typeof stored === 'object' && !Array.isArray(stored)) choices = stored;
  } catch { /* Storage is optional, including when opened as a local file. */ }
  let pageIndex = 0;
  const label = (slide, index) => slide.dataset.alt || String.fromCharCode(65 + index);
  const choice = page => Math.max(0, page.alternatives.findIndex((slide, index) => label(slide, index) === choices[page.key]));

  function readLocation() {
    const requested = new URLSearchParams(location.search).get('slide') || '';
    const named = pages.findIndex(page => page.alternatives.some(slide => slide.dataset.name === requested));
    if (named >= 0) {
      pageIndex = named;
      const index = pages[named].alternatives.findIndex(slide => slide.dataset.name === requested);
      choices[pages[named].key] = label(pages[named].alternatives[index], index);
      return;
    }
    const match = /^(\d+)([a-z]?)$/i.exec(requested);
    if (!match) return;
    pageIndex = Math.max(0, Math.min(Number(match[1]) - 1, pages.length - 1));
    const page = pages[pageIndex];
    const index = page.alternatives.findIndex((slide, i) => label(slide, i).toUpperCase() === match[2].toUpperCase());
    if (index >= 0) choices[page.key] = label(page.alternatives[index], index);
  }

  function render() {
    const page = pages[pageIndex];
    const index = choice(page);
    const selected = page.alternatives[index];
    slides.forEach(slide => {
      slide.classList.toggle('active', slide === selected);
      slide.setAttribute('aria-hidden', String(slide !== selected));
    });
    try { localStorage.setItem(storageKey, JSON.stringify(choices)); } catch {}
    const url = new URL(location.href);
    url.searchParams.set('slide', `${pageIndex + 1}${page.alternatives.length > 1 ? label(selected, index) : ''}`);
    try { history.replaceState(null, '', url); } catch {}
  }

  function go(delta) {
    pageIndex = Math.max(0, Math.min(pageIndex + delta, pages.length - 1));
    render();
  }

  function cycle(delta) {
    const page = pages[pageIndex];
    const count = page.alternatives.length;
    if (count < 2) return;
    const next = (choice(page) + delta + count) % count;
    choices[page.key] = label(page.alternatives[next], next);
    render();
  }

  function fit() {
    const scale = Math.min(innerWidth / 1920, innerHeight / 1080);
    stage.style.transform = `scale(${scale})`;
    stage.style.left = `${(innerWidth - 1920 * scale) / 2}px`;
    stage.style.top = `${(innerHeight - 1080 * scale) / 2}px`;
  }

  function isEditing(target) {
    return window.SlidesEditor?.state.editing || document.querySelector('#slides-comment-dialog.open') ||
      (target instanceof Element && (target.closest('input, textarea, select') || target.isContentEditable));
  }

  document.addEventListener('keydown', event => {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || isEditing(event.target)) return;
    if (event.key === ' ' && event.target instanceof Element && event.target.closest('button, a, summary')) return;
    const current = pages[pageIndex].alternatives[choice(pages[pageIndex])];
    const fragments = [...current.querySelectorAll('.revealable')];
    switch (event.key) {
      case 'ArrowRight': case 'PageDown': case ' ': {
        const hidden = fragments.find(fragment => !fragment.classList.contains('revealed'));
        if (hidden) hidden.classList.add('revealed');
        else go(1);
        break;
      }
      case 'ArrowLeft': case 'PageUp': {
        const visible = fragments.filter(fragment => fragment.classList.contains('revealed')).pop();
        if (visible) visible.classList.remove('revealed');
        else go(-1);
        break;
      }
      case 'ArrowDown': cycle(1); break;
      case 'ArrowUp': cycle(-1); break;
      case 'Home': pageIndex = 0; render(); break;
      case 'End': pageIndex = pages.length - 1; render(); break;
      case 'f': case 'F':
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
        else document.documentElement.requestFullscreen().catch(() => {});
        break;
      default: return;
    }
    event.preventDefault();
  });

  document.addEventListener('click', event => {
    const link = event.target.closest('[data-goto]');
    if (!link || isEditing(event.target) || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const index = pages.findIndex(page => page.key === link.dataset.goto);
    if (index < 0) return;
    event.preventDefault();
    pageIndex = index;
    render();
  });

  window.addEventListener('popstate', () => { readLocation(); render(); });
  window.addEventListener('resize', fit);
  window.SlidesNavigation = { go, cycle };
  readLocation();
  fit();
  render();
})();
