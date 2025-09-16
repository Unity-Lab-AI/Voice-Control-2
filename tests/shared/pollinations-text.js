'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const API_ENDPOINT = 'https://text.pollinations.ai/openai';
const TEST_MODEL = 'openai';
const TEST_VOICE = 'alloy';
const TEST_PROMPT = 'Reply with a short greeting from the Unity Chat automated test suite.';

async function requestPollinationsResponse() {
  const url = new URL(API_ENDPOINT);
  url.searchParams.set('model', TEST_MODEL);

  const payload = {
    model: TEST_MODEL,
    voice: TEST_VOICE,
    private: true,
    messages: [
      { role: 'system', content: 'You are verifying the Pollinations text endpoint for Unity Chat.' },
      { role: 'user', content: TEST_PROMPT }
    ]
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  return { response, payload };
}

test('Pollinations text generation returns a non-empty message', { timeout: 20000 }, async (t) => {
  let response;
  let payload;

  try {
    ({ response, payload } = await requestPollinationsResponse());
  } catch (error) {
    const cause = error?.cause?.code || error?.cause?.errno || error?.code;
    const message = cause ? `Pollinations API unreachable (${cause}).` : 'Pollinations API unreachable.';
    t.diagnostic(message);
    t.skip(message);
    return;
  }

  if (!response.ok) {
    const message = `Pollinations API responded with status ${response.status}.`;
    t.diagnostic(message);
    t.skip(message);
    return;
  }

  let data;
  try {
    data = await response.json();
  } catch (error) {
    const message = `Unable to parse Pollinations response: ${error.message}`;
    t.diagnostic(message);
    t.skip(message);
    return;
  }

  const content = data?.choices?.[0]?.message?.content || data?.message || '';

  assert.equal(typeof content, 'string', 'Pollinations response content must be a string.');
  assert.ok(content.trim().length > 0, 'Pollinations response should not be empty.');

  t.diagnostic({
    model: payload.model,
    voice: payload.voice,
    preview: content.slice(0, 120)
  });
});
