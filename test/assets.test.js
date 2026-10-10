import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { ROOT } from './helpers/briefing-page.js';

// Local files index.html points at that are known to be missing.
const KNOWN_MISSING = {
  'files/head.min.js': 'head.js is in js/, and reveal.js 5 does not need it',
  'lib/js/classList.js': 'reveal.js 3 polyfill, never loaded by current browsers',
  'plugin/gallery/gallery.plugin.js': '404 on every load; the plugin is already loaded from js/',
};

const { document } = new JSDOM(readFileSync(path.join(ROOT, 'index.html'), 'utf8')).window;

const isLocal = (url) => !/^[a-z]+:|^\/\//i.test(url);

const tagReferences = [
  ...[...document.querySelectorAll('script[src]')].map((script) => script.getAttribute('src')),
  ...[...document.querySelectorAll('link[rel="stylesheet"][href]')].map((link) => link.getAttribute('href')),
];

// Files reveal.js loads itself, from the `dependencies` option of Reveal.initialize().
const dependencyReferences = [...document.querySelectorAll('script:not([src])')]
  .flatMap((script) => script.textContent.split('\n'))
  .filter((line) => !line.trim().startsWith('//'))
  .flatMap((line) => [...line.matchAll(/\bsrc:\s*'([^']+)'/g)].map((match) => match[1]));

for (const reference of [...tagReferences, ...dependencyReferences].filter(isLocal)) {
  test(`index.html references an existing file: ${reference}`, { todo: KNOWN_MISSING[reference] }, () => {
    const hint = reference.startsWith('reveal.js/') ? ' (run `git submodule update --init`)' : '';
    assert.ok(existsSync(path.join(ROOT, reference)), `${reference} is missing${hint}`);
  });
}
