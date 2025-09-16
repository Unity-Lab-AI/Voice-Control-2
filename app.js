const config = window.__APP_CONFIG__ || {};

const DEFAULT_SYSTEM_PROMPT =
  'You are Unity, a Pollinations AI voice guide speaking over a telephone call. ' +
  'Keep your spoken replies under 220 characters, invite the caller to share more, ' +
  'and acknowledge their responses warmly. Do not mention Pollinations tokens or API mechanics.';

const state = {
  models: [],
  voiceOptions: [],
  hasSecrets: false,
  lastPlan: null
};

const elements = {
  form: document.getElementById('call-form'),
  phone: document.getElementById('phone-number'),
  context: document.getElementById('call-context'),
  modelSelect: document.getElementById('model-select'),
  voiceSelect: document.getElementById('voice-select'),
  silence: document.getElementById('silence-threshold'),
  noInput: document.getElementById('no-input-timeout'),
  systemPrompt: document.getElementById('system-prompt'),
  callButton: document.getElementById('call-button'),
  resetButton: document.getElementById('reset-button'),
  statusIndicator: document.getElementById('status-indicator'),
  selectedModel: document.getElementById('selected-model'),
  selectedVoice: document.getElementById('selected-voice'),
  callPlan: document.getElementById('call-plan'),
  twimlPreview: document.getElementById('twiml-preview'),
  credentialsWarning: document.getElementById('credentials-warning'),
  eventLog: document.getElementById('event-log')
};

if (!elements.systemPrompt.value.trim()) {
  elements.systemPrompt.value = DEFAULT_SYSTEM_PROMPT;
}

function setStatus(message, variant = 'idle') {
  const variants = ['status-indicator--idle', 'status-indicator--ready', 'status-indicator--error', 'status-indicator--pending'];
  elements.statusIndicator.classList.remove(...variants);
  elements.statusIndicator.classList.add(`status-indicator--${variant}`);
  elements.statusIndicator.textContent = message;
}

function logEvent(message, type = 'info') {
  const entry = document.createElement('li');
  const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  entry.textContent = `[${timestamp}] ${message}`;
  if (type === 'error') {
    entry.classList.add('log-item--error');
  } else if (type === 'success') {
    entry.classList.add('log-item--success');
  }
  elements.eventLog.prepend(entry);
  const maxEntries = 25;
  while (elements.eventLog.children.length > maxEntries) {
    elements.eventLog.removeChild(elements.eventLog.lastChild);
  }
}

function sanitizePhone(value) {
  return value.replace(/[^+\d]/g, '');
}

function updateSelectedIndicators() {
  const modelOption = elements.modelSelect.options[elements.modelSelect.selectedIndex];
  const voiceOption = elements.voiceSelect.options[elements.voiceSelect.selectedIndex];
  elements.selectedModel.textContent = modelOption ? modelOption.textContent : '—';
  elements.selectedVoice.textContent = voiceOption ? voiceOption.textContent : '—';
}

function updateCallButtonState() {
  const phone = sanitizePhone(elements.phone.value).trim();
  const model = elements.modelSelect.value;
  const voice = elements.voiceSelect.value;
  const hasRequiredInputs = Boolean(phone && model && voice);
  elements.callButton.disabled = !(state.hasSecrets && hasRequiredInputs);
}

function updateCredentialsStatus() {
  const requiredKeys = ['twilioAccountSid', 'twilioAuthToken', 'twilioPhoneNumber'];
  state.hasSecrets = requiredKeys.every((key) => typeof config[key] === 'string' && config[key].trim().length > 0);

  if (state.hasSecrets) {
    elements.credentialsWarning.textContent =
      'Twilio credentials detected. Enter a phone number and press “Call me” to trigger the Unity bridge.';
    setStatus('Ready when you are.', 'ready');
  } else {
    elements.credentialsWarning.textContent =
      'Waiting for GitHub Actions secrets (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER). Calls remain disabled.';
    setStatus('Secrets required before calling.', 'idle');
  }

  updateCallButtonState();
}

function populateModelSelect(models) {
  elements.modelSelect.innerHTML = '';
  const docFrag = document.createDocumentFragment();
  let appended = 0;
  const textModels = models.filter((model) => Array.isArray(model.output_modalities) && model.output_modalities.includes('text'));
  const sorted = textModels.sort((a, b) => a.name.localeCompare(b.name));

  sorted.forEach((model) => {
    const option = document.createElement('option');
    option.value = model.name;
    const label = model.description ? `${model.name} — ${model.description}` : model.name;
    option.textContent = label;
    if (model.name === 'unity') {
      option.selected = true;
    }
    docFrag.append(option);
    appended += 1;
  });

  if (!appended) {
    const option = document.createElement('option');
    option.textContent = 'No Pollinations text models available';
    option.disabled = true;
    docFrag.append(option);
  }

  elements.modelSelect.append(docFrag);
  updateSelectedIndicators();
  updateCallButtonState();
}

