import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import './style.css';
import { loadEvents, fetchNews, fetchMoreEvents, CATEGORIES } from './data/dataService.js';
import { createGlobe } from './globe/Globe.js';
import { createEventMarkers } from './globe/EventMarkers.js';
import { createPicker } from './interactions/Picker.js';
import { createTooltip } from './ui/Tooltip.js';
import { createSidePanel } from './ui/SidePanel.js';

const RADIUS = 5;

let rafId = null;

function cleanup() {
  if (rafId !== null) cancelAnimationFrame(rafId);
  const app = document.getElementById('app');
  if (app) app.innerHTML = '';
}

if (import.meta.hot) import.meta.hot.dispose(cleanup);

cleanup();
init();

async function init() {
  const container = document.getElementById('app');

  // ---------- renderer ----------
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  const viewSize = () => ({
    w: window.innerWidth || container.clientWidth || 1280,
    h: window.innerHeight || container.clientHeight || 800,
  });
  let { w: vw, h: vh } = viewSize();
  renderer.setSize(vw, vh);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);
  renderer.domElement.style.cursor = 'grab';

  // ---------- scene + camera ----------
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, vw / vh, 0.1, 1000);
  camera.position.set(0, 2, 19);

  // ---------- lighting ----------
  scene.add(new THREE.AmbientLight(0x88a0d0, 0.55));
  const key = new THREE.DirectionalLight(0xffffff, 1.3);
  key.position.set(8, 6, 10);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x4a8cff, 0.6);
  rim.position.set(-10, -4, -6);
  scene.add(rim);

  scene.add(createStars());

  // ---------- controls ----------
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.rotateSpeed = 0.5;
  controls.minDistance = 9;
  controls.maxDistance = 32;
  controls.enablePan = false;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.45;

  // ---------- globe ----------
  const globe = createGlobe(RADIUS);
  scene.add(globe.group);

  // ---------- markers (empty until first live load) ----------
  const markers = createEventMarkers([], RADIUS);
  globe.group.add(markers.group);

  // ---------- UI ----------
  const tooltip = createTooltip();
  const panel = createSidePanel({
    onOpen: () => (controls.autoRotate = false),
    onClose: () => (controls.autoRotate = true),
    onFindMore: (category) => {
      const chip = document.querySelector(`.chip[data-cat="${category}"]`);
      if (chip && !chip.classList.contains('active')) chip.click();
    },
  });

  // ---------- visitor counter ----------
  const vcountEl = document.getElementById('visitor-count');
  const visitorKey = 'globe-unique-visitors';
  let visitorCount = parseInt(localStorage.getItem(visitorKey) || '0', 10) + 1;
  localStorage.setItem(visitorKey, String(visitorCount));
  vcountEl.textContent = `👥 ${visitorCount.toLocaleString()} unique visitor${visitorCount === 1 ? '' : 's'}`;

  // ---------- shared live-event state ----------
  let currentEvents = [];
  let populated = false; // becomes true after the first "Find Events" populate
  const shownIds = new Set();
  const statusEl = document.getElementById('data-status');
  const toastEl = document.getElementById('app-toast');
  let toastTimer = null;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.add('hidden'), 3200);
  }

  let newsLoadToken = 0; // guards against a stale background news load applying

  /** Fetch live events for `days` and rebuild all markers. */
  async function loadRange(days) {
    const token = ++newsLoadToken;
    statusEl.innerHTML = `<span class="live-dot"></span>Fetching live events…`;
    const { events, live } = await loadEvents({ days });
    currentEvents = events;
    shownIds.clear();
    markers.clear();
    for (const evt of events) {
      markers.addMarker(evt);
      shownIds.add(evt.id);
    }
    // re-apply current category filter to the new markers
    applyFilter();
    if (live) {
      statusEl.innerHTML = `<span class="live-dot"></span>${events.length} live events · USGS + NASA EONET`;
    } else {
      statusEl.textContent = `⚠ Live sources unavailable — showing sample data`;
    }

    // Stream in GDELT world news (economic / business / geopolitical) in the
    // background — it's rate-limited behind a proxy, so we don't make the user
    // wait for it. New markers pop onto the globe when it resolves.
    if (live) streamNews(days, token);
  }

  /** Background: fetch news and add any fresh markers without blocking. */
  async function streamNews(days, token) {
    statusEl.innerHTML = `<span class="live-dot"></span>${currentEvents.length} live events · loading world news…`;
    const news = await fetchNews({ days }).catch(() => []);
    if (token !== newsLoadToken) return; // a newer load superseded us
    let added = 0;
    for (const evt of news) {
      if (shownIds.has(evt.id)) continue;
      markers.addMarker(evt);
      shownIds.add(evt.id);
      currentEvents.push(evt);
      added++;
    }
    if (added) applyFilter();
    const tail = added
      ? `${currentEvents.length} live events · USGS · NASA · GDELT news`
      : `${currentEvents.length} live events · USGS + NASA EONET`;
    statusEl.innerHTML = `<span class="live-dot"></span>${tail}`;
  }

  // ---------- picking ----------
  createPicker({
    camera,
    domElement: renderer.domElement,
    markers: markers.markers,
    onHover: (evt, screen) => {
      if (evt) tooltip.show(evt, screen);
      else tooltip.hide();
    },
    onSelect: (evt) => {
      panel.open(evt);
      tooltip.hide();
    },
  });

  // ---------- filters (kept in sync across rebuilds) ----------
  let filterRender = null;
  function applyFilter() {
    filterRender?.();
  }
  buildFilters(markers);

  // ---------- time range control ----------
  let activeDays = 7;
  const slider = document.getElementById('rc-slider');
  const rcValue = document.getElementById('rc-value');
  const presetBtns = [...document.querySelectorAll('.rc-btn')];

  function setRangeLabel(days) {
    rcValue.textContent = days === 1 ? 'Last 24 hours' : `Last ${days} days`;
  }

  let rangeDebounce = null;
  function requestRange(days) {
    activeDays = days;
    setRangeLabel(days);
    presetBtns.forEach((b) => b.classList.toggle('active', +b.dataset.days === days));
    // Only re-fetch on range change once the globe has been populated. Before
    // that, changing the range just sets the window the first Find Events uses.
    if (!populated) return;
    clearTimeout(rangeDebounce);
    rangeDebounce = setTimeout(() => loadRange(days), 250);
  }

  slider.addEventListener('input', () => {
    const days = parseInt(slider.value, 10);
    requestRange(days);
  });
  presetBtns.forEach((b) => {
    b.addEventListener('click', () => {
      const days = parseInt(b.dataset.days, 10);
      slider.value = days;
      requestRange(days);
    });
  });

  // ---------- Find Events button ----------
  // First click populates the (initially empty) globe with real live events.
  // Every click after that adds one more fresh, diverse live event.
  const addBtn = document.getElementById('add-event-btn');
  addBtn.addEventListener('click', async () => {
    addBtn.disabled = true;
    const original = addBtn.textContent;

    if (!populated) {
      // ----- first click: populate the globe -----
      addBtn.textContent = 'Finding live events…';
      try {
        await loadRange(activeDays);
        populated = true;
        addBtn.textContent = '+ Find More Events';
      } catch (e) {
        toast('Could not reach live event sources.');
        addBtn.textContent = original;
      } finally {
        addBtn.disabled = false;
      }
      return;
    }

    // ----- subsequent clicks: add one more diverse event -----
    addBtn.textContent = 'Finding event…';
    try {
      // Use a wider window (60 days) so we pull a large diverse pool, not just
      // the latest batch which is usually all earthquakes.
      const candidates = await fetchMoreEvents(shownIds, Math.max(activeDays, 60));
      const fresh = pickDiverseEvent(candidates, currentEvents);
      if (fresh) {
        markers.addMarker(fresh);
        shownIds.add(fresh.id);
        currentEvents.push(fresh);
        applyFilter();
        panel.open(fresh);
        toast(`Added live event: ${fresh.title}`);
      } else {
        toast('No new live events available right now — try a wider range.');
      }
    } catch (e) {
      toast('Could not reach live event sources.');
    } finally {
      addBtn.disabled = false;
      addBtn.textContent = '+ Find More Events';
    }
  });

  window.__globe = {
    get events() { return currentEvents; },
    openEvent: (i) => panel.open(currentEvents[i]),
    closePanel: panel.close,
    camera,
    renderer,
    markers: markers.markers,
    loadRange,
  };

  // ---------- start empty: globe waits for the user to Find Events ----------
  statusEl.textContent = 'Press “Find Events” to load live world events';

  const loading = document.getElementById('loading');
  loading.classList.add('gone');
  setTimeout(() => loading.classList.add('hidden'), 600);

  // ---------- resize ----------
  function resize() {
    const { w, h } = viewSize();
    if (w === 0 || h === 0) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    renderer.render(scene, camera);
  }
  window.addEventListener('resize', resize);
  new ResizeObserver(resize).observe(container);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) resize(); });

  // ---------- animation loop ----------
  const clock = new THREE.Clock();
  function animate() {
    markers.update(clock.getElapsedTime());
    controls.update();
    renderer.render(scene, camera);
    rafId = requestAnimationFrame(animate);
  }
  animate();

  // expose filter render so range rebuilds re-apply the active category set
  function buildFilters(markersRef) {
    const wrap = document.getElementById('filters');
    const cats = Object.keys(CATEGORIES).filter((c) => c !== 'other');
    const active = new Set(cats);

    function render() {
      markersRef.setCategoryFilter(active.size === cats.length ? null : active);
      wrap.querySelectorAll('.chip').forEach((chip) => {
        chip.classList.toggle('active', active.has(chip.dataset.cat));
      });
    }
    filterRender = render;

    for (const c of cats) {
      const chip = document.createElement('button');
      chip.className = 'chip active';
      chip.dataset.cat = c;
      chip.innerHTML = `<span class="dot" style="background:${CATEGORIES[c].color}"></span>${c}`;
      chip.addEventListener('click', () => {
        if (active.has(c)) active.delete(c);
        else active.add(c);
        if (active.size === 0) cats.forEach((x) => active.add(x));
        render();
      });
      wrap.appendChild(chip);
    }
    render();
  }
}

