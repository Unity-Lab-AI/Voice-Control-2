document.addEventListener("DOMContentLoaded", () => {
    const screensaverContainer = document.getElementById("screensaver-container");
    const toggleScreensaverButton = document.getElementById("toggle-screensaver");
    const fullscreenButton = document.getElementById("fullscreen-screensaver");
    const stopButton = document.getElementById("screensaver-exit");
    const playPauseButton = document.getElementById("screensaver-playpause");
    const saveButton = document.getElementById("screensaver-save");
    const copyButton = document.getElementById("screensaver-copy");
    const hideButton = document.getElementById("screensaver-hide");
    const screensaverImage1 = document.getElementById("screensaver-image1");
    const screensaverImage2 = document.getElementById("screensaver-image2");
    const promptInput = document.getElementById("screensaver-prompt");
    const timerInput = document.getElementById("screensaver-timer");
    const aspectSelect = document.getElementById("screensaver-aspect");
    const enhanceCheckbox = document.getElementById("screensaver-enhance");
    const privateCheckbox = document.getElementById("screensaver-private");
    const modelSelect = document.getElementById("screensaver-model");
    const transitionDurationInput = document.getElementById("screensaver-transition-duration");
    const restartPromptButton = document.getElementById("screensaver-restart-prompt");

    let screensaverActive = false;
    let imageInterval = null;
    let promptInterval = null;
    let paused = false;
    let isFullscreen = false;
    let imageHistory = [];
    let promptHistory = [];
    let currentImage = 'image1';
    let controlsHidden = false;
    let isTransitioning = false;
    let autoPromptEnabled = true;
    let isFetchingPrompt = false;
    let lastPromptUpdate = 0;
    const MAX_HISTORY = 12;
    const PROMPT_UPDATE_INTERVAL = 20000;

    let settings = {
        prompt: '',
        timer: 30,
        aspect: 'widescreen',
        model: 'flux',
        enhance: true,
        priv: true,
        transitionDuration: 1
    };

    toggleScreensaverButton.title = "Toggle the screensaver on/off.";
    fullscreenButton.title = "Go full screen (or exit it).";
    stopButton.title = "Stop the screensaver.";
    playPauseButton.title = "Play or pause the image rotation.";
    saveButton.title = "Save the current screensaver image.";
    copyButton.title = "Copy the current screensaver image to clipboard.";
    hideButton.title = "Hide or show controls and thumbnails.";
    promptInput.title = "Prompt for the AI to create images from.";
    timerInput.title = "Interval between new images (in seconds).";
    aspectSelect.title = "Select the aspect ratio for the generated image.";
    modelSelect.title = "Choose the image-generation model.";
    enhanceCheckbox.title = "If enabled, the prompt is 'enhanced' via an LLM.";
    privateCheckbox.title = "If enabled, the image won't appear on the public feed.";
    transitionDurationInput.title = "Set the duration of image transitions in seconds.";
    if (restartPromptButton) restartPromptButton.title = "Toggle automatic prompt generation on/off.";

    function saveScreensaverSettings() {
        try {
            localStorage.setItem("screensaverSettings", JSON.stringify(settings));
        } catch (err) {
            console.error("Failed to save settings to localStorage:", err);
            window.showToast("Shit, I couldn’t save the settings. Things might get weird.");
        }
    }

    function loadScreensaverSettings() {
        const raw = localStorage.getItem("screensaverSettings");
        if (raw) {
            try {
                const s = JSON.parse(raw);
                settings.prompt = '';
                settings.timer = s.timer || 30;
                settings.aspect = s.aspect || 'widescreen';
                settings.model = s.model || 'flux';
                settings.enhance = s.enhance !== undefined ? s.enhance : true;
                settings.priv = s.priv !== undefined ? s.priv : true;
                settings.transitionDuration = s.transitionDuration || 1;

                promptInput.value = settings.prompt;
                timerInput.value = settings.timer;
                aspectSelect.value = settings.aspect;
                modelSelect.value = settings.model;
                enhanceCheckbox.checked = settings.enhance;
                privateCheckbox.checked = settings.priv;
                transitionDurationInput.value = settings.transitionDuration;
            } catch (err) {
                console.warn("Failed to parse screensaver settings:", err);
            }
        }
    }

    function saveImageHistory() {
        try {
            localStorage.setItem("imageHistory", JSON.stringify(imageHistory));
            localStorage.setItem("promptHistory", JSON.stringify(promptHistory));
            console.log("Saved imageHistory to localStorage:", imageHistory);
            console.log("Saved promptHistory to localStorage:", promptHistory);
        } catch (err) {
            console.error("Failed to save image history to localStorage:", err);
            window.showToast("Fuck, I couldn’t save the image history. Gallery might not persist.");
        }
    }

    function loadImageHistory() {
        imageHistory = [];
        promptHistory = [];
        updateThumbnailHistory();
        console.log("Cleared imageHistory and promptHistory on startup.");
    }

    loadScreensaverSettings();
    loadImageHistory();

    function generateSeed() {
        return Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
    }

    function getDimensions(aspect) {
        switch (aspect) {
            case "widescreen": return { width: 1920, height: 1080 };
            case "square": return { width: 1024, height: 1024 };
            case "portrait": return { width: 1080, height: 1920 };
            default: return { width: 1920, height: 1080 };
        }
    }

    function preloadImage(url) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.src = url;
            img.onload = () => resolve(url);
            img.onerror = () => reject(new Error("Image failed to load"));
        });
    }

    async function fetchDynamicPrompt() {
        const metaPrompt = "Generate an image prompt of something new and wild. Respond with text only.";
        const messages = [
            { role: "system", content: "Generate unique, wild image prompts as text only, under 100 characters." },
            { role: "user", content: metaPrompt }
        ];
        const body = {
            messages,
            model: "unity"
        };
        const apiUrl = `https://text.pollinations.ai/openai?model=unity`;
        try {
            const response = await window.pollinationsFetch(apiUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json", Accept: "application/json" },
                body: JSON.stringify(body),
                cache: "no-store",
            });

            const data = await response.json();
            let generatedPrompt = data.choices?.[0]?.message?.content || data.choices?.[0]?.text || data.response;
            if (!generatedPrompt) throw new Error("No prompt returned from API");
            if (generatedPrompt.length > 100) generatedPrompt = generatedPrompt.substring(0, 100);
            return generatedPrompt;
        } catch (err) {
            console.error("Failed to fetch dynamic prompt:", err);
            throw err;
        }
    }
    async function updatePrompt() {
        if (!screensaverActive || paused || !autoPromptEnabled || isFetchingPrompt) {
            return false;
        }
        isFetchingPrompt = true;
        try {
            const newPrompt = await fetchDynamicPrompt();
            promptInput.value = newPrompt;
            settings.prompt = newPrompt;
            saveScreensaverSettings();
            window.showToast("New fucked-up prompt loaded from API: " + newPrompt);
            lastPromptUpdate = Date.now();
            return true;
        } catch (err) {
            console.error("Failed to fetch new prompt after retries:", err);
            window.showToast("Fuck, I can’t get a new prompt from the API! Trying again in next cycle.");
            lastPromptUpdate = Date.now();
            return false;
        } finally {
            isFetchingPrompt = false;
        }
    }

    async function fetchNewImage() {
        if (isTransitioning) return;
        isTransitioning = true;

        saveScreensaverSettings();
        let prompt = promptInput.value.trim();
        if (!prompt || autoPromptEnabled) {
            const success = await updatePrompt();
            if (success) {
                prompt = promptInput.value.trim();
            } else if (!prompt) {
                isTransitioning = false;
                return;
            }
        }

        const { width, height } = getDimensions(settings.aspect);
        const seed = generateSeed();
        const model = settings.model || "flux";
        const enhance = settings.enhance;
        const priv = settings.priv;

        const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${width}&height=${height}&seed=${seed}&model=${model}&nologo=true&private=${priv}&enhance=${enhance}&nolog=true&referrer=unityailab.com`;
        console.log("Generated new image URL:", url);

        const nextImage = currentImage === 'image1' ? 'image2' : 'image1';
        const nextImgElement = document.getElementById(`screensaver-${nextImage}`);
        const currentImgElement = document.getElementById(`screensaver-${currentImage}`);

        let finalImageUrl = url;
        let imageAddedToHistory = false;

        function handleImageLoad(logMessage) {
            nextImgElement.style.opacity = '1';
            currentImgElement.style.opacity = '0';
            currentImage = nextImage;
            if (!imageAddedToHistory) {
                finalImageUrl = nextImgElement.src;
                addToHistory(finalImageUrl, prompt);
                imageAddedToHistory = true;
            }
            console.log(logMessage, nextImgElement.src);
        }

        nextImgElement.onload = () => handleImageLoad("Image loaded successfully, added to history:");

        nextImgElement.onerror = () => {
            const fallbackUrl = "https://via.placeholder.com/512?text=Image+Failed";
            nextImgElement.src = fallbackUrl;
            nextImgElement.onload = () => handleImageLoad("Image failed, added fallback to history:");
            nextImgElement.onerror = () => {
                console.error("Fallback image also failed to load.");
            };
        };

        try {
            await preloadImage(url);
            nextImgElement.src = url;
        } catch (err) {
            const fallbackUrl = "https://via.placeholder.com/512?text=Image+Failed";
            nextImgElement.src = fallbackUrl;
        } finally {
            isTransitioning = false;
        }
    }

    function addToHistory(imageUrl, prompt) {
        if (imageHistory.includes(imageUrl)) {
            console.log("Duplicate image URL detected, skipping:", imageUrl);
            return;
        }
        imageHistory.unshift(imageUrl);
        promptHistory.unshift(prompt);
        if (imageHistory.length > MAX_HISTORY) {
            imageHistory.pop();
            promptHistory.pop();
        }
        saveImageHistory();
        updateThumbnailHistory();
        console.log("Current imageHistory length:", imageHistory.length, "Images:", imageHistory);
        console.log("Current promptHistory length:", promptHistory.length, "Prompts:", promptHistory);
    }

    function updateThumbnailHistory() {
        const thumbnailContainer = document.getElementById('screensaver-thumbnails');
        if (!thumbnailContainer) {
            console.error("Thumbnail container not found in DOM.");
            window.showToast("Fuck, the thumbnail container is missing. Can’t populate the gallery.");
            return;
        }

        thumbnailContainer.innerHTML = '';
        imageHistory.forEach((imageUrl, index) => {
            const thumb = document.createElement('img');
            thumb.src = imageUrl;
            thumb.classList.add('thumbnail');
            thumb.title = promptHistory[index] || 'No prompt available';
            thumb.alt = "Thumbnail Image";
            thumb.style.opacity = '1';
            thumb.onerror = () => {
                console.log(`Thumbnail ${index + 1} failed to load, using fallback:`, imageUrl);
                thumb.src = "https://via.placeholder.com/160x90?text=Image+Failed";
                thumb.style.opacity = '1';
            };
            thumb.onload = () => {
                console.log(`Thumbnail ${index + 1} loaded successfully:`, imageUrl);
            };
            thumb.onclick = () => showHistoricalImage(index);
            const currentImgSrc = document.getElementById(`screensaver-${currentImage}`).src;
            if (imageUrl === currentImgSrc) {
                thumb.classList.add('selected');
                console.log("Highlighted thumbnail as selected:", imageUrl);
            }
            thumbnailContainer.appendChild(thumb);
            console.log(`Added thumbnail ${index + 1}/${imageHistory.length} to DOM:`, thumb.src);
        });

        thumbnailContainer.scrollTo({ left: 0, behavior: 'smooth' });
        console.log("Updated thumbnail gallery with", imageHistory.length, "images. DOM count:", thumbnailContainer.children.length);

        const offsetWidth = thumbnailContainer.offsetWidth;
        thumbnailContainer.style.display = 'none';
        thumbnailContainer.offsetHeight;
        thumbnailContainer.style.display = 'flex';
        console.log("Forced DOM reflow to ensure rendering. Container offsetWidth:", offsetWidth);
    }

    function showHistoricalImage(index) {
        const imageUrl = imageHistory[index];
        const currentImgElement = document.getElementById(`screensaver-${currentImage}`);
        const nextImage = currentImage === 'image1' ? 'image2' : 'image1';
        const nextImgElement = document.getElementById(`screensaver-${nextImage}`);
        currentImgElement.style.opacity = '0';
        nextImgElement.onload = () => {
            nextImgElement.style.opacity = '1';
            currentImage = nextImage;
            updateThumbnailHistory();
        };
        nextImgElement.onerror = () => {
            nextImgElement.src = "https://via.placeholder.com/512?text=Image+Failed";
            nextImgElement.style.opacity = '1';
            currentImage = nextImage;
            updateThumbnailHistory();
        };
        nextImgElement.src = imageUrl;
        nextImgElement.alt = "Screensaver Image";
        if (nextImgElement.complete && nextImgElement.naturalWidth !== 0) {
            nextImgElement.style.opacity = '1';
            currentImgElement.style.opacity = '0';
            currentImage = nextImage;
            updateThumbnailHistory();
        }
    }

    function setOrResetImageInterval() {
        clearInterval(imageInterval);
        imageInterval = setInterval(() => {
            if (!paused && screensaverActive) {
                console.log("Fetching new image at interval...");
                fetchNewImage();
            }
        }, settings.timer * 1000);
    }

    function setOrResetPromptInterval() {
        clearInterval(promptInterval);
        promptInterval = null;
        if (autoPromptEnabled && screensaverActive && !paused) {
            lastPromptUpdate = Date.now();
            updatePrompt().then(success => {
                if (success) fetchNewImage();
            });
            promptInterval = setInterval(async () => {
                if (!autoPromptEnabled || !screensaverActive || paused || isFetchingPrompt) {
                    clearInterval(promptInterval);
                    promptInterval = null;
                    return;
                }
                const now = Date.now();
                const elapsed = now - lastPromptUpdate;
                if (elapsed >= PROMPT_UPDATE_INTERVAL) {
                    const success = await updatePrompt();
                    if (success) {
                        await fetchNewImage();
                    }
                }
            }, 1000);
        }
    }

    function toggleAutoPrompt() {
        autoPromptEnabled = !autoPromptEnabled;
        restartPromptButton.innerHTML = autoPromptEnabled ? "🔄 Auto-Prompt On" : "🔄 Auto-Prompt Off";
        window.showToast(autoPromptEnabled ? "Auto-prompt generation enabled" : "Auto-prompt generation disabled");
        if (autoPromptEnabled) {
            setOrResetPromptInterval();
        } else {
            clearInterval(promptInterval);
            promptInterval = null;
            if (promptInput.value.trim() && screensaverActive) {
                fetchNewImage();
            }
        }
    }

    function startScreensaver() {
        screensaverActive = true;
        paused = false;
        controlsHidden = false;

        screensaverContainer.style.position = "fixed";
        screensaverContainer.style.top = "0";
        screensaverContainer.style.left = "0";
        screensaverContainer.style.width = "100vw";
        screensaverContainer.style.height = "100vh";
        screensaverContainer.style.zIndex = "9999";
        screensaverContainer.classList.remove("hidden");

        screensaverImage1.style.opacity = '0';
        screensaverImage2.style.opacity = '0';

        screensaverContainer.style.setProperty('--transition-duration', `${settings.transitionDuration}s`);

        console.log("Starting screensaver, fetching initial image...");
        fetchNewImage();
        setOrResetImageInterval();
        setOrResetPromptInterval();

        toggleScreensaverButton.textContent = "Stop Screensaver";
        playPauseButton.innerHTML = "⏸️";
        hideButton.innerHTML = "🙈";
        if (restartPromptButton) restartPromptButton.innerHTML = autoPromptEnabled ? "🔄 Auto-Prompt On" : "🔄 Auto-Prompt Off";

        if (window.speechSynthesis) window.speechSynthesis.cancel();
        document.body.style.overflow = "hidden";
        window.screensaverActive = true;
    }

    function stopScreensaver() {
        screensaverActive = false;
        paused = false;
        controlsHidden = false;
        screensaverContainer.classList.add("hidden");
        clearInterval(imageInterval);
        clearInterval(promptInterval);
        promptInterval = null;

        imageHistory = [];
        promptHistory = [];
        localStorage.removeItem("imageHistory");
        localStorage.removeItem("promptHistory");
        updateThumbnailHistory();

        document.body.style.overflow = "";
        window.screensaverActive = false;

        toggleScreensaverButton.textContent = "Start Screensaver";
        playPauseButton.innerHTML = "▶️";
        hideButton.innerHTML = "🙈";
        if (restartPromptButton) restartPromptButton.innerHTML = autoPromptEnabled ? "🔄 Auto-Prompt On" : "🔄 Auto-Prompt Off";

        if (isFullscreen) {
            document.exitFullscreen().then(() => {
                isFullscreen = false;
                fullscreenButton.textContent = "⛶";
            }).catch(err => console.error("Error exiting fullscreen on stop:", err));
        }
    }

    function togglePause() {
        paused = !paused;
        playPauseButton.innerHTML = paused ? "▶️" : "⏸️";
        window.showToast(paused ? "Screensaver paused" : "Screensaver resumed");
        if (!paused) {
            setOrResetImageInterval();
            setOrResetPromptInterval();
        }
    }

    function toggleControls() {
        controlsHidden = !controlsHidden;
        const controls = document.querySelector('.screensaver-controls');
        const thumbnails = document.querySelector('.screensaver-thumbnails');
        if (controlsHidden) {
            controls.classList.add('hidden-panel');
            thumbnails.classList.add('hidden-panel');
            hideButton.innerHTML = "🙉";
        } else {
            controls.classList.remove('hidden-panel');
            thumbnails.classList.remove('hidden-panel');
            hideButton.innerHTML = "🙈";
        }
        window.showToast(controlsHidden ? "Controls hidden" : "Controls visible");
    }

    function saveImage() {
        if (!document.getElementById(`screensaver-${currentImage}`).src) {
            window.showToast("No image to save");
            return;
        }
        fetch(document.getElementById(`screensaver-${currentImage}`).src, { mode: "cors" })
            .then(response => {
                if (!response.ok) throw new Error("Network response was not ok");
                return response.blob();
            })
            .then(blob => {
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `screensaver-image-${Date.now()}.png`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                window.showToast("Image download initiated");
            })
            .catch(err => {
                console.error("Error saving image:", err);
                window.showToast("Failed to save image");
            });
    }

    function copyImage() {
        const currentImg = document.getElementById(`screensaver-${currentImage}`);
        if (!currentImg.src) {
            window.showToast("No image to copy");
            return;
        }
        if (!currentImg.complete || currentImg.naturalWidth === 0) {
            window.showToast("Image not fully loaded yet. Please try again.");
            return;
        }
        copyButton.textContent = "📋 Copying...";
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        canvas.width = currentImg.naturalWidth;
        canvas.height = currentImg.naturalHeight;
        ctx.drawImage(currentImg, 0, 0);
        canvas.toBlob(blob => {
            if (!blob) {
                copyButton.textContent = "📋 Copy";
                window.showToast("Failed to copy image: Unable to create blob.");
                return;
            }
            navigator.clipboard.write([new ClipboardItem({ "image/png": blob })])
                .then(() => {
                    const dataURL = canvas.toDataURL("image/png");
                    localStorage.setItem("lastCopiedImage", dataURL);
                    copyButton.textContent = "✅ Copied!";
                    window.showToast("Image copied to clipboard and saved to local storage");
                    setTimeout(() => copyButton.textContent = "📋 Copy", 1500);
                })
                .catch(err => {
                    copyButton.textContent = "❌ Failed";
                    window.showToast("Copy failed: " + err.message);
                    setTimeout(() => copyButton.textContent = "📋 Copy", 1500);
                });
        }, "image/png");
    }

    function toggleFullscreen() {
        if (!screensaverActive) {
            window.showToast("Start the screensaver first!");
            return;
        }
        if (!document.fullscreenElement) {
            screensaverContainer.requestFullscreen()
                .then(() => {
                    isFullscreen = true;
                    fullscreenButton.textContent = "↙";
                    screensaverImage1.style.objectFit = "contain";
                    screensaverImage2.style.objectFit = "contain";
                    screensaverContainer.style.backgroundColor = "#000000";
                })
                .catch(err => window.showToast("Failed to enter fullscreen: " + err.message));
        } else {
            document.exitFullscreen()
                .then(() => {
                    isFullscreen = false;
                    fullscreenButton.textContent = "⛶";
                    screensaverImage1.style.objectFit = "cover";
                    screensaverImage2.style.objectFit = "cover";
                    screensaverContainer.style.backgroundColor = "#000000";
                })
                .catch(err => window.showToast("Failed to exit fullscreen: " + err.message));
        }
    }

    promptInput.addEventListener('focus', () => {
        clearInterval(promptInterval);
        promptInterval = null;
    });

    promptInput.addEventListener('input', () => {
        settings.prompt = promptInput.value;
    });

    timerInput.addEventListener('change', () => {
        settings.timer = parseInt(timerInput.value) || 30;
        saveScreensaverSettings();
        if (screensaverActive) setOrResetImageInterval();
    });

    aspectSelect.addEventListener('change', () => {
        settings.aspect = aspectSelect.value;
        saveScreensaverSettings();
    });

    modelSelect.addEventListener('change', () => {
        settings.model = modelSelect.value;
        saveScreensaverSettings();
    });

    enhanceCheckbox.addEventListener('change', () => {
        settings.enhance = enhanceCheckbox.checked;
        saveScreensaverSettings();
    });

    privateCheckbox.addEventListener('change', () => {
        settings.priv = privateCheckbox.checked;
        saveScreensaverSettings();
    });

    transitionDurationInput.addEventListener('change', () => {
        settings.transitionDuration = parseFloat(transitionDurationInput.value) || 1;
        saveScreensaverSettings();
        screensaverContainer.style.setProperty('--transition-duration', `${settings.transitionDuration}s`);
    });

    if (restartPromptButton) {
        restartPromptButton.addEventListener("click", (e) => {
            e.stopPropagation();
            toggleAutoPrompt();
        });
    }

    toggleScreensaverButton.addEventListener("click", () => {
        screensaverActive ? stopScreensaver() : startScreensaver();
    });

    fullscreenButton.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleFullscreen();
    });

    stopButton.addEventListener("click", (e) => {
        e.stopPropagation();
        stopScreensaver();
    });

    playPauseButton.addEventListener("click", (e) => {
        e.stopPropagation();
        if (screensaverActive) togglePause();
        else window.showToast("Start the screensaver first!");
    });

    saveButton.addEventListener("click", (e) => {
        e.stopPropagation();
        if (screensaverActive) saveImage();
        else window.showToast("Start the screensaver first!");
    });

    copyButton.addEventListener("click", (e) => {
        e.stopPropagation();
        if (screensaverActive) copyImage();
        else window.showToast("Start the screensaver first!");
    });

    hideButton.addEventListener("click", (e) => {
        e.stopPropagation();
        if (screensaverActive) toggleControls();
        else window.showToast("Start the screensaver first!");
    });

    document.addEventListener('keydown', (e) => {
        if (!screensaverActive) return;
        switch (e.key) {
            case 'p': togglePause(); break;
            case 's': saveImage(); break;
            case 'c': copyImage(); break;
            case 'f': toggleFullscreen(); break;
            case 'Escape':
                if (controlsHidden) toggleControls();
                else stopScreensaver();
                break;
            case 'h': toggleControls(); break;
            case 'r': toggleAutoPrompt(); break;
        }
    });

    window.showToast = function(message, duration = 3000) {
        let toast = document.getElementById("toast-notification");
        if (!toast) {
            toast = document.createElement("div");
            toast.id = "toast-notification";
            toast.style.position = "fixed";
            toast.style.top = "5%";
            toast.style.left = "50%";
            toast.style.transform = "translateX(-50%)";
            toast.style.backgroundColor = "rgba(0,0,0,0.7)";
            toast.style.color = "white";
            toast.style.padding = "10px 20px";
            toast.style.borderRadius = "5px";
            toast.style.zIndex = "9999";
            toast.style.transition = "opacity 0.3s";
            document.body.appendChild(toast);
        }
        toast.textContent = message;
        toast.style.opacity = "1";
        clearTimeout(toast.timeout);
        toast.timeout = setTimeout(() => toast.style.opacity = "0", duration);
    };

    console.log("Screensaver initialized with dynamic API prompts and streaming thumbnail gallery!");
});
