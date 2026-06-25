# World Events Globe 🌍

An interactive, minimalistic **low-poly 3D globe** that pins world events as
glowing red bubbles. Drag to spin the planet, scroll to zoom, and click any
bubble to open a side panel with the event's image, summary, severity, and a
link to the source.

Built with **Vite + Three.js** (vanilla JS).

![overview](docs/overview.png)

## Features

- 🪨 **Low-poly globe** with real Earth texture, ocean, atmosphere halo, and starfield.
- 🔴 **Red event bubbles** — size and glow scale with each event's severity (1–5).
- 🖱️ **Hover** a bubble for a quick tooltip; **click** it for the full side panel.
- 🗂️ **Category filter chips** — geopolitical, geographical, economic, environmental.
- ⚡ **Live data** — Real-time events from USGS (earthquakes) and NASA EONET (natural disasters).
- 🎛️ **Customizable time range** — View events from 24 hours to 90 days.
- 👥 **Visitor counter** — Tracks unique visitors with localStorage.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:5180, then click **"Find Events"** to load live world events. Click **"+ Find More Events"** to add more bubbles to the globe.

## Build & Deploy

```bash
npm run build
```

The `dist/` folder is auto-deployed to GitHub Pages on every push to `main` (via GitHub Actions).

To set up a new GitHub repo:
1. [Create a new GitHub repo](https://github.com/new)
2. In your terminal:
   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/WorldEventsGlobe.git
   git branch -M main
   git push -u origin main
   ```
3. Go to **Settings → Pages** and confirm it's set to deploy from `gh-pages` branch (the workflow creates this automatically)
4. Your app goes live at `https://YOUR_USERNAME.github.io/WorldEventsGlobe`

## Project structure

```
src/
├── main.js              # boots scene, camera, controls, wires everything
├── style.css            # background, side panel, tooltip, chips
├── globe/
│   ├── Globe.js         # low-poly globe mesh + lighting + atmosphere
│   ├── EventMarkers.js  # red bubbles, halos, stems, pulse animation
│   └── latLongToVec3.js # lat/long → 3D position helper
├── ui/
│   ├── SidePanel.js     # slide-in detail panel
│   └── Tooltip.js       # hover label
├── interactions/
│   └── Picker.js        # raycasting hover/click detection
└── data/
    ├── dataService.js   # loadEvents() — swap to a live API here
    └── events.json      # 20 sample world events
```

## Data Sources

- **USGS Earthquake Data** (https://earthquake.usgs.gov) — Geological events, updated in real-time. Magnitude 4.5+.
- **NASA EONET** (https://eonet.gsfc.nasa.gov) — Environmental events including wildfires, volcanoes, severe storms, floods, and ice events.

Both APIs are free, CORS-enabled, and require no API key.

## Customization

**Custom data source?** Edit `src/data/dataService.js`:
- `fetchUsgs(days)` — pulls earthquakes
- `fetchEonet(days)` — pulls natural disasters
- Both return normalized event objects with `{id, title, category, severity, lat, lng, place, summary, imageUrl, sourceName, sourceUrl, date}`

To swap in a different API, follow the same shape and return it from `loadEvents()`.
