/* global marked, DOMPurify, Prism */
'use strict';

const STORAGE_KEYS = {
  theme: 'unity-theme',
  memories: 'unity-memories',
  history: 'unity-history',
  preferences: 'unity-preferences'
};

const FALLBACK_MODELS = [
  { id: 'openai', label: 'OpenAI (GPT-4o mini)' },
  { id: 'mistral', label: 'Mistral' },
  { id: 'llama', label: 'LLaMA Fusion' },
  { id: 'deepseek', label: 'DeepSeek' },
  { id: 'claude-hybridspace', label: 'Claude HybridSpace' }
];

const FALLBACK_VOICES = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];

const API_ENDPOINT = 'https://text.pollinations.ai/openai';
const MODELS_ENDPOINT = 'https://text.pollinations.ai/models';
const API_REFERRER = 'www.unityailab.com';
const LOCAL_MODELS_PATH = 'data/models.json';

const API_SEED_LENGTH = 8;
let cryptoSeedWarningLogged = false;

function sanitizeToken(value) {
  if (typeof value !== 'string') {
    return '';
  }
  const trimmed = value.trim();
  if (!trimmed || trimmed.includes('POLLINATIONS_TOKEN')) {
    return '';
  }
  return trimmed;
}

function readMetaContent(name) {
  if (typeof document === 'undefined') {
    return '';
  }
  const meta = document.querySelector(`meta[name="${name}"]`);
  return meta?.getAttribute('content')?.trim() || '';
}

function resolvePollinationsToken() {
  if (typeof window === 'undefined') {
    return '';
  }

  const directCandidates = [
    window.POLLINATIONS_TOKEN,
    window.__POLLINATIONS_TOKEN__,
    window.__UNITY_CONFIG__?.pollinationsToken,
    window.__ENV__?.POLLINATIONS_TOKEN
  ];

  for (const candidate of directCandidates) {
    const sanitized = sanitizeToken(candidate);
    if (sanitized) {
      return sanitized;
    }
  }

  if (typeof document !== 'undefined') {
    const datasetToken = sanitizeToken(document.documentElement?.dataset?.pollinationsToken);
    if (datasetToken) {
      return datasetToken;
    }

    const metaToken = sanitizeToken(readMetaContent('pollinations-token'));
    if (metaToken) {
      return metaToken;
    }
  }

  return '';
}

function generateSeed() {
  const fallbackSeed = '23456789';

  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    try {
      const buffer = new Uint32Array(1);
      crypto.getRandomValues(buffer);
      const digits = buffer[0].toString().padStart(API_SEED_LENGTH, '0');
      if (digits.length >= API_SEED_LENGTH) {
        return digits.slice(-API_SEED_LENGTH);
      }
    } catch (error) {
      if (!cryptoSeedWarningLogged) {
        console.warn('Unable to generate cryptographic seed, falling back to Math.random()', error);
        cryptoSeedWarningLogged = true;
      }
    }
  }

  const randomSeed = Math.floor(Math.random() * 10 ** API_SEED_LENGTH)
    .toString()
    .padStart(API_SEED_LENGTH, '0');

  return randomSeed || fallbackSeed;
}

const API_TOKEN = resolvePollinationsToken();

const DEFAULT_THEME_ID = 'light';
const THEME_FILES = [
  'light',
  'dark',
  'oled',
  'burple',
  'cyberpunk',
  'dracula',
  'gruvbox_dark',
  'gruvbox_light',
  'hacker',
  'honeycomb',
  'material_dark',
  'material_light',
  'monokai',
  'nord',
  'ocean_breeze',
  'pastel_dream',
  'pretty_pink',
  'rainbow_throwup',
  'serenity',
  'solarized_dark',
  'solarized_light',
  'subtle_light',
  'vintage_paper'
];

function formatThemeLabel(slug) {
  return slug
    .replace(/_/g, ' ')
    .replace(/\b(\w)/g, (char) => char.toUpperCase())
    .replace(/Oled/gi, 'OLED');
}

const THEME_CATALOG = THEME_FILES.map((slug) => ({
  id: slug,
  label: formatThemeLabel(slug),
  description: ''
}));

