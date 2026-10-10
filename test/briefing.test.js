import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { ROOT } from './helpers/briefing-page.js';

const context = vm.createContext({});
context.window = context;
vm.runInContext(readFileSync(path.join(ROOT, 'js', 'briefing.js'), 'utf8'), context);
const { Briefing } = context;

const FEET_PER_FL = 30.48;

describe('flightLevelAltitude', () => {
  test('equals the flight level with the standard setting 1013.25', () => {
    for (const fl of [65, 115, 195]) {
      assert.ok(Math.abs(Briefing.flightLevelAltitude(fl, 1013.25) - fl * FEET_PER_FL) < 1e-6, `FL${fl}`);
    }
  });

  test('the QNH offset shrinks with height, below the 28 ft/hPa rule of thumb', () => {
    const offset = (fl) => Briefing.flightLevelAltitude(fl, 1030) - fl * FEET_PER_FL;
    const ruleOfThumb = (1030 - 1013.25) * 28 * 0.3048;
    assert.ok(offset(195) < offset(115) && offset(115) < offset(65) && offset(65) < ruleOfThumb);
  });
});

describe('qnhDelta', () => {
  test('is zero at 1013.25 and follows the sign of QNH - 1013.25', () => {
    assert.equal(Briefing.qnhDelta(1013.25), 0);
    assert.ok(Briefing.qnhDelta(1020) > 0);
    assert.ok(Briefing.qnhDelta(1000) < 0);
  });

  test('is about 8.32 m per hPa near the standard pressure', () => {
    assert.ok(Math.abs(Briefing.qnhDelta(1014.25) - 8.32) < 0.02);
  });
});

test('floorTo5 rounds down to a multiple of 5 m', () => {
  assert.deepEqual([3630, 3632.36, 3634.99, 3635].map(Briefing.floorTo5), [3630, 3630, 3630, 3635]);
});

describe('qnhFromMetar', () => {
  test('reads the QNH of the first observation', () => {
    assert.equal(Briefing.qnhFromMetar({ results: 1, data: [{ barometer: { mb: 1021 } }] }), 1021);
  });

  const unusable = {
    'no body': null,
    'no observation': { results: 0, data: [] },
    'no barometer': { results: 1, data: [{ icao: 'LFCK' }] },
    'inches of mercury': { results: 1, data: [{ barometer: { mb: 29.92 } }] },
  };
  for (const [name, body] of Object.entries(unusable)) {
    test(`throws for ${name}`, () => {
      assert.throws(() => Briefing.qnhFromMetar(body), /no usable QNH/);
    });
  }
});

describe('utcDate', () => {
  test('zero-pads day and month', () => {
    assert.deepEqual(
      { ...Briefing.utcDate(new Date('2024-03-06T12:00:00Z')) },
      { day: '06', month: '03', year: '2024', ymd: '20240306' },
    );
  });

  test('uses the UTC calendar day', () => {
    assert.equal(Briefing.utcDate(new Date('2024-01-05T23:30:00-02:00')).ymd, '20240106');
  });
});

describe('parisTime', () => {
  test('formats in Paris time, summer and winter', () => {
    assert.equal(Briefing.parisTime('2024-07-01T19:45:00Z'), '21:45');
    assert.equal(Briefing.parisTime('2024-12-01T16:05:00Z'), '17:05');
  });

  test('throws on an invalid time', () => {
    assert.throws(() => Briefing.parisTime(undefined), /invalid time/);
  });
});

test('endOfFlights is 30 minutes after sunset', () => {
  assert.equal(Briefing.parisTime(Briefing.endOfFlights('2024-06-21T19:58:00Z')), '22:28');
});
