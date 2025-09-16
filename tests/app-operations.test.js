const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const htmlPath = path.join(__dirname, '..', 'index.html');
const html = fs.readFileSync(htmlPath, 'utf8');

const dom = new JSDOM(html);
const { document } = dom.window;

function getEl(selector) {
  const el = document.querySelector(selector);
  assert.ok(el, `Expected to find element matching selector "${selector}"`);
  return el;
}

// Structural checks
const form = getEl('#call-form');
assert.strictEqual(form.tagName, 'FORM');

const phone = getEl('#phone-number');
assert.strictEqual(phone.getAttribute('type'), 'tel');

const modelSelect = getEl('#model-select');
assert.strictEqual(modelSelect.tagName, 'SELECT');

const voiceSelect = getEl('#voice-select');
assert.strictEqual(voiceSelect.tagName, 'SELECT');

const silence = getEl('#silence-threshold');
assert.strictEqual(silence.getAttribute('type'), 'number');

const timeout = getEl('#no-input-timeout');
assert.strictEqual(timeout.getAttribute('type'), 'number');

const callButton = getEl('#call-button');
assert.strictEqual(callButton.tagName, 'BUTTON');
assert.ok(callButton.classList.contains('primary'));

const resetButton = getEl('#reset-button');
assert.strictEqual(resetButton.tagName, 'BUTTON');
assert.strictEqual(resetButton.getAttribute('type'), 'reset');

// Status + preview panels
const status = getEl('#status-indicator');
assert.ok(status.classList.contains('status-indicator'));

const modelDisplay = getEl('#selected-model');
const voiceDisplay = getEl('#selected-voice');
assert.strictEqual(modelDisplay.textContent.trim(), '—');
assert.strictEqual(voiceDisplay.textContent.trim(), '—');

const eventLog = getEl('#event-log');
assert.strictEqual(eventLog.tagName, 'OL');

const plan = getEl('#call-plan');
assert.strictEqual(plan.tagName, 'TEXTAREA');
assert.ok(plan.hasAttribute('readonly'));

const twiml = getEl('#twiml-preview');
assert.strictEqual(twiml.tagName, 'TEXTAREA');
assert.ok(twiml.hasAttribute('readonly'));

// Script references
const scripts = Array.from(document.querySelectorAll('script'));
const configScript = scripts.find((script) => script.id === 'app-config');
assert.ok(configScript, 'Expected a script with id="app-config" to be present');

const moduleScript = scripts.find((script) => script.getAttribute('src') === 'app.js');
assert.ok(moduleScript, 'Expected index.html to include app.js');
assert.strictEqual(moduleScript.getAttribute('type'), 'module');

console.log('✅ Unity Call Me static UI validated');
