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
