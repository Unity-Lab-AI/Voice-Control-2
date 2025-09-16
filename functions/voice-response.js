import {
  buildErrorTwiml,
  buildFunctionsBaseUrl,
  buildTwimlResponse,
  decodeState,
  encodeState
} from "./_shared/voiceBridge.js";

async function handleVoiceResponse(context) {
  const { request } = context;
  const url = new URL(request.url);
  const stateParam = url.searchParams.get("state");

  if (!stateParam) {
    return new Response(buildErrorTwiml("Session information was not provided."), {
      status: 200,
      headers: { "Content-Type": "text/xml", "Cache-Control": "no-store" }
    });
  }

  const state = decodeState(stateParam);
  if (!state || !state.lastAssistant) {
    return new Response(buildErrorTwiml("The voice session is no longer active."), {
      status: 200,
      headers: { "Content-Type": "text/xml", "Cache-Control": "no-store" }
    });
  }

  const functionsBase = buildFunctionsBaseUrl(request.url);
  const encodedState = encodeState(state);
  const twiml = buildTwimlResponse(state, encodedState, functionsBase, state.gatherPrompt);

  return new Response(twiml, {
    status: 200,
    headers: { "Content-Type": "text/xml", "Cache-Control": "no-store" }
  });
}

export const onRequestGet = handleVoiceResponse;
export const onRequestPost = handleVoiceResponse;
