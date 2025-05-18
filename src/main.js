function initializeTranslationApp(serverUrl) {
    // ------------------ DOM ELEMENTS ------------------
    const $serviceMessageOutput = $("#service-message-output");
    const $serviceMessageOutputIcon = $("#service-message-output-icon");
    const $textDisplay = $('#output');
    const $sidePanel = $('#side-panel');
    const $langSelect = $('#targetLang');
    const $toggleSidePanel = $('#toggle-side-panel');

    // ------------------ STATE ------------------
    let socket = null;
    let reconnectInterval = null;
    let isPaused = false;
    let isPlaying = false;
    let wakeLock = null;

    // ------------------ THEME ------------------
    function setThemeFromLocalStorage() {
        if (localStorage.getItem('theme') === 'dark') {
            document.documentElement.classList.add('dark');
        }
    }

    function toggleTheme() {
        const darkMode = document.documentElement.classList.toggle('dark');
        localStorage.setItem('theme', darkMode ? 'dark' : 'light');
    }

    // ------------------ AUDIO ------------------
    function playAudio(base64, onEnd) {
        if (isPlaying) return console.log("Audio already playing.");
        isPlaying = true;

        const audioBlob = new Blob(
            [new Uint8Array(atob(base64).split('').map(c => c.charCodeAt(0)))],
            {type: 'audio/mp3'}
        );

        const audio = new Audio(URL.createObjectURL(audioBlob));
        audio.play().catch(console.error);
        audio.onended = () => {
            isPlaying = false;
            onEnd?.();
        };
    }

    async function getNextAudioElement($el) {
        const $next = $el.next();
        if ($next.length) return $next;
        await new Promise(r => setTimeout(r, 500));
        return getNextAudioElement($el);
    }

    async function playAudioFromElement($el) {
        const audioContent = $el.attr('data-audio-content');
        if (!audioContent) return;

        const $icon = $el.children('span');
        $icon.addClass('opacity-50 pointer-events-none');

        playAudio(audioContent, async () => {
            $el.removeAttr('data-audio-content');
            $icon.text('✔');
            await playAudioFromElement(await getNextAudioElement($el));
        });
    }

    // ------------------ SOCKET ------------------
    let reconnecting = false;

    function connectWebSocket(lang) {
        if (!lang || reconnecting) return;

        if (socket && socket.readyState < 2) return;

        reconnecting = true;
        const wsUrl = `ws://${serverUrl}:8000/ws/transcribe/${lang}`;
        $serviceMessageOutput.text(`Connecting to ${wsUrl}...`);

        try {
            socket = new WebSocket(wsUrl);
        } catch (err) {
            console.error("Failed to create WebSocket:", err);
            $serviceMessageOutput.text("Invalid WebSocket URL or browser issue.");
            reconnecting = false;
            return;
        }

        socket.onopen = () => {
            $serviceMessageOutput.text(`Connected: ${lang}`);
            $serviceMessageOutputIcon?.addClass('blinking');
            clearInterval(reconnectInterval);
            reconnectInterval = null;
            reconnecting = false;
        };

        socket.onclose = () => {
            $serviceMessageOutput.text('Disconnected');
            $serviceMessageOutputIcon?.removeClass('blinking');
            reconnecting = false;

            if (!reconnectInterval) {
                reconnectInterval = setInterval(() => {
                    if (!socket || socket.readyState >= 2) {
                        connectWebSocket(localStorage.getItem('selectedLanguage'));
                    }
                }, 5000);
            }
        };

        socket.onerror = err => {
            console.error("WebSocket error:", err);
            $serviceMessageOutput.text(`Error: ${err.message || err}`);
        };

        socket.onmessage = ({data}) => {
            try {
                const msg = JSON.parse(data);
                if (msg.translated_text) addText(msg);
            } catch (err) {
                console.error("Invalid message data", err);
            }
        };
    }

    // ------------------ UI HELPERS ------------------
    function addText({original_text, translated_text, audio_content}) {
        if (isPaused) return;

        $('<div class="flex items-center w-full">')
            .append(
                $('<div class="message bg-blue-100 dark:bg-blue-800 text-blue-900 dark:text-blue-100 rounded-lg px-4 py-2 flex-1">')
                    .text(translated_text)
                    .attr('title', original_text)
                    .on('touchstart', function () {
                        $(this).text(original_text);
                    })
                    .on('touchend touchcancel', function () {
                        $(this).text(translated_text);
                    })
            )
            .append(
                $('<span class="message-audio-icon ml-2 cursor-pointer w-1/12 text-center">🔊</span>')
                    .on('click', () => playAudioFromElement($(event.currentTarget).parent()))
            )
            .attr('data-audio-content', audio_content || null)
            .appendTo($textDisplay);

        setTimeout(() => {
            $textDisplay.scrollTop($textDisplay[0].scrollHeight);
        }, 0);
    }

    function clearText() {
        $textDisplay.empty();
    }

    function togglePause($btn) {
        isPaused = !isPaused;
        const $icon = $btn.find('img');
        $icon.attr('src', isPaused
            ? '/img/play-svgrepo-com.svg'
            : '/img/play-pause-svgrepo-com.svg');
        $serviceMessageOutputIcon?.toggleClass('blinking', !isPaused);
    }

    function toggleSidePanel() {
        $sidePanel.toggleClass('hidden');
        $('main').toggleClass('shifted');
    }

    function getButton(text, iconUrl, alt, onClick) {
        const html = iconUrl ? `${text}<img src="${iconUrl}" alt="${alt}">` : text;
        return $('<button>', {
            html,
            click: onClick
        }).addClass('bg-gray-200 dark:bg-gray-700 px-3 py-1 rounded hover:bg-gray-300 dark:hover:bg-gray-600');
    }

    function createFooterButtons() {
        const $pauseBtn = getButton('', '/img/play-pause-svgrepo-com.svg', 'pause', () => togglePause($pauseBtn));
        $sidePanel.append(
            getButton('', '/img/theme-store.svg', 'theme', toggleTheme),
            getButton('', '/img/refresh-cw-alt-1-svgrepo-com.svg', 'clear', clearText),
            $pauseBtn,
            getButton('', '/img/audio.svg', 'audio', () => {
                $textDisplay.children().each((_, el) => playAudioFromElement($(el)));
            }),
            getButton('', '/img/settings-cog-svgrepo-com.svg', 'settings', () => window.location.href = "/settings")
        );
    }

    // ------------------ LANGUAGE ------------------
    async function changeLanguage(lang) {
        localStorage.setItem('selectedLanguage', lang);
        try {
            const res = await fetch(`http://${serverUrl}:8000/api/addLang`, {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({lang})
            });
            if (!res.ok) throw new Error((await res.json()).detail);
            socket?.close(1000, 'Lang switch');
            connectWebSocket(lang);
        } catch (err) {
            console.error("Change lang error:", err);
        }
    }

    function initLanguageSelect(languages, selectedLang) {
        $langSelect.empty().append(
            languages.map(({value, text}) => new Option(text, value))
        );
        $langSelect.val(selectedLang);
        $langSelect.on("change", e => changeLanguage(e.target.value));
    }

    async function fetchLanguages() {
        try {
            const res = await fetch(`http://${serverUrl}:8000/api/languages`);
            if (!res.ok) throw new Error('Fetch failed');
            const langs = await res.json();
            return langs.map(code => ({value: code, text: code}))
                .concat({value: 'ht', text: 'Haitian Creole'});
        } catch (err) {
            console.error('Lang fetch error:', err);
            return [
                {value: 'en', text: 'English'},
                {value: 'ru', text: 'Russian'},
                {value: 'fr', text: 'Français'}
            ];
        }
    }

    // ------------------ WAKE LOCK ------------------
    async function requestWakeLock() {
        try {
            wakeLock = await navigator.wakeLock?.request('screen');
            console.log('Wake Lock is active');
        } catch (err) {
            console.error("Wake Lock error:", err);
        }
    }

    // ------------------ INIT ------------------
    async function initApp() {

        createFooterButtons();
        setThemeFromLocalStorage();
        $toggleSidePanel.on("click", toggleSidePanel);

        const selectedLang = localStorage.getItem('selectedLanguage') || 'ru';
        const languages = await fetchLanguages();
        initLanguageSelect(languages, selectedLang);
        await changeLanguage(selectedLang);
        await requestWakeLock();
    }

    initApp();
}


