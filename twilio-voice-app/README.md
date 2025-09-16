# Unity Voice Call Assistant

A lightweight Node + Twilio companion service that lets Unity call a phone number and hold a spoken conversation powered by the Pollinations text API. Users receive an automated phone call, hear Unity's response rendered via Pollinations text-to-speech, and can answer verbally—Twilio transcribes the caller's speech and the cycle continues.

## Features

- ✅ **Phone call initiation** – Trigger a call to any E.164 phone number from the web UI.
- 🧠 **Unity text brain** – Conversations use the same Pollinations text API powering Unity Chat.
- 🔊 **Voice playback** – Assistant replies are played with Pollinations TTS directly over the call.
- 🗣️ **Two-way dialog** – Twilio speech recognition captures the caller's reply and routes it back to the AI.
- 🌐 **Self-hosted UI** – Includes a simple dashboard to start calls and watch status updates.

## Prerequisites

- A Twilio account with an active phone number (trial accounts work while you remain within verified numbers).
- Node.js 18+ (for native `fetch`).
- A public HTTPS URL that Twilio can reach (use [ngrok](https://ngrok.com/), [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/), etc.).

## Getting started

1. Install dependencies:
   ```bash
   cd twilio-voice-app
   npm install
   ```
2. Copy the example environment file and fill in your details:
   ```bash
   cp .env.example .env
   ```
   Required variables:
   - `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`
   - `PUBLIC_SERVER_URL` – The **public** HTTPS URL that Twilio will call back (e.g. your ngrok tunnel).
   - Optional: `POLLINATIONS_VOICE` to choose a different Pollinations voice preset.
3. Start the server:
   ```bash
   npm start
   ```
4. Expose the running server:
   ```bash
   # Example using ngrok (server must already be running on PORT)
   ngrok http 4000
   ```
5. Update `PUBLIC_SERVER_URL` in your `.env` with the HTTPS forwarding address printed by ngrok and restart the server if needed.

Visit [http://localhost:4000](http://localhost:4000) to load the dashboard, enter a phone number, and press **Call My Phone**. Answer the incoming call from your Twilio number to begin the voice chat.

## Twilio configuration tips

- Trial accounts can only call verified numbers. Add your mobile phone to the **Verified Caller IDs** page in the Twilio Console.
- Ensure your Twilio phone number has **Voice** capabilities enabled.
- The application automatically provides TwiML at:
  - `POST /voice-response`
  - `POST /gather`
  Twilio uses those URLs during the call flow, so they must be publicly reachable.

## Conversation flow

1. The web UI sends the phone number and optional topic to `POST /api/start-call`.
2. The server creates a session, asks the Pollinations text API for the first reply, and kicks off the phone call through Twilio.
3. When the call is answered, Twilio requests `/voice-response`, which streams the Pollinations TTS audio and immediately starts a speech gather.
4. The caller speaks. Twilio transcribes the response and POSTs it to `/gather`.
5. The server sends the transcription back to the Pollinations text API, receives a new answer, and responds with more TwiML to keep the dialog going.

Each assistant reply is constrained to a short length so the Pollinations TTS GET endpoint can render it reliably.

## Development notes

- Sessions are stored in memory. Restarting the server will drop active conversations.
- If the Pollinations API or TTS call fails, the server gracefully ends the phone call to avoid trapping the caller.
- The UI keeps an activity log and status banner so you can monitor attempts and errors from the browser.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Call fails immediately | Double-check Twilio credentials and verify the destination number. |
| No audio plays | Confirm your ngrok tunnel is active and that the Pollinations TTS URL is reachable from the public internet. |
| Gather never hears me | Make sure you stay on the line and speak after Unity finishes. Background noise can reduce Twilio's speech recognition confidence. |

## Security reminder

This sample app runs entirely server-side so your Twilio credentials remain private. Never expose your auth token in frontend code or client-side JavaScript.