const LEGACY_THEME_MAP = {
  'theme-light': 'light',
  'theme-dark': 'dark',
  'theme-amoled': 'oled',
  daylight: 'light',
  aurora: 'dark',
  nightfall: 'oled',
  ocean: 'ocean_breeze',
  honeycomb: 'honeycomb',
  serenity: 'serenity'
};

const state = {
  aiInstruct: '',
  history: [],
  memories: [],
  selectedModel: FALLBACK_MODELS[0].id,
  selectedVoice: FALLBACK_VOICES[0],
  selectedTheme: DEFAULT_THEME_ID,
  memoryEnabled: true,
  isSending: false,
  availableModels: [],
  availableVoices: [],
  availableThemes: THEME_CATALOG.map((theme) => ({ ...theme }))
};

const elements = {};

const formatters = {
  markdown(input) {
    if (!input) {
      return '';
    }
    const hasMarked = typeof marked !== 'undefined' && typeof marked.parse === 'function';
    const hasDomPurify = typeof DOMPurify !== 'undefined' && typeof DOMPurify.sanitize === 'function';

    if (hasMarked) {
      const rawHtml = marked.parse(input, { mangle: false, headerIds: false });
      return hasDomPurify ? DOMPurify.sanitize(rawHtml, { USE_PROFILES: { html: true } }) : rawHtml;
    }

    const escaped = input
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
    return escaped.replace(/\n/g, '<br />');
  }
};

function buildGatewayUrl(model, options = {}) {
  const url = new URL(API_ENDPOINT);

  if (model) {
    url.searchParams.set('model', model);
  }

  if (API_REFERRER) {
    url.searchParams.set('referrer', API_REFERRER);
    url.searchParams.set('referer', API_REFERRER);
  }

  if (API_TOKEN) {
    url.searchParams.set('token', API_TOKEN);
  }

  const seedOverride = typeof options.seed === 'string' ? options.seed.trim() : '';
  const seedValue = seedOverride || generateSeed();
  url.searchParams.set('seed', seedValue);

  return url.toString();
}

function buildModelsUrl(model) {
  const url = new URL(MODELS_ENDPOINT);

  if (model) {
    url.searchParams.set('model', model);
  }

  if (API_REFERRER) {
    url.searchParams.set('referrer', API_REFERRER);
    url.searchParams.set('referer', API_REFERRER);
  }

  if (API_TOKEN) {
    url.searchParams.set('token', API_TOKEN);
  }

  return url.toString();
}

function resolveThemeId(value) {
  const normalized = String(value || '').trim();
  if (!normalized) {
    return '';
  }
  const lower = normalized.toLowerCase();
  return LEGACY_THEME_MAP[lower] || normalized;
}

function findThemeById(id, collection = state.availableThemes) {
  if (!id) return null;
  const fromCollection = collection.find((theme) => theme.id === id);
  if (fromCollection) {
    return fromCollection;
  }
  return THEME_CATALOG.find((theme) => theme.id === id) || null;
}

function getThemeList() {
  return THEME_CATALOG.map((theme) => ({ ...theme }));
}

function bindElements() {
  elements.modelSelect = document.getElementById('modelSelect');
  elements.voiceSelect = document.getElementById('voiceSelect');
  elements.themeSelect = document.getElementById('themeSelect');
  elements.memoryToggle = document.getElementById('memoryToggle');
  elements.memoryList = document.getElementById('memoryList');
  elements.clearMemories = document.getElementById('clearMemories');
  elements.chatLog = document.getElementById('chatLog');
  elements.composer = document.getElementById('composer');
  elements.messageInput = document.getElementById('messageInput');
  elements.sendButton = document.getElementById('sendButton');
  elements.resetChat = document.getElementById('resetChat');
  elements.charCounter = document.getElementById('charCounter');
  elements.connectionStatus = document.getElementById('connectionStatus');
  elements.toast = document.getElementById('toast');
  elements.modelBadge = document.getElementById('modelBadge');
  elements.voiceBadge = document.getElementById('voiceBadge');
  elements.themeBadge = document.getElementById('themeBadge');
}

function configureLibraries() {
  if (window.marked) {
    marked.setOptions({
      breaks: true,
      gfm: true,
      mangle: false,
      headerIds: false
    });
  }
  if (Prism?.plugins?.autoloader) {
    Prism.plugins.autoloader.languages_path =
      'https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/';
  }
}

