import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { ROOT, REVEAL_STUB } from './helpers/briefing-page.js';

const PLUGIN = readFileSync(path.join(ROOT, 'js', 'gallery.plugin.js'), 'utf8');

const gallery = (attributes = '', frames = ['a', 'b', 'c']) =>
  `<ul class="gallery" ${attributes}>${frames
    .map((name) => `<li><img src="https://img.test/${name}.png" alt="${name}"></li>`)
    .join('')}</ul>`;

// Loads the plugin into a jsdom page with a stubbed Reveal and manual timers.
function loadPlugin(slidesHtml, { currentSlide } = {}) {
  const { window } = new JSDOM(
    `<!DOCTYPE html><div class="reveal"><div class="slides">${slidesHtml}</div></div>`,
    { runScripts: 'outside-only' },
  );
  const timers = new Map();
  let nextTimer = 0;
  window.setInterval = (fn, ms) => {
    timers.set(++nextTimer, { fn, ms });
    return nextTimer;
  };
  window.clearInterval = (id) => timers.delete(id);
  window.eval(REVEAL_STUB);
  if (currentSlide) window.Reveal.currentSlide = window.document.querySelector(currentSlide);
  window.eval(PLUGIN);

  const { document } = window;
  return {
    window,
    document,
    Gallery: window.Gallery,
    timers,
    tick: (times = 1) => {
      for (let i = 0; i < times; i++) for (const { fn } of [...timers.values()]) fn();
    },
    slideChanged: (previousSlide, currentSlide) =>
      window.Reveal.listeners.slidechanged.forEach((fn) =>
        fn({ previousSlide: document.querySelector(previousSlide), currentSlide: document.querySelector(currentSlide) }),
      ),
  };
}

const states = (node) => [...node.querySelectorAll('li')].map((li) => li.className);

describe('Gallery.step', () => {
  const frames = () => [{ className: 'active' }, { className: 'inactive' }, { className: 'inactive' }];
  const activeIndex = (items) => items.findIndex((item) => item.className === 'active');

  test('loops forever when iterations is 0', () => {
    const { Gallery } = loadPlugin('');
    const items = frames();
    const step = Gallery.step(items, 0);
    const seen = Array.from({ length: 7 }, () => (step(), activeIndex(items)));
    assert.deepEqual(seen, [1, 2, 0, 1, 2, 0, 1]);
  });

  test('stops on the last frame after the requested iterations', () => {
    const { Gallery } = loadPlugin('');
    const items = frames();
    const step = Gallery.step(items, 2);
    const seen = Array.from({ length: 8 }, () => (step(), activeIndex(items)));
    assert.deepEqual(seen, [1, 2, 0, 1, 2, 2, 2, 2]);
    assert.deepEqual(items.map((item) => item.className), ['inactive', 'inactive', 'active']);
  });
});

describe('Gallery.start / Gallery.stop', () => {
  test('shows the first frame and advances every data-interval seconds', () => {
    const { document, Gallery, timers, tick } = loadPlugin(`<section>${gallery('data-interval="2" data-iterations="0"')}</section>`);
    const node = document.querySelector('.gallery');
    Gallery.start(node);
    assert.deepEqual(states(node), ['active', 'inactive', 'inactive']);
    assert.deepEqual([...timers.values()].map((timer) => timer.ms), [2000]);
    tick(3);
    assert.deepEqual(states(node), ['active', 'inactive', 'inactive']);
  });

  test('defaults to one frame per second, played once', () => {
    const { document, Gallery, timers, tick } = loadPlugin(`<section>${gallery()}</section>`);
    const node = document.querySelector('.gallery');
    Gallery.start(node);
    assert.equal([...timers.values()][0].ms, 1000);
    tick(10);
    assert.deepEqual(states(node), ['inactive', 'inactive', 'active']);
  });

  test('adds a caption from the image alt text', () => {
    const { document, Gallery } = loadPlugin(`<section>${gallery()}</section>`);
    const node = document.querySelector('.gallery');
    Gallery.start(node);
    assert.deepEqual([...node.querySelectorAll('li > label')].map((label) => label.textContent), ['a', 'b', 'c']);
  });

  test('stop clears the timer and a restart begins from the first frame', () => {
    const { document, Gallery, timers, tick } = loadPlugin(`<section>${gallery('data-iterations="0"')}</section>`);
    const node = document.querySelector('.gallery');
    Gallery.start(node);
    tick(2);
    Gallery.stop(node);
    assert.equal(timers.size, 0);
    Gallery.start(node);
    assert.deepEqual(states(node), ['active', 'inactive', 'inactive']);
  });

  test('full-screen mode moves the gallery out of the slides and back', () => {
    const { document, Gallery } = loadPlugin(`<section>${gallery('data-mode="full-screen"')}</section>`);
    const node = document.querySelector('.gallery');
    const slides = document.querySelector('.slides');
    const section = document.querySelector('section');

    Gallery.start(node, slides);
    assert.equal(node.nextSibling, slides);
    assert.ok(section.querySelector('#gallery-placeholder'));
    assert.match(node.querySelector('li').style.backgroundImage, /img\.test\/a\.png/);
    assert.equal(node.querySelector('img').style.display, 'none');

    Gallery.stop(node, slides);
    assert.equal(node.parentNode, section);
    assert.equal(document.getElementById('gallery-placeholder'), null);
    assert.equal(node.querySelector('li').style.backgroundImage, '');
    assert.equal(node.querySelector('img').style.display, '');
  });
});

describe('Reveal integration', () => {
  const deck = `<section id="intro"></section><section id="rain">${gallery()}</section>`;

  test('starts the gallery of the slide shown and stops it when leaving', () => {
    const { document, timers, slideChanged } = loadPlugin(deck);
    slideChanged('#intro', '#rain');
    assert.equal(timers.size, 1);
    assert.deepEqual(states(document.querySelector('.gallery')), ['active', 'inactive', 'inactive']);
    slideChanged('#rain', '#intro');
    assert.equal(timers.size, 0);
  });

  test('starts the gallery already on screen when the plugin loads', () => {
    const { timers } = loadPlugin(deck, { currentSlide: '#rain' });
    assert.equal(timers.size, 1);
  });
});
