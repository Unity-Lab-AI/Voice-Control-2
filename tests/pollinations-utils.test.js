const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const utilsPath = path.resolve(__dirname, '../twilio-voice-app/pollinations-utils.js');
const {
  DEFAULT_TEXT_MODEL,
  DEFAULT_TTS_MODEL,
  DEFAULT_OPENAI_OPTIONS,
  sanitizeForTts,
  createTtsUrl,
  buildOpenAiUrl,
  createOpenAiPayload
} = require(utilsPath);

test('default models expose unity text model and openai-audio tts model', () => {
  assert.strictEqual(DEFAULT_TEXT_MODEL, 'unity');
  assert.strictEqual(DEFAULT_TTS_MODEL, 'openai-audio');
});

test('buildOpenAiUrl appends model query parameter', () => {
  const url = buildOpenAiUrl('unity');
  assert.strictEqual(url, 'https://text.pollinations.ai/openai?model=unity');
});

test('createOpenAiPayload returns expected structure', () => {
  const messages = [{ role: 'user', content: 'Hello' }];
  const payload = createOpenAiPayload(messages, { model: 'unity' });
  assert.deepStrictEqual(payload, {
    model: 'unity',
    messages,
    temperature: DEFAULT_OPENAI_OPTIONS.temperature,
    max_output_tokens: DEFAULT_OPENAI_OPTIONS.max_output_tokens,
    top_p: DEFAULT_OPENAI_OPTIONS.top_p,
    presence_penalty: DEFAULT_OPENAI_OPTIONS.presence_penalty,
    frequency_penalty: DEFAULT_OPENAI_OPTIONS.frequency_penalty,
    stream: DEFAULT_OPENAI_OPTIONS.stream
  });
});

test('createOpenAiPayload enforces array messages', () => {
  assert.throws(() => createOpenAiPayload(null), { name: 'TypeError' });
});

test('sanitizeForTts compacts whitespace and truncates long text', () => {
  const longText = 'Hello   world\nthis is   a   test';
  assert.strictEqual(sanitizeForTts(longText), 'Hello world this is a test');

  const repeated = 'a'.repeat(500);
  const sanitized = sanitizeForTts(repeated);
  assert.ok(sanitized.endsWith('...'));
  assert.strictEqual(sanitized.length, 380);
});

test('createTtsUrl encodes sanitized text and attaches defaults', () => {
  const url = new URL(createTtsUrl('Hello\nworld', 'nova'));
  assert.strictEqual(url.searchParams.get('model'), DEFAULT_TTS_MODEL);
  assert.strictEqual(url.searchParams.get('voice'), 'nova');
  assert.strictEqual(url.pathname, '/Hello%20world');
});
