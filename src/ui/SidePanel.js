import { CATEGORIES } from '../data/dataService.js';

const SEVERITY_LABELS = {
  1: 'Minor',
  2: 'Low',
  3: 'Moderate',
  4: 'Major',
  5: 'Critical',
};

/** Controls the slide-in detail panel for a selected event. */
export function createSidePanel({ onOpen, onClose, onFindMore } = {}) {
  const panel = document.getElementById('panel');
  const img = document.getElementById('panel-image');
  const sev = document.getElementById('panel-severity');
  const cat = document.getElementById('panel-category');
  const title = document.getElementById('panel-title');
  const place = document.getElementById('panel-place');
  const summary = document.getElementById('panel-summary');
  const date = document.getElementById('panel-date');
  const link = document.getElementById('panel-link');
  const source = document.getElementById('panel-source');
  const closeBtn = document.getElementById('panel-close');
  const findMoreBtn = document.getElementById('find-more-btn');
  const findMoreCat = document.getElementById('find-more-cat');
  let currentEvent = null;

  function open(event) {
    currentEvent = event;
    img.src = event.imageUrl;
    img.alt = event.title;
    sev.textContent = `${SEVERITY_LABELS[event.severity]} · severity ${event.severity}/5`;

    cat.textContent = event.category;
    cat.style.color = CATEGORIES[event.category]?.color ?? 'var(--accent)';

    title.textContent = event.title;
    place.textContent = event.place;
    summary.textContent = event.summary;
    date.textContent = event.date ? formatDate(event.date) : '';

    link.href = event.sourceUrl;
    source.textContent = event.sourceName;

    findMoreCat.textContent = `${event.category} events`;

    panel.classList.remove('hidden');
    panel.setAttribute('aria-hidden', 'false');
    // Force a synchronous reflow so the slide-in transition plays. (Avoid
    // requestAnimationFrame here — it's paused when the tab is backgrounded,
    // which would leave the panel populated but never sliding open.)
    void panel.offsetWidth;
    panel.classList.add('open');
    onOpen?.(event);
  }

  function close() {
    panel.classList.remove('open');
    panel.setAttribute('aria-hidden', 'true');
    onClose?.();
  }

  closeBtn.addEventListener('click', close);
  findMoreBtn.addEventListener('click', () => {
    if (currentEvent) {
      onFindMore?.(currentEvent.category);
      close();
    }
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });

  return { open, close };
}

function formatDate(iso) {
  const d = new Date(iso + 'T00:00:00');
  if (isNaN(d)) return iso;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
