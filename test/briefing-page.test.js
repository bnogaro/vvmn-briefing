import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { loadBriefing, jsonResponse, defaultFetch, metarWithQnh } from './helpers/briefing-page.js';

// La Montagne Noire (LFMG), as declared in js/briefing.js.
const LAT = '43.4063889';
const LON = '1.9891666666666667';

async function withPage(t, options) {
  const page = await loadBriefing(options);
  t.after(page.close);
  return page;
}

const imageSources = (document, prefix) =>
  [...document.querySelectorAll(`img[src^="${prefix}"]`)].map((img) => img.getAttribute('src'));

describe('page load', () => {
  test('runs every script without uncaught errors', async (t) => {
    const page = await withPage(t);
    assert.deepEqual(page.uncaughtErrors, []);
    assert.deepEqual(page.consoleErrors, []);
  });

  test('requests no missing local file', async (t) => {
    const page = await withPage(t);
    assert.deepEqual(page.missingFiles, []);
  });

  test('starts reveal.js as a looping, auto-advancing kiosk', async (t) => {
    const { reveal } = await withPage(t);
    assert.equal(reveal.initOptions.loop, true);
    assert.equal(reveal.initOptions.history, false);
    assert.equal(reveal.initOptions.autoSlide, 20000);
  });

  test('keeps every slide on screen for at least 5 seconds', async (t) => {
    const { document } = await withPage(t);
    for (const slide of document.querySelectorAll('section[data-autoslide]')) {
      const title = slide.querySelector('h2, h4')?.textContent;
      assert.ok(Number(slide.dataset.autoslide) >= 5000, `${title}: ${slide.dataset.autoslide} ms`);
    }
  });
});

describe('date-dependent content', () => {
  test('title slide shows the UTC date as DD/MM/YYYY', async (t) => {
    const { document } = await withPage(t, { now: '2024-03-06T12:00:00Z' });
    assert.equal(document.querySelector('section p').textContent, 'Montagne Noire 06/03/2024');
  });

  test('title slide uses the UTC calendar day', async (t) => {
    const { document } = await withPage(t, { now: '2024-01-05T23:30:00-02:00' });
    assert.equal(document.querySelector('section p').textContent, 'Montagne Noire 06/01/2024');
  });

  test('rain gallery shows 07h to 18h of the day\'s 00Z AROME run for south-west France', async (t) => {
    const { document } = await withPage(t, { now: '2024-03-06T12:00:00Z' });
    const expected = Array.from(
      { length: 12 },
      (_, i) => `https://modeles7.meteociel.fr/modeles/arome/runs/2024030600/aromehd-1-${i + 7}-3.png`,
    );
    const frames = [...document.querySelectorAll('ul.gallery li img')].map((img) => img.getAttribute('src'));
    assert.deepEqual(frames, expected);
  });

  test('front map shows today 12h and tomorrow 00h from KNMI', async (t) => {
    const { document } = await withPage(t, { now: '2024-03-06T12:00:00Z' });
    const base = 'https://cdn.knmi.nl/knmi/map/page/weer/waarschuwingen_verwachtingen/weerkaarten/';
    assert.deepEqual(imageSources(document, base), [`${base}PL0612_large.gif`, `${base}PL0700_large.gif`]);
  });

  test('tomorrow\'s front map rolls over to the next month', async (t) => {
    const { document } = await withPage(t, { now: '2024-03-31T12:00:00Z' });
    const sources = imageSources(document, 'https://cdn.knmi.nl/');
    assert.match(sources[0], /PL3112_large\.gif$/);
    assert.match(sources[1], /PL0100_large\.gif$/);
  });

  // 2024-03-03 is a Sunday. Noon UTC is the same weekday in every European timezone.
  const tomorrowByDate = {
    '2024-03-03': 'lundi',
    '2024-03-04': 'mardi',
    '2024-03-05': 'mercredi',
    '2024-03-06': 'jeudi',
    '2024-03-07': 'vendredi',
    '2024-03-08': 'samedi',
    '2024-03-09': 'dimanche',
  };
  for (const [date, tomorrow] of Object.entries(tomorrowByDate)) {
    test(`24h forecast on ${date} shows ${tomorrow}`, async (t) => {
      const { document } = await withPage(t, { now: `${date}T12:00:00Z` });
      assert.deepEqual(imageSources(document, 'https://www.lameteo.org/'), [
        `https://www.lameteo.org/images/previsions/${tomorrow}.png`,
      ]);
    });
  }
});

