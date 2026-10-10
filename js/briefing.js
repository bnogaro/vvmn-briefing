// Fills the briefing slides: date-dependent forecast charts, sunset and the
// flight level table. Kept as a classic script (no ES module) so that
// index.html still works when opened straight from disk (file://).
(function (Briefing) {
  'use strict';

  // La Montagne Noire (LFMG): centre of the maps and place of the sunset.
  const LAT = '43.4063889';
  const LON = '1.9891666666666667';

  // QNH is read from the METAR of Castres-Mazamet.
  // Free API key from https://www.checkwxapi.com, readable by anyone loading the page.
  const CHECKWX_API_KEY = '52fa72e59d364463b44cfa4ec3';
  const METAR_AIRPORT = 'LFCK';

  // Places of the modelled soundings, as named by data-sounding in index.html.
  const SOUNDINGS = { airfield: [LAT, LON], albi: ['43.9004', '1.972'] };

  const pad2 = (n) => String(n).padStart(2, '0');

  // Date parts in UTC, as used by the forecast providers.
  function utcDate(date) {
    const day = pad2(date.getUTCDate());
    const month = pad2(date.getUTCMonth() + 1);
    const year = String(date.getUTCFullYear());
    return { day, month, year, ymd: year + month + day };
  }

  const nextDay = (date) => new Date(date.getTime() + 24 * 60 * 60 * 1000);

  // AROME path: runs/yyyymmddhh/aromehd-x-y-z.png
  //   x: 0 temperature, 1 rain, 3 wind
  //   y: forecast hour of the run
  //   z: 0 France, 1 NW, 2 NE, 3 SW, 4 SE, 5 Belgium, 6 Switzerland
  // Rain over south-west France, 07h to 18h UTC of the day's 00Z run.
  function aromeRainUrls(date) {
    const run = `${utcDate(date).ymd}00`;
    const urls = [];
    for (let hour = 7; hour <= 18; hour++) {
      urls.push(`https://modeles7.meteociel.fr/modeles/arome/runs/${run}/aromehd-1-${hour}-3.png`);
    }
    return urls;
  }

  // KNMI front chart for the UTC day of `date`, at `hour` ('00' or '12').
  const knmiFrontUrl = (date, hour) =>
    `https://cdn.knmi.nl/knmi/map/page/weer/waarschuwingen_verwachtingen/weerkaarten/PL${utcDate(date).day}${hour}_large.gif`;

  // lameteo.org publishes one chart per weekday: show tomorrow's (local time).
  const TOMORROW_BY_WEEKDAY = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
  const lameteoTomorrowUrl = (date) =>
    `https://www.lameteo.org/images/previsions/${TOMORROW_BY_WEEKDAY[date.getDay()]}.png`;

  const windyUrl = (level) =>
    'https://embed.windy.com/embed.html?type=map&location=coordinates&metricRain=default&metricTemp=default' +
    `&metricWind=default&zoom=6&overlay=wind&product=arome&level=${level}` +
    `&lat=${LAT}&lon=${LON}&detailLat=${LAT}&detailLon=${LON}&marker=true&pressure=true&message=true`;

  const meteoParapenteUrl = () => `https://meteo-parapente.com/#/${LAT},${LON},7`;

  // Meteociel AROME sounding, 6 hours into the run.
  const soundingUrl = ([lat, lon]) =>
    `https://www.meteociel.fr/modeles/sondage2arome.php?archive=0&ech=6&map=1&wrf=0&region=&type=1&lat=${lat}&lon=${lon}`;

  // QNH (hPa) of a decoded checkwx METAR; throws when there is none.
  function qnhFromMetar(body) {
    const qnh = Number(body?.data?.[0]?.barometer?.mb);
    if (!(qnh >= 900 && qnh <= 1100)) {
      throw new Error(`no usable QNH in METAR: ${JSON.stringify(body)}`);
    }
    return qnh;
  }

  const sunsetUrl = () =>
    `https://api.sunrise-sunset.org/json?lat=${LAT}&lng=${LON}&date=today&tzid=europe/paris&formatted=0`;
  const metarUrl = () => `https://api.checkwx.com/metar/${METAR_AIRPORT}/decoded?x-api-key=${CHECKWX_API_KEY}`;

  // "19:15" in Paris time, from an ISO 8601 timestamp.
  function parisTime(iso) {
    const time = new Date(iso);
    if (Number.isNaN(time.getTime())) throw new Error(`invalid time: ${iso}`);
    return time.toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' });
  }

  // Aeronautical night begins 30 minutes after sunset (France): flights end by then.
  const endOfFlights = (sunset) => new Date(new Date(sunset).getTime() + 30 * 60 * 1000);

  async function fetchJson(url) {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
  }

  // Points the date-dependent images and iframes of the page at `now`'s forecasts.
  function render(document, now) {
    const { day, month, year } = utcDate(now);
    document.getElementById('today').textContent = `${day}/${month}/${year}`;
    document.getElementById('front-today').src = knmiFrontUrl(now, '12');
    document.getElementById('front-tomorrow').src = knmiFrontUrl(nextDay(now), '00');
    document.getElementById('forecast-tomorrow').src = lameteoTomorrowUrl(now);
    document.getElementById('meteo-parapente').src = meteoParapenteUrl();
    document.querySelectorAll('iframe[data-windy-level]').forEach((iframe) => {
      iframe.src = windyUrl(iframe.dataset.windyLevel);
    });
    document.querySelectorAll('iframe[data-sounding]').forEach((iframe) => {
      iframe.src = soundingUrl(SOUNDINGS[iframe.dataset.sounding]);
    });

    const gallery = document.getElementById('rain-forecast');
    for (const url of aromeRainUrls(now)) {
      const item = document.createElement('li');
      const img = document.createElement('img');
      img.src = url;
      item.appendChild(img);
      gallery.appendChild(item);
    }
  }

  async function showSunset(document) {
    const display = document.getElementById('sunsetDisplay');
    try {
      const body = await fetchJson(sunsetUrl());
      const sunset = parisTime(body.results.sunset);
      console.log(`Fetched sunset from api.sunrise-sunset.org: ${sunset}`);
      display.textContent = `Coucher de soleil : ${sunset}`;
      document.getElementById('fdv').value = parisTime(endOfFlights(body.results.sunset));
    } catch (error) {
      console.error('Could not fetch the sunset:', error);
      display.textContent = 'Coucher de soleil : indisponible';
    }
  }

  // Without a QNH the table keeps its dashes: a stale altitude is worse than none.
  async function showFlightLevels(document) {
    const cell = (id) => document.getElementById(id);
    let qnh;
    try {
      qnh = qnhFromMetar(await fetchJson(metarUrl()));
    } catch (error) {
      console.error('Could not fetch the QNH:', error);
      cell('qnh').textContent = 'indisponible';
      return;
    }
    console.log(`Fetched QNH from METAR at api.checkwx.com: ${qnh}`);
    cell('qnh').textContent = String(qnh);
    cell('delta').textContent = String(FlightLevels.delta(qnh));
    // The table lists the levels: one cell per level, marked data-fl="115".
    document.querySelectorAll('[data-fl]').forEach((levelCell) => {
      levelCell.textContent = String(FlightLevels.altitude(Number(levelCell.dataset.fl), qnh));
    });
  }

  // Fills the page for `now`: the forecast charts at once, the sunset and the
  // flight level table when their APIs answer. Resolves once both are shown.
  function start(document, now) {
    render(document, now);
    return Promise.all([showSunset(document), showFlightLevels(document)]);
  }

  Object.assign(Briefing, { start });
})((window.Briefing = window.Briefing || {}));
