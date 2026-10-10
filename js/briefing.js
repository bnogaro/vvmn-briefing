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

  const FLIGHT_LEVELS = [65, 115, 195];

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

  // Flight levels are pressure surfaces of the ICAO standard atmosphere.
  // An altimeter set to QNH reads, at the surface of pressure p:
  //   h = T0 / L * (1 - (p / QNH) ^ (R L / g))
  const ISA_T0 = 288.15; // K
  const ISA_LAPSE = 0.0065; // K/m
  const ISA_EXPONENT = 0.190263; // R L / g
  const ISA_P0 = 1013.25; // hPa
  const FOOT = 0.3048; // m

  const pressureAtFlightLevel = (fl) =>
    ISA_P0 * Math.pow(1 - (ISA_LAPSE * fl * 100 * FOOT) / ISA_T0, 1 / ISA_EXPONENT);
  const altitudeOnQnh = (pressure, qnh) => (ISA_T0 / ISA_LAPSE) * (1 - Math.pow(pressure / qnh, ISA_EXPONENT));

  // Altitude (m) at which the altimeter, set to QNH, reaches flight level `fl`.
  const flightLevelAltitude = (fl, qnh) => altitudeOnQnh(pressureAtFlightLevel(fl), qnh);

  // Altitude (m) of the 1013.25 hPa surface: QNH altitude minus pressure altitude near the ground.
  const qnhDelta = (qnh) => altitudeOnQnh(ISA_P0, qnh);

  // Flight levels are used as ceilings: round down to stay below them.
  const floorTo5 = (metres) => Math.floor(metres / 5) * 5;

  // QNH (hPa) of a decoded checkwx METAR; throws when there is none.
  function qnhFromMetar(body) {
    const qnh = Number(body?.data?.[0]?.barometer?.mb);
    if (!(qnh >= 900 && qnh <= 1100)) {
      throw new Error(`no usable QNH in METAR: ${JSON.stringify(body)}`);
    }
    return qnh;
  }

  const sunsetUrl = () => `https://api.sunrise-sunset.org/json?lat=${LAT}&lng=${LON}&date=today&tzid=europe/paris`;
  const metarUrl = () => `https://api.checkwx.com/metar/${METAR_AIRPORT}/decoded?x-api-key=${CHECKWX_API_KEY}`;

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

    const gallery = document.getElementById('rain-forecast');
    for (const url of aromeRainUrls(now)) {
      const item = document.createElement('li');
      const img = document.createElement('img');
      img.src = url;
      img.style.cssText = 'height:600px; text-align:center;';
      item.appendChild(img);
      gallery.appendChild(item);
    }
  }

  async function showSunset(document) {
    try {
      const body = await fetchJson(sunsetUrl());
      const sunset = body.results.sunset;
      console.log(`Fetched sunset from api.sunrise-sunset.org: ${sunset}`);
      document.getElementById('sunsetDisplay').textContent = `Coucher de soleil: ${sunset}`;
    } catch (error) {
      console.error('There was a problem with the fetch operation:', error);
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
    cell('delta').textContent = String(Math.round(qnhDelta(qnh)));
    for (const fl of FLIGHT_LEVELS) {
      cell(`fl${fl}`).textContent = String(floorTo5(flightLevelAltitude(fl, qnh)));
    }
  }

  Object.assign(Briefing, {
    utcDate,
    aromeRainUrls,
    knmiFrontUrl,
    lameteoTomorrowUrl,
    windyUrl,
    flightLevelAltitude,
    qnhDelta,
    floorTo5,
    qnhFromMetar,
    render,
    showSunset,
    showFlightLevels,
  });
})((window.Briefing = window.Briefing || {}));