function initClock() {
  const clock = document.getElementById('taskbarClock');
  if (!clock) return;

  const updateClock = () => {
    const now = new Date();
    clock.textContent = now.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  updateClock();
  setInterval(updateClock, 30_000);
}

function loadStoredState() {
  try {
    const storedTheme = localStorage.getItem(STORAGE_KEYS.theme);
    if (storedTheme) {
      const resolvedTheme = resolveThemeId(storedTheme);
      if (resolvedTheme) {
        state.selectedTheme = resolvedTheme;
      }
    }

    const storedMemories = localStorage.getItem(STORAGE_KEYS.memories);
    if (storedMemories) {
      const parsed = JSON.parse(storedMemories);
      if (Array.isArray(parsed)) {
        state.memories = parsed;
      }
    }

    if (localStorage.getItem(STORAGE_KEYS.history)) {
      localStorage.removeItem(STORAGE_KEYS.history);
    }
    state.history = [];

    const preferences = localStorage.getItem(STORAGE_KEYS.preferences);
    if (preferences) {
      const parsed = JSON.parse(preferences);
      if (parsed && typeof parsed === 'object') {
        state.selectedModel = parsed.model || state.selectedModel;
        state.selectedVoice = parsed.voice || state.selectedVoice;
        state.memoryEnabled = parsed.memoryEnabled ?? state.memoryEnabled;
      }
    }
  } catch (error) {
    console.warn('Unable to load stored state', error);
  }
}

function persistState() {
  try {
    localStorage.setItem(STORAGE_KEYS.theme, state.selectedTheme);
    localStorage.setItem(STORAGE_KEYS.memories, JSON.stringify(state.memories));
    localStorage.removeItem(STORAGE_KEYS.history);
    localStorage.setItem(
      STORAGE_KEYS.preferences,
      JSON.stringify({
        model: state.selectedModel,
        voice: state.selectedVoice,
        memoryEnabled: state.memoryEnabled
      })
    );
  } catch (error) {
    console.warn('Unable to persist state', error);
  }
}

function applyTheme(themeId) {
  const themes = state.availableThemes.length ? state.availableThemes : getThemeList();
  const fallbackTheme = findThemeById(DEFAULT_THEME_ID, themes) || themes[0] || THEME_CATALOG[0];
  const targetTheme = findThemeById(themeId, themes) || fallbackTheme;

  const resolvedId = targetTheme?.id || DEFAULT_THEME_ID;
  state.selectedTheme = resolvedId;

  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', resolvedId);
  }

  if (elements.themeSelect && elements.themeSelect.options.length) {
    elements.themeSelect.value = resolvedId;
  }

  persistState();
  updateSessionSnapshot();
}

let themeStylesLoaded = false;

function ensureThemeStylesLoaded() {
  if (themeStylesLoaded || typeof document === 'undefined') {
    return;
  }
  const head = document.head || document.getElementsByTagName('head')[0];
  if (!head) return;

  THEME_CATALOG.forEach((theme) => {
    if (!document.querySelector(`link[data-theme-source="${theme.id}"]`)) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = `themes/${theme.id}.css`;
      link.dataset.themeSource = theme.id;
      head.appendChild(link);
    }
  });

  themeStylesLoaded = true;
}

function setSelectPlaceholder(select, text) {
  if (!select) return;
  select.innerHTML = '';
  const option = document.createElement('option');
  option.value = '';
  option.textContent = text;
  option.disabled = true;
  option.selected = true;
  select.appendChild(option);
  select.disabled = true;
}

