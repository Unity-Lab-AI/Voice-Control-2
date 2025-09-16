#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const REPORT_DIR = path.resolve(__dirname, '..', 'reports');
const MODEL_REPORT_PATH = path.join(REPORT_DIR, 'model-responses.json');
const ARTIFACT_REPORT_PATH = path.join(REPORT_DIR, 'artifact-integrity.json');
const SUMMARY_PATH = path.join(REPORT_DIR, 'summary.md');

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function safeReadJson(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    return { error: `Unable to parse ${path.basename(filePath)}: ${error.message}` };
  }
}

function renderModelSection(report) {
  if (!report) {
    return ['## Model response verification', '', '_No model report available._'];
  }

  if (report.error) {
    return ['## Model response verification', '', `⚠️ ${report.error}`];
  }

  const lines = [
    '## Model response verification',
    '',
    `- Total models tested: **${report.total ?? report.results?.length ?? 0}**`,
    `- Passed: **${report.passed ?? 0}**`,
    `- Failed: **${report.failed ?? 0}**`,
    ''
  ];

  if (Array.isArray(report.results) && report.results.length) {
    lines.push('| Model | Status | Output | Latency (ms) | Note |');
    lines.push('| --- | --- | --- | --- | --- |');
    report.results.forEach((result) => {
      const status = result.success ? '✅' : '❌';
      const output = result.outputType || 'n/a';
      const latency = result.latencyMs ?? '—';
      const note = result.success ? (result.tier || '') : (result.error || '').replace(/\|/g, '\\|');
      lines.push(`| \`${result.id}\` | ${status} | ${output} | ${latency} | ${note || '—'} |`);
    });
  }

  return lines;
}

function renderArtifactSection(report) {
  if (!report) {
    return ['## Artifact verification', '', '_No artifact report available._'];
  }

  if (report.error) {
    return ['## Artifact verification', '', `⚠️ ${report.error}`];
  }

  const lines = [
    '## Artifact verification',
    '',
    `- Checks executed: **${report.total ?? report.results?.length ?? 0}**`,
    `- Passed: **${report.passed ?? 0}**`,
    `- Failed: **${report.failed ?? 0}**`,
    ''
  ];

  if (Array.isArray(report.results) && report.results.length) {
    lines.push('| Check | Status | Note |');
    lines.push('| --- | --- | --- |');
    report.results.forEach((result) => {
      const status = result.status === 'passed' ? '✅' : '❌';
      const note = result.status === 'passed' ? (result.detail || 'ok') : (result.error || '').replace(/\|/g, '\\|');
      lines.push(`| ${result.name} | ${status} | ${note} |`);
    });
  }

  return lines;
}

function writeStepSummary(sections) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) return;
  fs.appendFileSync(summaryPath, `${sections.join('\n')}\n`);
}

function main() {
  ensureDir(REPORT_DIR);

  const modelReport = safeReadJson(MODEL_REPORT_PATH);
  const artifactReport = safeReadJson(ARTIFACT_REPORT_PATH);

  const sections = [
    '# Unity Copilot Studio pipeline summary',
    '',
    ...renderModelSection(modelReport),
    '',
    ...renderArtifactSection(artifactReport)
  ];

  fs.writeFileSync(SUMMARY_PATH, `${sections.join('\n')}\n`);
  console.log(`Wrote aggregated summary to ${SUMMARY_PATH}`);
  writeStepSummary(sections);
}

main();