describe('maps centred on the airfield', () => {
  test('Windy wind maps cover surface, 900, 800 and 600 hPa with AROME', async (t) => {
    const { document } = await withPage(t);
    const maps = [...document.querySelectorAll('iframe[src^="https://embed.windy.com/"]')].map(
      (iframe) => new URL(iframe.getAttribute('src')).searchParams,
    );
    assert.deepEqual(maps.map((params) => params.get('level')), ['surface', '900h', '800h', '600h']);
    for (const params of maps) {
      assert.equal(params.get('product'), 'arome');
      assert.equal(params.get('overlay'), 'wind');
      assert.deepEqual(
        [params.get('lat'), params.get('lon'), params.get('detailLat'), params.get('detailLon')],
        [LAT, LON, LAT, LON],
      );
    }
  });

  test('Meteo-parapente is centred on the airfield', async (t) => {
    const { document } = await withPage(t);
    const iframe = document.querySelector('iframe[src^="https://meteo-parapente.com/"]');
    assert.equal(iframe.getAttribute('src'), `https://meteo-parapente.com/#/${LAT},${LON},7`);
  });

  test('Meteociel soundings cover the airfield and Albi, 6 hours into the AROME run', async (t) => {
    const { document } = await withPage(t);
    const soundings = [...document.querySelectorAll('iframe[src^="https://www.meteociel.fr/modeles/sondage2arome.php"]')].map(
      (iframe) => new URL(iframe.getAttribute('src')).searchParams,
    );
    assert.deepEqual(
      soundings.map((params) => [params.get('lat'), params.get('lon'), params.get('ech')]),
      [
        [LAT, LON, '6'],
        ['43.9004', '1.972', '6'],
      ],
    );
  });
});

describe('sunset', () => {
  test('requests today\'s sunset at the airfield as an ISO timestamp', async (t) => {
    const { fetchCalls } = await withPage(t);
    const url = new URL(fetchCalls.find((call) => call.startsWith('https://api.sunrise-sunset.org/')));
    assert.equal(url.pathname, '/json');
    assert.equal(url.searchParams.get('lat'), LAT);
    assert.equal(url.searchParams.get('lng'), LON);
    assert.equal(url.searchParams.get('date'), 'today');
    assert.equal(url.searchParams.get('tzid'), 'europe/paris');
    assert.equal(url.searchParams.get('formatted'), '0');
  });

  test('displays the sunset in Paris time, 24h format', async (t) => {
    const { document } = await withPage(t);
    assert.equal(document.getElementById('sunsetDisplay').textContent, 'Coucher de soleil : 19:15');
  });

  test('fills in the end of flights 30 minutes after sunset, at aeronautical night', async (t) => {
    const { document } = await withPage(t);
    assert.equal(document.getElementById('fdv').value, '19:45');
  });

  test('uses Paris summer time for the sunset and the end of flights', async (t) => {
    const sunset = { results: { sunset: '2024-06-21T21:58:12+02:00' }, status: 'OK' };
    const fetch = (url) => (url.includes('sunrise-sunset') ? jsonResponse(sunset) : defaultFetch(url));
    const { document } = await withPage(t, { now: '2024-06-21T12:00:00Z', fetch });
    assert.equal(document.getElementById('sunsetDisplay').textContent, 'Coucher de soleil : 21:58');
    assert.equal(document.getElementById('fdv').value, '22:28');
  });

  const failures = {
    'the API fails': () => jsonResponse({}, 500),
    'the API answers without a sunset': () => jsonResponse({ results: {}, status: 'OK' }),
  };
  for (const [failure, sunriseSunset] of Object.entries(failures)) {
    test(`says the sunset is unavailable and logs when ${failure}`, async (t) => {
      const fetch = (url) => (url.includes('sunrise-sunset') ? sunriseSunset() : defaultFetch(url));
      const page = await withPage(t, { fetch });
      assert.equal(page.document.getElementById('sunsetDisplay').textContent, 'Coucher de soleil : indisponible');
      assert.equal(page.document.getElementById('fdv').value, '', 'end of flights left for the briefer');
      assert.equal(page.consoleErrors.length, 1);
      assert.deepEqual(page.uncaughtErrors, []);
    });
  }
});

