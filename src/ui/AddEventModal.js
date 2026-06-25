import { CATEGORIES } from '../data/dataService.js';

/**
 * Add Event modal — two-step:
 *   1. User clicks "Add Event" → placement mode activates (click the globe to pin a location)
 *   2. Form opens pre-filled with lat/lng → user fills details → submits → marker added
 *
 * onSubmit(eventObject) is called when the user confirms.
 * onPlacementStart / onPlacementEnd let main.js toggle the globe-click handler.
 */
export function createAddEventModal({ onSubmit, onPlacementStart, onPlacementEnd }) {
  const overlay = document.getElementById('add-event-overlay');
  const form = document.getElementById('add-event-form');
  const latInput = document.getElementById('ae-lat');
  const lngInput = document.getElementById('ae-lng');
  const titleInput = document.getElementById('ae-title');
  const categoryInput = document.getElementById('ae-category');
  const severityInput = document.getElementById('ae-severity');
  const severityLabel = document.getElementById('ae-severity-label');
  const placeInput = document.getElementById('ae-place');
  const summaryInput = document.getElementById('ae-summary');
  const sourceNameInput = document.getElementById('ae-sourcename');
  const sourceUrlInput = document.getElementById('ae-sourceurl');
  const dateInput = document.getElementById('ae-date');
  const cancelBtn = document.getElementById('ae-cancel');
  const toast = document.getElementById('placement-toast');

  // populate category options
  categoryInput.innerHTML = Object.keys(CATEGORIES)
    .filter(c => c !== 'other')
    .map(c => `<option value="${c}">${c}</option>`)
    .join('');

  severityInput.addEventListener('input', () => {
    severityLabel.textContent = ['', 'Minor', 'Low', 'Moderate', 'Major', 'Critical'][severityInput.value];
  });

  function openForm(lat, lng) {
    latInput.value = lat;
    lngInput.value = lng;
    dateInput.value = new Date().toISOString().slice(0, 10);
    severityLabel.textContent = 'Moderate';
    severityInput.value = 3;
    titleInput.value = '';
    placeInput.value = '';
    summaryInput.value = '';
    sourceNameInput.value = '';
    sourceUrlInput.value = '';
    overlay.classList.remove('hidden');
    requestAnimationFrame(() => overlay.classList.add('ae-open'));
    titleInput.focus();
  }

  function close() {
    overlay.classList.remove('ae-open');
    setTimeout(() => overlay.classList.add('hidden'), 280);
    onPlacementEnd?.();
  }

  /** Called by main.js when user clicks the globe surface in placement mode. */
  function receivePlacement(lat, lng) {
    hideToast();
    openForm(lat, lng);
  }

  /** Start placement mode — shows the toast and awaits a globe click. */
  function startPlacement() {
    showToast();
    onPlacementStart?.();
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const evt = {
      id: 'user-' + Date.now(),
      title: titleInput.value.trim() || 'Custom event',
      category: categoryInput.value,
      severity: parseInt(severityInput.value, 10),
      lat: parseFloat(latInput.value),
      lng: parseFloat(lngInput.value),
      place: placeInput.value.trim() || 'Unknown location',
      summary: summaryInput.value.trim(),
      imageUrl: `https://picsum.photos/seed/${Date.now()}/640/400`,
      sourceName: sourceNameInput.value.trim() || 'User submitted',
      sourceUrl: sourceUrlInput.value.trim() || '#',
      date: dateInput.value,
    };
    close();
    onSubmit?.(evt);
  });

  cancelBtn.addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  function showToast() { toast.classList.remove('hidden'); }
  function hideToast() { toast.classList.add('hidden'); }

  return { receivePlacement, startPlacement };
}
