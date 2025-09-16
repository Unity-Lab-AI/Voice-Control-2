const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const htmlPath = path.join(__dirname, '..', 'index.html');
const html = fs.readFileSync(htmlPath, 'utf8');

const dom = new JSDOM(html);
const { document } = dom.window;

function getElement(selector) {
  const element = document.querySelector(selector);
  assert.ok(element, `Expected to find element matching selector "${selector}"`);
  return element;
}

function getById(id) {
  const element = document.getElementById(id);
  assert.ok(element, `Expected to find element with id "${id}"`);
  return element;
}

function expectButton(id) {
  const el = getById(id);
  assert.strictEqual(el.tagName, 'BUTTON', `Expected #${id} to be a <button>`);
  assert.ok(el.textContent.trim().length > 0 || el.querySelector('i'), `Expected #${id} button to have text or an icon`);
}

function expectSelect(id) {
  const el = getById(id);
  assert.strictEqual(el.tagName, 'SELECT', `Expected #${id} to be a <select>`);
}

// Core layout containers
getById('screensaver-container');
getById('chat-box');
const chatInput = getById('chat-input');
assert.strictEqual(chatInput.tagName, 'TEXTAREA', 'Chat input should be a textarea to support multiline typing');
expectButton('send-button');
getById('session-list');
getById('visitor-count-display');
expectSelect('model-select');
expectSelect('theme-select');
expectSelect('voice-select');
expectButton('toggle-screensaver');
expectButton('open-personalization-btn');
expectButton('open-settings-btn');
expectButton('toggle-simple-mode');
expectButton('donation-open-btn');
expectButton('voice-toggle');
expectButton('open-voice-settings-modal');
expectButton('voice-chat-toggle');
expectButton('shut-up-btn');
expectButton('clear-chat');

// Screensaver controls
expectButton('screensaver-playpause');
expectButton('fullscreen-screensaver');
expectButton('screensaver-hide');
expectButton('screensaver-save');
expectButton('screensaver-copy');
expectButton('screensaver-restart-prompt');
expectButton('screensaver-exit');
getById('screensaver-prompt');
getById('screensaver-timer');
getById('screensaver-aspect');
getById('screensaver-model');
getById('screensaver-transition-duration');
getById('screensaver-enhance');
getById('screensaver-private');

// Ensure critical scripts are part of the final page payload
const scriptSrcs = Array.from(document.querySelectorAll('script[src]'), (el) => el.getAttribute('src'));
[
  'screensaver.js',
  'storage.js',
  'memory-api.js',
  'chat-core.js',
  'ui.js',
  'chat-storage.js',
  'chat-init.js',
  'simple.js'
].forEach((src) => {
  assert.ok(scriptSrcs.includes(src), `Expected script ${src} to be referenced by index.html`);
});

console.log('✅ Application UI structure and critical script references verified.');
