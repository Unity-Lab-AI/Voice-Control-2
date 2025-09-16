#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function main() {
  const runningInCI = process.env.GITHUB_ACTIONS === 'true';
  if (runningInCI) {
    assert(process.env.POLLINATIONS_TOKEN, 'POLLINATIONS_TOKEN secret must be provided in CI builds.');
  }

  const requiredFiles = ['index.html', 'styles.css', 'script.js', 'ai-instruct.txt'];
  requiredFiles.forEach((file) => {
    const resolved = path.join(ROOT, file);
    assert(fs.existsSync(resolved), `Missing required file: ${file}`);
  });

  const html = readText(path.join(ROOT, 'index.html'));
  ['modelSelect', 'voiceSelect', 'themeSelect', 'chatLog', 'composer', 'memoryList'].forEach((id) => {
    assert(html.includes(`id="${id}"`), `Expected element with id="${id}" in index.html`);
  });
  assert(
    html.includes('Pollinations conversations in a focused creative workspace'),
    'index.html should describe the Unity Chat workspace experience.'
  );

  const js = readText(path.join(ROOT, 'script.js'));
  ['API_ENDPOINT', 'buildSystemPrompt', 'parseStructuredContent', 'fetchModels'].forEach((token) => {
    assert(js.includes(token), `script.js must include ${token}.`);
  });

  const css = readText(path.join(ROOT, 'styles.css'));
  ['.taskbar', '.window', '.chat-bubble', '.memory-list'].forEach((selector) => {
    assert(css.includes(selector), `styles.css missing expected selector ${selector}`);
  });

  console.log('Validation checks passed.');
}

main();
