import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { ROOT } from './helpers/briefing-page.js';

const PLUGIN = readFileSync(path.join(ROOT, 'js', 'gallery.plugin.js'), 'utf8');

const gallery = (attributes = '') =>
  `<ul class="gallery" ${attributes}>${['a', 'b', 'c']
    .map((name) => `<li><img src="https://img.test/${name}.png"></li>`)
    .join('')}</ul>`;

// Starts the plugin against a stub reveal.js deck, with timers advanced by hand.
function setUp(slidesHtml) {
  const { window } = new JSDOM(`<!DOCTYPE html><div class="reveal"><div class="slides">${slidesHtml}</div></div>`, {
    runScripts: 'outside-only',
  });
  const timers = new Map();
  let nextTimer = 0;
  window.setInterval = (fn, ms) => {
    timers.set(++nextTimer, { fn, ms });
    return nextTimer;
  };
  window.clearInterval = (id) => timers.delete(id);
  window.eval(PLUGIN);

  const listeners = {};
  window.RevealGallery.init({ on: (type, fn) => (listeners[type] ||= []).push(fn) });

  const { document } = window;
  const slide = (selector) => selector && document.querySelector(selector);
  return {
    timers,
    tick: (times = 1) => {
      for (let i = 0; i < times; i++) for (const { fn } of [...timers.values()]) fn();
    },
    ready: (current) => listeners.ready.forEach((fn) => fn({ currentSlide: slide(current) })),
    show: (previous, current) =>
      listeners.slidechanged.forEach((fn) => fn({ previousSlide: slide(previous), currentSlide: slide(current) })),
    states: (selector) => [...document.querySelectorAll(`${selector} li`)].map((li) => li.className),
    activeIndex: (selector) => [...document.querySelectorAll(`${selector} li`)].findIndex((li) => li.className === 'active'),
  };
}

const deck = (attributes) => `<section id="intro"></section><section id="rain">${gallery(attributes)}</section>`;

test('shows the first image, then the next one every data-interval seconds', () => {
  const page = setUp(deck('data-interval="2" data-iterations="0"'));
  page.show('#intro', '#rain');
  assert.deepEqual(page.states('#rain'), ['active', 'inactive', 'inactive']);
  assert.deepEqual([...page.timers.values()].map((timer) => timer.ms), [2000]);
  page.tick();
  assert.deepEqual(page.states('#rain'), ['inactive', 'active', 'inactive']);
});

test('loops forever when data-iterations is 0', () => {
  const page = setUp(deck('data-iterations="0"'));
  page.show('#intro', '#rain');
  const seen = Array.from({ length: 7 }, () => (page.tick(), page.activeIndex('#rain')));
  assert.deepEqual(seen, [1, 2, 0, 1, 2, 0, 1]);
});

test('stops on the last image after data-iterations plays', () => {
  const page = setUp(deck('data-iterations="2"'));
  page.show('#intro', '#rain');
  const seen = Array.from({ length: 8 }, () => (page.tick(), page.activeIndex('#rain')));
  assert.deepEqual(seen, [1, 2, 0, 1, 2, 2, 2, 2]);
  assert.deepEqual(page.states('#rain'), ['inactive', 'inactive', 'active']);
});

test('defaults to one image per second, played once', () => {
  const page = setUp(deck(''));
  page.show('#intro', '#rain');
  assert.equal([...page.timers.values()][0].ms, 1000);
  page.tick(10);
  assert.deepEqual(page.states('#rain'), ['inactive', 'inactive', 'active']);
});

test('stops when its slide is left and restarts from the first image', () => {
  const page = setUp(deck('data-iterations="0"'));
  page.show('#intro', '#rain');
  page.tick(2);
  page.show('#rain', '#intro');
  assert.equal(page.timers.size, 0);
  page.show('#intro', '#rain');
  assert.deepEqual(page.states('#rain'), ['active', 'inactive', 'inactive']);
});

test('starts a gallery on the first slide when reveal.js is ready', () => {
  const page = setUp(deck(''));
  page.ready('#rain');
  assert.equal(page.timers.size, 1);
});

test('keeps one timer per gallery when it is shown again or another gallery follows', () => {
  const page = setUp(`${deck('')}<section id="wind">${gallery('')}</section>`);
  page.ready('#rain');
  page.show('#intro', '#rain');
  assert.equal(page.timers.size, 1);
  page.show('#rain', '#wind');
  assert.equal(page.timers.size, 1);
  assert.deepEqual(page.states('#wind'), ['active', 'inactive', 'inactive']);
});

test('ignores slides without a gallery and a missing previous slide', () => {
  const page = setUp(deck(''));
  page.show(null, '#intro');
  assert.equal(page.timers.size, 0);
});