async function testSocketConnection(server_url) {
    if (!server_url || server_url.trim() === '') {
        $("#statusMessage").text("Server address is empty.");
        localStorage.setItem("selectedServer", '');
        return false;
    }

    $("#statusMessage").text("Connecting to " + server_url + "...");

    return new Promise((resolve) => {
        try {
            let ping_server_url = `ws://${server_url}:8000/ws/ping`;
            const testSocket = new WebSocket(ping_server_url);

            testSocket.onopen = () => {
                $("#statusMessage").text("Connected to " + server_url);
                setTimeout(() => {
                    testSocket.close(); // Close test socket
                    resolve(true); // Успешное подключение
                }, 300);
            };

            testSocket.onerror = () => {
                $("#statusMessage").text("Failed to connect to " + server_url);
                resolve(false); // Ошибка подключения
            };

            testSocket.onclose = (event) => {
                if (!event.wasClean) {
                    $("#statusMessage").text("Connection closed unexpectedly");
                }
                // Ничего не делаем здесь — результат уже вернён
            };

            // На случай зависания — таймаут 3 секунды
            setTimeout(() => {
                testSocket.close();
                resolve(false);
            }, 3000);

        } catch (err) {
            console.error("WebSocket connection error:", err);
            $("#statusMessage").text("Invalid server URL or connection issue.");
            localStorage.setItem("selectedServer", '');
            resolve(false);
        }
    });
}

const $serverSelection = $("#server-selection");
const $translationApp = $("#translation-app");

// On load: if server is already selected, go directly to app
$(document).ready(() => {
    const server_url = localStorage.getItem("selectedServer");

    testSocketConnection(server_url).then((isConnected) => {

        if (isConnected) {
            $serverSelection.addClass("hidden");
            $translationApp.removeClass("hidden");

            if (typeof initializeTranslationApp === "function") {
                initializeTranslationApp(server_url);
            }
        }

    });

    // Handle server selection and show translation UI
    $("#connectBtn").on("click", () => {
        let server_url = $('#serverSelector').val();

        testSocketConnection(server_url).then((isConnected) => {
            if (isConnected) {
                localStorage.setItem("selectedServer", server_url);

                $serverSelection.addClass("hidden");
                $translationApp.removeClass("hidden");

                if (typeof initializeTranslationApp === "function") {
                    initializeTranslationApp(server_url);
                }
            } else {
                localStorage.setItem("selectedServer", '');
            }
        });

    });

});