function populateVoiceSelect(models) {
  elements.voiceSelect.innerHTML = '';
  const voicesFromOpenAi = models.find((model) => model.name === 'openai-audio');
  const voiceList = Array.isArray(voicesFromOpenAi?.voices) ? voicesFromOpenAi.voices : ['nova', 'alloy', 'onyx'];
  state.voiceOptions = voiceList;

  const fragment = document.createDocumentFragment();
  voiceList.forEach((voice) => {
    const option = document.createElement('option');
    option.value = voice;
    option.textContent = voice;
    fragment.append(option);
  });

  elements.voiceSelect.append(fragment);
  if (voiceList.includes('nova')) {
    elements.voiceSelect.value = 'nova';
  }
  updateSelectedIndicators();
  updateCallButtonState();
}

async function loadPollinationsModels() {
  try {
    logEvent('Fetching Pollinations model catalog…');
    const response = await fetch('https://text.pollinations.ai/models');
    if (!response.ok) {
      throw new Error(`Model request failed with status ${response.status}`);
    }
    const models = await response.json();
    if (!Array.isArray(models)) {
      throw new Error('Unexpected Pollinations models response.');
    }
    state.models = models;
    populateModelSelect(models);
    populateVoiceSelect(models);
    logEvent('Pollinations models loaded.', 'success');
  } catch (error) {
    logEvent(`Unable to load Pollinations models: ${error.message}`, 'error');
    setStatus('Model fetch failed – retry?', 'error');
  }
}

function buildAudioUrl(text, voice) {
  const encoded = encodeURIComponent(text.trim());
  const url = new URL(`https://text.pollinations.ai/${encoded}`);
  url.searchParams.set('model', 'openai-audio');
  url.searchParams.set('voice', voice);
  if (config.pollinationsReferrer) {
    url.searchParams.set('referrer', config.pollinationsReferrer);
  }
  return url.toString();
}

function summarisePlan(plan) {
  const lines = [];
  if (plan.opening) lines.push(`Opening: ${plan.opening}`);
  if (plan.followUpPrompt) lines.push(`Follow up: ${plan.followUpPrompt}`);
  if (plan.acknowledgement) lines.push(`Acknowledgement: ${plan.acknowledgement}`);
  if (plan.closing) lines.push(`Closing: ${plan.closing}`);
  if (plan.reminder) lines.push(`Reminder: ${plan.reminder}`);
  return lines.join('\n\n');
}

function buildTwiml(plan, voice, silenceSeconds, noInputSeconds) {
  const pauseBetweenSegments = Math.max(1, Math.min(10, Number(silenceSeconds) || 6));
  const noInputPause = Math.max(2, Math.min(60, Number(noInputSeconds) || 12));
  const segments = [
    plan.opening,
    plan.followUpPrompt,
    plan.acknowledgement,
    plan.reminder,
    plan.closing
  ].filter(Boolean);

  if (!segments.length) {
    throw new Error('Unity plan did not include any speech segments.');
  }

  const parts = ['<?xml version="1.0" encoding="UTF-8"?>', '<Response>'];
  parts.push(`<Say voice="Polly.Joanna">Starting Unity call sequence.</Say>`);
  segments.forEach((segment, index) => {
    const url = buildAudioUrl(segment, voice);
    parts.push(`<Play>${url}</Play>`);
    if (index === 0) {
      parts.push(`<Pause length="${pauseBetweenSegments}"/>`);
    } else if (index < segments.length - 1) {
      parts.push(`<Pause length="${pauseBetweenSegments}"/>`);
    }
  });
  parts.push(`<Pause length="${noInputPause}"/>`);
  parts.push('<Say>It was great speaking with you. Goodbye!</Say>');
  parts.push('<Hangup/>');
  parts.push('</Response>');
  return parts.join('');
}

