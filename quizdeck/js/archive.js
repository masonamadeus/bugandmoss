const archive = {
  // EXPORT
  exportDeck: async function(deckId) {
    try {
      const deck = await db.getDeck(deckId);
      if (!deck) throw new Error("Deck not found");
      const zip = new JSZip();
      zip.file('deck.json', JSON.stringify(deck));
              
      const assets = zip.folder('assets');
              
      // Include title card media if present
      if (deck.titleMediaId) {
        const blob = await db.getMedia(deck.titleMediaId);
        if (blob) assets.file(deck.titleMediaId, blob);
      }

      // Include question & answer media for all cards
      if (deck.cards) {
        for (const card of deck.cards) {
          if (card.qMediaId) {
            const blob = await db.getMedia(card.qMediaId);
            if (blob) assets.file(card.qMediaId, blob);
          }
          if (card.aMediaId) {
            const blob = await db.getMedia(card.aMediaId);
            if (blob) assets.file(card.aMediaId, blob);
          }
        }
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const downloadUrl = URL.createObjectURL(zipBlob);
              
      const a = document.createElement('a');
      a.href = downloadUrl;
      const safeName = (deck.title || 'quiz').replace(/[^a-z0-9]/gi, '_').toLowerCase();
      a.download = `${safeName}.qzd`;
              
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
              
      URL.revokeObjectURL(downloadUrl);
      console.log(`Exported ${safeName}.qzd successfully.`);
            
    } catch (error) {
      console.error("Export failed:", error);
      alert("Failed to export the deck.");
    }
  },

  // IMPORT
  importDeck: async function(file) {
    try {
      const zip = new JSZip();
      const contents = await zip.loadAsync(file);
              
      if (!contents.file('deck.json')) {
        throw new Error("Invalid .qzd file: Missing deck.json");
      }
              
      const deckDataStr = await contents.file('deck.json').async('string');
      const deckObj = JSON.parse(deckDataStr);
      deckObj.id = 'deck_' + Date.now(); 
              
      // Helper to reconstruct MIME type from the saved file extension
      const getMimeType = (filename) => {
        const ext = filename.split('.').pop().toLowerCase();
        if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) return 'image/' + (ext==='jpg'?'jpeg':ext);
        if (['mp4', 'webm', 'ogg'].includes(ext)) return 'video/' + ext;
        if (['mp3', 'wav', 'm4a'].includes(ext)) return 'audio/' + (ext==='mp3'?'mpeg':ext);
        return 'application/octet-stream';
      };
      const mediaPromises = [];
              
      // Safely iterate the folder and collect promises
      const assetsFolder = contents.folder('assets');
      if (assetsFolder) {
        assetsFolder.forEach((relativePath, zipEntry) => {
          if (!zipEntry.dir) {
            const p = zipEntry.async('blob').then(async (rawBlob) => {
              // Re-apply the correct MIME type using the extension
              const mimeType = getMimeType(relativePath);
              const typedBlob = new Blob([rawBlob], { type: mimeType });
                          
              // relativePath is just the filename inside 'assets/'
              await db.saveMedia(relativePath, typedBlob);
            });
            mediaPromises.push(p);
          }
        });
      }
              
      // Await all files to finish unpacking and saving to IndexedDB
      await Promise.all(mediaPromises);
              
      // Save deck metadata last so it doesn't show up in the grid until files are ready
      await db.saveDeck(deckObj);
              
      console.log(`Imported deck "${deckObj.title}" successfully.`);
      return deckObj; 
              
    } catch (error) {
      console.error("Import failed:", error);
      alert("Failed to import the deck. Ensure it is a valid .qzd file.");
    }
  }
};