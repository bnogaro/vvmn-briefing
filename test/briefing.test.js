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
