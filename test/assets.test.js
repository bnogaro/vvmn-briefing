import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { ROOT } from './helpers/briefing-page.js';

const { document } = new JSDOM(readFileSync(path.join(ROOT, 'index.html'), 'utf8')).window;

const isLocal = (url) => !/^[a-z]+:|^\/\//i.test(url);

const references = [
  ...[...document.querySelectorAll('script[src]')].map((script) => script.getAttribute('src')),
  ...[...document.querySelectorAll('link[rel="stylesheet"][href]')].map((link) => link.getAttribute('href')),
].filter(isLocal);

for (const reference of references) {
  test(`index.html references an existing file: ${reference}`, () => {
    const hint = reference.startsWith('reveal.js/') ? ' (run `git submodule update --init`)' : '';
    assert.ok(existsSync(path.join(ROOT, reference)), `${reference} is missing${hint}`);
  });
}
