document.addEventListener("DOMContentLoaded", () => {
  /* ─── Cloudflare‑only setup (no VPS) ───────────────────────────── */
  const USE_LOCAL_FALLBACK = false;              // set true only for offline dev
  /* visitor‑counter cache */
  const VISITOR_CACHE_MS = 5 * 60 * 1000;        // 5 minutes
  const VISITOR_TS_KEY   = "visitor_ts";
  const VISITOR_CNT_KEY  = "visitor_cnt";
  /* ──────────────────────────────────────────────────────────────── */

  const sessionListEl = document.getElementById("session-list");
  let sessions = loadSessions();
  const defaultModelPreference = localStorage.getItem("defaultModelPreference") || "unity";

  if (!localStorage.getItem("currentSessionId")) {
    const newSession = createSession("New Chat");
    localStorage.setItem("currentSessionId", newSession.id);
  }

  initUserChecks();
  startVisitorCountPolling();
  renderSessions();

  window.Storage = {
    getSessions,
    createSession,
    deleteSession,
    getCurrentSession,
    setCurrentSessionId,
    updateSessionMessages,
    renameSession,
    setSessionModel,
    getDefaultModel,
    setDefaultModel,
    clearAllSessions,
    getMemories,
    addMemory,
    removeMemory,
    clearAllMemories,
    deleteAllUserData,
    renderSessions
  };
  /**
   * Return the current array of chat sessions held in memory.
   * @returns {Array<Object>} all stored sessions
   */
  function getSessions() {
    return sessions;
  }

  /**
   * Get the default model to use for new sessions. If the user has not
   * chosen one yet, "unity" is returned.
   * @returns {string} model identifier
   */
  function getDefaultModel() {
    return localStorage.getItem("defaultModelPreference") || "unity";
  }

  /**
   * Persist the user's preferred default model so future sessions inherit it.
   * @param {string} modelName - model identifier
   */
  function setDefaultModel(modelName) {
    localStorage.setItem("defaultModelPreference", modelName);
    console.log("Default model preference set to:", modelName);
  }

  /**
   * Create a new chat session and store it immediately.
   * @param {string} name - human friendly session title
   * @returns {Object} the created session
   */
  function createSession(name) {
    const newId = Date.now().toString();
    const session = {
      id: newId,
      name,
      model: getDefaultModel(),
      messages: [],
      lastUpdated: Date.now()
    };
    sessions.push(session);
    saveSessions();
    return session;
  }

  /**
   * Delete a session. If the deleted session was active, choose another
   * session or create a new one as the current session.
   * @param {string} sessionId - identifier of session to delete
   */
  function deleteSession(sessionId) {
    sessions = sessions.filter(s => s.id !== sessionId);
    saveSessions();
    if (localStorage.getItem("currentSessionId") === sessionId) {
      const chatBox = document.getElementById("chat-box");
      if (chatBox) chatBox.innerHTML = "";
      if (sessions.length > 0) {
        localStorage.setItem("currentSessionId", sessions[0].id);
      } else {
        const newSession = createSession("New Chat");
        localStorage.setItem("currentSessionId", newSession.id);
      }
    }
    renderSessions();
  }

  /**
   * Update the display name for a session. Handles JSON strings that may
   * come from the backend containing a suggested title.
   * @param {string} sessionId - id of session to rename
   * @param {string|Object} newName - new name or object with title
   */
  function renameSession(sessionId, newName) {
    const session = sessions.find(s => s.id === sessionId);
    if (session) {
      let cleanName = newName;
      if (typeof newName === "object") {
        cleanName = JSON.stringify(newName);
      } else if (newName && newName.startsWith("{") && newName.endsWith("}")) {
        try {
          const parsed = JSON.parse(newName);
          cleanName = parsed.response || parsed.chatTitle || newName;
        } catch (e) {
          console.error("Error parsing session name JSON:", e);
        }
      }
      session.name = cleanName;
      session.lastUpdated = Date.now();
      saveSessions();
      renderSessions();
    }
  }

  /**
   * Retrieve the session currently marked as active. If none exists,
   * create a new session and mark it active.
   * @returns {Object} current session object
   */
  function getCurrentSession() {
    const currentId = localStorage.getItem("currentSessionId");
    let session = sessions.find(s => s.id === currentId);
    if (!session) {
      session = createSession("New Chat");
      localStorage.setItem("currentSessionId", session.id);
    }
    return session;
  }

  /**
   * Set which session should be active and update the sidebar list.
   * @param {string} sessionId - id of session to activate
   */
  function setCurrentSessionId(sessionId) {
    localStorage.setItem("currentSessionId", sessionId);
    renderSessions();
  }

  /**
   * Change the model associated with a specific session and persist both
   * the session and the default model preference.
   * @param {string} sessionId - session to update
   * @param {string} modelName - model identifier to assign
   */
  function setSessionModel(sessionId, modelName) {
    const session = sessions.find(s => s.id === sessionId);
    if (session) {
      session.model = modelName;
      session.lastUpdated = Date.now();
      saveSessions();
      setDefaultModel(modelName);
    }
  }

  /**
   * Replace the message history for a session, typically after sending or
   * receiving new messages from the API.
   * @param {string} sessionId - session whose messages are being saved
   * @param {Array<Object>} messages - full message array
   */
  function updateSessionMessages(sessionId, messages) {
    const session = sessions.find(s => s.id === sessionId);
    if (session) {
      session.messages = messages;
      session.lastUpdated = Date.now();
      saveSessions();
    }
  }

  /**
   * Load the list of sessions from localStorage.
   * @returns {Array<Object>} parsed session data or an empty array
   */
  function loadSessions() {
    const raw = localStorage.getItem("pollinations_sessions");
    return raw ? JSON.parse(raw) : [];
  }

  /**
   * Persist the current in‑memory sessions array to localStorage.
   */
  function saveSessions() {
    localStorage.setItem("pollinations_sessions", JSON.stringify(sessions));
  }

  /**
   * Rebuild the session list in the sidebar. The most recently updated
   * sessions appear first and the active session receives a special class.
   */
  function renderSessions() {
    if (!sessionListEl) return;
    sessionListEl.innerHTML = "";
    sessions.sort((a, b) => b.lastUpdated - a.lastUpdated);

    const currentSessionId = localStorage.getItem("currentSessionId");
    sessions.forEach(session => {
      const li = document.createElement("li");
      li.classList.add("session-item");
      if (session.id === currentSessionId) {
        li.classList.add("active");
      }
      const titleSpan = document.createElement("span");
      titleSpan.classList.add("session-title");
      let displayName = session.name;
      if (displayName && displayName.startsWith("{") && displayName.endsWith("}")) {
        try {
          const parsed = JSON.parse(displayName);
          displayName = parsed.response || parsed.chatTitle || displayName;
        } catch (e) {
          console.error("Error parsing session name JSON:", e);
        }
      }
      titleSpan.textContent = displayName;

      const editBtn = document.createElement("button");
      editBtn.classList.add("session-edit-btn");
      editBtn.innerHTML = '<i class="fas fa-edit"></i>';
      editBtn.title = "Rename this chat session";
      editBtn.addEventListener("click", e => {
        e.stopPropagation();
        const newName = prompt("Rename session:", session.name);
        if (newName && newName.trim() !== "") {
          renameSession(session.id, newName.trim());
        }
      });

      const delBtn = document.createElement("button");
      delBtn.classList.add("session-delete-btn");
      delBtn.innerHTML = '<i class="fas fa-trash"></i>';
      delBtn.title = "Delete this entire session";
      delBtn.addEventListener("click", e => {
        e.stopPropagation();
        if (!confirm(`Are you sure you want to delete session "${session.name}"?`)) return;
        deleteSession(session.id);
      });

      const controlsDiv = document.createElement("div");
      controlsDiv.className = "session-controls";
      controlsDiv.appendChild(editBtn);
      controlsDiv.appendChild(delBtn);
      li.appendChild(titleSpan);
      li.appendChild(controlsDiv);

      li.addEventListener("click", () => {
        localStorage.setItem("currentSessionId", session.id);
        location.reload();
      });
      sessionListEl.appendChild(li);
    });

    if (sessions.length === 0) {
      const emptyMsg = document.createElement("p");
      emptyMsg.className = "text-center text-muted";
      emptyMsg.style.padding = "10px";
      emptyMsg.innerHTML = '<i class="fas fa-info-circle"></i> No chat sessions yet. Start a new chat!';
      sessionListEl.appendChild(emptyMsg);
    }
  }

  /**
   * Remove every stored session and start fresh with a new one.
   */
  function clearAllSessions() {
    sessions = [];
    saveSessions();
    localStorage.removeItem("currentSessionId");
    const newSession = createSession("New Chat");
    localStorage.setItem("currentSessionId", newSession.id);
    renderSessions();
  }

  /**
   * Retrieve the saved memory strings from localStorage.
   * @returns {Array<string>} list of memories
   */
  function getMemories() {
    const raw = localStorage.getItem("pollinations_memory");
    return raw ? JSON.parse(raw) : [];
  }

  /**
   * Persist a provided memory array to localStorage.
   * @param {Array<string>} memories - full list to store
   */
  function saveMemories(memories) {
    localStorage.setItem("pollinations_memory", JSON.stringify(memories));
  }

  /**
   * Add a memory entry if it is not already stored.
   * @param {string} text - memory string to store
   */
  function addMemory(text) {
    const memories = getMemories();
    if (!memories.includes(text.trim())) {
      memories.push(text.trim());
      saveMemories(memories);
    }
  }

  /**
   * Remove a memory entry by its index.
   * @param {number} index - position of memory to remove
   */
  function removeMemory(index) {
    const memories = getMemories();
    if (index >= 0 && index < memories.length) {
      memories.splice(index, 1);
      saveMemories(memories);
    }
  }

  /**
   * Delete all stored memories.
   */
  function clearAllMemories() {
    localStorage.removeItem("pollinations_memory");
  }

  /**
   * Completely remove all data saved by the application and refresh.
   */
  function deleteAllUserData() {
    localStorage.clear();
    location.reload();
  }

  /* ───── user‑ID registration (now via /api/registerUser) ───── */

  /**
   * Ensure a persistent user ID exists. If none is stored, attempt to
   * register one with the backend and fall back to a locally generated ID
   * when necessary.
   */
  function initUserChecks() {
    let firstLaunch = localStorage.getItem("firstLaunch");
    if (firstLaunch === null) {
      localStorage.setItem("firstLaunch", "0");
    }
    checkOrGenerateUserId().then(() => {
      console.log("User ID validation complete");
    }).catch(err => {
      console.warn("Problem with user ID, using local fallback:", err);
      ensureLocalUserId();
    });
  }

  /**
   * Create a local user ID if none exists and server registration fails.
   */
  function ensureLocalUserId() {
    if (!localStorage.getItem("uniqueUserId")) {
      const localId = generateRandomId();
      localStorage.setItem("uniqueUserId", localId);
      console.log("Created local user ID fallback");
    }
  }

  /**
   * Retrieve or generate a unique user identifier and optionally register
   * it with the remote server.
   * @returns {Promise<string>} resolved user ID
   */
  async function checkOrGenerateUserId() {
    let userId = localStorage.getItem("uniqueUserId");
    if (!userId) {
      userId = generateRandomId();
      let success = false;
      if (!USE_LOCAL_FALLBACK) {
        try {
          success = await registerUserIdWithServer(userId);
        } catch (err) {
          console.warn("Server registration failed, using local fallback:", err);
          success = true;
        }
      } else {
        success = true;
      }
      localStorage.setItem("uniqueUserId", userId);
    }
    return userId;
  }

  /**
   * Attempt to register a generated user ID with the server. Returns true
   * if the registration succeeds or the ID already exists.
   * @param {string} userId - identifier to register
   * @returns {Promise<boolean>} success state
   */
  async function registerUserIdWithServer(userId) {
    if (USE_LOCAL_FALLBACK) {
      console.log("Using local fallback for user registration");
      await new Promise(resolve => setTimeout(resolve, 100));
      return true;
    }
    try {
      const response = await fetch("/api/registerUser", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId })
      });
      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }
      const data = await response.json();
      return data.status === "registered" || data.status === "exists";
    } catch (err) {
      console.error("Failed to register user with server:", err);
      throw err;
    }
  }

  /**
   * Generate a short random identifier using base‑36 characters.
   * @returns {string} random ID
   */
  function generateRandomId() {
    return Math.random().toString(36).substr(2, 9);
  }

  /* ───── Cloudflare visitor‑counter ───── */

  /**
   * Periodically update the visitor count display by polling the backend.
   */
  function startVisitorCountPolling() {
    const visitorCountDisplay = document.getElementById("visitor-count-display");
    if (!visitorCountDisplay) return;

    async function update() {
      try {
        const count = await fetchVisitorCountCached();
        visitorCountDisplay.textContent = prettyNumber(count);
      } catch (err) {
        visitorCountDisplay.textContent = "Offline";
        console.warn("Failed to get visitor count:", err);
      }
    }

    update();
    setInterval(update, 60_000); // refresh every minute
  }

  /**
   * Fetch the visitor count, caching the value to avoid excessive requests.
   * @returns {Promise<number>} total visitor count
   */
  async function fetchVisitorCountCached() {
    const now = Date.now();
    const ts  = +localStorage.getItem(VISITOR_TS_KEY) || 0;
    if (now - ts < VISITOR_CACHE_MS) {
      return +localStorage.getItem(VISITOR_CNT_KEY);
    }

    if (USE_LOCAL_FALLBACK) {
      const stub = 1234;
      localStorage.setItem(VISITOR_TS_KEY, now);
      localStorage.setItem(VISITOR_CNT_KEY, stub);
      return stub;
    }

    const { total } = await fetch("/api/visitors").then(r => r.json());
    localStorage.setItem(VISITOR_TS_KEY, now);
    localStorage.setItem(VISITOR_CNT_KEY, total);
    return total;
  }

  /**
   * Convert a large number into a shortened, human‑friendly string.
   * @param {number} n - number to prettify
   * @returns {string} formatted number
   */
  function prettyNumber(n) {
    const abs = Math.abs(n);
    if (abs >= 1e9)  return (n / 1e9).toFixed(abs >= 1e11 ? 0 : 2) + "B";
    if (abs >= 1e6)  return (n / 1e6).toFixed(abs >= 1e8  ? 0 : 2) + "M";
    if (abs >= 1e3)  return (n / 1e3).toFixed(abs >= 1e5  ? 0 : 2) + "K";
    return n.toString();
  }
});
