// HTML Sanitization helper to prevent XSS and tag breakout
function escapeHTML(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const create = {
  deck: { id: '', title: '', author: '', styles: { bg: '#000000', text: '#ffffff' }, titleMediaId: null, cards: [] },
  activeIndex: 0,
  hasUnsavedChanges: false,
  autosaveTimer: null,

  // Debounced Autosave Engine
  triggerAutosave: function () {
    this.hasUnsavedChanges = true;
    const statusEl = document.getElementById('autosave-status');
    if (statusEl) {
      statusEl.innerText = '  Saving...';
      statusEl.classList.add('saving');
    }
    clearTimeout(this.autosaveTimer);
    this.autosaveTimer = setTimeout(async () => {
      if (!this.deck.title) this.deck.title = 'Untitled Deck';
      this.deck.lastEdited = Date.now();
      await db.saveDeck(this.deck);
      this.hasUnsavedChanges = false;
      if (statusEl) {
        statusEl.innerText = '  Saved';
        statusEl.classList.remove('saving');
      }
    }, 600);
  },

  startNew: function () {
    this.deck = { id: 'deck_' + Date.now(), title: '', author: '', styles: { bg: '#000000', text: '#ffffff' }, titleMediaId: null, cards: [] };
    this.addCard('qa');
    this.activeIndex = 0;
    this.hasUnsavedChanges = false;
    this.syncDeckMetaUI();
    navigate('create');
  },

  addCard: function (type = 'qa') {
    if (type === 'scoreboard') {
      this.deck.cards.push({ type: 'scoreboard', title: 'Scoreboard', players: [] });
    } else {
      this.deck.cards.push({ type: 'qa', qText: '', qMediaId: null, aText: '', aMediaId: null });
    }
    this.activeIndex = this.deck.cards.length - 1;
    this.triggerAutosave();
    this.renderSidebar();
    this.renderEditor();
  },

  loadDeck: async function (deckId) {
    const loadedDeck = await db.getDeck(deckId);
    if (!loadedDeck) return;

    this.deck = loadedDeck;
    if (!this.deck.styles) this.deck.styles = { bg: '#000000', text: '#ffffff' };
    if (typeof this.deck.author === 'undefined') this.deck.author = '';
    if (!this.deck.cards || this.deck.cards.length === 0) {
      this.deck.cards = [{ qText: '', qMediaId: null, aText: '', aMediaId: null }];
    }
    this.activeIndex = 0;
    this.hasUnsavedChanges = false;

    this.syncDeckMetaUI();
    this.renderSidebar();
    this.renderEditor();
    navigate('create');
  },

  syncDeckMetaUI: function () {
    document.getElementById('deck-title-input').value = this.deck.title || '';
    document.getElementById('deck-author-input').value = this.deck.author || '';
    document.getElementById('deck-bg-input').value = this.deck.styles.bg || '#000000';
    document.getElementById('deck-text-input').value = this.deck.styles.text || '#ffffff';

    const mediaLabel = document.getElementById('intro-media-label');
    const mediaBtnRemove = document.getElementById('btn-remove-intro-media');
    const mediaFilename = document.getElementById('intro-media-filename');

    if (this.deck.titleMediaId) {
      mediaLabel.innerText = 'Change Intro Media';
      mediaBtnRemove.style.display = 'inline-block';
      mediaFilename.innerText = 'Attached: ' + this.deck.titleMediaId;
    } else {
      mediaLabel.innerText = 'Upload Intro Media';
      mediaBtnRemove.style.display = 'none';
      mediaFilename.innerText = 'No media attached';
    }
  },

  updateDeckMeta: function (field, value) {
    this.deck[field] = value;
    this.triggerAutosave();
  },

  updateDeckStyle: function (field, value) {
    this.deck.styles[field] = value;
    this.triggerAutosave();
  },

  handleIntroMedia: async function (event) {
    const file = event.target.files[0];
    if (!file) return;

    const mediaId = 'media_' + Date.now() + '_' + file.name.replace(/[^a-z0-9.]/gi, '_');
    await db.saveMedia(mediaId, file);

    this.deck.titleMediaId = mediaId;
    this.triggerAutosave();
    this.syncDeckMetaUI();
  },

  removeIntroMedia: function () {
    this.deck.titleMediaId = null;
    this.triggerAutosave();
    this.syncDeckMetaUI();
  },


  deleteCard: function (index) {
    if (this.deck.cards.length === 1) {
      alert("You must have at least one card in your deck.");
      return;
    }
    if (confirm("Are you sure you want to delete this card?")) {
      this.deck.cards.splice(index, 1);
      this.activeIndex = Math.max(0, this.activeIndex - 1);
      this.triggerAutosave();
      this.renderSidebar();
      this.renderEditor();
    }
  },

  selectCard: function (index) {
    this.activeIndex = index;
    this.renderSidebar();
    this.renderEditor();
  },

  moveCard: function (fromIndex, toIndex) {
    const [movedCard] = this.deck.cards.splice(fromIndex, 1);
    this.deck.cards.splice(toIndex, 0, movedCard);

    this.activeIndex = toIndex;
    this.triggerAutosave();
    this.renderSidebar();
    this.renderEditor();
  },

  updateText: function (field, value) {
    this.deck.cards[this.activeIndex][field] = value;
    this.triggerAutosave();
    this.renderSidebar();
  },

  focusAnswer: function () {
    document.getElementById('aText-input')?.focus();
  },

  advanceToNextCard: function () {
    if (this.activeIndex < this.deck.cards.length - 1) {
      this.selectCard(this.activeIndex + 1);
      setTimeout(() => document.getElementById('qText-input')?.focus(), 50);
    } else {
      this.addCard();
    }
  },

  handleMediaUpload: async function (field, event) {
    const file = event.target.files[0];
    if (!file) return;

    const mediaId = 'media_' + Date.now() + '_' + file.name.replace(/[^a-z0-9.]/gi, '_');
    await db.saveMedia(mediaId, file);

    this.deck.cards[this.activeIndex][field] = mediaId;
    this.triggerAutosave();
    this.renderEditor();
  },

  removeMedia: function (field) {
    this.deck.cards[this.activeIndex][field] = null;
    this.triggerAutosave();
    this.renderEditor();
  },

  renderSidebar: function () {
    const sidebar = document.getElementById('card-list-sidebar');
    sidebar.innerHTML = `
        <div style="display: flex; gap: 0.5rem; margin-bottom: 1rem;">
            <button class="btn" onclick="create.addCard('qa')" style="flex: 1; padding: 0.5rem 0.2rem; font-size: 0.8rem;">+ Q/A</button>
            <button class="btn" onclick="create.addCard('scoreboard')" style="flex: 1; padding: 0.5rem 0.2rem; font-size: 0.8rem;">+ Scoreboard</button>
        </div>
    `;
    this.deck.cards.forEach((card, index) => {
      const thumb = document.createElement('div');
      thumb.className = `card-thumb ${this.activeIndex === index ? 'active' : ''}`;
      thumb.innerText = card.type === 'scoreboard' ? `🏆 ${card.title || 'Scoreboard'}` : (card.qText ? card.qText.substring(0, 20) + '...' : `Card ${index + 1}`);
      thumb.onclick = () => this.selectCard(index);
      thumb.draggable = true;
      // ... drag logic remains the same ...
      sidebar.appendChild(thumb);
    });
  },

  // --- Player Builder Logic ---
  addPlayerToCard: async function () {
    const name = prompt("Enter player name:");
    if (!name) return;
    this.deck.cards[this.activeIndex].players.push({
      id: 'p_' + Date.now(),
      name: name,
      pic: null,
      score: 0,
      audioId: null
    });
    this.triggerAutosave();
    this.renderEditor();
  },

  removePlayerFromCard: async function (playerId) {
    if (!confirm("Remove this player?")) return;
    const card = this.deck.cards[this.activeIndex];
    const p = card.players.find(x => x.id === playerId);
    if (p && p.audioId) await db.deleteMedia(p.audioId);
    card.players = card.players.filter(x => x.id !== playerId);
    this.triggerAutosave();
    this.renderEditor();
  },

  handlePlayerPic: function (playerId, event) {
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
        ctx.drawImage(img, (img.width - size) / 2, (img.height - size) / 2, size, size, 0, 0, 100, 100);
        const card = this.deck.cards[this.activeIndex];
        const p = card.players.find(x => x.id === playerId);
        if (p) p.pic = canvas.toDataURL('image/jpeg', 0.8);
        this.triggerAutosave();
        this.renderEditor();
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  },

  handlePlayerAudio: async function (playerId, event) {
    const file = event.target.files[0];
    if (!file) return;
    const mediaId = `sb_toast_${playerId}_${Date.now()}`;
    await db.saveMedia(mediaId, file);
    const card = this.deck.cards[this.activeIndex];
    const p = card.players.find(x => x.id === playerId);
    if (p) {
      if (p.audioId) await db.deleteMedia(p.audioId); // cleanup old
      p.audioId = mediaId;
    }
    this.triggerAutosave();
    this.renderEditor();
  },

  renderEditor: function () {
    const editor = document.getElementById('card-editor');
    const card = this.deck.cards[this.activeIndex];
    const isLastCard = this.activeIndex === this.deck.cards.length - 1;

    let editorHTML = `
            <div class="editor-card-nav">
                <button class="btn" ${this.activeIndex === 0 ? 'disabled style="opacity:0.4;"' : ''} onclick="create.selectCard(${this.activeIndex - 1})">⬅ Prev</button>
                <span>Card ${this.activeIndex + 1} of ${this.deck.cards.length}</span>
                <button class="btn" ${isLastCard ? 'disabled style="opacity:0.4;"' : ''} onclick="create.selectCard(${this.activeIndex + 1})">Next ➡</button>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                <h3 style="margin: 0; color: var(--text-desk);">Editing ${card.type === 'scoreboard' ? 'Scoreboard' : 'Q/A Card'}</h3>
                <button class="btn" style="color: var(--accent-ink); border-color: var(--accent-ink);" onclick="create.deleteCard(${this.activeIndex})">Delete Card</button>
            </div>
        `;

    if (card.type === 'scoreboard') {
      editorHTML += `
                <div class="pane index-card" style="width: 100%;">
                    <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(0,0,0,0.1); padding-bottom: 0.5rem; margin-bottom: 1rem;">
                        <h4>Scoreboard Title: <input type="text" value="${escapeHTML(card.title || '')}" oninput="create.updateText('title', this.value)" style="border:none; border-bottom:1px dashed #333; background:transparent; font-family:inherit; font-size:1rem; outline:none;"></h4>
                        <button class="btn primary" onclick="create.addPlayerToCard()">+ Add Player</button>
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 1rem;">
            `;

      if (card.players && card.players.length > 0) {
        card.players.forEach(p => {
          editorHTML += `
                        <div style="display: flex; gap: 1rem; align-items: center; background: rgba(0,0,0,0.05); padding: 0.75rem; border-radius: 4px; border: 1px solid rgba(0,0,0,0.1);">
                            <img src="${p.pic || 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="%23ddd"/></svg>'}" style="width: 50px; height: 50px; border-radius: 50%; object-fit: cover;">
                            <div style="flex: 1;">
                                <div style="font-weight: bold; font-size: 1.2rem;">${escapeHTML(p.name)}</div>
                                <div style="display: flex; gap: 0.5rem; margin-top: 0.5rem;">
                                    <label class="btn" style="font-size: 0.75rem; padding: 0.2rem 0.5rem;">Pic <input type="file" accept="image/*" style="display:none;" onchange="create.handlePlayerPic('${p.id}', event)"></label>
                                    <label class="btn" style="font-size: 0.75rem; padding: 0.2rem 0.5rem;">Toast Audio <input type="file" accept="audio/*" style="display:none;" onchange="create.handlePlayerAudio('${p.id}', event)"></label>
                                    <span style="font-size: 0.75rem; opacity: 0.6; align-self: center;">${p.audioId ? '✓ Audio Saved' : ''}</span>
                                </div>
                            </div>
                            <button class="btn danger" style="padding: 0.3rem 0.6rem;" onclick="create.removePlayerFromCard('${p.id}')">Remove</button>
                        </div>
                    `;
        });
      } else {
        editorHTML += `<p style="opacity: 0.6; text-align: center; padding: 2rem;">No players added yet.</p>`;
      }

      editorHTML += `</div></div>`;
    } else {
      // Standard Q/A UI
      editorHTML += `
                <div class="editor-pane">
                    <div class="pane index-card">
                        <h4>Question</h4>
                        <textarea id="qText-input" oninput="create.updateText('qText', this.value)" placeholder="Enter question text...">${escapeHTML(card.qText)}</textarea>
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 0.5rem;">
                            <div style="display: flex; gap: 0.5rem; align-items: center;">
                                <label class="btn">
                                    ${card.qMediaId ? 'Change Media' : 'Upload Media'}
                                    <input type="file" accept="image/*,audio/*,video/*" style="display:none;" onchange="create.handleMediaUpload('qMediaId', event)">
                                </label>
                                ${card.qMediaId ? `<button class="btn" style="color:var(--accent-ink);" onclick="create.removeMedia('qMediaId')">Remove</button>` : ''}
                            </div>
                            <button class="btn jump-btn" onclick="create.focusAnswer()">Go to Answer ➡</button>
                        </div>
                        <small class="text-truncate">${card.qMediaId ? 'Attached: ' + escapeHTML(card.qMediaId) : 'No media attached'}</small>
                    </div>
                    <!-- Answer Index Card -->
                    <div class="pane index-card">
                        <h4>Answer</h4>
                        <textarea id="aText-input" oninput="create.updateText('aText', this.value)" placeholder="Enter answer text...">${escapeHTML(card.aText)}</textarea>
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 0.5rem;">
                            <div style="display: flex; gap: 0.5rem; align-items: center;">
                                <label class="btn">
                                    ${card.aMediaId ? 'Change Media' : 'Upload Media'}
                                    <input type="file" accept="image/*,audio/*,video/*" style="display:none;" onchange="create.handleMediaUpload('aMediaId', event)">
                                </label>
                                ${card.aMediaId ? `<button class="btn" style="color:var(--accent-ink);" onclick="create.removeMedia('aMediaId')">Remove</button>` : ''}
                            </div>
                            <button class="btn jump-btn" onclick="create.advanceToNextCard()">${isLastCard ? '+ Add Next Card' : 'Next Card ➡'}</button>
                        </div>
                        <small class="text-truncate">${card.aMediaId ? 'Attached: ' + escapeHTML(card.aMediaId) : 'No media attached'}</small>
                    </div>
                </div>
            `;
    }

    editor.innerHTML = editorHTML;
  }
};