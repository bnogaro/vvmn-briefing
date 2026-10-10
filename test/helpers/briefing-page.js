// Loads index.html in jsdom with the network stubbed out, so the inline
// scripts run exactly as in a browser but against controlled data.
//
// - The page is served from a fake https origin: jsdom request interceptors
//   do not see file:// URLs, so local files are answered from disk here.
// - reveal.js is replaced by a recording stub (it needs real layout/canvas).
// - Every other external request (iframes, fonts...) gets an empty response.
// - window.fetch (used for sunset and METAR) is replaced by `fetch` below.
// - `new Date()` / `Date.now()` return the fixed instant `now`.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM, VirtualConsole, requestInterceptor } from 'jsdom';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ORIGIN = 'https://briefing.test/';

// Records the options and starts the plugins like reveal.js; emit() fires deck events.
const REVEAL_STUB = `
window.Reveal = {
  initOptions: null,
  listeners: {},
  initialize(options) {
    this.initOptions = options;
    (options.plugins || []).forEach((plugin) => plugin.init(this));
  },
  on(type, fn) { (this.listeners[type] ||= []).push(fn); },
  emit(type, event) { (this.listeners[type] || []).forEach((fn) => fn(event)); },
};`;

const CONTENT_TYPES = { '.js': 'application/javascript', '.css': 'text/css', '.html': 'text/html' };

export function jsonResponse(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

// As returned with formatted=0 and tzid=europe/paris.
export const DEFAULT_SUNSET = { results: { sunset: '2024-03-06T19:15:23+01:00' }, status: 'OK' };
export const metarWithQnh = (mb) => ({ results: 1, data: [{ icao: 'LFCK', barometer: { hg: 0, hpa: mb, kpa: 0, mb } }] });

export function defaultFetch(url) {
  if (url.startsWith('https://api.sunrise-sunset.org/')) return jsonResponse(DEFAULT_SUNSET);
  if (url.startsWith('https://api.checkwx.com/')) return jsonResponse(metarWithQnh(1013));
  throw new Error(`unexpected fetch: ${url}`);
}

export async function loadBriefing({ now = '2024-03-06T12:00:00Z', fetch = defaultFetch } = {}) {
  const fetchCalls = [];
  const pendingFetches = [];
  const missingFiles = [];
  const uncaughtErrors = [];
  const consoleErrors = [];

  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (e) => {
    if (e.type === 'unhandled-exception') uncaughtErrors.push(e.cause ?? e);
  });
  virtualConsole.on('error', (...args) => consoleErrors.push(args));

  const html = await readFile(path.join(ROOT, 'index.html'), 'utf8');
  const dom = new JSDOM(html, {
    url: ORIGIN,
    runScripts: 'dangerously',
    virtualConsole,
    resources: {
      interceptors: [
        requestInterceptor(async (request) => {
          if (request.url === `${ORIGIN}reveal.js/dist/reveal.js`) {
            return new Response(REVEAL_STUB, { headers: { 'Content-Type': CONTENT_TYPES['.js'] } });
          }
          if (request.url.startsWith(ORIGIN)) {
            const relative = decodeURIComponent(new URL(request.url).pathname).slice(1);
            try {
              const body = await readFile(path.join(ROOT, relative));
              const type = CONTENT_TYPES[path.extname(relative)] ?? 'application/octet-stream';
              return new Response(body, { headers: { 'Content-Type': type } });
            } catch {
              missingFiles.push(relative);
              return new Response('not found', { status: 404 });
            }
          }
          return new Response('', { headers: { 'Content-Type': 'text/html' } });
        }),
      ],
    },
    beforeParse(window) {
      const fixed = Date.parse(now);
      const RealDate = window.Date;
      window.Date = class extends RealDate {
        constructor(...args) {
          if (args.length === 0) super(fixed);
          else super(...args);
        }
        static now() {
          return fixed;
        }
      };
      window.fetch = (url) => {
        fetchCalls.push(String(url));
        const result = Promise.resolve().then(() => fetch(String(url)));
        pendingFetches.push(result.catch(() => {}));
        return result;
      };
    },
  });

  const { window } = dom;
  await new Promise((resolve) => window.addEventListener('load', resolve));
  await Promise.all(pendingFetches);
  // Let the page's async handlers (await response.json(), DOM updates) finish.
  await new Promise((resolve) => setImmediate(resolve));

  return {
    window,
    document: window.document,
    reveal: window.Reveal,
    fetchCalls,
    missingFiles,
    uncaughtErrors,
    consoleErrors,
    close: () => window.close(),
  };
}
