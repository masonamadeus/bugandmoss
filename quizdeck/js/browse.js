const browse = {
  renderGrid: async function() {
    const grid = document.getElementById('deck-grid');
    grid.innerHTML = ''; // Clear current grid

    const decks = await db.getAllDecks();
    
    if (decks.length === 0) {
      grid.innerHTML = '<p>No decks found. Create one or import a .qzd file!</p>';
      return;
    }

    decks.forEach(deck => {
      const card = document.createElement('div');
      card.className = 'deck-card';
      
      const title = document.createElement('h3');
      title.innerText = deck.title || 'Untitled Deck';
      
      const count = document.createElement('p');
      count.innerText = `${deck.cards ? deck.cards.length : 0} Cards`;

      const actions = document.createElement('div');
      actions.className = 'deck-actions';

      // Perform Button
      const btnPerform = document.createElement('button');
      btnPerform.className = 'btn primary';
      btnPerform.innerText = 'Perform';
      btnPerform.onclick = () => perform.start(deck.id);
      
      // Edit Button
      const btnEdit = document.createElement('button');
      btnEdit.className = 'btn';
      btnEdit.innerText = 'Edit';
      btnEdit.onclick = () => create.loadDeck(deck.id);

      // Send/Share Button
      const btnSend = document.createElement('button');
      btnSend.className = 'btn';
      btnSend.innerText = 'Share';
      btnSend.onclick = () => archive.shareDeck(deck.id);

      // Export Button
      const btnExport = document.createElement('button');
      btnExport.className = 'btn';
      btnExport.innerText = 'Export';
      btnExport.onclick = () => archive.exportDeck(deck.id);

      // Delete Button
      const btnDelete = document.createElement('button');
      btnDelete.className = 'btn danger';
      btnDelete.innerText = 'Delete';
      btnDelete.onclick = async () => {
        if(confirm(`Are you sure you want to delete "${deck.title}"?`)) {
          
          // Cleanup associated media blobs so they don't leak memory
          if (deck.titleMediaId) await db.deleteMedia(deck.titleMediaId);
          if (deck.cards) {
            for (const c of deck.cards) {
              if (c.qMediaId) await db.deleteMedia(c.qMediaId);
              if (c.aMediaId) await db.deleteMedia(c.aMediaId);
            }
          }
          
          // Delete the actual deck JSON object
          await db.deleteDeck(deck.id);
          this.renderGrid();
        }
      };

      actions.append(btnPerform, btnEdit, btnSend, btnDelete);
      card.append(title, count, actions);
      grid.appendChild(card);
    });
  },

  handleImport: async function(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    await archive.importDeck(file);
    event.target.value = ''; // Reset input
    this.renderGrid();
  }
};