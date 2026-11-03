// Altitudes of flight levels for a QNH, from the ICAO standard atmosphere.
// Kept as a classic script (no ES module) so that index.html still works when
// opened straight from disk (file://).
(function (FlightLevels) {
  'use strict';

  // Flight levels are pressure surfaces of the standard atmosphere.
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

  // Altitude (m) at which an altimeter set to `qnh` (hPa) reaches flight level
  // `fl`, rounded down to 5 m: flight levels are used as ceilings.
  FlightLevels.altitude = (fl, qnh) => Math.floor(altitudeOnQnh(pressureAtFlightLevel(fl), qnh) / 5) * 5;

  // Altitude (m) of the 1013.25 hPa surface for `qnh`, rounded to the metre:
  // how far QNH altitudes sit above pressure altitudes near the ground.
  FlightLevels.delta = (qnh) => Math.round(altitudeOnQnh(ISA_P0, qnh));
})((window.FlightLevels = window.FlightLevels || {}));
