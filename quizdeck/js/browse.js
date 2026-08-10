const browse = {
  renderGrid: async function() {
    
    const decks = await db.getAllDecks();
    const grid = document.getElementById('deck-grid');
    grid.innerHTML = ''; // Clear current grid
         
    if (decks.length === 0) {
      grid.innerHTML = '<p>No decks found. Create one, import a .qzd file, or load the tutorial!</p>';
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
          aText: "Check out the Settings menu to set up custom hotkeys, adjust your OBS layout visually, and override the default sound effects.\n\nHave fun!",
          aMediaId: null
        }
      ]
    };

    await db.saveDeck(tutorialDeck);
    this.renderGrid();
  }
};