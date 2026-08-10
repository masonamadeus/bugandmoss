const DB_NAME = 'QuizDeckDB';
const DB_VERSION = 1;

const db = {
  instance: null,

  // Initialize the database and set up object stores
  init: function() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const database = event.target.result;
        // Store for deck metadata and JSON structure
        if (!database.objectStoreNames.contains('decks')) {
          database.createObjectStore('decks', { keyPath: 'id' });
        }
        // Store for raw images/audio/video blobs
        if (!database.objectStoreNames.contains('media')) {
          database.createObjectStore('media', { keyPath: 'id' });
        }
      };

      request.onsuccess = (event) => {
        this.instance = event.target.result;
        resolve(this.instance);
      };

      request.onerror = (event) => reject(event.target.error);
    });
  },

  // Helper to open transactions
  _transaction: function(storeName, mode) {
    return this.instance.transaction([storeName], mode).objectStore(storeName);
  },

  // --- Deck CRUD Operations ---

  saveDeck: function(deckObj) {
    return new Promise((resolve, reject) => {
      const store = this._transaction('decks', 'readwrite');
      const request = store.put(deckObj);
      request.onsuccess = () => resolve(deckObj.id);
      request.onerror = (event) => reject(event.target.error);
    });
  },

  getAllDecks: function() {
    return new Promise((resolve, reject) => {
      const store = this._transaction('decks', 'readonly');
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = (event) => reject(event.target.error);
    });
  },

  getDeck: function(id) {
    return new Promise((resolve, reject) => {
      const store = this._transaction('decks', 'readonly');
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result);
      request.onerror = (event) => reject(event.target.error);
    });
  },

  deleteDeck: function(id) {
    return new Promise((resolve, reject) => {
      const store = this._transaction('decks', 'readwrite');
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = (event) => reject(event.target.error);
    });
  },

  // --- Media Blob Operations ---

  saveMedia: function(mediaId, blob) {
    return new Promise((resolve, reject) => {
      const store = this._transaction('media', 'readwrite');
      // We store an object containing the ID and the raw Blob
      const request = store.put({ id: mediaId, blob: blob });
      request.onsuccess = () => resolve(mediaId);
      request.onerror = (event) => reject(event.target.error);
    });
  },

  getMedia: function(mediaId) {
    return new Promise((resolve, reject) => {
      const store = this._transaction('media', 'readonly');
      const request = store.get(mediaId);
      request.onsuccess = () => {
        // Return just the blob if it exists
        resolve(request.result ? request.result.blob : null);
      };
      request.onerror = (event) => reject(event.target.error);
    });
  },

  deleteMedia: function(mediaId) {
    return new Promise((resolve, reject) => {
      const store = this._transaction('media', 'readwrite');
      const request = store.delete(mediaId);
      request.onsuccess = () => resolve();
      request.onerror = (event) => reject(event.target.error);
    });
  }
};