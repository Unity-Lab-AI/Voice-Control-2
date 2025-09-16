#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

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

function main() {
  fs.rmSync(DIST, { recursive: true, force: true });
  ensureDir(DIST);

  const files = ['index.html', 'styles.css', 'script.js', 'ai-instruct.txt'];
  files.forEach((file) => {
    copyFile(path.join(ROOT, file), path.join(DIST, file));
  });

  copyDirectory(path.join(ROOT, 'assets'), path.join(DIST, 'assets'));

  console.log('Build output prepared at', DIST);
}

main();
