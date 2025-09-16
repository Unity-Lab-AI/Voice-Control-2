const express = require('express');
const twilio = require('twilio');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const dotenv = require('dotenv');
const cors = require('cors');

dotenv.config({ path: path.resolve(__dirname, '.env') });

let fetchImpl = global.fetch;
if (!fetchImpl) {
  fetchImpl = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
}

const PORT = process.env.PORT || 4000;
const PUBLIC_SERVER_URL = process.env.PUBLIC_SERVER_URL;
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER;
const DEFAULT_VOICE = process.env.POLLINATIONS_VOICE || 'nova';
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN;

const hasTwilioCredentials =
  Boolean(TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_PHONE_NUMBER);

if (!hasTwilioCredentials) {
  console.warn('[WARN] Twilio credentials are not fully configured. API routes will return errors.');
}
if (!PUBLIC_SERVER_URL) {
  console.warn('[WARN] PUBLIC_SERVER_URL is not set. Twilio callbacks will fail without a public URL.');
}
if (!ALLOWED_ORIGIN) {
  console.warn('[WARN] ALLOWED_ORIGIN is not set. Defaulting to allow requests from any origin.');
}

const app = express();
app.use(cors({ origin: ALLOWED_ORIGIN || '*', methods: ['GET', 'POST', 'OPTIONS'] }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const sessions = new Map();

const SYSTEM_PROMPT =
  'You are Unity Voice, an AI assistant speaking with a caller over the phone. ' +
  'Keep every reply under 200 characters, speak naturally, and ask follow-up questions to keep the chat going.';

const client = hasTwilioCredentials
  ? twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
  : null;

function sanitizeForTts(text) {
  if (!text) return '';
  const compact = text.replace(/\s+/g, ' ').trim();
  if (compact.length <= 380) return compact;
  return `${compact.slice(0, 377)}...`;
}

function createTtsUrl(text, voice = DEFAULT_VOICE) {
  const sanitized = sanitizeForTts(text);
  const encoded = encodeURIComponent(sanitized);
  const url = new URL(`https://text.pollinations.ai/${encoded}`);
  url.searchParams.set('model', 'openai-audio');
  url.searchParams.set('voice', voice);
  return url.toString();
}

async function fetchPollinationsResponse(session, userMessage) {
  if (userMessage && userMessage.trim()) {
    session.messages.push({ role: 'user', content: userMessage.trim() });
  }

  const payload = {
    model: 'openai',
    messages: session.messages,
    temperature: 0.8,
    max_output_tokens: 300,
    top_p: 0.95,
    presence_penalty: 0,
    frequency_penalty: 0,
    stream: false
  };

  const response = await fetchImpl('https://text.pollinations.ai/openai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Pollinations API error: ${response.status} ${body}`);
  }

  const data = await response.json();
  const assistantMessage = data?.choices?.[0]?.message?.content?.trim();
  if (!assistantMessage) {
    throw new Error('Pollinations API returned an empty response.');
  }

  session.messages.push({ role: 'assistant', content: assistantMessage });
  session.lastAssistant = assistantMessage;
  return assistantMessage;
}

function createSession(phoneNumber, initialVoice = DEFAULT_VOICE) {
  const id = uuidv4();
  const session = {
    id,
    phoneNumber,
    voice: initialVoice,
    messages: [{ role: 'system', content: SYSTEM_PROMPT }],
    lastAssistant: null
  };
  sessions.set(id, session);
  return session;
}

function buildGatherAction(sessionId) {
  return `/gather?sessionId=${sessionId}`;
}

function buildVoiceResponse(session, twiml, promptMessage, gatherPrompt) {
  const responseMessage = session.lastAssistant || promptMessage;
  if (!responseMessage) {
    twiml.say('I was not able to prepare a message. Goodbye.');
    twiml.hangup();
    return twiml;
  }

  const audioUrl = createTtsUrl(responseMessage, session.voice);
  twiml.play(audioUrl);

  const gather = twiml.gather({
    input: 'speech',
    action: buildGatherAction(session.id),
    method: 'POST',
    speechTimeout: 'auto',
    language: 'en-US'
  });

  if (gatherPrompt) {
    gather.say(gatherPrompt);
  } else {
    gather.say('Please share your reply after the tone.');
  }
  gather.pause({ length: 1 });

  twiml.say('No response detected. Ending the call.');
  twiml.hangup();
  return twiml;
}

async function startPhoneCall(session) {
  if (!client) {
    throw new Error('Twilio client is not configured.');
  }
  if (!PUBLIC_SERVER_URL) {
    throw new Error('PUBLIC_SERVER_URL is not configured.');
  }

  const voiceUrl = new URL('/voice-response', PUBLIC_SERVER_URL);
  voiceUrl.searchParams.set('sessionId', session.id);

  return client.calls.create({
    url: voiceUrl.toString(),
    to: session.phoneNumber,
    from: TWILIO_PHONE_NUMBER,
    method: 'POST'
  });
}

app.post('/api/start-call', async (req, res) => {
  try {
    const { phoneNumber, initialPrompt, voice } = req.body || {};
    if (!phoneNumber || typeof phoneNumber !== 'string') {
      return res.status(400).json({ error: 'A destination phoneNumber is required.' });
    }
    if (!client) {
      return res.status(500).json({ error: 'Twilio credentials are missing on the server.' });
    }
    if (!PUBLIC_SERVER_URL) {
      return res.status(500).json({ error: 'PUBLIC_SERVER_URL is not configured on the server.' });
    }

    const session = createSession(phoneNumber.trim(), voice || DEFAULT_VOICE);
    const gatherPrompt = 'After the message, speak your reply and stay on the line for the assistant to respond.';

    if (initialPrompt && initialPrompt.trim()) {
      await fetchPollinationsResponse(session, initialPrompt);
    } else {
      await fetchPollinationsResponse(session, 'Greet the caller briefly and ask how you can help.');
    }

    await startPhoneCall(session);

    res.json({
      sessionId: session.id,
      status: 'initiated',
      message: 'Call started. Answer the phone to begin the voice chat.',
      gatherPrompt
    });
  } catch (error) {
    console.error('Failed to start call', error);
    res.status(500).json({ error: error.message || 'Failed to start call.' });
  }
});

function getSession(req) {
  const sessionId = req.query.sessionId || req.body.sessionId;
  if (!sessionId) {
    return { errorTwiml: new twilio.twiml.VoiceResponse().say('Session not provided.') };
  }
  const session = sessions.get(sessionId);
  if (!session) {
    const twiml = new twilio.twiml.VoiceResponse();
    twiml.say('The session has expired. Please start a new call.');
    twiml.hangup();
    return { errorTwiml: twiml };
  }
  return { session };
}

async function handleVoiceResponse(req, res) {
  const { session, errorTwiml } = getSession(req);
  if (!session) {
    res.type('text/xml').send(errorTwiml.toString());
    return;
  }

  const twiml = new twilio.twiml.VoiceResponse();
  buildVoiceResponse(session, twiml, null, 'Please leave your reply after the tone.');
  res.type('text/xml').send(twiml.toString());
}

app.post('/voice-response', handleVoiceResponse);
app.get('/voice-response', handleVoiceResponse);

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.post('/gather', async (req, res) => {
  const { session, errorTwiml } = getSession(req);
  if (!session) {
    res.type('text/xml').send(errorTwiml.toString());
    return;
  }

  const speechResult = req.body?.SpeechResult;
  const confidence = req.body?.Confidence;

  console.log(`Gathered speech for session ${session.id}:`, speechResult, 'confidence:', confidence);

  const twiml = new twilio.twiml.VoiceResponse();

  if (!speechResult) {
    twiml.say('I did not hear anything. Let me repeat myself.');
    buildVoiceResponse(session, twiml, null, 'Please respond after the message.');
    res.type('text/xml').send(twiml.toString());
    return;
  }

  try {
    await fetchPollinationsResponse(session, speechResult);
    buildVoiceResponse(session, twiml, null, 'Share your next reply when you are ready.');
  } catch (error) {
    console.error('Error generating AI response:', error);
    twiml.say('Something went wrong while generating a response. I will end the call now.');
    twiml.hangup();
  }

  res.type('text/xml').send(twiml.toString());
});

app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);
  res.status(500).json({ error: 'Internal server error.' });
});

app.listen(PORT, () => {
  console.log(`Twilio voice bridge listening on port ${PORT}`);
});
