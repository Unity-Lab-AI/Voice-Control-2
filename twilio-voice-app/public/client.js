const form = document.getElementById('call-form');
const statusEl = document.getElementById('status');
const logEl = document.getElementById('log');
const submitBtn = form.querySelector('button[type="submit"]');

function timestamp() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function log(message, type = 'info') {
  const item = document.createElement('li');
  item.className = `log__item log__item--${type}`;
  item.innerHTML = `<span class="log__time">${timestamp()}</span><span class="log__message">${message}</span>`;
  logEl.prepend(item);
}

function setStatus(message, variant = 'idle') {
  statusEl.textContent = message;
  statusEl.dataset.state = variant;
}

async function startCall(payload) {
  const response = await fetch('/api/start-call', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errBody = await response.json().catch(() => ({}));
    const errorMessage = errBody.error || 'Failed to start call.';
    throw new Error(errorMessage);
  }

  return response.json();
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(form);
  const phoneNumber = formData.get('phoneNumber');
  const initialPrompt = formData.get('initialPrompt');
  const voice = formData.get('voice');

  submitBtn.disabled = true;
  setStatus('Creating session and contacting Twilio…', 'pending');
  log(`Attempting to call ${phoneNumber} using the ${voice} voice.`, 'info');

  try {
    const result = await startCall({ phoneNumber, initialPrompt, voice });
    setStatus(result.message || 'Call in progress. Answer your phone!', 'success');
    log('Call initiated successfully. Pick up to talk with Unity.', 'success');
    if (result.gatherPrompt) {
      log(`On the call, you will hear: “${result.gatherPrompt}”`, 'hint');
    }
  } catch (error) {
    console.error(error);
    setStatus(error.message, 'error');
    log(error.message, 'error');
  } finally {
    submitBtn.disabled = false;
  }
});

setStatus('Ready when you are.', 'idle');
log('Configure your .env values, run the server, and Unity will call when you press the button.');
