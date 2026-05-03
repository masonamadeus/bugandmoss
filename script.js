document.addEventListener('DOMContentLoaded', () => {

    // ==========================================
    // 0. TV — LIVE OR OFFLINE
    // ==========================================
    const tvScreen = document.getElementById('tv-screen');

    function isStreamLive() {
        // Get current time in US Eastern (handles EST/EDT automatically)
        const now = new Date();
        const est = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
        const day = est.getDay(); // 0 = Sun, 6 = Sat
        const mins = est.getHours() * 60 + est.getMinutes();
        const isWeekday = day >= 1 && day <= 5;
        
        // 7:00 AM = 420 mins. 8:30 AM = 510 mins. 
        const inWindow = mins >= 410 && mins <= 510; 
        
        return isWeekday && inWindow;
    }

    async function setupTV() {
        const glare = '<div class="screen-glare"></div>';
        
        if (isStreamLive()) {
            // WE ARE LIVE! Show Twitch.
            const parent = window.location.hostname || 'localhost';
            tvScreen.innerHTML = `
                <iframe src="https://player.twitch.tv/?channel=bugandmoss&parent=${parent}" frameborder="0" allowfullscreen="true" scrolling="no"></iframe>
                ${glare}`;
        } else {
            // OFF AIR! Fetch the latest completed YouTube video using DecAPI
            const ytHandle = "@bugandmosstv"; 
            
            // DecAPI is built for streamers. It returns raw text and bypasses upcoming streams!
            const apiUrl = `https://decapi.me/youtube/latest_video?handle=${ytHandle}&no_livestream=1&format={id}`;

            try {
                tvScreen.innerHTML = `
                    <div style="display:flex; align-items:center; justify-content:center; height:100%; background:#000; color:#3bb273; font-family:var(--font-digital); font-size: 1.5rem;">
                        LOADING VOD...
                    </div>
                    ${glare}`;
                
                const response = await fetch(apiUrl);
                
                // If DecAPI is down or returns an error, catch it
                if (!response.ok) throw new Error("API Network Error");
                
                // We requested format={id}, so the response text is JUST the 11-character video ID
                const videoId = await response.text(); 
                
                // DecAPI returns strings starting with "Error" if the channel isn't found
                if (videoId.includes("Error") || videoId.includes("No video")) {
                    throw new Error(videoId);
                }
                
                tvScreen.innerHTML = `
                    <iframe src="https://www.youtube.com/embed/${videoId.trim()}?autoplay=0" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen="true"></iframe>
                    ${glare}`;
                
            } catch (error) {
                console.error("Error fetching latest YouTube VOD:", error);
                
                // Fallback offline screen if the fetch fails completely
                tvScreen.innerHTML = `
                    <div class="tv-offline" style="background:#111; height:100%; display:flex; flex-direction:column; align-items:center; justify-content:center; color:#fff; font-family:var(--font-cartoon);">
                        <div style="font-size: 2.5rem; filter: grayscale(1) opacity(0.5); margin-bottom: 0.2rem;">📺</div>
                        <p style="font-size: 1.6rem; font-weight: 700; margin: 0; letter-spacing: 1px;">Off Air</p>
                        <p style="font-size: 1rem; color: #888; margin: 0;">Live weekdays 7–8am EST</p>
                        <a href="https://youtube.com/@bugandmosstv" target="_blank" style="margin-top:0.6rem; background:var(--color-youtube); color:#fff; border-radius:8px; padding:0.5rem 1.2rem; text-decoration:none;">Watch on YouTube</a>
                    </div>
                    ${glare}`;
            }
        }
    }

    setupTV();

    // ==========================================
    // 1. THE PHONE DIRECTORY (SMART PAGINATION & INDEX)
    // ==========================================
    let directoryPages = []; 
    let bookPages = [];
    let currentBookPage = 0;
    
    // Index Variables
    let indexData = []; 
    let indexPages = [];
    let currentIndexPage = 0;
    let isIndexMode = false;

    async function loadDirectory() {
        try {
            const response = await fetch('directory.json?t=' + Date.now());
            if (!response.ok) throw new Error("Could not load directory.json");
            
            directoryPages = await response.json();
            
            // Front-End Random Ad Generator (Kept identical to your version)
            directoryPages.forEach(category => {
                if (!category.entries || category.entries.length === 0) return;
                const totalItems = category.entries.length;
                let hardcodedAds = category.entries.filter(e => e.isAd).length;
                let maxAdsAllowed = 0;
                if (totalItems > 10) maxAdsAllowed = 2;
                else if (totalItems > 3) maxAdsAllowed = 1;
                
                let adsToAdd = maxAdsAllowed - hardcodedAds;
                if (adsToAdd > 0) {
                    let normalIndices = [];
                    category.entries.forEach((entry, idx) => { if (!entry.isAd) normalIndices.push(idx); });
                    for (let i = normalIndices.length - 1; i > 0; i--) {
                        const j = Math.floor(Math.random() * (i + 1));
                        [normalIndices[i], normalIndices[j]] = [normalIndices[j], normalIndices[i]];
                    }
                    const selectedIndices = normalIndices.slice(0, adsToAdd);
                    selectedIndices.forEach(idx => {
                        category.entries[idx].isAd = true;
                        if (!category.entries[idx].subtitle) category.entries[idx].subtitle = "Featured Listing"; 
                    });
                }
            });

            // The Smart Pagination Engine
            bookPages = [];
            indexData = []; // Clear index map
            let currentPageData = [];
            let currentWeight = 0;

            const isMobile = window.innerWidth < 600;
            const MAX_WEIGHT = isMobile ? 10 : 12; // Fewer items per page on mobile
           
            
            directoryPages.forEach(category => {
                if (!category.entries || category.entries.length === 0) return;
                
                const firstItemWeight = category.entries[0].isAd ? 4 : 1;
                const requiredInitialSpace = 2 + firstItemWeight;
                
                if (currentWeight + requiredInitialSpace > MAX_WEIGHT && currentPageData.length > 0) {
                    bookPages.push(currentPageData);
                    currentPageData = [];
                    currentWeight = 0;
                }
                
                // --- Map this category to the exact page it starts on! ---
                indexData.push({ title: category.title, targetPage: bookPages.length });
                
                currentPageData.push({ type: 'header', text: category.title });
                currentWeight += 2;
                
                category.entries.forEach(item => {
                    if (item.isHidden) return;
                    const itemWeight = item.isAd ? 3 : 1; 
                    
                    if (currentWeight + itemWeight > MAX_WEIGHT && currentPageData.length > 0) {
                        bookPages.push(currentPageData);
                        currentPageData = [];
                        currentWeight = 0;
                        currentPageData.push({ type: 'header', text: category.title + ' (cont.)' });
                        currentWeight += 2;
                    }
                    
                    currentPageData.push({ type: 'entry', data: item });
                    currentWeight += itemWeight;
                });
            });
            
            if (currentPageData.length > 0) bookPages.push(currentPageData);

            // --- Chunk the Index into its own pages (10 categories per page) ---
            indexPages = [];
            const ITEMS_PER_INDEX_PAGE = 10;
            for (let i = 0; i < indexData.length; i += ITEMS_PER_INDEX_PAGE) {
                indexPages.push(indexData.slice(i, i + ITEMS_PER_INDEX_PAGE));
            }
            
            renderPhoneBookPage();

        } catch (error) {
            console.error("Directory Error:", error);
            document.getElementById('directory-list').innerHTML = "<div style='color:red;'>Directory unavailable.</div>";
        }
    }

    function escapeHtml(unsafe) {
        if (!unsafe) return "";
        return unsafe.toString().replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }

    function renderPhoneBookPage() {
        const listElement = document.getElementById('directory-list');
        listElement.innerHTML = '';
        if (bookPages.length === 0) return;
        
        const pageData = bookPages[currentBookPage];
        
        pageData.forEach(item => {
            if (item.type === 'header') {
                const catHeader = document.createElement('div');
                catHeader.className = 'pb-category-header';
                catHeader.innerText = item.text;
                listElement.appendChild(catHeader);
            } else {
                const entryData = item.data;
                const entryDiv = document.createElement('div');
                
                if (entryData.isAd) {
                    entryDiv.className = 'pb-ad-entry';
                    entryDiv.innerHTML = `
                        <div class="pb-ad-header">
                            <span class="pb-ad-title">${escapeHtml(entryData.name)}</span>
                            <span class="pb-dots"></span>
                            <strong class="pb-ad-number">${escapeHtml(entryData.number)}</strong>
                        </div>
                        ${entryData.subtitle ? `<div class="pb-ad-subtitle">${escapeHtml(entryData.subtitle)}</div>` : ''}
                        ${entryData.description ? `<div class="pb-ad-desc">${escapeHtml(entryData.description)}</div>` : ''}
                    `;
                } else {
                    entryDiv.className = 'pb-normal-entry';
                    entryDiv.innerHTML = `
                        <span class="pb-name">${escapeHtml(entryData.name)}</span>
                        <span class="pb-dots"></span>
                        <strong class="pb-number">${escapeHtml(entryData.number)}</strong>
                    `;
                }
                listElement.appendChild(entryDiv);
            }
        });

        document.getElementById('pb-page-indicator').innerText = `Pg ${currentBookPage + 1} / ${bookPages.length}`;
        document.getElementById('pb-prev').style.visibility = currentBookPage === 0 ? 'hidden' : 'visible';
        document.getElementById('pb-next').style.visibility = currentBookPage === bookPages.length - 1 ? 'hidden' : 'visible';
    }

    // --- Index View Rendering & Toggle Logic ---
    function toggleIndexMode() {
        isIndexMode = !isIndexMode;
        const dirView = document.getElementById('directory-list');
        const dirControls = document.getElementById('dir-controls');
        const idxView = document.getElementById('index-view');
        const indexTab = document.getElementById('index-tab');
        
        if (isIndexMode) {
            dirView.style.display = 'none';
            dirControls.style.display = 'none';
            idxView.style.display = 'block';
            indexTab.innerText = "CLOSE";
            indexTab.style.backgroundColor = '#ccc'; // Gray out the tab when open
            currentIndexPage = 0;
            renderIndexPage();
        } else {
            dirView.style.display = 'flex';
            dirControls.style.display = 'block';
            idxView.style.display = 'none';
            indexTab.innerText = "INDEX";
            indexTab.style.backgroundColor = '#ff9ee2'; // Restore pink tab
            renderPhoneBookPage();
        }
    }

    function renderIndexPage() {
        const listEl = document.getElementById('index-list-container');
        listEl.innerHTML = '';
        if (indexPages.length === 0) return;
        
        const pageData = indexPages[currentIndexPage];
        
        pageData.forEach(item => {
            const div = document.createElement('div');
            div.className = 'index-item';
            div.innerHTML = `<span>${escapeHtml(item.title)}</span><span class="index-item-page">Pg ${item.targetPage + 1}</span>`;
            
            // Clicking an index item jumps to that page and closes the index
            div.addEventListener('click', () => {
                currentBookPage = item.targetPage;
                toggleIndexMode(); 
            });
            listEl.appendChild(div);
        });

        document.getElementById('idx-page-indicator').innerText = `Index Pg ${currentIndexPage + 1} / ${indexPages.length}`;
        document.getElementById('idx-prev').style.visibility = currentIndexPage === 0 ? 'hidden' : 'visible';
        document.getElementById('idx-next').style.visibility = currentIndexPage === indexPages.length - 1 ? 'hidden' : 'visible';
    }

    // --- Button Listeners ---
    document.getElementById('index-tab').addEventListener('click', toggleIndexMode);

    document.getElementById('pb-prev').addEventListener('click', () => {
        if (currentBookPage > 0) { currentBookPage--; renderPhoneBookPage(); }
    });

    document.getElementById('pb-next').addEventListener('click', () => {
        if (currentBookPage < bookPages.length - 1) { currentBookPage++; renderPhoneBookPage(); }
    });

    document.getElementById('idx-prev').addEventListener('click', () => {
        if (currentIndexPage > 0) { currentIndexPage--; renderIndexPage(); }
    });

    document.getElementById('idx-next').addEventListener('click', () => {
        if (currentIndexPage < indexPages.length - 1) { currentIndexPage++; renderIndexPage(); }
    });

    // Boot it up
    loadDirectory();

    // ==========================================
    // 3. TELEPHONE DIALING LOGIC & DTMF TONES
    // ==========================================
    const screen = document.getElementById('phone-screen');
    const keys = document.querySelectorAll('.key');
    const clearBtn = document.getElementById('btn-clear');
    const callBtn = document.getElementById('btn-call');
    
    let currentNumber = '';
    
    // --- DTMF Tone Synthesizer ---
    let audioCtx;
    const dtmfFrequencies = {
        '1': [697, 1209], '2': [697, 1336], '3': [697, 1477],
        '4': [770, 1209], '5': [770, 1336], '6': [770, 1477],
        '7': [852, 1209], '8': [852, 1336], '9': [852, 1477],
        '*': [941, 1209], '0': [941, 1336], '#': [941, 1477]
    };

    function playDTMF(key) {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume();
        
        const freqs = dtmfFrequencies[key];
        if (!freqs) return;

        const osc1 = audioCtx.createOscillator();
        const osc2 = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();

        osc1.frequency.value = freqs[0];
        osc2.frequency.value = freqs[1];
        
        osc1.connect(gainNode);
        osc2.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);

        osc1.start(); osc2.start();
        osc1.stop(audioCtx.currentTime + 0.1); osc2.stop(audioCtx.currentTime + 0.1);
    }

    // --- Custom Tone Generator for Ringing/Errors ---
    function playTone(freq1, freq2, durationMs) {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume();

        const osc1 = audioCtx.createOscillator();
        const osc2 = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();

        osc1.frequency.value = freq1;
        osc2.frequency.value = freq2;

        osc1.connect(gainNode);
        osc2.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        const durationSec = durationMs / 1000;
        
        gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);

        osc1.start(); osc2.start();
        osc1.stop(audioCtx.currentTime + durationSec); 
        osc2.stop(audioCtx.currentTime + durationSec);
    }

    // --- Mechanical Click/Pop Generator ---
    function playClickPop(startFreq) {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume();

        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();

        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        // A massive, rapid drop in frequency creates a percussive "pop"
        osc.frequency.setValueAtTime(startFreq, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(50, audioCtx.currentTime + 0.05);

        // Very short volume envelope (50ms)
        gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.05);

        osc.start(audioCtx.currentTime);
        osc.stop(audioCtx.currentTime + 0.05);
    }

    // --- Keypad Logic ---
    keys.forEach(key => {
        key.addEventListener('mousedown', () => {
            const val = key.querySelector('.key-num').textContent;
            playDTMF(val);
            if (currentNumber.length < 15 && currentNumber !== 'ERR') {
                currentNumber += val;
                updateScreen();
            }
        });
    });

    clearBtn.addEventListener('mousedown', () => {
        playClickPop(600); // Lower pitched pop for "Clear"
        currentNumber = '';
        updateScreen();
    });

    callBtn.addEventListener('mousedown', () => {
        playClickPop(1000); // Higher pitched pop for "Call"
        const dialed = currentNumber;
        const allContacts = directoryPages.flatMap(page => page.entries || []);
        
        const contact = allContacts.find(item => {
            if (!item.number) return false;
            const directoryDigits = mapAlphaToDigits(item.number); 
        
            return directoryDigits === dialed;
        });
        
        if (contact) {
            screen.innerText = 'DIALING';
            
            // Standard North American Ringback Tone (440Hz & 480Hz)
            playTone(440, 480, 800); 
            
            // Check if it's an audio easter egg or a web link
            if (contact.audioUrl) {
                // Wait 800ms for the connection tone to finish before playing the audio file
                setTimeout(() => {
                    const secretAudio = new Audio(contact.audioUrl);
                    secretAudio.play();
                    setTimeout(() => {
                        currentNumber = '';
                        updateScreen();
                    }, 2000); 
                }, 800);
            } else if (contact.url) {
                setTimeout(() => {
                    window.open(contact.url, '_blank').focus();
                    currentNumber = '';
                    updateScreen();
                }, 800);
            }
        } else if (dialed !== '') {
            screen.innerText = 'ERR';
            
            // Standard North American "Invalid/Busy" Tone (480Hz & 620Hz)
            playTone(480, 620, 500);
            
            setTimeout(() => {
                currentNumber = '';
                updateScreen();
            }, 1000);
        }
    });

    function updateScreen() {
        screen.innerText = currentNumber;
    }

    // --- Keyboard Support ---
    document.addEventListener('keydown', (e) => {
        // SAFETY CHECK: Don't dial if the user is typing in the Scratch Pad or an input field!
        if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;

        let targetButton = null;
        const key = e.key;

        // Match 0-9, *, and # to the keypad
        if (['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '#'].includes(key)) {
            targetButton = Array.from(keys).find(k => k.querySelector('.key-num').textContent === key);
        } 
        // Match Backspace or Delete to the CLEAR button
        else if (key === 'Backspace' || key === 'Delete') {
            targetButton = clearBtn;
        } 
        // Match Enter to the CALL button
        else if (key === 'Enter') {
            targetButton = callBtn;
        }

        if (targetButton) {
            // Prevent default browser behaviors (like 'Enter' scrolling the page or 'Backspace' navigating back)
            e.preventDefault(); 
            
            // 1. Trigger the actual dialing and audio logic
            targetButton.dispatchEvent(new MouseEvent('mousedown'));
            
            // 2. Visually push the button down for 100 milliseconds
            targetButton.classList.add('keyboard-active');
            setTimeout(() => targetButton.classList.remove('keyboard-active'), 100);
        }
    });

    // ==========================================
    // 4. SCRATCH PAD LOGIC
    // ==========================================
    const scratchPad = document.getElementById('scratch-pad-text');
    if (scratchPad) {
        // Load existing notes from browser memory
        const savedNotes = localStorage.getItem('bugandmoss-scratchpad');
        if (savedNotes) {
            scratchPad.value = savedNotes;
        }

        // Auto-save whenever the user types
        scratchPad.addEventListener('input', () => {
            localStorage.setItem('bugandmoss-scratchpad', scratchPad.value);
        });
    }

    // ==========================================
    // 5. TV KNOB EASTER EGG
    // ==========================================
    const tvKnobs = document.querySelectorAll('.tv-knob');
    
    tvKnobs.forEach(knob => {
        knob.addEventListener('click', () => {
            // Adds the CSS animation class to drop it off the screen
            knob.classList.add('fallen');
            
            // Optional: Play a tiny plastic click sound if you want!
            if (typeof playClickPop === "function") {
                playClickPop(800); 
            }
        });
    });

    function mapAlphaToDigits(str) {
        const map = {
            'A': '2', 'B': '2', 'C': '2',
            'D': '3', 'E': '3', 'F': '3',
            'G': '4', 'H': '4', 'I': '4',
            'J': '5', 'K': '5', 'L': '5',
            'M': '6', 'N': '6', 'O': '6',
            'P': '7', 'Q': '7', 'R': '7', 'S': '7',
            'T': '8', 'U': '8', 'V': '8',
            'W': '9', 'X': '9', 'Y': '9', 'Z': '9'
        };
        // Convert to uppercase, map letters to numbers, then strip everything else except digits, * and #
        return str.toUpperCase()
                .replace(/[A-Z]/g, L => map[L])
                .replace(/[^0-9*#]/g, '');
    }

});