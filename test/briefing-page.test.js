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
});

describe('date-dependent content', () => {
  test('title slide shows the UTC date as DD/MM/YYYY', async (t) => {
    const { document } = await withPage(t, { now: '2024-03-06T12:00:00Z' });
    assert.equal(document.querySelector('section p').textContent, 'Montagne Noire 06/03/2024');
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
});

describe('sunset', () => {
  test('requests today\'s sunset at the airfield in Paris time', async (t) => {
    const { fetchCalls } = await withPage(t);
    const url = new URL(fetchCalls.find((call) => call.startsWith('https://api.sunrise-sunset.org/')));
    assert.equal(url.pathname, '/json');
    assert.equal(url.searchParams.get('lat'), LAT);
    assert.equal(url.searchParams.get('lng'), LON);
    assert.equal(url.searchParams.get('date'), 'today');
    assert.equal(url.searchParams.get('tzid'), 'europe/paris');
  });

  test('displays the sunset time', async (t) => {
    const { document } = await withPage(t);
    assert.equal(document.getElementById('sunsetDisplay').textContent, 'Coucher de soleil: 7:15:23 PM');
  });

  test('leaves the sunset empty and logs when the API fails', async (t) => {
    const fetch = (url) => (url.includes('sunrise-sunset') ? jsonResponse({}, 500) : defaultFetch(url));
    const page = await withPage(t, { fetch });
    assert.equal(page.document.getElementById('sunsetDisplay').textContent, '');
    assert.equal(page.consoleErrors.length, 1);
    assert.deepEqual(page.uncaughtErrors, []);
  });
});

describe('flight level table', () => {
  test('requests the decoded METAR of Castres (LFCK)', async (t) => {
    const { fetchCalls } = await withPage(t);
    const url = new URL(fetchCalls.find((call) => call.startsWith('https://api.checkwx.com/')));
    assert.equal(url.pathname, '/metar/LFCK/decoded');
    assert.ok(url.searchParams.get('x-api-key'), 'API key is sent');
  });

  // Expected values solved independently from the ISA barometric formula
  // p(h) = QNH * (1 - 0.0065 h / 288.15) ^ 5.25588: the altitude where the
  // pressure equals that of the flight level, rounded DOWN to 5 m (ceilings).
  // Delta is the altitude of the 1013.25 hPa surface, rounded to the metre.
  const cases = [
    { qnh: 1013, delta: '-2', fl65: '1975', fl115: '3500', fl195: '5940' },
    { qnh: 1020, delta: '56', fl65: '2030', fl115: '3555', fl195: '5990' },
    { qnh: 1030, delta: '138', fl65: '2110', fl115: '3630', fl195: '6060' },
    { qnh: 995, delta: '-154', fl65: '1830', fl115: '3360', fl195: '5810' },
  ];
  for (const { qnh, ...expected } of cases) {
    test(`QNH ${qnh} hPa gives FL65 ${expected.fl65} m, FL115 ${expected.fl115} m, FL195 ${expected.fl195} m`, async (t) => {
      const fetch = (url) => (url.includes('checkwx') ? jsonResponse(metarWithQnh(qnh)) : defaultFetch(url));
      const { document } = await withPage(t, { fetch });
      const cell = (id) => document.getElementById(id).textContent;
      assert.equal(cell('qnh'), String(qnh));
      assert.deepEqual(
        { delta: cell('delta'), fl65: cell('fl65'), fl115: cell('fl115'), fl195: cell('fl195') },
        expected,
      );
    });
  }

  const failures = {
    'the METAR request fails': () => {
      throw new TypeError('Failed to fetch');
    },
    'the METAR API answers an error': () => jsonResponse({ error: 'Unauthorized' }, 401),
    'the METAR has no observation': () => jsonResponse({ results: 0, data: [] }),
    'the METAR QNH is implausible': () => jsonResponse(metarWithQnh(29.92)),
  };
  for (const [failure, checkwx] of Object.entries(failures)) {
    test(`shows no altitude when ${failure}`, async (t) => {
      const fetch = (url) => (url.includes('checkwx') ? checkwx() : defaultFetch(url));
      const page = await withPage(t, { fetch });
      assert.equal(page.document.getElementById('qnh').textContent, 'indisponible');
      for (const id of ['delta', 'fl65', 'fl115', 'fl195']) {
        assert.equal(page.document.getElementById(id).textContent, '—', `#${id}`);
      }
      assert.equal(page.consoleErrors.length, 1);
      assert.deepEqual(page.uncaughtErrors, []);
    });
  }
});

describe('gallery wiring', () => {
  test('the rain gallery starts when its slide is shown', async (t) => {
    const { document, reveal } = await withPage(t);
    const gallery = document.querySelector('ul.gallery');
    const [onSlideChanged] = reveal.listeners.slidechanged;
    onSlideChanged({ previousSlide: document.querySelector('section'), currentSlide: gallery.closest('section') });
    const states = [...gallery.querySelectorAll('li')].map((li) => li.className);
    assert.equal(states.filter((state) => state === 'active').length, 1);
    assert.equal(states.filter((state) => state === 'inactive').length, 11);
    onSlideChanged({ previousSlide: gallery.closest('section'), currentSlide: document.querySelector('section') });
  });
});
