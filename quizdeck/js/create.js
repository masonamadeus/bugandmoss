const create = {
  deck: { id: '', title: '', author: '', styles: { bg: '#000000', text: '#ffffff' }, titleMediaId: null, cards: [] },
  activeIndex: 0,
  hasUnsavedChanges: false,

  markUnsaved: function() {
    this.hasUnsavedChanges = true;
  },

  startNew: function() {
    this.deck = { id: 'deck_' + Date.now(), title: '', author: '', styles: { bg: '#000000', text: '#ffffff' }, titleMediaId: null, cards: [] };
    this.deck.cards.push({ qText: '', qMediaId: null, aText: '', aMediaId: null });
    this.activeIndex = 0;
    this.hasUnsavedChanges = false;
    
    this.syncDeckMetaUI();
    this.renderSidebar();
    this.renderEditor();
    navigate('create');
  },

  loadDeck: async function(deckId) {
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

  syncDeckMetaUI: function() {
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

  updateDeckMeta: function(field, value) {
    this.deck[field] = value;
    this.markUnsaved();
  },

  updateDeckStyle: function(field, value) {
    this.deck.styles[field] = value;
    this.markUnsaved();
  },

  handleIntroMedia: async function(event) {
    const file = event.target.files[0];
    if (!file) return;

    const mediaId = 'media_' + Date.now() + '_' + file.name.replace(/[^a-z0-9.]/gi, '_');
    await db.saveMedia(mediaId, file);
    
    this.deck.titleMediaId = mediaId;
    this.markUnsaved();
    this.syncDeckMetaUI();
  },

  removeIntroMedia: function() {
    this.deck.titleMediaId = null;
    this.markUnsaved();
    this.syncDeckMetaUI();
  },

  addCard: function() {
    this.deck.cards.push({ qText: '', qMediaId: null, aText: '', aMediaId: null });
    this.activeIndex = this.deck.cards.length - 1;
    this.markUnsaved();
    this.renderSidebar();
    this.renderEditor();
  },

  deleteCard: function(index) {
    if (this.deck.cards.length === 1) {
      alert("You must have at least one card in your deck.");
      return;
    }
    if (confirm("Are you sure you want to delete this card?")) {
      this.deck.cards.splice(index, 1);
      this.activeIndex = Math.max(0, this.activeIndex - 1);
      this.markUnsaved();
      this.renderSidebar();
      this.renderEditor();
    }
  },

  selectCard: function(index) {
    this.activeIndex = index;
    this.renderSidebar();
    this.renderEditor();
  },

  moveCard: function(fromIndex, toIndex) {
    const [movedCard] = this.deck.cards.splice(fromIndex, 1);
    this.deck.cards.splice(toIndex, 0, movedCard);
    
    this.activeIndex = toIndex;
    this.markUnsaved();
    this.renderSidebar();
    this.renderEditor();
  },

  updateText: function(field, value) {
    this.deck.cards[this.activeIndex][field] = value;
    this.markUnsaved();
    this.renderSidebar(); 
  },

  handleMediaUpload: async function(field, event) {
    const file = event.target.files[0];
    if (!file) return;

    const mediaId = 'media_' + Date.now() + '_' + file.name.replace(/[^a-z0-9.]/gi, '_');
    await db.saveMedia(mediaId, file);
    
    this.deck.cards[this.activeIndex][field] = mediaId;
    this.markUnsaved();
    this.renderEditor(); 
  },

  removeMedia: function(field) {
    this.deck.cards[this.activeIndex][field] = null;
    this.markUnsaved();
    this.renderEditor();
  },

  renderSidebar: function() {
    const sidebar = document.getElementById('card-list-sidebar');
    sidebar.innerHTML = '<button class="btn" onclick="create.addCard()" style="width: 100%; margin-bottom: 1rem;">+ Add Question</button>';

    this.deck.cards.forEach((card, index) => {
      const thumb = document.createElement('div');
      thumb.className = `card-thumb ${this.activeIndex === index ? 'active' : ''}`;
      thumb.innerText = card.qText ? card.qText.substring(0, 20) + '...' : `Card ${index + 1}`;
      thumb.onclick = () => this.selectCard(index);
      
      thumb.draggable = true;
      thumb.ondragstart = (e) => { e.dataTransfer.setData('text/plain', index); thumb.style.opacity = '0.5'; };
      thumb.ondragend = () => { thumb.style.opacity = '1'; };
      thumb.ondragover = (e) => { e.preventDefault(); thumb.classList.add('drag-over'); };
      thumb.ondragleave = () => { thumb.classList.remove('drag-over'); };
      thumb.ondrop = (e) => {
        e.preventDefault();
        thumb.classList.remove('drag-over');
        const fromIndex = parseInt(e.dataTransfer.getData('text/plain'));
        if (!isNaN(fromIndex) && fromIndex !== index) this.moveCard(fromIndex, index);
      };
      sidebar.appendChild(thumb);
    });
  },

  renderEditor: function() {
    const editor = document.getElementById('card-editor');
    const card = this.deck.cards[this.activeIndex];

    editor.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
        <h3 style="margin: 0; color: var(--text-ink);">Editing Card ${this.activeIndex + 1}</h3>
        <button class="btn" style="color: var(--accent-ink); border-color: var(--accent-ink);" onclick="create.deleteCard(${this.activeIndex})">Delete Card</button>
      </div>
      <div class="editor-pane">
        <!-- Question Index Card -->
        <div class="pane index-card">
          <h4>Question</h4>
          <textarea oninput="create.updateText('qText', this.value)" placeholder="Enter question text...">${card.qText}</textarea>
          
          <div style="display: flex; gap: 0.5rem; align-items: center;">
            <label class="btn">
              ${card.qMediaId ? 'Change Media' : 'Upload Media'}
              <input type="file" accept="image/*,audio/*,video/*" style="display:none;" onchange="create.handleMediaUpload('qMediaId', event)">
            </label>
            ${card.qMediaId ? `<button class="btn" style="color:var(--accent-ink);" onclick="create.removeMedia('qMediaId')">Remove</button>` : ''}
          </div>
          <small class="text-truncate">${card.qMediaId ? 'Attached: ' + card.qMediaId : 'No media attached'}</small>
        </div>

        <!-- Answer Index Card -->
        <div class="pane index-card">
          <h4>Answer</h4>
          <textarea oninput="create.updateText('aText', this.value)" placeholder="Enter answer text...">${card.aText}</textarea>
          
          <div style="display: flex; gap: 0.5rem; align-items: center;">
            <label class="btn">
              ${card.aMediaId ? 'Change Media' : 'Upload Media'}
              <input type="file" accept="image/*,audio/*,video/*" style="display:none;" onchange="create.handleMediaUpload('aMediaId', event)">
            </label>
            ${card.aMediaId ? `<button class="btn" style="color:var(--accent-ink);" onclick="create.removeMedia('aMediaId')">Remove</button>` : ''}
          </div>
          <small class="text-truncate">${card.aMediaId ? 'Attached: ' + card.aMediaId : 'No media attached'}</small>
        </div>
      </div>
    `;
  },

  saveDeck: async function() {
    if (!this.deck.title) this.deck.title = 'Untitled Deck';
    
    await db.saveDeck(this.deck);
    this.hasUnsavedChanges = false; 
    
    const btn = document.getElementById('btn-save-deck');
    const originalText = btn.innerText;
    btn.innerText = '✓ Saved!';
    
    await browse.renderGrid();
    setTimeout(() => { btn.innerText = originalText; navigate('browse'); }, 800);
  }
};