#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const REPORT_DIR = path.join(ROOT, 'reports');
const REPORT_PATH = path.join(REPORT_DIR, 'artifact-integrity.json');
const STEP_SUMMARY_TITLE = 'Artifact verification';

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function readFile(relPath) {
  const filePath = path.join(DIST, relPath);
  assert(fs.existsSync(filePath), `Expected ${relPath} to be present in dist.`);
  return fs.readFileSync(filePath, 'utf8');
}

function buildStepSummary(results) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) return;

  const passed = results.filter((item) => item.status === 'passed').length;
  const failed = results.length - passed;

  const lines = [
    `### ${STEP_SUMMARY_TITLE}`,
    `* Checks passed: ${passed}`,
    `* Checks failed: ${failed}`,
    '',
    '| Check | Status | Notes |',
    '| --- | --- | --- |'
  ];

  results.forEach((item) => {
    const status = item.status === 'passed' ? '✅' : '❌';
    const note = item.status === 'passed' ? (item.detail || 'ok') : item.error;
    lines.push(`| ${item.name} | ${status} | ${note.replace(/\|/g, '\\|')} |`);
  });

  fs.appendFileSync(summaryPath, `${lines.join('\n')}\n`);
}

function runChecks() {
  const results = [];

  const register = (name, fn) => {
    try {
      const detail = fn();
      results.push({ name, status: 'passed', detail: detail || '' });
    } catch (error) {
      results.push({ name, status: 'failed', error: error.message });
    }
  };

  register('dist directory exists', () => {
    assert(fs.existsSync(DIST) && fs.statSync(DIST).isDirectory(), 'dist directory missing.');
    return 'found';
  });

  const html = (() => {
    let content = '';
    register('index.html copied', () => {
      content = readFile('index.html');
      return 'copied';
    });
    return () => content;
  })();

  register('styles.css copied', () => readFile('styles.css') && 'copied');
  register('script.js copied', () => readFile('script.js') && 'copied');
  register('ai-instruct.txt copied', () => {
    const text = readFile('ai-instruct.txt');
    assert(text.trim().length > 0, 'ai-instruct.txt should not be empty.');
    return 'copied';
  });

  register('index.html includes model controls', () => {
    const htmlContent = html();
    ['modelSelect', 'voiceSelect', 'themeSelect', 'chatLog', 'composer'].forEach((id) => {
      assert(htmlContent.includes(`id="${id}"`), `Missing element id="${id}" in index.html.`);
    });
    return 'controls verified';
  });

  register('script.js references models endpoint', () => {
    const script = readFile('script.js');
    assert(script.includes('text.pollinations.ai/models'), 'Expected models endpoint reference in script.js');
    assert(script.includes('normalizeModelPayload'), 'normalizeModelPayload should be present.');
    assert(script.includes('setSelectPlaceholder'), 'setSelectPlaceholder should be present.');
    return 'logic verified';
  });

  register('dist directory excludes node_modules', () => {
    const children = fs.readdirSync(DIST);
    assert(!children.includes('node_modules'), 'node_modules directory should not be bundled.');
    return 'clean';
  });

  return results;
}

function summarize(results) {
  const passed = results.filter((item) => item.status === 'passed').length;
  const failed = results.length - passed;

  return {
    generatedAt: new Date().toISOString(),
    total: results.length,
    passed,
    failed,
    results
  };
}

function main() {
  ensureDir(REPORT_DIR);
  const results = runChecks();
  const summary = summarize(results);

  fs.writeFileSync(REPORT_PATH, JSON.stringify(summary, null, 2));
  console.log(`Artifact verification report written to ${REPORT_PATH}`);
  results.forEach((item) => {
    const statusIcon = item.status === 'passed' ? '✅' : '❌';
    const note = item.status === 'passed' ? item.detail || 'ok' : item.error;
    console.log(`${statusIcon} ${item.name} → ${note}`);
  });

  buildStepSummary(results);

  if (summary.failed > 0) {
    process.exitCode = 1;
  }
}

main();