async function generateUnityPlan(modelName, context, systemPrompt) {
  const headers = { 'Content-Type': 'application/json' };
  if (config.pollinationsToken) {
    headers.Authorization = `Bearer ${config.pollinationsToken}`;
  }

  const promptContext = context?.trim() ? context.trim() : 'Provide a warm welcome and learn what the caller needs today.';

  const payload = {
    model: modelName,
    messages: [
      { role: 'system', content: `${systemPrompt}\nReturn only valid JSON.` },
      {
        role: 'user',
        content:
          'Design the next speaking plan for this live phone call. ' +
          'Reply with a JSON object containing the fields opening, followUpPrompt, acknowledgement, reminder, closing. ' +
          'Each value must be a natural spoken sentence (<=220 characters). Context: ' +
          promptContext
      }
    ],
    response_format: { type: 'json_object' },
    temperature: 0.8,
    max_output_tokens: 400,
    stream: false
  };

  const response = await fetch('https://text.pollinations.ai/openai', {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Pollinations API returned ${response.status}: ${errorText.slice(0, 160)}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('Pollinations did not include a completion.');
  }

  try {
    const parsed = JSON.parse(content);
    state.lastPlan = parsed;
    return parsed;
  } catch (error) {
    throw new Error('Pollinations response was not valid JSON.');
  }
}

function base64Encode(value) {
  if (typeof btoa === 'function') {
    return btoa(value);
  }
  return Buffer.from(value, 'utf8').toString('base64');
}

async function startTwilioCall(twiml, phoneNumber) {
  if (!state.hasSecrets) {
    throw new Error('Twilio credentials missing.');
  }

  const authPayload = `${config.twilioAccountSid}:${config.twilioAuthToken}`;
  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(config.twilioAccountSid)}/Calls.json`;
  const params = new URLSearchParams({
    To: phoneNumber,
    From: config.twilioPhoneNumber,
    Twiml: twiml
  });

  if (config.twilioStatusCallback) {
    params.append('StatusCallback', config.twilioStatusCallback);
    if (config.twilioStatusEvents) {
      params.append('StatusCallbackEvent', config.twilioStatusEvents);
    }
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${base64Encode(authPayload)}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: params
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Twilio API error ${response.status}: ${text.slice(0, 200)}`);
  }

  return response.json();
}

async function handleCall(event) {
  event.preventDefault();
  updateCallButtonState();
  if (elements.callButton.disabled) {
    return;
  }

  const phoneNumber = sanitizePhone(elements.phone.value);
  const modelName = elements.modelSelect.value;
  const voice = elements.voiceSelect.value;
  const systemPrompt = elements.systemPrompt.value.trim() || DEFAULT_SYSTEM_PROMPT;
  const context = elements.context.value;
  const silenceSeconds = elements.silence.value;
  const noInputSeconds = elements.noInput.value;

  try {
    setStatus('Preparing Unity call plan…', 'pending');
    logEvent('Contacting Pollinations to prepare the Unity speaking plan…');
    const plan = await generateUnityPlan(modelName, context, systemPrompt);
    elements.callPlan.value = summarisePlan(plan);
    logEvent('Unity speaking plan received.', 'success');

    const twiml = buildTwiml(plan, voice, silenceSeconds, noInputSeconds);
    elements.twimlPreview.value = twiml;
    logEvent('Generated TwiML for outbound call. Requesting Twilio dial-out…');

    const twilioResponse = await startTwilioCall(twiml, phoneNumber);
    logEvent(`Twilio accepted the call. SID: ${twilioResponse.sid}`, 'success');
    setStatus('Call initiated. Answer your phone!', 'ready');
  } catch (error) {
    console.error(error);
    logEvent(error.message || 'Call failed.', 'error');
    setStatus('Call failed – check the log.', 'error');
  } finally {
    updateCallButtonState();
  }
}

function handleReset() {
  elements.callPlan.value = '';
  elements.twimlPreview.value = '';
  state.lastPlan = null;
  setStatus(state.hasSecrets ? 'Ready when you are.' : 'Secrets required before calling.', state.hasSecrets ? 'ready' : 'idle');
  logEvent('Form reset. Configure a new call.');
  updateSelectedIndicators();
  updateCallButtonState();
}

function wireEvents() {
  elements.form.addEventListener('submit', handleCall);
  elements.resetButton.addEventListener('click', handleReset);
  elements.phone.addEventListener('input', updateCallButtonState);
  elements.modelSelect.addEventListener('change', () => {
    updateSelectedIndicators();
    updateCallButtonState();
  });
  elements.voiceSelect.addEventListener('change', () => {
    updateSelectedIndicators();
    updateCallButtonState();
  });
  elements.silence.addEventListener('input', updateCallButtonState);
  elements.noInput.addEventListener('input', updateCallButtonState);
}

(function init() {
  wireEvents();
  updateCredentialsStatus();
  loadPollinationsModels();
  elements.callPlan.value = 'Unity will populate this area with a speaking plan before the call starts.';
  elements.twimlPreview.value = 'Twilio TwiML preview will appear here after the plan is generated.';
  logEvent('Interface ready. Awaiting configuration.');
})();
