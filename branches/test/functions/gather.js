import {
  buildErrorTwiml,
  buildFunctionsBaseUrl,
  buildTwimlResponse,
  decodeState,
  encodeState,
  fetchPollinationsResponse
} from "./_shared/voiceBridge.js";

async function handleGather(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const stateParam = url.searchParams.get("state");

  if (!stateParam) {
    return new Response(buildErrorTwiml("Session information was not provided."), {
      status: 200,
      headers: { "Content-Type": "text/xml", "Cache-Control": "no-store" }
    });
  }

  const state = decodeState(stateParam);
  if (!state) {
    return new Response(buildErrorTwiml("The voice session could not be restored."), {
      status: 200,
      headers: { "Content-Type": "text/xml", "Cache-Control": "no-store" }
    });
  }

  const formData = await request.formData();
  const speechResult = formData.get("SpeechResult");
  const confidenceRaw = formData.get("Confidence");
  const confidenceValue = confidenceRaw === null ? NaN : Number(confidenceRaw);
  const lowConfidence = Number.isFinite(confidenceValue) ? confidenceValue < 0.1 : false;

  const functionsBase = buildFunctionsBaseUrl(request.url);

  if (!speechResult || lowConfidence) {
    const encodedState = encodeState(state);
    const twiml = buildTwimlResponse(state, encodedState, functionsBase, "I didn't catch that. Please respond after the message.");
    return new Response(twiml, {
      status: 200,
      headers: { "Content-Type": "text/xml", "Cache-Control": "no-store" }
    });
  }

  try {
    await fetchPollinationsResponse(env, state, speechResult);
    const encodedState = encodeState(state);
    const twiml = buildTwimlResponse(state, encodedState, functionsBase, "Share your next reply when you are ready.");
    return new Response(twiml, {
      status: 200,
      headers: { "Content-Type": "text/xml", "Cache-Control": "no-store" }
    });
  } catch (error) {
    console.error("Error generating Pollinations response", error);
    return new Response(buildErrorTwiml("Something went wrong while generating a response. Ending the call."), {
      status: 200,
      headers: { "Content-Type": "text/xml", "Cache-Control": "no-store" }
    });
  }
}

export const onRequestPost = handleGather;
