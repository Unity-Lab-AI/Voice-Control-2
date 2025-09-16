import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import twilio from 'twilio';
import serverModule from '../twilio-voice-app/server.js';

const {
  app,
  buildGatherAction,
  buildVoiceResponse,
  createSession,
  createTtsUrl,
  DEFAULT_VOICE,
  fetchPollinationsResponse,
  getFetchImplementation,
  getSession,
  resetSessionStore,
  sanitizeForTts,
  setFetchImplementation,
  sessions,
  startPhoneCall,
  SYSTEM_PROMPT
} = serverModule;

const originalFetch = getFetchImplementation();

describe('Twilio voice server utilities', () => {
  beforeEach(() => {
    resetSessionStore();
    setFetchImplementation(originalFetch);
  });

  afterEach(() => {
    resetSessionStore();
    setFetchImplementation(originalFetch);
  });

  it('sanitizes and truncates TTS text safely', () => {
    expect(sanitizeForTts('  Hello   Unity   ')).toBe('Hello Unity');
    const long = 'a'.repeat(600);
    const sanitized = sanitizeForTts(long);
    expect(sanitized.endsWith('...')).toBe(true);
    expect(sanitized.length).toBe(380);
  });

  it('builds TTS URLs with voice parameters', () => {
    const url = new URL(createTtsUrl('Synthesize this message', 'aria'));
    expect(url.origin).toBe('https://text.pollinations.ai');
    expect(url.searchParams.get('model')).toBe('openai-audio');
    expect(url.searchParams.get('voice')).toBe('aria');
  });

  it('creates sessions with default metadata', () => {
    const session = createSession('+15555550123');
    expect(session.phoneNumber).toBe('+15555550123');
    expect(session.voice).toBe(DEFAULT_VOICE);
    expect(session.messages[0]).toEqual({ role: 'system', content: SYSTEM_PROMPT });
    expect(sessions.get(session.id)).toBe(session);
  });

  it('creates sessions with a custom voice option', () => {
    const session = createSession('+15555550123', 'aria');
    expect(session.voice).toBe('aria');
  });

  it('sends chat completions using the unity model', async () => {
    const session = createSession('+15555550123');
    const calls = [];
    setFetchImplementation(async (url, options) => {
      calls.push({ url, options });
      expect(url).toBe('https://text.pollinations.ai/openai');
      const body = JSON.parse(options.body);
      expect(body.model).toBe('unity');
      expect(Array.isArray(body.messages)).toBe(true);
      expect(body.messages).toHaveLength(2);
      expect(body.messages[1]).toEqual({ role: 'user', content: 'Check internal setup' });
      return {
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'Internal configuration ready.' } }] })
      };
    });

    const reply = await fetchPollinationsResponse(session, 'Check internal setup');
    expect(reply).toBe('Internal configuration ready.');
    expect(session.lastAssistant).toBe('Internal configuration ready.');
    expect(session.messages.at(-1)).toEqual({ role: 'assistant', content: 'Internal configuration ready.' });
    expect(calls).toHaveLength(1);
  });

  it('builds gather actions with the session id', () => {
    const session = createSession('+15555550123');
    expect(buildGatherAction(session.id)).toBe(`/gather?sessionId=${session.id}`);
  });

  it('renders a full voice response TwiML document', () => {
    const session = createSession('+15555550123');
    session.lastAssistant = 'Hello caller, Unity online.';
    const twiml = new twilio.twiml.VoiceResponse();
    buildVoiceResponse(session, twiml, null, 'Please reply after the tone.');
    const xml = twiml.toString();
    expect(xml).toContain('https://text.pollinations.ai/');
    expect(xml).toContain('model=openai-audio');
    expect(xml).toContain(`voice=${session.voice}`);
    expect(xml).toContain(`/gather?sessionId=${session.id}`);
    expect(xml).toContain('Please reply after the tone.');
  });

  it('falls back to a goodbye message when no assistant output is ready', () => {
    const session = createSession('+15555550123');
    session.lastAssistant = null;
    const twiml = new twilio.twiml.VoiceResponse();
    buildVoiceResponse(session, twiml, '', null);
    const xml = twiml.toString();
    expect(xml).toContain('I was not able to prepare a message. Goodbye.');
    expect(xml).toContain('<Hangup/>');
  });

  it('retrieves stored sessions or returns helpful errors', () => {
    const session = createSession('+15555550123');
    const found = getSession({ query: { sessionId: session.id }, body: {} });
    expect(found.session).toBe(session);

    const noSessionId = getSession({ query: {}, body: {} });
    expect(noSessionId.errorTwiml.toString()).toContain('Session not provided.');

    const missing = getSession({ query: { sessionId: 'does-not-exist' }, body: {} });
    expect(missing.errorTwiml.toString()).toContain('The session has expired.');
  });

  it('throws descriptive errors when attempting to start a call without configuration', async () => {
    const session = createSession('+15555550123');
    await expect(startPhoneCall(session)).rejects.toThrow('Twilio client is not configured.');
  });
});

describe('Twilio voice express routes', () => {
  beforeEach(() => {
    resetSessionStore();
    setFetchImplementation(originalFetch);
  });

  afterEach(() => {
    resetSessionStore();
    setFetchImplementation(originalFetch);
  });

  it('rejects call attempts without a phone number', async () => {
    const res = await request(app).post('/api/start-call').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/phoneNumber is required/i);
  });

  it('rejects call attempts when Twilio credentials are missing', async () => {
    const res = await request(app).post('/api/start-call').send({ phoneNumber: '+15555550123' });
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/Twilio credentials/i);
  });

  it('returns TwiML when a voice response is requested without a valid session', async () => {
    const res = await request(app).post('/voice-response');
    expect(res.status).toBe(200);
    expect(res.type).toBe('text/xml');
    expect(res.text).toContain('Session not provided');
  });

  it('returns TwiML for gather callbacks with missing sessions', async () => {
    const res = await request(app).post('/gather');
    expect(res.status).toBe(200);
    expect(res.type).toBe('text/xml');
    expect(res.text).toContain('Session not provided');
  });

  it('streams audio for existing sessions and keeps the conversation alive', async () => {
    const session = createSession('+15555550123');
    session.lastAssistant = 'Unity voice channel engaged.';
    const res = await request(app).get('/voice-response').query({ sessionId: session.id });
    expect(res.status).toBe(200);
    expect(res.type).toBe('text/xml');
    expect(res.text).toContain('Unity%20voice%20channel%20engaged.');
    expect(res.text).toContain(`/gather?sessionId=${session.id}`);
  });

  it('records user speech and forwards it to the Unity model during gather callbacks', async () => {
    const session = createSession('+15555550123');
    setFetchImplementation(async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'Response from Unity.' } }] })
    }));

    const res = await request(app)
      .post('/gather')
      .send({ sessionId: session.id, SpeechResult: 'How are you?', Confidence: '0.92' });

    expect(res.status).toBe(200);
    expect(res.type).toBe('text/xml');
    expect(res.text).toContain('Response%20from%20Unity.');
  });
});
