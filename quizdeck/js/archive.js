const archive = {
  // Helper to generate the zip file and blob
  createZipFile: async function(deckId) {
    const deck = await db.getDeck(deckId);
    if (!deck) throw new Error("Deck not found");

    const zip = new JSZip();
    zip.file('deck.json', JSON.stringify(deck));
    const assets = zip.folder('assets');
            
    if (deck.titleMediaId) {
      const blob = await db.getMedia(deck.titleMediaId);
      if (blob) assets.file(deck.titleMediaId, blob);
    }

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
    const safeName = (deck.title || 'quiz').replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const file = new File([zipBlob], `${safeName}.qzd`, { type: 'application/octet-stream' });

    return { file, zipBlob, safeName, title: deck.title };
  },

  // EXPORT (Download file)
  exportDeck: async function(deckId) {
    try {
      const { zipBlob, safeName } = await this.createZipFile(deckId);
      const downloadUrl = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = downloadUrl;
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

  // SHARE / SEND (Triggers OS Share Sheet with file attached)
  shareDeck: async function(deckId) {
    try {
      const { file, title } = await this.createZipFile(deckId);

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: title || 'QuizDeck',
          text: `Check out this quiz deck: "${title || 'Quiz'}"!`,
          files: [file]
        });
      } else {
        alert("Direct file sharing isn't supported in this browser. Downloading the .qzd file so you can attach it manually!");
        await this.exportDeck(deckId);
      }
    } catch (error) {
      if (error.name !== 'AbortError') { // Ignore user canceling the share dialog
        console.error("Share failed:", error);
        await this.exportDeck(deckId);
      }
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
              
      const getMimeType = (filename) => {
        const ext = filename.split('.').pop().toLowerCase();
        if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) return 'image/' + (ext==='jpg'?'jpeg':ext);
        if (['mp4', 'webm', 'ogg'].includes(ext)) return 'video/' + ext;
        if (['mp3', 'wav', 'm4a'].includes(ext)) return 'audio/' + (ext==='mp3'?'mpeg':ext);
        return 'application/octet-stream';
      };
      const mediaPromises = [];
              
      const assetsFolder = contents.folder('assets');
      if (assetsFolder) {
        assetsFolder.forEach((relativePath, zipEntry) => {
          if (!zipEntry.dir) {
            const p = zipEntry.async('blob').then(async (rawBlob) => {
              const mimeType = getMimeType(relativePath);
              const typedBlob = new Blob([rawBlob], { type: mimeType });
              await db.saveMedia(relativePath, typedBlob);
            });
            mediaPromises.push(p);
          }
        });
      }
              
      await Promise.all(mediaPromises);
      await db.saveDeck(deckObj);
              
      console.log(`Imported deck "${deckObj.title}" successfully.`);
      return deckObj; 
    } catch (error) {
      console.error("Import failed:", error);
      alert("Failed to import the deck. Ensure it is a valid .qzd file.");
    }
  }
};