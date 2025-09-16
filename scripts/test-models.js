#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const API_ROOT = 'https://text.pollinations.ai';
const MODELS_ENDPOINT = `${API_ROOT}/models`;
const OPENAI_ENDPOINT = `${API_ROOT}/openai`;
const REPORT_DIR = path.resolve(__dirname, '..', 'reports');
const REPORT_PATH = path.join(REPORT_DIR, 'model-responses.json');
const STEP_SUMMARY_TITLE = 'Model response verification';
const REQUEST_DELAY_MS = Number.parseInt(process.env.MODEL_TEST_DELAY_MS || '1200', 10);

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function createModelEntry(id, details = {}) {
  if (!id) return null;

  const friendlyName = (details.description || details.title || details.label || details.name || '').trim();
  const includesId = friendlyName && friendlyName.toLowerCase().includes(String(id).toLowerCase());
  const label = friendlyName ? (includesId ? friendlyName : `${friendlyName} (${id})`) : id;
  const tier = details.tier || (details.community ? 'community' : '');
  const voices = Array.isArray(details.voices)
    ? details.voices
        .map((voice) => (typeof voice === 'string' ? voice.trim() : voice?.id?.trim?.()))
        .filter((voice) => Boolean(voice))
    : [];
  const outputModalities = Array.isArray(details.output_modalities)
    ? details.output_modalities
        .map((modality) => (typeof modality === 'string' ? modality.toLowerCase() : ''))
        .filter(Boolean)
    : [];
  const supportsText = !outputModalities.length || outputModalities.includes('text');

  return {
    id,
    label,
    description: friendlyName,
    tier,
    voices,
    supportsText
  };
}

function normalizeModelPayload(payload) {
  const modelMap = new Map();

  const appendModel = (entry) => {
    if (!entry || modelMap.has(entry.id)) return;
    modelMap.set(entry.id, entry);
  };

  if (Array.isArray(payload)) {
    payload.forEach((item) => {
      if (typeof item === 'string') {
        appendModel(createModelEntry(item));
      } else if (item && typeof item === 'object') {
        const id = item.id || item.name || item.model;
        appendModel(createModelEntry(id, item));
      }
    });
  } else if (payload && typeof payload === 'object') {
    Object.entries(payload).forEach(([id, details]) => {
      if (typeof details === 'string') {
        appendModel(createModelEntry(id, { description: details }));
      } else {
        appendModel(createModelEntry(id, details || {}));
      }
    });
  }

  return Array.from(modelMap.values());
}

function resolveHeaders() {
  const headers = {
    'Content-Type': 'application/json',
    'User-Agent': 'UnityCopilotStudio-ModelTest/1.0'
  };

  const token = process.env.POLLINATIONS_TOKEN?.trim();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText} ${body}`.trim());
  }
  return response.json();
}

function buildPayload(model) {
  const payload = {
    model: model.id,
    messages: [
      {
        role: 'system',
        content: 'You are a quality assurance assistant validating Pollinations model connectivity.'
      },
      {
        role: 'user',
        content: 'Provide a short confirmation (max 25 words) that you are reachable for integration tests.'
      }
    ],
    private: true,
    temperature: 0
  };

  if (model.voices && model.voices.length) {
    payload.voice = model.voices[0];
  }

  return payload;
}

async function delay(ms) {
  if (!ms) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function testModel(model, headers) {
  const payload = buildPayload(model);
  const startedAt = Date.now();
  const result = {
    id: model.id,
    label: model.description || model.label || model.id,
    tier: model.tier || null
  };

  try {
    const response = await fetch(OPENAI_ENDPOINT, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });
    result.status = response.status;
    result.latencyMs = Date.now() - startedAt;

    let data;
    try {
      data = await response.json();
    } catch (parseError) {
      result.success = false;
      result.error = `Unable to parse JSON response: ${parseError.message}`;
      return result;
    }

    const choice = data?.choices?.[0]?.message || {};
    const text = typeof choice.content === 'string' ? choice.content.trim() : '';
    const audio = choice.audio;

    if (response.ok && (text || audio)) {
      result.success = true;
      if (text) {
        result.preview = text.slice(0, 200);
      }
      if (audio) {
        result.outputType = 'audio';
      } else {
        result.outputType = 'text';
      }
    } else {
      result.success = false;
      result.error = data?.error?.message || 'Response missing expected content.';
      result.raw = data;
    }
  } catch (error) {
    result.success = false;
    result.error = error.message;
  }

  return result;
}

function logResult(result) {
  const statusIcon = result.success ? '✅' : '❌';
  const tierInfo = result.tier ? ` [tier:${result.tier}]` : '';
  const note = result.success
    ? `${result.outputType || 'unknown'} • ${result.latencyMs ?? '?'}ms`
    : result.error;
  console.log(`${statusIcon} ${result.id}${tierInfo} → ${note}`);
}

function writeStepSummary(summary) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) return;

  const lines = [
    `### ${STEP_SUMMARY_TITLE}`,
    `* Total models tested: ${summary.total}`,
    `* Passed: ${summary.passed}`,
    `* Failed: ${summary.failed}`,
    '',
    '| Model | Status | Latency (ms) | Notes |',
    '| --- | --- | --- | --- |'
  ];

  summary.results.forEach((result) => {
    const status = result.success ? '✅' : '❌';
    const latency = result.latencyMs ?? '—';
    const note = result.success ? result.outputType || 'text' : (result.error || '').replace(/\|/g, '\\|');
    lines.push(`| \`${result.id}\` | ${status} | ${latency} | ${note || 'n/a'} |`);
  });

  fs.appendFileSync(summaryPath, `${lines.join('\n')}\n`);
}

async function main() {
  ensureDir(REPORT_DIR);

  const headers = resolveHeaders();
  const modelsPayload = await fetchJson(MODELS_ENDPOINT, { headers });
  const models = normalizeModelPayload(modelsPayload)
    .filter((model) => model?.id)
    .filter((model) => model.supportsText !== false);

  if (!models.length) {
    throw new Error('No testable models were discovered.');
  }

  const results = [];
  for (let index = 0; index < models.length; index += 1) {
    const model = models[index];
    const result = await testModel(model, headers);
    logResult(result);
    results.push(result);
    if (index < models.length - 1) {
      await delay(REQUEST_DELAY_MS);
    }
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    total: results.length,
    passed: results.filter((item) => item.success).length,
    failed: results.filter((item) => !item.success).length,
    results
  };

  fs.writeFileSync(REPORT_PATH, JSON.stringify(summary, null, 2));
  console.log(`Model response report written to ${REPORT_PATH}`);
  writeStepSummary(summary);

  if (summary.failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('Model verification failed:', error);
  process.exitCode = 1;
});

