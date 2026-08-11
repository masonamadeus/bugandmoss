const browse = {
  renderGrid: async function() {
    const decks = await db.getAllDecks();
    const grid = document.getElementById('deck-grid');
    grid.innerHTML = ''; // Clear current grid
          
    if (decks.length === 0) {
      grid.innerHTML = '<p>No decks found. Create one or import a .qzd file!</p>';
      return;
    }

    // Default sort: newest edited decks first
    decks.sort((a, b) => (b.lastEdited || 0) - (a.lastEdited || 0));

    // Custom drag-and-drop sort via localStorage
    try {
      const savedOrder = JSON.parse(localStorage.getItem('quizdeck_order'));
      if (savedOrder && Array.isArray(savedOrder)) {
        decks.sort((a, b) => {
          let indexA = savedOrder.indexOf(a.id);
          let indexB = savedOrder.indexOf(b.id);
          // If a deck is new and not in the array, throw it to the end
          if (indexA === -1) indexA = 99999;
          if (indexB === -1) indexB = 99999;
          return indexA - indexB;
        });
      }
    } catch(e){}

    decks.forEach(deck => {
      const card = document.createElement('div');
      card.className = 'deck-card';
      card.dataset.id = deck.id;
      card.draggable = true;

      // --- Drag and Drop Logic ---
      card.ondragstart = (e) => {
        e.dataTransfer.setData('text/plain', deck.id);
        card.style.opacity = '0.5';
      };
      card.ondragend = () => {
        card.style.opacity = '1';
        document.querySelectorAll('.deck-card').forEach(c => c.classList.remove('drag-over'));
      };
      card.ondragover = (e) => e.preventDefault(); 
      card.ondragenter = (e) => {
        e.preventDefault();
        card.classList.add('drag-over');
      };
      card.ondragleave = (e) => card.classList.remove('drag-over');
      card.ondrop = (e) => {
        e.preventDefault();
        card.classList.remove('drag-over');
        const draggedId = e.dataTransfer.getData('text/plain');
        if (draggedId && draggedId !== deck.id) {
          browse.reorderDecks(draggedId, deck.id);
        }
      };
      // ---------------------------
      
      const title = document.createElement('h3');
      title.innerText = deck.title || 'Untitled Deck';
      
      // NEW: Last Edited Timestamp
      const dateStr = deck.lastEdited 
        ? new Date(deck.lastEdited).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) 
        : 'Never';
      const dateEl = document.createElement('small');
      dateEl.innerText = `Last edited: ${dateStr}`;
      dateEl.style.display = 'block';
      dateEl.style.opacity = '0.6';
      dateEl.style.marginBottom = '0.5rem';
      
      const count = document.createElement('p');
      count.innerText = `${deck.cards ? deck.cards.length : 0} Cards`;

      const actions = document.createElement('div');
      actions.className = 'deck-actions';

      const btnPerform = document.createElement('button');
      btnPerform.className = 'btn primary';
      btnPerform.innerText = 'Perform';
      btnPerform.onclick = () => perform.start(deck.id);
      
      const btnEdit = document.createElement('button');
      btnEdit.className = 'btn';
      btnEdit.innerText = 'Edit';
      btnEdit.onclick = () => create.loadDeck(deck.id);

      const btnShare = document.createElement('button');
      btnShare.className = 'btn';
      btnShare.innerText = 'Share';
      btnShare.onclick = () => archive.shareDeck(deck.id);
      
      const btnExport = document.createElement('button');
      btnExport.className = 'btn';
      btnExport.innerText = 'Export';
      btnExport.onclick = () => archive.exportDeck(deck.id);

      const btnDelete = document.createElement('button');
      btnDelete.className = 'btn danger';
      btnDelete.innerText = 'Delete';
      btnDelete.onclick = async () => {
        if(confirm(`Are you sure you want to delete "${deck.title}"?`)) {
          if (deck.titleMediaId) await db.deleteMedia(deck.titleMediaId);
          if (deck.cards) {
            for (const c of deck.cards) {
              if (c.qMediaId) await db.deleteMedia(c.qMediaId);
              if (c.aMediaId) await db.deleteMedia(c.aMediaId);
            }
          }
          await db.deleteDeck(deck.id);

          // Clean up custom order array so it doesn't leak dead IDs
          try {
            let savedOrder = JSON.parse(localStorage.getItem('quizdeck_order'));
            if (savedOrder) {
                savedOrder = savedOrder.filter(id => id !== deck.id);
                localStorage.setItem('quizdeck_order', JSON.stringify(savedOrder));
            }
          } catch(e){}

          this.renderGrid();
        }
      };

      actions.append(btnPerform, btnEdit, btnShare, btnDelete);
      card.append(title, dateEl, count, actions); // Injected dateEl here
      grid.appendChild(card);
    });
  },

  // Helper to visually swap decks and save to local storage
  reorderDecks: function(draggedId, targetId) {
    const cards = Array.from(document.querySelectorAll('.deck-card'));
    let currentOrder = cards.map(c => c.dataset.id);
    
    const fromIndex = currentOrder.indexOf(draggedId);
    const toIndex = currentOrder.indexOf(targetId);
    
    if (fromIndex > -1 && toIndex > -1) {
      currentOrder.splice(fromIndex, 1);
      currentOrder.splice(toIndex, 0, draggedId);
      localStorage.setItem('quizdeck_order', JSON.stringify(currentOrder));
      this.renderGrid();
    }
  },

  handleImport: async function(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    await archive.importDeck(file);
    event.target.value = ''; // Reset input
    this.renderGrid();
  },
  
  createTutorial: async function() {
    const tutorialDeck = {
      id: 'deck_tutorial',
      title: 'Interactive Tutorial',
      author: 'Mason Amadeus',
      styles: { bg: '#1e293b', text: '#f8fafc' },
      titleMediaId: null,
      cards: [
        {
          qText: "Welcome to QuizDeck!\n\nPress 'Show Answer' to flip this card.",
          qMediaId: null,
          aText: "Great job!\n\nYou just flipped your first card. \n\nClick 'Next Question' to continue.",
          aMediaId: null
        },
        {
          qText: "Did you know QuizDeck connects directly to OBS Studio?",
          qMediaId: null,
          aText: "It does!\n\nClick 'Copy OBS Link' at the top of the main screen and paste it into an OBS Browser Source.\n\nYour host control panel will instantly sync your questions to the OBS overlay in real-time!",
          aMediaId: null
        },
        {
          qText: "Notice how the text fits perfectly on the screen?\n\nQuizDeck automatically scales your text so it always stays inside your OBS boundaries, no matter how much you write.\n\n(Yes, even if you write a giant paragraph like this!)",
          qMediaId: null,
          aText: "It works for answers too!\n\nNow try pressing the 'Correct' or 'Wrong' button below right now to log a score.",
          aMediaId: null
        },
        {
          qText: "Now this is a QUESTION page...\n\nTry pressing 'Correct' or 'Wrong' *right now* while still on this Question screen.",
          qMediaId: null,
          aText: "Boom 😎\n\nQuizDeck instantly reveals the answer and logs the score. \n\nThe whole idea is to be able to use and abuse this platform for various quiz-related and quiz-like nonsense.",
          aMediaId: null
        },
        {
          qText: "Can QuizDeck handle media files?",
          qMediaId: null,
          aText: "Yes!\n\nYou can attach Images, Videos, and Custom Audio to any Question, Answer, or Title screen.\n\n(We'd show you an image here, but you'll have to upload your own in the Create tab!)",
          aMediaId: null
        },
        {
          qText: "Are you ready to host your first live game show?",
          qMediaId: null,
          aText: "Check out the Settings menu to set up custom hotkeys, adjust your OBS layout visually, and override the default sound effects.\n\n Exit performance mode by clicking the button in the top right. \n\nHave fun!",
          aMediaId: null
        }
      ]
    };

    await db.saveDeck(tutorialDeck);
    this.renderGrid();
  }
};
