# Unity Voice Chat

A single-page chat experience that integrates Pollinations text, image, and audio features with optional Twilio phone calling. The repository now contains only the assets required to deploy the Unity chat UI as a static site (for example on GitHub Pages) alongside a focused Twilio voice bridge server that can place phone calls to the number you provide.

## Project structure

```
/
├── index.html              # Unity Chat web application
├── styles.css              # Core styling for the UI
├── stylesScreensaver.css   # Animated Pollinations screensaver styles
├── *.js                    # Client logic (chat core, UI bindings, storage, screensaver, etc.)
├── themes/                 # Optional theme packs selectable in the sidebar
├── ai-instruct.txt         # System prompt loaded by the chat client
├── server/                 # Twilio voice bridge API (Express + Twilio)
└── APIDOCS.md              # Pollinations API reference (read-only)
```

All unused prototypes and duplicate apps have been removed so that only the main Unity chat remains. The front end keeps every feature from the original experience (model chooser, theme management, voice controls, personalization, memories, screensaver, and the new phone call controls).

## Frontend deployment

The root directory is a static site. Deploying it to GitHub Pages (or any static host) only requires copying the files from the root of the repository.

For local development:

```bash
npm install
npm start
```

This launches `http-server` on `http://localhost:8080` so you can verify styling and functionality before publishing.

### Starting a phone call from the UI

Open the **Settings** modal and scroll to the **Unity Phone Call** card. Provide:

1. **Voice bridge URL** – The HTTPS base URL where you deployed the server found in `server/`. It must expose the `/api/start-call` endpoint.
2. **Phone number** – Destination number in E.164 format (e.g. `+15551234567`).
3. **Initial topic** (optional) – Unity will open the call with this context.
4. **Pollinations voice** – Voice preset the Twilio call should use (`nova`, `alloy`, `fable`, `onyx`, `shimmer`, or `echo`).

The status card below the button shows whether the call was created successfully. These preferences are persisted in `localStorage` for convenience.

## Twilio voice bridge (`server/`)

The `server/` directory contains a minimal Express application that bridges Unity Chat to Twilio. It handles call creation, Pollinations text generation, and TTS playback during the phone call.

### Configure environment variables

Copy the example file and fill in your values:

```bash
cd server
cp .env.example .env
```

| Variable | Purpose |
| --- | --- |
| `TWILIO_ACCOUNT_SID` | Your Twilio project SID. |
| `TWILIO_AUTH_TOKEN` | Auth token for the project. |
| `TWILIO_PHONE_NUMBER` | Twilio phone number used to place calls. |
| `PUBLIC_SERVER_URL` | Public HTTPS URL that Twilio can reach (use ngrok/Cloudflare Tunnel while developing). |
| `ALLOWED_ORIGIN` | URL of the deployed Unity chat frontend (needed for CORS). |
| `POLLINATIONS_VOICE` | Default Pollinations voice for the call (optional, defaults to `nova`). |
| `PORT` | Local port for the Express server (defaults to `4000`). |

Install dependencies and start the server:

```bash
npm install
npm start
```

Expose the running server via a public tunnel and update `PUBLIC_SERVER_URL` accordingly. Once live, the Unity chat frontend can call the `/api/start-call` endpoint to trigger the phone conversation.

## Workflow summary

1. Deploy the static site in this repository (or run it locally with `npm start`).
2. Launch the Twilio voice bridge in `server/`, ensure it has a public HTTPS URL, and set `ALLOWED_ORIGIN` to your frontend domain.
3. From the Unity chat UI open **Settings → Unity Phone Call**, enter the server URL and your phone number, and click **Call My Phone**.
4. Answer the incoming call and talk with Unity as it generates responses using Pollinations and Twilio.

With these changes the repository is trimmed to the essential Unity experience while keeping every feature—chat models, theme switching, voice synthesis, screensaver, memories, and now the integrated phone dialer—operational.