function populateSelect(select, options, selectedValue, { includeMeta = false } = {}) {
  if (!select) return;
  select.innerHTML = '';

  if (!Array.isArray(options) || !options.length) {
    setSelectPlaceholder(select, 'No options available');
    return;
  }

  select.disabled = false;

  options.forEach((opt) => {
    const option = document.createElement('option');
    if (typeof opt === 'string') {
      option.value = opt;
      option.textContent = opt;
    } else if (opt && typeof opt === 'object') {
      option.value = opt.id;
      option.textContent = opt.label || opt.id;

      if (includeMeta) {
        const tierSuffix = opt.tier ? ` • Tier: ${opt.tier}` : '';
        if (opt.description) {
          option.title = `${opt.description}${tierSuffix}`.trim();
        } else if (opt.tier) {
          option.title = `Tier: ${opt.tier}`;
        }
        if (opt.tier) {
          option.dataset.tier = opt.tier;
        }
      }
    }

    if (option.value === selectedValue) {
      option.selected = true;
    }

    select.appendChild(option);
  });
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
  const voices = new Set(FALLBACK_VOICES);

  const appendModel = (entry) => {
    if (!entry || modelMap.has(entry.id)) return;
    modelMap.set(entry.id, entry);
    entry.voices.forEach((voice) => voices.add(voice));
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

  if (!modelMap.size) {
    FALLBACK_MODELS.forEach((fallback) => {
      appendModel(createModelEntry(fallback.id, fallback));
    });
  }

  const models = Array.from(modelMap.values()).sort((a, b) =>
    a.label.localeCompare(b.label, undefined, { sensitivity: 'base' })
  );
  const voiceList = Array.from(voices).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

  return { models, voices: voiceList };
}

async function loadLocalModelCatalog() {
  try {
    const response = await fetch(LOCAL_MODELS_PATH, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`Status ${response.status}`);
    }
    const data = await response.json();
    const payload = Array.isArray(data?.models) ? data.models : data;
    const normalized = normalizeModelPayload(payload);

    if (normalized && Array.isArray(data?.voices)) {
      const voiceSet = new Set([...(normalized.voices || []), ...data.voices]);
      normalized.voices = Array.from(voiceSet).sort((a, b) =>
        a.localeCompare(b, undefined, { sensitivity: 'base' })
      );
    }

    return normalized;
  } catch (error) {
    console.warn('Unable to load bundled model catalog', error.message || error);
    return null;
  }
}

async function fetchModels() {
  const localCatalog = await loadLocalModelCatalog();
  if (localCatalog?.models?.length) {
    return localCatalog;
  }

  try {
    const response = await fetch(buildModelsUrl(state.selectedModel), { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`Status ${response.status}`);
    }
    const data = await response.json();
    return normalizeModelPayload(data);
  } catch (error) {
    console.warn('Falling back to predefined models', error);
    return normalizeModelPayload(
      FALLBACK_MODELS.map((model) => ({ id: model.id, label: model.label }))
    );
  }
}

function updateSessionSnapshot() {
  const selectedModelOption = state.availableModels.find((m) => m.id === state.selectedModel);
  if (elements.modelBadge) {
    const modelLabel = selectedModelOption?.label || state.selectedModel;
    elements.modelBadge.textContent = modelLabel;
    elements.modelBadge.title = selectedModelOption?.description || modelLabel;
  }
  if (elements.voiceBadge) {
    elements.voiceBadge.textContent = state.selectedVoice;
    elements.voiceBadge.title = state.selectedVoice;
  }
  if (elements.themeBadge) {
    const theme = findThemeById(state.selectedTheme);
    const themeLabel = theme?.label || state.selectedTheme;
    elements.themeBadge.textContent = themeLabel;
    elements.themeBadge.title = theme?.description || themeLabel;
  }
}

function renderMemories() {
  elements.memoryList.innerHTML = '';
  if (!state.memories.length) {
    const placeholder = document.createElement('li');
    placeholder.textContent = 'No saved memories yet.';
    placeholder.classList.add('empty');
    elements.memoryList.appendChild(placeholder);
    return;
  }

  state.memories.slice(-10).forEach((memory) => {
    const item = document.createElement('li');
    item.textContent = memory;
    elements.memoryList.appendChild(item);
  });
}

function setConnectionStatus(text, variant = 'idle') {
  if (!elements.connectionStatus) return;
  elements.connectionStatus.textContent = text;
  elements.connectionStatus.dataset.status = variant;
}

function trimHistory() {
  const limit = 60;
  if (state.history.length > limit) {
    state.history = state.history.slice(-limit);
  }
}

function trimMemories() {
  const limit = 50;
  if (state.memories.length > limit) {
    state.memories = state.memories.slice(-limit);
  }
}

