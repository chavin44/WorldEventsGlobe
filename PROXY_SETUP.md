# Reliable live news — free Cloudflare Worker proxy (5 minutes)

The globe always shows real earthquakes (USGS) and natural disasters (NASA EONET).
For real **economic, business, company & geopolitical** news it uses **GDELT** — a
free global news database. GDELT isn't directly reachable from a browser (no CORS),
and every *public* proxy is permanently rate-limited because the whole internet
shares it.

The fix is your **own** tiny proxy on Cloudflare Workers. It's free (100,000
requests/day), has its own IP that GDELT won't throttle, and takes ~5 minutes.

## Steps

1. **Make a free Cloudflare account** → https://dash.cloudflare.com/sign-up
   (no credit card needed for the Workers free plan).

2. In the dashboard sidebar, click **Workers & Pages** → **Create application** →
   **Create Worker**. Give it a name like `globe-news` and click **Deploy**.

3. Click **Edit code**. Delete everything in the editor, then paste the entire
   contents of [`cloudflare-worker.js`](cloudflare-worker.js) from this project.
   Click **Deploy** (top right).

4. Copy your worker's URL — it looks like:
   `https://globe-news.YOUR-SUBDOMAIN.workers.dev`

5. Open your live globe site, open the browser **console** (press `F12` →
   *Console* tab), paste this **once** (with your real worker URL) and press Enter:

   ```js
   localStorage.setItem('newsProxy', 'https://globe-news.YOUR-SUBDOMAIN.workers.dev/?url=');
   ```

   ⚠️ Keep the `/?url=` on the end.

6. Reload the page and click **Find Events**. Within a few seconds you'll see
   yellow **economic** and red **geopolitical** news markers stream onto the globe,
   each linking to the real article.

That's it — it'll keep working for everyone who visits, with no further setup.

## Want it on by default for all visitors?

Instead of step 5, edit `src/data/dataService.js` and set:

```js
const DEFAULT_PROXY = 'https://globe-news.YOUR-SUBDOMAIN.workers.dev/?url=';
```

Then `git commit` and `git push` — the auto-deploy will publish it, and every
visitor gets reliable news with nothing to configure.
