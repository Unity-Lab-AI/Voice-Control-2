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

const API_ENDPOINT = 'https://text.pollinations.ai/openai?referrer=unity-copilot-studio.app';
const MODELS_ENDPOINT = 'https://text.pollinations.ai/models?referrer=unity-copilot-studio.app';

const state = {
  aiInstruct: '',
  history: [],
  memories: [],
  selectedModel: FALLBACK_MODELS[0].id,
  selectedVoice: FALLBACK_VOICES[0],
  selectedTheme: 'theme-light',
  memoryEnabled: true,
  isSending: false,
  availableModels: FALLBACK_MODELS,
  availableVoices: [...FALLBACK_VOICES]
};

const elements = {};

const formatters = {
  markdown(input) {
    if (!input) {
      return '';
    }
    const rawHtml = marked.parse(input, { mangle: false, headerIds: false });
    return DOMPurify.sanitize(rawHtml, { USE_PROFILES: { html: true } });
  }
};

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
      state.selectedTheme = storedTheme;
    }

    const storedMemories = localStorage.getItem(STORAGE_KEYS.memories);
    if (storedMemories) {
      const parsed = JSON.parse(storedMemories);
      if (Array.isArray(parsed)) {
        state.memories = parsed;
      }
    }

    const storedHistory = localStorage.getItem(STORAGE_KEYS.history);
    if (storedHistory) {
      const parsed = JSON.parse(storedHistory);
      if (Array.isArray(parsed)) {
        state.history = parsed;
      }
    }

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
    localStorage.setItem(STORAGE_KEYS.history, JSON.stringify(state.history));
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

function applyTheme(themeClass) {
  const themes = ['theme-light', 'theme-dark', 'theme-amoled'];
  themes.forEach((cls) => document.body.classList.remove(cls));
  document.body.classList.add(themeClass);
  state.selectedTheme = themeClass;
  elements.themeBadge.textContent =
    themeClass === 'theme-dark' ? 'Aurora Dark' : themeClass === 'theme-amoled' ? 'Nightfall AMOLED' : 'Daylight';
  persistState();
}

function populateSelect(select, options, selectedValue) {
  if (!select) return;
  select.innerHTML = '';
  options.forEach((opt) => {
    const option = document.createElement('option');
    if (typeof opt === 'string') {
      option.value = opt;
      option.textContent = opt;
    } else {
      option.value = opt.id;
      option.textContent = opt.label || opt.id;
    }
    if (option.value === selectedValue) {
      option.selected = true;
    }
    select.appendChild(option);
  });
}

async function fetchModels() {
  let data;
  try {
    const response = await fetch(MODELS_ENDPOINT, { cache: 'no-store' });
    if (response.ok) {
      data = await response.json();
    } else {
      throw new Error(`Status ${response.status}`);
    }
  } catch (error) {
    console.warn('Falling back to predefined models', error);
    return {
      models: FALLBACK_MODELS,
      voices: FALLBACK_VOICES
    };
  }

  const models = [];
  const voices = new Set(FALLBACK_VOICES);

  const processModel = (id, details) => {
    if (!id) return;
    const label = details?.title || details?.name || details?.label || id;
    models.push({ id, label });
    if (details?.voices && Array.isArray(details.voices)) {
      details.voices.forEach((voice) => {
        if (voice && typeof voice === 'string') {
          voices.add(voice);
        } else if (voice?.id) {
          voices.add(voice.id);
        }
      });
    }
  };

  if (Array.isArray(data)) {
    data.forEach((item) => {
      if (typeof item === 'string') {
        models.push({ id: item, label: item });
      } else if (item && typeof item === 'object') {
        processModel(item.id || item.name, item);
      }
    });
  } else if (data && typeof data === 'object') {
    Object.entries(data).forEach(([id, details]) => processModel(id, details));
  }

  const uniqueModels = models.length ? models : FALLBACK_MODELS;
  return {
    models: uniqueModels,
    voices: Array.from(voices)
  };
}

function updateSessionSnapshot() {
  const selectedModelOption = state.availableModels.find((m) => m.id === state.selectedModel);
  elements.modelBadge.textContent = selectedModelOption ? selectedModelOption.label : state.selectedModel;
  elements.voiceBadge.textContent = state.selectedVoice;
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
    Prism.highlightElement(codeEl);
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
  state.history.forEach((message) => appendChatMessage(message));
}

function addSystemWelcomeIfNeeded() {
  if (state.history.length) return;
  const welcome = {
    role: 'assistant',
    timestamp: new Date().toISOString(),
    content:
      'Welcome to your Windows 11 2025 inspired workspace! I am ready to chat, craft code snippets, and fetch Pollinations images. ' +
      'Adjust the model, voice, and theme from the control hub, then send me a message to begin.'
  };
  state.history.push(welcome);
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
  applyTheme(event.target.value);
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
  addSystemWelcomeIfNeeded();
  renderChat();
  persistState();
  showToast('Conversation reset.', 'info');
}

function buildSystemPrompt() {
  const themeLabel = elements.themeSelect?.selectedOptions?.[0]?.textContent || 'Daylight';
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
    const response = await fetch(API_ENDPOINT, {
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

  const { models, voices } = await fetchModels();
  state.availableModels = models;
  state.availableVoices = voices;

  if (!state.availableModels.find((model) => model.id === state.selectedModel)) {
    state.selectedModel = state.availableModels[0]?.id || state.selectedModel;
  }

  if (!state.availableVoices.includes(state.selectedVoice)) {
    state.selectedVoice = state.availableVoices[0] || state.selectedVoice;
  }

  populateSelect(elements.modelSelect, models, state.selectedModel);
  populateSelect(elements.voiceSelect, voices, state.selectedVoice);
  elements.themeSelect.value = state.selectedTheme;

  elements.memoryToggle.checked = state.memoryEnabled;

  addSystemWelcomeIfNeeded();
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
