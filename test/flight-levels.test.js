import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { ROOT } from './helpers/briefing-page.js';

const context = vm.createContext({});
context.window = context;
vm.runInContext(readFileSync(path.join(ROOT, 'js', 'flight-levels.js'), 'utf8'), context);
const { FlightLevels } = context;

test('with the standard setting 1013.25, each level is at its own height, rounded down', () => {
  // FL65 = 1981.2 m, FL115 = 3505.2 m, FL195 = 5943.6 m.
  assert.deepEqual([65, 115, 195].map((fl) => FlightLevels.altitude(fl, 1013.25)), [1980, 3505, 5940]);
  assert.equal(FlightLevels.delta(1013.25), 0);
});

// Expected values solved independently from the ISA barometric formula
// p(h) = QNH * (1 - 0.0065 h / 288.15) ^ 5.25588: the altitude where the
// pressure equals that of the flight level, rounded DOWN to 5 m (ceilings).
// Delta is the altitude of the 1013.25 hPa surface, rounded to the metre.
const cases = [
  { qnh: 1013, delta: -2, fl65: 1975, fl115: 3500, fl195: 5940 },
  { qnh: 1020, delta: 56, fl65: 2030, fl115: 3555, fl195: 5990 },
  { qnh: 1030, delta: 138, fl65: 2110, fl115: 3630, fl195: 6060 },
  { qnh: 995, delta: -154, fl65: 1830, fl115: 3360, fl195: 5810 },
];
for (const { qnh, ...expected } of cases) {
  test(`QNH ${qnh} hPa gives FL65 ${expected.fl65} m, FL115 ${expected.fl115} m, FL195 ${expected.fl195} m`, () => {
    assert.deepEqual(
      {
        delta: FlightLevels.delta(qnh),
        fl65: FlightLevels.altitude(65, qnh),
        fl115: FlightLevels.altitude(115, qnh),
        fl195: FlightLevels.altitude(195, qnh),
      },
      expected,
    );
  });
}
