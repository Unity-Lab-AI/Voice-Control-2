const DEFAULT_TEXT_MODEL = 'unity';
const DEFAULT_TTS_MODEL = 'openai-audio';

function sanitizeForTts(text) {
  if (!text) return '';
  const compact = String(text).replace(/\s+/g, ' ').trim();
  if (compact.length <= 380) {
    return compact;
  }
  return `${compact.slice(0, 377)}...`;
}

function createTtsUrl(text, voice = 'nova', { model = DEFAULT_TTS_MODEL } = {}) {
  const sanitized = sanitizeForTts(text);
  const encoded = encodeURIComponent(sanitized);
  const url = new URL(`https://text.pollinations.ai/${encoded}`);
  if (model) {
    url.searchParams.set('model', model);
  }
  if (voice) {
    url.searchParams.set('voice', voice);
  }
  return url.toString();
}

function buildOpenAiUrl(model = DEFAULT_TEXT_MODEL) {
  const url = new URL('https://text.pollinations.ai/openai');
  if (model) {
    url.searchParams.set('model', model);
  }
  return url.toString();
}

const DEFAULT_OPENAI_OPTIONS = {
  temperature: 0.8,
  max_output_tokens: 300,
  top_p: 0.95,
  presence_penalty: 0,
  frequency_penalty: 0,
  stream: false
};

function createOpenAiPayload(messages, options = {}) {
  if (!Array.isArray(messages)) {
    throw new TypeError('messages must be an array');
  }

  const {
    model = DEFAULT_TEXT_MODEL,
    temperature = DEFAULT_OPENAI_OPTIONS.temperature,
    max_output_tokens = DEFAULT_OPENAI_OPTIONS.max_output_tokens,
    top_p = DEFAULT_OPENAI_OPTIONS.top_p,
    presence_penalty = DEFAULT_OPENAI_OPTIONS.presence_penalty,
    frequency_penalty = DEFAULT_OPENAI_OPTIONS.frequency_penalty,
    stream = DEFAULT_OPENAI_OPTIONS.stream
  } = options;

  return {
    model,
    messages,
    temperature,
    max_output_tokens,
    top_p,
    presence_penalty,
    frequency_penalty,
    stream
  };
}

module.exports = {
  DEFAULT_TEXT_MODEL,
  DEFAULT_TTS_MODEL,
  DEFAULT_OPENAI_OPTIONS,
  sanitizeForTts,
  createTtsUrl,
  buildOpenAiUrl,
  createOpenAiPayload
};