/**
 * Pick the next event to add so the globe stays diverse.
 * Finds whichever category is most underrepresented among currently shown
 * events, then returns a random event from that category in the candidate pool.
 * Falls back to any random candidate if no category breakdown helps.
 */
function pickDiverseEvent(candidates, shown) {
  if (!candidates.length) return null;

  // Count how many of each category are already on the globe
  const catCounts = {};
  for (const e of shown) catCounts[e.category] = (catCounts[e.category] || 0) + 1;

  // Group candidates by category
  const byCat = {};
  for (const c of candidates) {
    if (!byCat[c.category]) byCat[c.category] = [];
    byCat[c.category].push(c);
  }

  // Pick from the category with the fewest already-shown events
  let bestCat = null;
  let bestCount = Infinity;
  for (const cat of Object.keys(byCat)) {
    const count = catCounts[cat] || 0;
    if (count < bestCount) { bestCount = count; bestCat = cat; }
  }

  const pool = byCat[bestCat] || candidates;
  // Random pick from top 10 of that category to get geographic variety
  const slice = pool.slice(0, 10);
  return slice[Math.floor(Math.random() * slice.length)];
}

function createStars() {
  const count = 1200;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const r = 120 + Math.random() * 220;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[i * 3 + 0] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  return new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xaab8d8, size: 0.7, sizeAttenuation: true }));
}
