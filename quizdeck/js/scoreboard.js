const scoreboard = {
    board: null,
    settings: { sfx: true, overlay: true, sort: 'oldest' },
    stagedPic: null,
    stagedAudioFile: null,
    editingPlayerId: null,
    
    actionTimeout: null,
    pendingDeltas: {}, 
    initialSnapshot: null, 
    autosaveTimer: null,
    
    top10Visible: false,
    autoHideTimer: null,
    audioCtx: null,
    holdMode: false,
    pendingAutoTop10: null,

    init: function() {
        const savedSettings = localStorage.getItem('quizdeck_sb_settings');
        if (savedSettings) this.settings = JSON.parse(savedSettings);
    },

    startNew: async function() {
        this.init();
        this.board = { 
            id: 'deck_' + Date.now(), // Uses deck_ prefix so db.js handles it natively
            type: 'scoreboard', 
            title: 'New Scoreboard', 
            players: [], 
            lastEdited: Date.now() 
        };
        await db.saveDeck(this.board);
        this.open(this.board.id);
    },

    open: async function(id) {
        this.init();
        this.board = await db.getDeck(id);
        if(!this.board.players) this.board.players = [];
        
        document.getElementById('sb-title-input').value = this.board.title || 'New Scoreboard';
        document.getElementById('sb-sfx-toggle').checked = this.settings.sfx;
        document.getElementById('sb-overlay-toggle').checked = this.settings.overlay;
        
        this.top10Visible = false;
        document.getElementById('btn-toggle-top10').innerText = "Show Top 10 Overlay";

        // Reset hold mode
        this.holdMode = false;
        const btnHold = document.getElementById('btn-toggle-hold');
        if (btnHold) {
            btnHold.innerText = "Buffer Scores: OFF";
            btnHold.classList.remove('active');
        }

        if (window.broadcastToOBS) window.broadcastToOBS({ type: 'SCOREBOARD_TOP10', visible: false, players: [] });
        
        this.renderPanel();
        navigate('scoreboard');
    },

    triggerAutosave: function() {
        const statusEl = document.getElementById('sb-autosave-status');
        if (statusEl) { statusEl.innerText = 'Saving...'; statusEl.classList.add('saving'); }
        clearTimeout(this.autosaveTimer);
        this.autosaveTimer = setTimeout(async () => {
            this.board.lastEdited = Date.now();
            await db.saveDeck(this.board);
            if (statusEl) { statusEl.innerText = '✓ Saved'; statusEl.classList.remove('saving'); }
        }, 600);
    },

    updateTitle: function(val) {
        this.board.title = val;
        this.triggerAutosave();
    },

    saveSettings: function() {
        this.settings.sfx = document.getElementById('sb-sfx-toggle').checked;
        this.settings.overlay = document.getElementById('sb-overlay-toggle').checked;
        localStorage.setItem('quizdeck_sb_settings', JSON.stringify(this.settings));
        this.renderPanel();
    },

    toggleSort: function() {
        const sorts = ['oldest', 'score-high', 'score-low', 'alpha'];
        const labels = ['Oldest First', 'Highest Score', 'Lowest Score', 'Alphabetical'];
        let idx = sorts.indexOf(this.settings.sort) + 1;
        if (idx >= sorts.length) idx = 0;
        this.settings.sort = sorts[idx];
        document.getElementById('sb-sort-label').innerText = labels[idx];
        this.saveSettings();
    },

    toggleHoldMode: function() {
        this.holdMode = !this.holdMode;
        const btn = document.getElementById('btn-toggle-hold');
        if (this.holdMode) {
            btn.innerText = "Buffer Scores: ON";
            btn.classList.add('active');
            // Clear any currently running finalization timer so it holds indefinitely
            clearTimeout(this.actionTimeout);
        } else {
            btn.innerText = "Buffer Scores: OFF";
            btn.classList.remove('active');
            
            // If we accumulated points while holding, finalize them immediately now!
            if (Object.keys(this.pendingDeltas).length > 0) {
                this.finalizeScoreAction();
            }
        }
    },

    toggleTop10: function() {
        this.top10Visible = !this.top10Visible;
        document.getElementById('btn-toggle-top10').innerText = this.top10Visible ? "Hide Top 10" : "Show Top 10 Overlay";
        if (this.top10Visible) clearTimeout(this.autoHideTimer);
        this.syncTop10(false);
    },

    syncTop10: function(useFlip = false) {
        const sorted = this.getSortedPlayers(true);
        const boardTitle = this.board ? this.board.title : 'Scoreboard';
        if (!window.isOBS && typeof window.broadcastToOBS === 'function') {
            window.broadcastToOBS({ type: 'SCOREBOARD_TOP10', visible: this.top10Visible, players: sorted, useFlip: useFlip, title: boardTitle });
        }
        this.renderTop10(this.top10Visible, sorted, useFlip, boardTitle);
    },
    
    renderTop10: function(visible, sortedPlayers, useFlip = false, title = 'Scoreboard') {
        if (!window.isOBS) return;
        const container = document.getElementById('scoreboard-top10-container');
        if (!container) return;

        if (!visible) {
            container.classList.remove('visible');
            setTimeout(() => {
                if (!container.classList.contains('visible')) container.style.display = 'none';
            }, 500);
            return;
        }

        container.style.display = 'flex';

        let html = `<div class="sb-top10-header">${this.escape(title)}</div>`;
        sortedPlayers.slice(0, 10).forEach((p, index) => {
            html += `
                <div class="sb-top10-row" data-id="${p.id}">
                    <span class="sb-top10-rank">#${index + 1}</span>
                    <img src="${this.getAvatar(p)}" class="sb-top10-pic">
                    <span class="sb-top10-name">${this.escape(p.name)}</span>
                    <span class="sb-top10-score">${p.score}</span>
                </div>
            `;
        });
        container.innerHTML = html;
        void container.offsetHeight; // Force layout
        container.classList.add('visible');
    },

    triggerAutoTop10: function(oldPlayers, newPlayers, title = 'Scoreboard') {
        const executeTransition = () => {
            const container = document.getElementById('scoreboard-top10-container');
            if (!container) return;

            // 1. Render the initial / old list so rows sit in their natural starting slots
            this.renderTop10(true, oldPlayers, false, title);

            // Wait 500ms hold time so viewers see starting scores & ranks
            setTimeout(() => {
                const rows = Array.from(container.querySelectorAll('.sb-top10-row'));
                if (rows.length === 0) return;

                // 2. Map row DOM elements and current layout tops
                const rowMap = new Map();
                rows.forEach(r => rowMap.set(r.dataset.id, r));

                // 3. Update the text (rank numbers & scores) BEFORE the animation starts
                rows.forEach(row => {
                    const id = row.dataset.id;
                    const newRankIndex = newPlayers.findIndex(p => p.id === id);
                    const newPlayerData = newPlayers.find(p => p.id === id);

                    if (newPlayerData && newRankIndex !== -1 && newRankIndex < 10) {
                        const rankEl = row.querySelector('.sb-top10-rank');
                        const scoreEl = row.querySelector('.sb-top10-score');

                        if (rankEl) rankEl.innerText = `#${newRankIndex + 1}`;
                        if (scoreEl) {
                            scoreEl.innerText = newPlayerData.score;
                            // Add a subtle pop bump animation to the newly awarded points
                            scoreEl.classList.remove('sb-bump-anim');
                            void scoreEl.offsetWidth;
                            scoreEl.classList.add('sb-bump-anim');
                        }
                    }
                });

                // 4. Slide each existing row to its target rank using unscaled local offsetTop
                rows.forEach(row => {
                    const id = row.dataset.id;
                    const newRankIndex = newPlayers.findIndex(p => p.id === id);

                    if (newRankIndex !== -1 && newRankIndex < 10 && rows[newRankIndex]) {
                        const currentTop = row.offsetTop;
                        const targetTop = rows[newRankIndex].offsetTop;
                        const deltaY = targetTop - currentTop;

                        row.style.zIndex = deltaY < 0 ? '10' : '1';
                        row.style.transition = 'transform 1s cubic-bezier(0.25, 1, 0.5, 1)';
                        row.style.transform = `translateY(${deltaY}px)`;
                    } else if (newRankIndex >= 10 || newRankIndex === -1) {
                        // Dropping out of the Top 10
                        row.style.transition = 'opacity 0.6s ease';
                        row.style.opacity = '0';
                    }
                });

                // 5. Once the slide finishes, cleanly update the DOM to the final settled layout
                setTimeout(() => {
                    this.renderTop10(true, newPlayers, false, title);
                }, 1050);

            }, 500); // 500ms hold

            // 6. Auto-hide board after 8 seconds
            clearTimeout(this.autoHideTimer);
            this.autoHideTimer = setTimeout(() => {
                if (!this.top10Visible) {
                    this.renderTop10(false, [], false, title);
                }
            }, 7000);
        };

        const container = document.getElementById('scoreboard-overlay-container');
        const activeToasts = container ? container.querySelectorAll('.sb-notification') : [];

        if (activeToasts.length > 0) {
            this.pendingAutoTop10 = executeTransition;
        } else {
            executeTransition();
        }
    },

    checkPendingAutoTop10: function() {
        const container = document.getElementById('scoreboard-overlay-container');
        const remainingToasts = container ? container.querySelectorAll('.sb-notification') : [];
        
        // When the final toast has finished leaving the DOM, release the queued Top 10
        if (remainingToasts.length === 0 && typeof this.pendingAutoTop10 === 'function') {
            const run = this.pendingAutoTop10;
            this.pendingAutoTop10 = null;
            run();
        }
    },

    openEditor: function(playerId = null) {
        this.editingPlayerId = playerId;
        this.stagedPic = null;
        this.stagedAudioFile = null;
        
        const modal = document.getElementById('player-editor-modal');
        const title = document.getElementById('pe-title');
        const nameInput = document.getElementById('pe-name');
        const picPreview = document.getElementById('pe-pic-preview');
        const audioLabel = document.getElementById('pe-audio-label');
        const delBtn = document.getElementById('pe-delete-btn');

        if (playerId) {
            const player = this.board.players.find(p => p.id === playerId);
            title.innerText = "Edit Player";
            nameInput.value = player.name;
            delBtn.style.display = 'block';
            if (player.pic) {
                this.stagedPic = player.pic;
                picPreview.src = player.pic;
                picPreview.style.display = 'block';
            } else picPreview.style.display = 'none';
            audioLabel.innerText = player.audioId ? "Custom audio saved" : "No file selected";
        } else {
            title.innerText = "Add Player";
            nameInput.value = "";
            delBtn.style.display = 'none';
            picPreview.style.display = 'none';
            audioLabel.innerText = "No file selected";
        }
        modal.classList.remove('hidden');
    },

    closeEditor: function() {
        document.getElementById('player-editor-modal').classList.add('hidden');
        document.getElementById('pe-pic').value = '';
        document.getElementById('pe-audio').value = '';
    },

    stagePic: function(event) {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = 100; canvas.height = 100;
                const ctx = canvas.getContext('2d');
                const size = Math.min(img.width, img.height);
                ctx.drawImage(img, (img.width - size)/2, (img.height - size)/2, size, size, 0, 0, 100, 100);
                this.stagedPic = canvas.toDataURL('image/jpeg', 0.8);
                const preview = document.getElementById('pe-pic-preview');
                preview.src = this.stagedPic;
                preview.style.display = 'block';
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    },

    stageAudio: function(event) {
        const file = event.target.files[0];
        if (!file) return;
        this.stagedAudioFile = file;
        document.getElementById('pe-audio-label').innerText = file.name;
    },

    savePlayer: async function() {
        const name = document.getElementById('pe-name').value.trim();
        if (!name) return alert("Please enter a player name.");

        let player;
        if (this.editingPlayerId) {
            player = this.board.players.find(p => p.id === this.editingPlayerId);
            player.name = name;
            player.pic = this.stagedPic;
        } else {
            player = { id: 'p_' + Date.now(), name: name, pic: this.stagedPic, score: 0, addedAt: Date.now(), audioId: null };
            this.board.players.push(player);
        }

        if (this.stagedAudioFile) {
            const mediaId = 'sb_toast_' + player.id + '_' + Date.now();
            await db.saveMedia(mediaId, this.stagedAudioFile);
            if (player.audioId) await db.deleteMedia(player.audioId); // cleanup old
            player.audioId = mediaId;
        }

        this.triggerAutosave();
        this.closeEditor();
        this.renderPanel();
        if (this.top10Visible) this.syncTop10(false);
    },

    deleteEditingPlayer: async function() {
        if (!confirm("Are you sure you want to delete this player?")) return;
        const player = this.board.players.find(p => p.id === this.editingPlayerId);
        if (player && player.audioId) await db.deleteMedia(player.audioId);
        
        this.board.players = this.board.players.filter(p => p.id !== this.editingPlayerId);
        this.triggerAutosave();
        this.closeEditor();
        this.renderPanel();
        if (this.top10Visible) this.syncTop10(false);
    },

    resetScores: function() {
        if (confirm("Reset all scores to zero?")) {
            this.board.players.forEach(p => p.score = 0);
            this.triggerAutosave();
            this.renderPanel();
            if (this.top10Visible) this.syncTop10(false);
        }
    },

    modifyScore: function(id, delta) {
        const player = this.board.players.find(p => p.id === id);
        if (!player) return;
        
        if (Object.keys(this.pendingDeltas).length === 0) {
            this.initialSnapshot = JSON.parse(JSON.stringify(this.getSortedPlayers(true)));
        }

        player.score += delta;
        this.pendingDeltas[id] = (this.pendingDeltas[id] || 0) + delta;

        const scoreEl = document.getElementById('score-val-' + id);
        if (scoreEl) scoreEl.innerText = player.score;
        if (this.settings.sfx) this.playTone(delta > 0);

        if (this.settings.overlay) {
            if (!window.isOBS && typeof window.broadcastToOBS === 'function') {
                window.broadcastToOBS({ type: 'SCOREBOARD_REALTIME_TOAST', player: player, delta: this.pendingDeltas[id] });
            }
            this.updateOrShowNotification(player, this.pendingDeltas[id]);
        }

        // Only start the automatic 1-second countdown if Buffer Mode is OFF
        if (!this.holdMode) {
            clearTimeout(this.actionTimeout);
            this.actionTimeout = setTimeout(() => this.finalizeScoreAction(), 1000);
        }

    },

    finalizeScoreAction: async function() {
        this.triggerAutosave();
        const oldState = this.initialSnapshot;
        const newState = this.getSortedPlayers(true);
        const rankChanged = oldState.map(p=>p.id).join(',') !== newState.map(p=>p.id).join(',');

        this.renderPanel(true);

        if (this.settings.overlay) {
            for (let id in this.pendingDeltas) {
                let p = this.board.players.find(x => x.id === id);
                if (p && this.pendingDeltas[id] > 0) {
                    // Calculate their previous and current ranks
                    const oldRank = oldState.findIndex(x => x.id === id);
                    const newRank = newState.findIndex(x => x.id === id);
                    
                    // Only play the final toast audio if the player MOVED UP in position
                    if (oldRank !== -1 && newRank < oldRank) {
                        this.triggerFinalAudio(p);
                    }
                }
            }
        }
        
        if (this.top10Visible) {
            this.syncTop10(true);
        } else if (rankChanged && this.settings.overlay) {
            const boardTitle = this.board ? this.board.title : 'Scoreboard';
            if (!window.isOBS && typeof window.broadcastToOBS === 'function') {
                window.broadcastToOBS({ type: 'SCOREBOARD_AUTO_TOP10', oldPlayers: oldState, newPlayers: newState, title: boardTitle });
            }
            this.triggerAutoTop10(oldState, newState, boardTitle);
        }
        
        this.pendingDeltas = {};
        this.initialSnapshot = null;
    },

    updateOrShowNotification: function(player, currentDelta) {
        if (!window.isOBS) return;
        const container = document.getElementById('scoreboard-overlay-container');
        if (!container) return;
        let notif = container.querySelector(`.sb-notification[data-player-id="${player.id}"]`);
        const sign = currentDelta > 0 ? '+' : '';
        const colorClass = currentDelta > 0 ? 'positive' : 'negative';

        const scheduleRemoval = (targetNotif) => {
            clearTimeout(targetNotif.removeTimer);
            targetNotif.removeTimer = setTimeout(() => {
                targetNotif.style.animation = 'sbFadeOut 0.5s ease-in forwards';
                targetNotif.addEventListener('animationend', () => {
                    targetNotif.remove();
                    this.checkPendingAutoTop10();
                }, { once: true });
            }, 2500);
        };

        if (notif) {
            notif.querySelector('.sb-notif-delta').innerText = `${sign}${currentDelta}`;
            notif.querySelector('.sb-notif-delta').className = `sb-notif-delta ${colorClass}`;
            notif.querySelector('.sb-notif-total').innerText = `Total: ${player.score}`;
            
            notif.querySelector('.sb-notif-delta').classList.remove('sb-bump-anim');
            void notif.offsetWidth;
            notif.querySelector('.sb-notif-delta').classList.add('sb-bump-anim');
            
            notif.style.animation = 'none';
            scheduleRemoval(notif);
        } else {
            notif = document.createElement('div');
            notif.className = 'sb-notification';
            notif.dataset.playerId = player.id;
            notif.innerHTML = `
                <img src="${this.getAvatar(player)}" class="sb-top10-pic">
                <div style="display: flex; flex-direction: column; line-height: 1.2;">
                    <span class="sb-notif-name">${this.escape(player.name)}</span>
                    <span class="sb-notif-total" style="font-size: 1.1rem; opacity: 0.85;">Total: ${player.score}</span>
                </div>
                <span class="sb-notif-delta ${colorClass} sb-bump-anim">${sign}${currentDelta}</span>
            `;
            container.appendChild(notif);
            scheduleRemoval(notif);
        }
    },

    triggerFinalAudio: async function(player) {
        let buffer = null; let mime = null;
        if (player.audioId) {
            const blob = await db.getMedia(player.audioId);
            if (blob) { buffer = await blob.arrayBuffer(); mime = blob.type; }
        }
        if (!window.isOBS && typeof window.broadcastToOBS === 'function') {
            window.broadcastToOBS({ type: 'SCOREBOARD_FINAL_AUDIO', buffer: buffer, mime: mime });
        }
        this.playToastAudio(buffer, mime);
    },

    playToastAudio: function(buffer, mime) {
        if (buffer) {
            const url = URL.createObjectURL(new Blob([buffer], { type: mime }));
            const audio = new Audio(url);
            audio.onended = () => URL.revokeObjectURL(url);
            audio.play().catch(e => console.error("Audio failed:", e));
        } else if (this.settings.sfx) {
            if (!this.audioCtx) this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = this.audioCtx.createOscillator(); const gain = this.audioCtx.createGain();
            osc.connect(gain); gain.connect(this.audioCtx.destination);
            osc.type = 'sine'; osc.frequency.setValueAtTime(600, this.audioCtx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(1200, this.audioCtx.currentTime + 0.1);
            gain.gain.setValueAtTime(0.5, this.audioCtx.currentTime); gain.gain.exponentialRampToValueAtTime(0.01, this.audioCtx.currentTime + 0.5);
            osc.start(); osc.stop(this.audioCtx.currentTime + 0.5);
        }
    },

    getSortedPlayers: function(forceLeaderboard = false) {
        let sorted = [...this.board.players];
        const mode = forceLeaderboard ? 'score-high' : this.settings.sort;

        switch(mode) {
            case 'score-high': 
                sorted.sort((a, b) => (b.score - a.score) || (a.addedAt - b.addedAt)); 
                break;
            case 'score-low': 
                sorted.sort((a, b) => (a.score - b.score) || (a.addedAt - b.addedAt)); 
                break;
            case 'alpha': 
                sorted.sort((a, b) => a.name.localeCompare(b.name)); 
                break;
            default: 
                sorted.sort((a, b) => (a.addedAt || 0) - (b.addedAt || 0)); 
                break;
        }
        return sorted;
    },

    renderPanel: function(useFlip = false) {
        const list = document.getElementById('scoreboard-list');
        if (!list) return;

        const oldPositions = new Map();
        if (useFlip) document.querySelectorAll('.sb-player-card').forEach(card => oldPositions.set(card.dataset.id, card.getBoundingClientRect()));

        list.innerHTML = '';
        const sorted = this.getSortedPlayers();

        sorted.forEach(p => {
            const card = document.createElement('div');
            card.className = 'sb-player-card';
            card.dataset.id = p.id;
            
            card.innerHTML = `
                <img src="${this.getAvatar(p)}" class="sb-top10-pic">
                <div class="sb-player-info">
                    <span class="sb-player-name">${this.escape(p.name)}</span>
                    <a style="color: var(--accent-blue); cursor: pointer; font-size: 0.8rem; margin-top: 0.25rem;" onclick="scoreboard.openEditor('${p.id}')">Edit Player</a>
                </div>
                <button class="sb-btn minus" onclick="scoreboard.modifyScore('${p.id}', -1)">-1</button>
                <div class="sb-score" id="score-val-${p.id}">${p.score}</div>
                <button class="sb-btn plus" onclick="scoreboard.modifyScore('${p.id}', 1)">+1</button>
            `;
            list.appendChild(card);
        });

        if (useFlip && oldPositions.size > 0) {
            document.querySelectorAll('.sb-player-card').forEach(card => {
                const oldRect = oldPositions.get(card.dataset.id);
                if (oldRect) {
                    const deltaY = oldRect.top - card.getBoundingClientRect().top;
                    card.style.transform = `translateY(${deltaY}px)`;
                    card.style.transition = 'none';
                    requestAnimationFrame(() => {
                        card.style.transition = ''; card.style.transform = '';
                        card.classList.add('is-moving'); setTimeout(() => card.classList.remove('is-moving'), 400); 
                    });
                }
            });
        }
    },

    playTone: function(isPos) {
        if (!this.audioCtx) this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = this.audioCtx.createOscillator(); const gain = this.audioCtx.createGain();
        osc.connect(gain); gain.connect(this.audioCtx.destination);
        osc.type = isPos ? 'square' : 'sawtooth'; osc.frequency.setValueAtTime(isPos ? 440 : 250, this.audioCtx.currentTime);
        if (isPos) osc.frequency.exponentialRampToValueAtTime(880, this.audioCtx.currentTime + 0.1); else osc.frequency.exponentialRampToValueAtTime(150, this.audioCtx.currentTime + 0.2);
        gain.gain.setValueAtTime(0.3, this.audioCtx.currentTime); gain.gain.exponentialRampToValueAtTime(0.01, this.audioCtx.currentTime + 0.15);
        osc.start(); osc.stop(this.audioCtx.currentTime + 0.15);
    },

    // Deterministic avatar generator for players without a custom photo
    getAvatar: function(player) {
        if (player.pic) return player.pic;

        // Hash name + ID into a stable 32-bit integer
        const seed = (player.name || 'player') + (player.id || '');
        let hash = 0;
        for (let i = 0; i < seed.length; i++) {
            hash = ((hash << 5) - hash) + seed.charCodeAt(i);
            hash |= 0;
        }
        hash = Math.abs(hash);

        // Muted brutalist ink/paper palettes
        const palettes = [
            { bg: '#e74c3c', stroke: '#ffffff' }, // Crimson
            { bg: '#3498db', stroke: '#ffffff' }, // Ink Blue
            { bg: '#2ecc71', stroke: '#1a3322' }, // Soft Emerald
            { bg: '#f1c40f', stroke: '#2c2505' }, // Mustard Amber
            { bg: '#9b59b6', stroke: '#ffffff' }, // Velvet Purple
            { bg: '#1abc9c', stroke: '#ffffff' }, // Teal
            { bg: '#e67e22', stroke: '#ffffff' }, // Rust Orange
            { bg: '#34495e', stroke: '#f4ebd0' }, // Dark Slate
            { bg: '#d35400', stroke: '#ffffff' }, // Burnt Ochre
            { bg: '#16a085', stroke: '#ffffff' }  // Deep Aqua
        ];
        const color = palettes[hash % palettes.length];

        // 8 thick brutalist vector doodles (24x24 viewBox, stroke-based)
        const doodles = [
            // 0: Classic Crown
            '<path d="M4 18h16l2-11-5 4-5-8-5 8-5-4z" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>',
            // 1: 4-Point Star Sparkle
            '<path d="M12 2l2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5z" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/>',
            // 2: D6 Gaming Die
            '<rect x="4" y="4" width="16" height="16" rx="3" fill="none" stroke="currentColor" stroke-width="2.5"/><circle cx="8.5" cy="8.5" r="1.5" fill="currentColor"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/><circle cx="15.5" cy="15.5" r="1.5" fill="currentColor"/>',
            // 3: Lightbulb
            '<path d="M9 18h6m-5 3h4m-5-8a6 6 0 1 1 8 0c-1 1-1.5 2-1.5 3h-5c0-1-.5-2-1.5-3z" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>',
            // 4: Smiley Face
            '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2.5"/><circle cx="9" cy="10" r="1.2" fill="currentColor"/><circle cx="15" cy="10" r="1.2" fill="currentColor"/><path d="M8 14.5c1 2 2.5 3 4 3s3-1 4-3" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>',
            // 5: Lightning Bolt
            '<path d="M13 2L4 14h7l-2 8 11-12h-7z" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>',
            // 6: Heart
            '<path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/>',
            // 7: Hot Coffee Mug
            '<path d="M18 8h1a4 4 0 0 1 0 8h-1M4 8h14v8a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V8zm2-4c0 1 1 1 1 2m4-2c0 1 1 1 1 2m4-2c0 1 1 1 1 2" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>'
        ];
        const doodle = doodles[(hash >> 3) % doodles.length];

        const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" style="background:${color.bg};color:${color.stroke};width:100%;height:100%;">${doodle}</svg>`;
        return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
    },

    escape: function(str) { return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
};