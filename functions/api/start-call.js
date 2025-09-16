import {
  buildCorsHeaders,
  buildFunctionsBaseUrl,
  createInitialState,
  encodeState,
  startTwilioCall
} from "../_shared/voiceBridge.js";

function jsonResponse(status, data, headers = new Headers()) {
  const merged = new Headers(headers);
  if (!merged.has("Content-Type")) {
    merged.set("Content-Type", "application/json");
  }
  merged.set("Cache-Control", "no-store");
  return new Response(JSON.stringify(data), { status, headers: merged });
}

function validateEnvironment(env) {
  const missing = [];
  if (!env?.TWILIO_ACCOUNT_SID) missing.push("TWILIO_ACCOUNT_SID");
  if (!env?.TWILIO_AUTH_TOKEN) missing.push("TWILIO_AUTH_TOKEN");
  if (!env?.TWILIO_PHONE_NUMBER) missing.push("TWILIO_PHONE_NUMBER");
  if (missing.length) {
    throw new Error(`Missing environment variables: ${missing.join(", ")}`);
  }
}

export async function onRequestOptions(context) {
  const { request, env } = context;
  const headers = buildCorsHeaders(request, env?.ALLOWED_ORIGIN);
  headers.set("Content-Length", "0");
  return new Response(null, { status: 204, headers });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const corsHeaders = buildCorsHeaders(request, env?.ALLOWED_ORIGIN);

  let payload = null;
  try {
    payload = await request.json();
  } catch (error) {
    return jsonResponse(400, { error: "Invalid JSON payload." }, corsHeaders);
  }

  const phoneNumber = (payload?.phoneNumber || "").trim();
  const initialPrompt = typeof payload?.initialPrompt === "string" ? payload.initialPrompt : "";
  const voice = (payload?.voice || env?.POLLINATIONS_VOICE || "nova").trim();

  if (!phoneNumber) {
    return jsonResponse(400, { error: "A destination phoneNumber is required." }, corsHeaders);
  }
  if (!phoneNumber.startsWith("+") || phoneNumber.length < 8) {
    return jsonResponse(400, { error: "Phone number must be in E.164 format (e.g. +15551234567)." }, corsHeaders);
  }

  try {
    validateEnvironment(env);
  } catch (error) {
    return jsonResponse(500, { error: error.message }, corsHeaders);
  }

  const functionsBase = buildFunctionsBaseUrl(request.url);

  try {
    const state = await createInitialState(env, voice, initialPrompt);
    const encodedState = encodeState(state);
    const voiceResponseUrl = `${functionsBase}/voice-response?state=${encodedState}`;

    await startTwilioCall(env, phoneNumber, voiceResponseUrl);

    return jsonResponse(
      200,
      {
        status: "initiated",
        message: "Call started. Answer the phone to begin the voice chat.",
        sessionToken: encodedState,
        gatherPrompt: state.gatherPrompt,
        voice: state.voice,
        usingPagesBridge: true
      },
      corsHeaders
    );
  } catch (error) {
    console.error("Failed to start call", error);
    return jsonResponse(500, { error: error.message || "Failed to start call." }, corsHeaders);
  }
}