describe('flight level table', () => {
  test('requests the decoded METAR of Castres (LFCK)', async (t) => {
    const { fetchCalls } = await withPage(t);
    const url = new URL(fetchCalls.find((call) => call.startsWith('https://api.checkwx.com/')));
    assert.equal(url.pathname, '/metar/LFCK/decoded');
    assert.ok(url.searchParams.get('x-api-key'), 'API key is sent');
  });

  // QNH, delta and the altitude of each level, as shown in the table.
  const table = (document) => ({
    qnh: document.getElementById('qnh').textContent,
    delta: document.getElementById('delta').textContent,
    levels: Object.fromEntries([...document.querySelectorAll('[data-fl]')].map((cell) => [cell.dataset.fl, cell.textContent])),
  });

  // The altitudes themselves are checked in flight-levels.test.js.
  test('fills the table from the METAR QNH', async (t) => {
    const fetch = (url) => (url.includes('checkwx') ? jsonResponse(metarWithQnh(1030)) : defaultFetch(url));
    const { document } = await withPage(t, { fetch });
    assert.deepEqual(table(document), { qnh: '1030', delta: '138', levels: { 65: '2110', 115: '3630', 195: '6060' } });
  });

  const failures = {
    'the METAR request fails': () => {
      throw new TypeError('Failed to fetch');
    },
    'the METAR API answers an error': () => jsonResponse({ error: 'Unauthorized' }, 401),
    'the METAR has no observation': () => jsonResponse({ results: 0, data: [] }),
    'the METAR has no barometer': () => jsonResponse({ results: 1, data: [{ icao: 'LFCK' }] }),
    'the METAR QNH is implausible': () => jsonResponse(metarWithQnh(29.92)),
  };
  for (const [failure, checkwx] of Object.entries(failures)) {
    test(`shows no altitude when ${failure}`, async (t) => {
      const fetch = (url) => (url.includes('checkwx') ? checkwx() : defaultFetch(url));
      const page = await withPage(t, { fetch });
      assert.deepEqual(table(page.document), {
        qnh: 'indisponible',
        delta: '—',
        levels: { 65: '—', 115: '—', 195: '—' },
      });
      assert.equal(page.consoleErrors.length, 1);
      assert.deepEqual(page.uncaughtErrors, []);
    });
  }
});

describe('gallery wiring', () => {
  test('the rain gallery starts when its slide is shown', async (t) => {
    const { document, reveal } = await withPage(t);
    const gallery = document.querySelector('ul.gallery');
    const title = document.querySelector('section');
    reveal.emit('slidechanged', { previousSlide: title, currentSlide: gallery.closest('section') });
    const states = [...gallery.querySelectorAll('li')].map((li) => li.className);
    assert.deepEqual(states, ['active', ...Array(11).fill('inactive')]);
    reveal.emit('slidechanged', { previousSlide: gallery.closest('section'), currentSlide: title });
  });
});
