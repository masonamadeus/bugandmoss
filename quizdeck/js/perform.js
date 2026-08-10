const perform = {
  deck: null,
  currentIndex: 0,
  state: 'title', 
  score: { correct: 0, wrong: 0 },
  activeMediaUrl: null, 
  audioCtx: null,
  totalCards: 0,
  alreadyMarked: false, 
  startTime: null, // NEW: Tracks when the quiz actually starts
  endTime: null,   // NEW: Tracks when the final card is completed

  start: async function(deckId) {
    this.deck = await db.getDeck(deckId);
    if (!this.deck) {
      alert("This deck was not found!");
      return;
    }

    this.currentIndex = 0;
    this.state = 'title'; 
    this.score = { correct: 0, wrong: 0 };
    this.totalCards = this.deck.cards ? this.deck.cards.length : 0;
    this.alreadyMarked = false;
    this.startTime = null;
    this.endTime = null;
    
    this.applyDeckStyles();

    window.broadcastToOBS({ type: 'START' });
    navigate('perform');

    this.render();
    this.broadcast();
  },

  startRemote: function() {
    document.getElementById('view-perform').classList.remove('hidden');
    document.getElementById('view-perform').classList.add('active');
    document.body.classList.add('perform-active');
    this.score = { correct: 0, wrong: 0 };
    this.alreadyMarked = false;
    this.startTime = null;
    this.endTime = null;
  },

  applyDeckStyles: function() {
    const root = document.documentElement;
    let bg = settings.prefs.bg;
    let text = settings.prefs.text;

    if (this.deck && this.deck.styles) {
      if (this.deck.styles.bg) bg = this.deck.styles.bg;
      if (this.deck.styles.text) text = this.deck.styles.text;
    }

    if (window.isOBS) {
      let hex = bg.replace('#', '');
      if (hex.length === 3) hex = hex.split('').map(x => x + x).join('');
      const r = parseInt(hex.substring(0, 2), 16);
      const g = parseInt(hex.substring(2, 4), 16);
      const b = parseInt(hex.substring(4, 6), 16);
      const alpha = parseInt(settings.prefs.obsOpacity || '0') / 100;
      root.style.setProperty('--perf-bg', `rgba(${r}, ${g}, ${b}, ${alpha})`);
    } else {
      root.style.setProperty('--perf-bg', bg);
    }
    
    root.style.setProperty('--perf-text', text);
  },

  fitContent: function() {
    const contentDiv = document.getElementById('perf-content');
    if (!contentDiv) return;

    const textEls = contentDiv.querySelectorAll('.perf-text, .title-card');
    if (textEls.length === 0) return;

    textEls.forEach(el => el.style.fontSize = '100%');

    requestAnimationFrame(() => {
        let size = 100;
        while ((contentDiv.scrollHeight > contentDiv.clientHeight || contentDiv.scrollWidth > contentDiv.clientWidth) && size > 40) {
            size -= 5;
            textEls.forEach(el => el.style.fontSize = size + '%');
        }
    });
  },

  broadcast: async function() {
    if (window.isOBS) return; 

    let textStr = '';
    let authorStr = '';
    let mediaId = null;
    let arrayBuffer = null;
    let mimeType = null;
    let ext = null;

    if (this.state === 'title') {
      textStr = this.deck.title || 'Untitled Deck';
      authorStr = this.deck.author || '';
      mediaId = this.deck.titleMediaId;
    } else if (this.currentIndex < this.totalCards) {
      const card = this.deck.cards[this.currentIndex];
      textStr = this.state === 'question' ? card.qText : card.aText;
      mediaId = this.state === 'question' ? card.qMediaId : card.aMediaId;
    }

    if (mediaId) {
      const blob = await db.getMedia(mediaId);
      if (blob) {
        arrayBuffer = await blob.arrayBuffer();
        mimeType = blob.type;
        ext = mediaId.split('.').pop().toLowerCase();
      }
    }

    window.broadcastToOBS({
      type: 'SYNC',
      stateData: {
        currentIndex: this.currentIndex,
        state: this.state,
        score: this.score,
        totalCards: this.totalCards,
        alreadyMarked: this.alreadyMarked,
        startTime: this.startTime, // Pass timers to OBS
        endTime: this.endTime,
        textStr: textStr,
        authorStr: authorStr,
        mediaBuffer: arrayBuffer,
        mimeType: mimeType,
        mediaExt: ext,
        styles: this.deck.styles 
      }
    });
  },

  syncOBS: function(stateData) {
    this.currentIndex = stateData.currentIndex;
    this.state = stateData.state;
    this.score = stateData.score;
    this.totalCards = stateData.totalCards;
    this.alreadyMarked = stateData.alreadyMarked;
    this.startTime = stateData.startTime;
    this.endTime = stateData.endTime;
    
    if (stateData.styles) {
      this.deck = { styles: stateData.styles };
      this.applyDeckStyles();
    }

    this.renderRemote(stateData);
  },

  next: function() {
    if (this.state === 'title') {
      this.state = 'question';
      this.alreadyMarked = false;
      if (!this.startTime) this.startTime = Date.now(); // Start timer exactly when leaving title screen
    } else if (this.state === 'question') {
      this.state = 'answer';
    } else if (this.state === 'answer') {
      this.currentIndex++;
      this.state = 'question';
      this.alreadyMarked = false; 
    }
    this.render();
    this.broadcast();
  },

  mark: function(isCorrect) {
    if (this.state !== 'question' && this.state !== 'answer') return; 
    if (this.alreadyMarked) return;

    if (isCorrect) {
      this.score.correct++;
      this.playSFX('correct');
    } else {
      this.score.wrong++;
      this.playSFX('wrong');
    }

    if (this.state === 'question') {
      this.state = 'answer';
      this.alreadyMarked = true;
    } else {
      this.currentIndex++;
      this.state = 'question';
      this.alreadyMarked = false;
    }
    
    this.render();
    this.broadcast();
  },

  render: async function() {
    const contentDiv = document.getElementById('perf-content');
    const controlsContainer = document.querySelector('.perform-controls');
    const btnNext = document.getElementById('btn-perf-next');
    const btnCorrect = document.getElementById('btn-perf-correct');
    const btnWrong = document.getElementById('btn-perf-wrong');
    const progress = document.getElementById('perf-progress');

    if (this.activeMediaUrl) {
      URL.revokeObjectURL(this.activeMediaUrl);
      this.activeMediaUrl = null;
    }

    if (this.currentIndex >= this.totalCards && this.state !== 'title') {
      this.state = 'finished';
      if (!this.endTime) this.endTime = Date.now(); // Lock in final completion time
      
      let timeStr = "00:00";
      if (this.startTime) {
          const elapsed = Math.floor((this.endTime - this.startTime) / 1000);
          const mins = String(Math.floor(elapsed / 60)).padStart(2, '0');
          const secs = String(elapsed % 60).padStart(2, '0');
          timeStr = `${mins}:${secs}`;
      }

      progress.innerText = 'Finished';
      controlsContainer.style.display = 'none'; 
      
      const total = this.score.correct + this.score.wrong;
      contentDiv.innerHTML = `
        <div class="score-screen">
          <h1>Quiz Complete!</h1>
          <p>Correct: <span style="color:#00ff00">${this.score.correct}</span></p>
          <p>Wrong: <span style="color:#ff0000">${this.score.wrong}</span></p>
          <p class="score-screen-total">Total Scored: ${total} / ${this.totalCards} in: ${timeStr}</p>
        </div>
      `;
      return;
    }

    contentDiv.innerHTML = ''; 

    if (settings.prefs.showControls) {
      controlsContainer.style.display = 'flex';
      btnNext.style.display = 'inline-block'; 
      
      if ((this.state === 'question' || this.state === 'answer') && !this.alreadyMarked) {
        btnCorrect.style.display = 'inline-block';
        btnWrong.style.display = 'inline-block';
      } else {
        btnCorrect.style.display = 'none';
        btnWrong.style.display = 'none';
      }
    } else {
      controlsContainer.style.display = 'none';
    }

    let textStr = '';
    let authorStr = '';
    let mediaId = null;

    if (this.state === 'title') {
      progress.innerText = 'Intro';
      btnNext.innerText = 'Start Quiz';
      textStr = this.deck.title || 'Untitled Deck';
      authorStr = this.deck.author || '';
      mediaId = this.deck.titleMediaId;
    } else {
      progress.innerText = `Card ${this.currentIndex + 1} / ${this.totalCards}`;
      btnNext.innerText = this.state === 'question' ? 'Show Answer' : 'Next Question';
      const card = this.deck.cards[this.currentIndex];
      textStr = this.state === 'question' ? card.qText : card.aText;
      mediaId = this.state === 'question' ? card.qMediaId : card.aMediaId;
    }

    if (this.state === 'title') {
      const container = document.createElement('div');
      container.className = 'title-card';

      if (textStr) {
        const h1 = document.createElement('h1');
        h1.textContent = textStr;
        container.appendChild(h1);
      }

      if (authorStr) {
        const span = document.createElement('span');
        span.className = 'by-text';
        span.textContent = 'by';
        container.appendChild(span);

        const h3 = document.createElement('h3');
        h3.textContent = authorStr;
        container.appendChild(h3);
      }

      contentDiv.appendChild(container);
    } else if (textStr) {
      const p = document.createElement('div');
      p.className = 'perf-text';
      p.textContent = textStr; 
      contentDiv.appendChild(p);
    }

    if (mediaId) {
      const blob = await db.getMedia(mediaId);
      if (blob) {
        this.activeMediaUrl = URL.createObjectURL(blob);
        let mediaEl;
        const ext = mediaId.split('.').pop().toLowerCase();
        const isImage = blob.type.startsWith('image/') || ['png','jpg','jpeg','gif','webp'].includes(ext);
        const isVideo = blob.type.startsWith('video/') || ['mp4','webm','ogg'].includes(ext);
        const isAudio = blob.type.startsWith('audio/') || ['mp3','wav','m4a'].includes(ext);

        if (isImage) {
          mediaEl = document.createElement('img');
          mediaEl.src = this.activeMediaUrl;
          mediaEl.className = 'perf-media';
          mediaEl.onload = () => this.fitContent(); 
        } else if (isVideo) {
          mediaEl = document.createElement('video');
          mediaEl.src = this.activeMediaUrl;
          mediaEl.autoplay = true;
          mediaEl.loop = true;
          mediaEl.controls = true; 
          mediaEl.className = 'perf-media';
          mediaEl.onloadedmetadata = () => this.fitContent();
        } else if (isAudio) {
          mediaEl = document.createElement('div');
          mediaEl.className = 'custom-audio-player perf-media';
          
          const audio = document.createElement('audio');
          audio.src = this.activeMediaUrl;
          audio.autoplay = true;
          
          const btn = document.createElement('button');
          btn.className = 'btn';
          btn.innerText = '⏸ Pause Audio';
          btn.onclick = () => { if (audio.paused) { audio.play(); btn.innerText = '⏸ Pause Audio'; } else { audio.pause(); btn.innerText = '▶ Play Audio'; } };
          audio.onended = () => btn.innerText = '▶ Play Audio';
          
          mediaEl.appendChild(audio); mediaEl.appendChild(btn);
        }

        if (mediaEl) {
          if (this.state === 'title' && !isAudio) contentDiv.querySelector('.title-card').prepend(mediaEl);
          else contentDiv.appendChild(mediaEl);
        }
      }
    }

    this.fitContent(); 
  },

  renderRemote: function(stateData) {
    const contentDiv = document.getElementById('perf-content');
    
    if (this.activeMediaUrl) {
      URL.revokeObjectURL(this.activeMediaUrl);
      this.activeMediaUrl = null;
    }

    if (this.state === 'finished' || (this.currentIndex >= this.totalCards && this.state !== 'title')) {
      this.state = 'finished';
      if (!this.endTime) this.endTime = Date.now();
      
      let timeStr = "00:00";
      if (this.startTime) {
          const elapsed = Math.floor((this.endTime - this.startTime) / 1000);
          const mins = String(Math.floor(elapsed / 60)).padStart(2, '0');
          const secs = String(elapsed % 60).padStart(2, '0');
          timeStr = `${mins}:${secs}`;
      }

      const total = this.score.correct + this.score.wrong;
      contentDiv.innerHTML = `
        <div class="score-screen">
          <h1>Quiz Complete!</h1>
          <p>Correct: <span style="color:#00ff00">${this.score.correct}</span></p>
          <p>Wrong: <span style="color:#ff0000">${this.score.wrong}</span></p>
          <p class="score-screen-total">Total Scored: ${total} / ${this.totalCards} in: ${timeStr}</p>
        </div>
      `;
      return;
    }

    contentDiv.innerHTML = ''; 

    if (this.state === 'title') {
      const container = document.createElement('div');
      container.className = 'title-card';

      if (stateData.textStr) {
        const h1 = document.createElement('h1');
        h1.textContent = stateData.textStr;
        container.appendChild(h1);
      }

      if (stateData.authorStr) {
        const span = document.createElement('span');
        span.className = 'by-text';
        span.textContent = 'by';
        container.appendChild(span);

        const h3 = document.createElement('h3');
        h3.textContent = stateData.authorStr;
        container.appendChild(h3);
      }

      contentDiv.appendChild(container);
    } else if (stateData.textStr) {
      const p = document.createElement('div');
      p.className = 'perf-text';
      p.textContent = stateData.textStr; 
      contentDiv.appendChild(p);
    }

    if (stateData.mediaBuffer) {
      const blob = new Blob([stateData.mediaBuffer], { type: stateData.mimeType || 'application/octet-stream' });
      this.activeMediaUrl = URL.createObjectURL(blob);
      let mediaEl;

      const ext = stateData.mediaExt || '';
      const isImage = blob.type.startsWith('image/') || ['png','jpg','jpeg','gif','webp'].includes(ext);
      const isVideo = blob.type.startsWith('video/') || ['mp4','webm','ogg'].includes(ext);
      const isAudio = blob.type.startsWith('audio/') || ['mp3','wav','m4a'].includes(ext);

      if (isImage) {
        mediaEl = document.createElement('img');
        mediaEl.src = this.activeMediaUrl;
        mediaEl.className = 'perf-media';
        mediaEl.onload = () => this.fitContent(); 
      } else if (isVideo) {
        mediaEl = document.createElement('video');
        mediaEl.src = this.activeMediaUrl;
        mediaEl.autoplay = true;
        mediaEl.loop = true;
        mediaEl.controls = false; 
        mediaEl.className = 'perf-media';
        mediaEl.onloadedmetadata = () => this.fitContent(); 
      } else if (isAudio) {
        mediaEl = document.createElement('audio');
        mediaEl.src = this.activeMediaUrl;
        mediaEl.autoplay = true;
        mediaEl.style.display = 'none';
      }

      if (mediaEl) {
          if (this.state === 'title' && !isAudio) contentDiv.querySelector('.title-card').prepend(mediaEl);
          else contentDiv.appendChild(mediaEl);
      }
    }

    this.fitContent(); 
  },

  playSFX: async function(type, isRemote = false, remoteBuffer = null, remoteMime = null) {
      if (!window.isOBS && !isRemote) {
      let customBuffer = null;
      let mimeType = null;
      const hasCustom = type === 'correct' ? settings.prefs.hasCustomSfxCorrect : settings.prefs.hasCustomSfxWrong;
      
      if (hasCustom) {
        const blob = await db.getMedia(`sfx_${type}`);
        if (blob) { customBuffer = await blob.arrayBuffer(); mimeType = blob.type; }
      }
      
      window.broadcastToOBS({ type: 'SFX', sfxType: type, buffer: customBuffer, mimeType: mimeType });

      if (customBuffer) {
        const blob = new Blob([customBuffer], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.onended = () => URL.revokeObjectURL(url);
        audio.play().catch(e => console.error("Audio play failed:", e));
        return; 
      }
    } else if (isRemote && remoteBuffer) {
      const blob = new Blob([remoteBuffer], { type: remoteMime || 'audio/mpeg' });
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.onended = () => URL.revokeObjectURL(url);
      audio.play().catch(e => console.error("Audio play failed:", e));
      return;
    }

    if (!this.audioCtx) this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();
    
    osc.connect(gain);
    gain.connect(this.audioCtx.destination);

    if (type === 'correct') {
      osc.type = 'sine'; osc.frequency.setValueAtTime(600, this.audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1200, this.audioCtx.currentTime + 0.1);
      gain.gain.setValueAtTime(1, this.audioCtx.currentTime); gain.gain.exponentialRampToValueAtTime(0.01, this.audioCtx.currentTime + 0.5);
      osc.start(); osc.stop(this.audioCtx.currentTime + 0.5);
    } else {
      osc.type = 'sawtooth'; osc.frequency.setValueAtTime(150, this.audioCtx.currentTime);
      gain.gain.setValueAtTime(1, this.audioCtx.currentTime); gain.gain.exponentialRampToValueAtTime(0.01, this.audioCtx.currentTime + 0.3);
      osc.start(); osc.stop(this.audioCtx.currentTime + 0.3);
    }
  },

  exitOBS: function() {
    if (this.activeMediaUrl) URL.revokeObjectURL(this.activeMediaUrl);
    this.deck = null;
    document.getElementById('view-perform').classList.remove('active');
    document.getElementById('view-perform').classList.add('hidden');
    document.body.classList.remove('perform-active');
    document.getElementById('perf-content').innerHTML = ''; 
    settings.applyToDOM(); 
  },

  exit: function() {
    if (this.activeMediaUrl) URL.revokeObjectURL(this.activeMediaUrl);
    this.deck = null;
    
    window.broadcastToOBS({ type: 'EXIT' });
    settings.applyToDOM(); 
    navigate('browse');
  }
};

window.addEventListener('keydown', (e) => {
  if (!document.getElementById('view-perform').classList.contains('active')) return;
  if (window.isOBS) return; 
  
  if (settings.prefs.keyNext && e.code === settings.prefs.keyNext) {
    e.preventDefault(); perform.next();
  } else if (settings.prefs.keyCorrect && e.code === settings.prefs.keyCorrect) {
    e.preventDefault(); perform.mark(true);
  } else if (settings.prefs.keyWrong && e.code === settings.prefs.keyWrong) {
    e.preventDefault(); perform.mark(false);
  }
});