function showToast(message, variant = 'info', duration = 3200) {
  if (!elements.toast) return;
  elements.toast.textContent = message;
  elements.toast.classList.remove('success', 'error');
  if (variant === 'success') {
    elements.toast.classList.add('success');
  } else if (variant === 'error') {
    elements.toast.classList.add('error');
  }
  elements.toast.hidden = false;
  window.setTimeout(() => {
    elements.toast.hidden = true;
  }, duration);
}

function createAvatar(role) {
  const avatar = document.createElement('div');
  avatar.className = 'chat-avatar';
  avatar.textContent = role === 'assistant' ? '🤖' : '🧑🏻';
  return avatar;
}

function formatTimestamp(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function parseStructuredContent(content) {
  const workingContent = { text: content || '', codeBlocks: [], images: [], memories: [] };
  if (!content) {
    return workingContent;
  }

  const memoryPattern = /\[memory\]([\s\S]*?)\[\/memory\]/gi;
  workingContent.text = workingContent.text.replace(memoryPattern, (_, memoryBody) => {
    if (memoryBody) {
      workingContent.memories.push(memoryBody.trim());
    }
    return '';
  });

  const imagePattern = /\[IMAGE\]([\s\S]*?)\[\/IMAGE\]/gi;
  workingContent.text = workingContent.text.replace(imagePattern, (_, url) => {
    if (url) {
      workingContent.images.push(url.trim());
    }
    return '';
  });

  const codePattern = /\[CODE\]([\s\S]*?)\[\/CODE\]/gi;
  workingContent.text = workingContent.text.replace(codePattern, (_, codeBody) => {
    if (!codeBody) return '';
    const tripleMatch = codeBody.match(/```(\w+)?\n([\s\S]*?)```/);
    if (tripleMatch) {
      const [, language = '', rawCode = ''] = tripleMatch;
      workingContent.codeBlocks.push({
        language: language.trim().toLowerCase(),
        code: rawCode.trim()
      });
    } else {
      workingContent.codeBlocks.push({ language: '', code: codeBody.trim() });
    }
    return '';
  });

  workingContent.text = workingContent.text.trim();
  return workingContent;
}

function appendChatMessage(message) {
  if (!elements.chatLog) return;
  const placeholder = elements.chatLog.querySelector('.chat-empty');
  if (placeholder) {
    placeholder.remove();
  }
  const row = document.createElement('div');
  row.className = `chat-message ${message.role}`;

  const avatar = createAvatar(message.role);
  const bubble = document.createElement('div');
  bubble.className = 'chat-bubble';

  const content = parseStructuredContent(message.content);

  if (content.text) {
    const textWrapper = document.createElement('div');
    textWrapper.className = 'chat-text';
    textWrapper.innerHTML = formatters.markdown(content.text);
    bubble.appendChild(textWrapper);
  }

  content.images.forEach((url) => {
    if (!/^https?:\/\//i.test(url)) return;
    const image = document.createElement('img');
    image.src = url;
    image.alt = 'AI generated illustration';
    bubble.appendChild(image);
  });

  content.codeBlocks.forEach(({ language, code }) => {
    const pre = document.createElement('pre');
    const codeEl = document.createElement('code');
    if (language) {
      codeEl.className = `language-${language}`;
    }
    codeEl.textContent = code;
    pre.appendChild(codeEl);
    bubble.appendChild(pre);
    if (typeof Prism !== 'undefined' && typeof Prism.highlightElement === 'function') {
      Prism.highlightElement(codeEl);
    }
  });

  if (content.memories.length) {
    const memoryWrapper = document.createElement('div');
    memoryWrapper.className = 'chat-meta';
    memoryWrapper.textContent = `Stored memories: ${content.memories.join(' | ')}`;
    bubble.appendChild(memoryWrapper);
  }

  const meta = document.createElement('div');
  meta.className = 'chat-meta';
  meta.textContent = formatTimestamp(message.timestamp);
  bubble.appendChild(meta);

  if (message.role === 'assistant') {
    row.appendChild(avatar);
    row.appendChild(bubble);
  } else {
    row.appendChild(bubble);
    row.appendChild(avatar);
  }

  elements.chatLog.appendChild(row);
  elements.chatLog.scrollTop = elements.chatLog.scrollHeight;
}

function renderChat() {
  if (!elements.chatLog) return;
  elements.chatLog.innerHTML = '';
  if (!state.history.length) {
    return;
  }
  state.history.forEach((message) => appendChatMessage(message));
}

function updateCharCounter() {
  if (!elements.charCounter || !elements.messageInput) return;
  const length = elements.messageInput.value.trim().length;
  elements.charCounter.textContent = `${length} character${length === 1 ? '' : 's'}`;
}

function autoResizeTextarea() {
  if (!elements.messageInput) return;
  elements.messageInput.style.height = 'auto';
  elements.messageInput.style.height = `${elements.messageInput.scrollHeight}px`;
}

function handleThemeChange(event) {
  const themeId = event.target.value;
  if (!themeId) return;
  applyTheme(themeId);
  const theme = findThemeById(themeId);
  if (theme) {
    showToast(`Theme set to ${theme.label}.`, 'info', 2200);
  }
}

function handleModelChange(event) {
  state.selectedModel = event.target.value;
  updateSessionSnapshot();
  persistState();
}

function handleVoiceChange(event) {
  state.selectedVoice = event.target.value;
  updateSessionSnapshot();
  persistState();
}

function handleMemoryToggle(event) {
  state.memoryEnabled = Boolean(event.target.checked);
  persistState();
  showToast(state.memoryEnabled ? 'Memories will be recorded.' : 'Memory sync paused.', 'info');
}

function clearMemories() {
  state.memories = [];
  renderMemories();
  persistState();
  showToast('All memories cleared.', 'info');
}

function resetChat() {
  state.history = [];
  renderChat();
  persistState();
  showToast('Conversation reset.', 'info');
}

function buildSystemPrompt() {
  const theme = findThemeById(state.selectedTheme);
  const themeLabel = theme?.label || 'Daylight';
  const memoryBlock = state.memories.slice(-10).map((memory) => `[memory]${memory}[/memory]`).join('\n');
  const memoryCopy = state.memories.slice(-10).map((memory, index) => `${index + 1}. ${memory}`).join('\n');

  return [
    state.aiInstruct,
    '---',
    'Session parameters:',
    `- Active theme: ${themeLabel}`,
    `- Preferred voice: ${state.selectedVoice}`,
    `- Selected model: ${state.selectedModel}`,
    state.memoryEnabled && memoryBlock
      ? `Memories provided by the workspace (with plain copies):\n${memoryBlock}\nPlain list:\n${memoryCopy}`
      : 'No memories are currently shared for this session.',
    'Always include any generated code between [CODE] markers with fenced language blocks, image URLs between [IMAGE] markers, ' +
      'and new long-term memories between [memory] markers as described.'
  ]
    .filter(Boolean)
    .join('\n');
}

function buildPayload() {
  const historySlice = state.history.slice(-10).map(({ role, content }) => ({ role, content }));
  return {
    model: state.selectedModel,
    voice: state.selectedVoice,
    private: true,
    messages: [{ role: 'system', content: buildSystemPrompt() }, ...historySlice]
  };
}

async function sendMessage(event) {
  event.preventDefault();
  if (state.isSending) return;

  const userInput = elements.messageInput.value.trim();
  if (!userInput) return;

  const userMessage = {
    role: 'user',
    content: userInput,
    timestamp: new Date().toISOString()
  };

  state.history.push(userMessage);
  trimHistory();
  appendChatMessage(userMessage);
  persistState();

  elements.messageInput.value = '';
  updateCharCounter();
  autoResizeTextarea();

  state.isSending = true;
  elements.sendButton.disabled = true;
  setConnectionStatus('Contacting Pollinations…', 'busy');

  try {
    const payload = buildPayload();
    const response = await fetch(buildGatewayUrl(state.selectedModel), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Request failed: ${response.status}`);
    }

    const data = await response.json();
    const assistantContent =
      data?.choices?.[0]?.message?.content || data?.message || 'The assistant returned an empty response.';

    const assistantMessage = {
      role: 'assistant',
      content: assistantContent,
      timestamp: new Date().toISOString()
    };

    state.history.push(assistantMessage);
    trimHistory();
    appendChatMessage(assistantMessage);

    const parsed = parseStructuredContent(assistantContent);
    if (state.memoryEnabled && parsed.memories.length) {
      parsed.memories.forEach((memory) => {
        if (!state.memories.includes(memory)) {
          state.memories.push(memory);
        }
      });
      trimMemories();
      renderMemories();
    }

    persistState();
    showToast('Assistant replied.', 'success');
    setConnectionStatus('Idle', 'idle');
  } catch (error) {
    console.error(error);
    showToast('Unable to reach Pollinations. Please try again.', 'error');
    setConnectionStatus('Error', 'error');

    const errorMessage = {
      role: 'assistant',
      content: 'I could not reach the Pollinations API just now. Please retry in a moment.',
      timestamp: new Date().toISOString()
    };

    state.history.push(errorMessage);
    trimHistory();
    appendChatMessage(errorMessage);
    persistState();
  } finally {
    state.isSending = false;
    elements.sendButton.disabled = false;
    if (elements.messageInput) {
      elements.messageInput.focus({ preventScroll: true });
    }
  }
}

function handleKeyboardSubmit(event) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    elements.composer.requestSubmit();
  }
}

async function initialize() {
  bindElements();
  configureLibraries();
  initClock();
  loadStoredState();
  ensureThemeStylesLoaded();

  setSelectPlaceholder(elements.modelSelect, 'Loading models…');
  setSelectPlaceholder(elements.voiceSelect, 'Loading voices…');
  setSelectPlaceholder(elements.themeSelect, 'Loading themes…');

  applyTheme(state.selectedTheme);

  const preferencesLoaded = state.memoryEnabled;
  elements.memoryToggle.checked = preferencesLoaded;

  try {
    const response = await fetch('ai-instruct.txt', { cache: 'no-store' });
    if (response.ok) {
      state.aiInstruct = (await response.text()).trim();
    } else {
      throw new Error(`Failed to fetch ai-instruct.txt: ${response.status}`);
    }
  } catch (error) {
    console.error(error);
    state.aiInstruct = 'You are a helpful assistant.';
    showToast('Could not load ai-instruct.txt, using a fallback prompt.', 'error');
  }

  const themes = getThemeList();
  state.availableThemes = themes;
  if (!findThemeById(state.selectedTheme, state.availableThemes)) {
    state.selectedTheme = findThemeById(DEFAULT_THEME_ID, state.availableThemes)?.id
      || state.availableThemes[0]?.id
      || DEFAULT_THEME_ID;
  }
  populateSelect(elements.themeSelect, state.availableThemes, state.selectedTheme);
  applyTheme(state.selectedTheme);

  const { models, voices } = await fetchModels();
  const textModels = models.filter((model) => model.supportsText !== false);
  state.availableModels = textModels.length ? textModels : models;
  state.availableVoices = voices.length ? voices : [...FALLBACK_VOICES];

  if (!state.availableModels.find((model) => model.id === state.selectedModel)) {
    state.selectedModel = state.availableModels[0]?.id || state.selectedModel;
  }

  if (!state.availableVoices.includes(state.selectedVoice)) {
    state.selectedVoice = state.availableVoices[0] || state.selectedVoice;
  }

  populateSelect(elements.modelSelect, state.availableModels, state.selectedModel, { includeMeta: true });
  populateSelect(elements.voiceSelect, state.availableVoices, state.selectedVoice);

  elements.memoryToggle.checked = state.memoryEnabled;

  renderChat();
  renderMemories();
  updateSessionSnapshot();
  updateCharCounter();
  autoResizeTextarea();
  setConnectionStatus('Idle', 'idle');

  elements.modelSelect.addEventListener('change', handleModelChange);
  elements.voiceSelect.addEventListener('change', handleVoiceChange);
  elements.themeSelect.addEventListener('change', handleThemeChange);
  elements.memoryToggle.addEventListener('change', handleMemoryToggle);
  elements.clearMemories.addEventListener('click', clearMemories);
  elements.resetChat.addEventListener('click', resetChat);
  elements.messageInput.addEventListener('input', () => {
    updateCharCounter();
    autoResizeTextarea();
  });
  elements.messageInput.addEventListener('keydown', handleKeyboardSubmit);
  elements.composer.addEventListener('submit', sendMessage);
}

document.addEventListener('DOMContentLoaded', initialize);
