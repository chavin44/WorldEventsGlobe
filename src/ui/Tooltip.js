/** Small hover label that follows the cursor and shows an event's title. */
export function createTooltip() {
  const el = document.getElementById('tooltip');

  function show(event, screen) {
    el.innerHTML = `<span class="t-cat">${event.category}</span>${event.title}`;
    el.style.left = `${screen.x}px`;
    el.style.top = `${screen.y}px`;
    el.classList.remove('hidden');
  }

  function hide() {
    el.classList.add('hidden');
  }

  return { show, hide };
}
