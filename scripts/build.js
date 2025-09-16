#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const THEMES_DIR = path.join(ROOT, 'themes');
const DIST_DATA_DIR = path.join(DIST, 'data');
const API_ROOT = 'https://text.pollinations.ai';
const MODELS_ENDPOINT = `${API_ROOT}/models`;
const BUILD_REFERRER = 'unity-chat.build';

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function copyFile(from, to) {
  ensureDir(path.dirname(to));
  fs.copyFileSync(from, to);
}

function copyDirectory(from, to) {
  if (!fs.existsSync(from)) return;
  ensureDir(to);
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const source = path.join(from, entry.name);
    const destination = path.join(to, entry.name);
    if (entry.isDirectory()) {
      copyDirectory(source, destination);
    } else if (entry.isFile()) {
      copyFile(source, destination);
    }
  }
}

async function fetchRemoteModels(token) {
  if (!token) return null;

  const url = new URL(MODELS_ENDPOINT);
  url.searchParams.set('referrer', BUILD_REFERRER);
  url.searchParams.set('token', token);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch Pollinations models: ${response.status} ${response.statusText}`);
  }

  const payload = await response.json();
  return {
    generatedAt: new Date().toISOString(),
    source: url.toString(),
    models: payload
  };
}

async function writeModelCatalog(token) {
  ensureDir(DIST_DATA_DIR);

  if (!token) {
    console.warn('No Pollinations token provided. Skipping model catalog bundling.');
    return;
  }

  const outputPath = path.join(DIST_DATA_DIR, 'models.json');

  try {
    const catalog = await fetchRemoteModels(token);
    fs.writeFileSync(outputPath, JSON.stringify(catalog, null, 2));
    console.log('Wrote Pollinations model catalog to dist/data/models.json');
  } catch (error) {
    console.warn('Unable to fetch Pollinations model catalog with token:', error.message);
  }
}

async function main() {
  fs.rmSync(DIST, { recursive: true, force: true });
  ensureDir(DIST);

  const files = ['index.html', 'styles.css', 'script.js', 'ai-instruct.txt'];
  files.forEach((file) => {
    copyFile(path.join(ROOT, file), path.join(DIST, file));
  });

  copyDirectory(path.join(ROOT, 'assets'), path.join(DIST, 'assets'));
  copyDirectory(THEMES_DIR, path.join(DIST, 'themes'));
  await writeModelCatalog(process.env.POLLINATIONS_TOKEN?.trim());

  console.log('Build output prepared at', DIST);
}

main().catch((error) => {
  console.error('Build failed:', error);
  process.exitCode = 1;
});
