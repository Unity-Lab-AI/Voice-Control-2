const SYSTEM_PROMPT =
  "You are Unity Voice, an AI assistant speaking with a caller over the phone. " +
  "Keep every reply under 200 characters, speak naturally, and ask follow-up questions to keep the chat going.";

const DEFAULT_GATHER_PROMPT =
  "After the message, speak your reply and stay on the line for the assistant to respond.";

const MAX_HISTORY_PAIRS = 6; // 6 user/assistant turns keeps URLs manageable

function sanitizeForTts(text) {
  if (!text) return "";
  const compact = text.replace(/\s+/g, " ").trim();
  if (compact.length <= 380) return compact;
  return `${compact.slice(0, 377)}...`;
}

function createTtsUrl(text, voice = "nova") {
  const sanitized = sanitizeForTts(text);
  const encoded = encodeURIComponent(sanitized);
  const url = new URL(`https://text.pollinations.ai/${encoded}`);
  url.searchParams.set("model", "openai-audio");
  url.searchParams.set("voice", voice);
  return url.toString();
}

function escapeXml(str = "") {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildFunctionsBaseUrl(requestUrl) {
  const parsed = new URL(requestUrl);
  const idx = parsed.pathname.indexOf("/_functions");
  if (idx === -1) {
    return parsed.origin;
  }
  return `${parsed.origin}${parsed.pathname.slice(0, idx + "/_functions".length)}`;
}

function trimMessages(messages) {
  if (!Array.isArray(messages)) return [];
  const systemMessages = messages.filter(msg => msg?.role === "system");
  const nonSystem = messages.filter(msg => msg?.role !== "system");
  const trimmed = nonSystem.slice(-MAX_HISTORY_PAIRS * 2); // user + assistant pairs
  if (systemMessages.length > 0) {
    return [systemMessages[0], ...trimmed];
  }
  return trimmed;
}

function encodeState(state) {
  const safeState = { ...state, messages: trimMessages(state.messages) };
  const json = JSON.stringify(safeState);
  return encodeURIComponent(btoa(json));
}

function decodeState(param) {
  if (!param) return null;
  try {
    const json = atob(decodeURIComponent(param));
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed.messages)) parsed.messages = [];
    return parsed;
  } catch (error) {
    console.error("Failed to decode session state", error);
    return null;
  }
}

function buildTwimlResponse(state, encodedState, functionsBase, gatherPrompt = DEFAULT_GATHER_PROMPT) {
  const audioUrl = createTtsUrl(state.lastAssistant, state.voice);
  const gatherUrl = `${functionsBase}/gather?state=${encodedState}`;
  const prompt = escapeXml(gatherPrompt || DEFAULT_GATHER_PROMPT);

  return `<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n  <Play>${audioUrl}</Play>\n  <Gather input="speech" action="${gatherUrl}" method="POST" speechTimeout="auto" language="en-US">\n    <Say>${prompt}</Say>\n    <Pause length="1"/>\n  </Gather>\n  <Say>No response detected. Ending the call.</Say>\n  <Hangup/>\n</Response>`;
}

function buildErrorTwiml(message) {
  const safe = escapeXml(message || "The session is no longer active. Goodbye.");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n  <Say>${safe}</Say>\n  <Hangup/>\n</Response>`;
}

function buildCorsHeaders(request, allowedOrigin) {
  const requestOrigin = request.headers.get("Origin");
  const headers = new Headers();
  headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type");
  headers.set("Vary", "Origin");

  if (!allowedOrigin || allowedOrigin === "*") {
    headers.set("Access-Control-Allow-Origin", "*");
    return headers;
  }

  if (allowedOrigin === requestOrigin) {
    headers.set("Access-Control-Allow-Origin", requestOrigin);
  } else {
    headers.set("Access-Control-Allow-Origin", allowedOrigin);
  }
  return headers;
}

async function fetchPollinationsResponse(env, state, userMessage) {
  if (!state.messages) state.messages = [];
  if (!state.voice) state.voice = env?.POLLINATIONS_VOICE || "nova";
  if (!state.gatherPrompt) state.gatherPrompt = DEFAULT_GATHER_PROMPT;

  const trimmed = typeof userMessage === "string" ? userMessage.trim() : "";
  if (trimmed) {
    state.messages.push({ role: "user", content: trimmed });
  }

  const payload = {
    model: "openai",
    messages: trimMessages(state.messages.length ? state.messages : [{ role: "system", content: SYSTEM_PROMPT }]),
    temperature: 0.8,
    max_output_tokens: 300,
    top_p: 0.95,
    presence_penalty: 0,
    frequency_penalty: 0,
    stream: false
  };

  const headers = new Headers({ "Content-Type": "application/json" });
  const token = env?.POLLINATIONS_TOKEN || env?.pollinationsToken;
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch("https://text.pollinations.ai/openai", {
    method: "POST",
    headers,
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Pollinations API error: ${response.status} ${text}`);
  }

  const data = await response.json();
  const assistantMessage = data?.choices?.[0]?.message?.content?.trim();
  if (!assistantMessage) {
    throw new Error("Pollinations API returned an empty response.");
  }

  state.messages.push({ role: "assistant", content: assistantMessage });
  state.messages = trimMessages(state.messages);
  state.lastAssistant = assistantMessage;
  return assistantMessage;
}

async function createInitialState(env, voice, initialPrompt) {
  const state = {
    id: crypto.randomUUID(),
    voice: voice || env?.POLLINATIONS_VOICE || "nova",
    gatherPrompt: DEFAULT_GATHER_PROMPT,
    messages: [{ role: "system", content: SYSTEM_PROMPT }],
    lastAssistant: ""
  };

  const seedPrompt = initialPrompt && initialPrompt.trim()
    ? initialPrompt.trim()
    : "Greet the caller briefly and ask how you can help.";

  await fetchPollinationsResponse(env, state, seedPrompt);
  return state;
}

async function startTwilioCall(env, phoneNumber, voiceResponseUrl) {
  const accountSid = env?.TWILIO_ACCOUNT_SID;
  const authToken = env?.TWILIO_AUTH_TOKEN;
  const fromNumber = env?.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    throw new Error("Twilio credentials are not fully configured.");
  }

  const auth = btoa(`${accountSid}:${authToken}`);
  const body = new URLSearchParams({
    To: phoneNumber,
    From: fromNumber,
    Url: voiceResponseUrl,
    Method: "POST"
  });

  const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: body.toString()
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Twilio API error: ${response.status} ${text}`);
  }

  return response.json();
}

export {
  SYSTEM_PROMPT,
  DEFAULT_GATHER_PROMPT,
  buildCorsHeaders,
  buildErrorTwiml,
  buildFunctionsBaseUrl,
  buildTwimlResponse,
  createInitialState,
  createTtsUrl,
  decodeState,
  encodeState,
  fetchPollinationsResponse,
  startTwilioCall,
  trimMessages
};
