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
    // 1. THE PHONE DIRECTORY (FETCHED FROM JSON)
    // ==========================================
    let directoryPages = []; 
    const ITEMS_PER_PAGE = 5; // Max numbers to show on a single notebook page

    async function loadDirectory() {
        try {
            const response = await fetch('directory.json');
            if (!response.ok) throw new Error("Could not load directory.json");
            
            const rawCategories = await response.json();
            
            // "Chunk" the data: If a category has 9 items, split it into 3 pages!
            rawCategories.forEach(category => {
                
                // Skip empty categories to prevent blank pages
                if (!category.entries || category.entries.length === 0) return;

                // Slice the entries into chunks of 4 (or whatever ITEMS_PER_PAGE is)
                for (let i = 0; i < category.entries.length; i += ITEMS_PER_PAGE) {
                    directoryPages.push({
                        title: category.title, // Keeps the same title across the chunked pages
                        entries: category.entries.slice(i, i + ITEMS_PER_PAGE)
                    });
                }
            });

            renderPage();
        } catch (error) {
            console.error("Directory Error:", error);
            document.getElementById('directory-list').innerHTML = "<li><em>Directory unavailable.</em></li>";
        }
    }

    loadDirectory();

    // ==========================================
    // 2. PHONE BOOK PAGINATION LOGIC
    // ==========================================
    let currentPage = 0;
    
    const listElement = document.getElementById('directory-list');
    const titleElement = document.getElementById('directory-title');
    const prevBtn = document.getElementById('page-prev');
    const nextBtn = document.getElementById('page-next');
    const indicator = document.getElementById('page-indicator');

    function renderPage() {
        if (directoryPages.length === 0) return; 

        // Get the current page object
        const pageData = directoryPages[currentPage];

        // Update the book title
        titleElement.innerText = pageData.title;

        // Clear and populate the list
        listElement.innerHTML = ''; 
        pageData.entries.forEach(item => {
            const li = document.createElement('li');
            li.innerHTML = `<span>${item.name}:</span> <strong>${item.number}</strong>`;
            listElement.appendChild(li);
        });

        // Update indicator and buttons based on total pages
        const totalPages = directoryPages.length;
        indicator.innerText = `${currentPage + 1}/${totalPages}`;
        
        prevBtn.style.visibility = currentPage === 0 ? 'hidden' : 'visible';
        nextBtn.style.visibility = currentPage === totalPages - 1 ? 'hidden' : 'visible';
    }

    prevBtn.addEventListener('click', () => {
        if (currentPage > 0) { 
            currentPage--; 
            renderPage(); 
        }
    });

    nextBtn.addEventListener('click', () => {
        if (currentPage < directoryPages.length - 1) { 
            currentPage++; 
            renderPage(); 
        }
    });

    // ==========================================
    // 3. TELEPHONE DIALING LOGIC
    // ==========================================
    const screen = document.getElementById('phone-screen');
    const keys = document.querySelectorAll('.key');
    const clearBtn = document.getElementById('btn-clear');
    const callBtn = document.getElementById('btn-call');
    
    let currentNumber = '';

    keys.forEach(key => {
        key.addEventListener('click', () => {
            if (currentNumber.length < 10 && currentNumber !== 'ERR') {
                currentNumber += key.innerText;
                updateScreen();
            }
        });
    });

    clearBtn.addEventListener('click', () => {
        currentNumber = '';
        updateScreen();
    });

    callBtn.addEventListener('click', () => {
        const dialed = currentNumber;
        
        // Combine ALL entries from ALL pages into one flat list so we can search it
        const allContacts = directoryPages.flatMap(page => page.entries);
        
        // Look up the number in our combined list
        const contact = allContacts.find(item => item.number === dialed);
        
        if (contact) {
            screen.innerText = 'DIALING';
            setTimeout(() => {
                window.open(contact.url, '_blank').focus();
                currentNumber = '';
                updateScreen();
            }, 800);
        } else if (dialed !== '') {
            screen.innerText = 'ERR';
            setTimeout(() => {
                currentNumber = '';
                updateScreen();
            }, 1000);
        }
    });

    function updateScreen() {
        screen.innerText = currentNumber;
    }

});