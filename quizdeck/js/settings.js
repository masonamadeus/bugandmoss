const settings = {
  defaultPrefs: {
    bg: '#000000', text: '#ffffff', font: 'Roboto', size: '2', obsOpacity: '100',
    obsX: '50', obsY: '50', obsScale: '1', 
    obsMaxW: '1600', obsMaxH: '1200', // Maxed out defaults
    showControls: true, keyNext: '', keyCorrect: '', keyWrong: '',
    hasCustomSfxCorrect: false, hasCustomSfxWrong: false
  },
  
  prefs: {},

  init: function() {
    this.load();
    this.applyToDOM();
    this.updateUI();
  },

  open: function() {
    this.updateUI(); 
    document.getElementById('settings-modal')?.classList.remove('hidden');
    if (typeof window.broadcastToOBS === 'function') {
      window.broadcastToOBS({ type: 'PREVIEW_START' });
    }
  },

  close: function() {
    document.getElementById('settings-modal')?.classList.add('hidden');
    if (typeof window.broadcastToOBS === 'function') {
      window.broadcastToOBS({ type: 'PREVIEW_STOP' });
      if (typeof perform !== 'undefined' && perform.deck) {
          perform.broadcast();
      }
    }
  },

  load: function() {
    const saved = localStorage.getItem('quizdeck_prefs');
    this.prefs = saved ? { ...this.defaultPrefs, ...JSON.parse(saved) } : { ...this.defaultPrefs };
  },

  save: function() {
    const getVal = (id, fallback) => document.getElementById(id)?.value ?? fallback;
    
    this.prefs.bg = getVal('set-bg', this.prefs.bg);
    this.prefs.text = getVal('set-text', this.prefs.text);
    this.prefs.font = getVal('set-font', this.prefs.font).trim();
    this.prefs.size = getVal('set-size', this.prefs.size);
    this.prefs.obsOpacity = getVal('set-obs-opacity', this.prefs.obsOpacity); 
    this.prefs.showControls = document.getElementById('set-show-controls')?.checked ?? true;
    
    this.prefs.obsX = getVal('set-obs-x', this.prefs.obsX);
    this.prefs.obsY = getVal('set-obs-y', this.prefs.obsY);
    this.prefs.obsScale = getVal('set-obs-scale', this.prefs.obsScale);
    this.prefs.obsMaxW = getVal('set-obs-max-w', this.prefs.obsMaxW);
    this.prefs.obsMaxH = getVal('set-obs-max-h', this.prefs.obsMaxH);
    
    const setInner = (id, text) => { const el = document.getElementById(id); if (el) el.innerText = text; };
    setInner('set-size-val', this.prefs.size + 'rem');
    setInner('set-obs-opacity-val', this.prefs.obsOpacity + '%');
    setInner('set-obs-x-val', this.prefs.obsX + '%');
    setInner('set-obs-y-val', this.prefs.obsY + '%');
    setInner('set-obs-scale-val', parseFloat(this.prefs.obsScale).toFixed(1) + 'x');
    setInner('set-obs-max-w-val', this.prefs.obsMaxW + 'px');
    setInner('set-obs-max-h-val', this.prefs.obsMaxH + 'px');
    
    localStorage.setItem('quizdeck_prefs', JSON.stringify(this.prefs));
    this.applyToDOM();

    if (typeof window.broadcastToOBS === 'function') {
      window.broadcastToOBS({ type: 'SETTINGS', prefs: this.prefs });
    }
  },

  resetSection: async function(section) {
    if (section === 'appearance') {
      this.prefs.bg = this.defaultPrefs.bg;
      this.prefs.text = this.defaultPrefs.text;
      this.prefs.font = this.defaultPrefs.font;
      this.prefs.size = this.defaultPrefs.size;
    } else if (section === 'hotkeys') {
      this.prefs.showControls = this.defaultPrefs.showControls;
      this.prefs.keyNext = this.defaultPrefs.keyNext;
      this.prefs.keyCorrect = this.defaultPrefs.keyCorrect;
      this.prefs.keyWrong = this.defaultPrefs.keyWrong;
    } else if (section === 'sfx') {
      await this.clearSFX('correct');
      await this.clearSFX('wrong');
      return;
    } else if (section === 'obs') {
      this.prefs.obsOpacity = this.defaultPrefs.obsOpacity;
      this.prefs.obsX = this.defaultPrefs.obsX;
      this.prefs.obsY = this.defaultPrefs.obsY;
      this.prefs.obsScale = this.defaultPrefs.obsScale;
      this.prefs.obsMaxW = this.defaultPrefs.obsMaxW;
      this.prefs.obsMaxH = this.defaultPrefs.obsMaxH;
    }

    localStorage.setItem('quizdeck_prefs', JSON.stringify(this.prefs));
    this.updateUI();
    this.applyToDOM();

    if (typeof window.broadcastToOBS === 'function') {
      window.broadcastToOBS({ type: 'SETTINGS', prefs: this.prefs });
    }
  },

  applyToDOM: function() {
    const root = document.documentElement;
    
    let sizeVal = parseFloat(this.prefs.size || '2');
    if (window.isOBS) sizeVal *= 1.3; 
    root.style.setProperty('--perf-font-size', sizeVal.toFixed(2) + 'rem');

    if (window.isOBS) {
      let hex = this.prefs.bg || '#000000';
      hex = hex.replace('#', '');
      if (hex.length === 3) hex = hex.split('').map(x => x + x).join('');
      const r = parseInt(hex.substring(0, 2), 16);
      const g = parseInt(hex.substring(2, 4), 16);
      const b = parseInt(hex.substring(4, 6), 16);
      const alpha = parseInt(this.prefs.obsOpacity || '0') / 100;
      root.style.setProperty('--perf-bg', `rgba(${r}, ${g}, ${b}, ${alpha})`);
      
      root.style.setProperty('--obs-x', (this.prefs.obsX || '50') + '%');
      root.style.setProperty('--obs-y', (this.prefs.obsY || '50') + '%');
      root.style.setProperty('--obs-scale', this.prefs.obsScale || '1');
      root.style.setProperty('--obs-max-w', (this.prefs.obsMaxW || '1600') + 'px');
      root.style.setProperty('--obs-max-h', (this.prefs.obsMaxH || '1200') + 'px');
    } else {
      root.style.setProperty('--perf-bg', this.prefs.bg);
    }

    root.style.setProperty('--perf-text', this.prefs.text);

    const fontName = this.prefs.font;
    if (fontName) {
      const builtIns = ['sans-serif', 'serif', 'monospace', 'arial', 'verdana', 'tahoma', 'trebuchet ms', 'times new roman', 'georgia', 'garamond', 'courier new', 'impact'];
      if (!builtIns.includes(fontName.toLowerCase())) {
        const fontUrl = `https://fonts.googleapis.com/css2?family=${fontName.replace(/ /g, '+')}&display=swap`;
        const linkEl = document.getElementById('dynamic-font');
        if(linkEl) linkEl.href = fontUrl;
      } else {
        const linkEl = document.getElementById('dynamic-font');
        if(linkEl) linkEl.href = ''; 
      }
      root.style.setProperty('--perf-font', `"${fontName}", sans-serif`);
    }
  },

  updateUI: function() {
    const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
    const setInner = (id, text) => { const el = document.getElementById(id); if (el) el.innerText = text; };
    
    setVal('set-bg', this.prefs.bg);
    setVal('set-text', this.prefs.text);
    setVal('set-font', this.prefs.font);
    setVal('set-size', this.prefs.size);
    setVal('set-obs-opacity', this.prefs.obsOpacity || '0');
    
    const chk = document.getElementById('set-show-controls');
    if (chk) chk.checked = this.prefs.showControls;
    
    setVal('set-obs-x', this.prefs.obsX || '50');
    setVal('set-obs-y', this.prefs.obsY || '50');
    setVal('set-obs-scale', this.prefs.obsScale || '1');
    setVal('set-obs-max-w', this.prefs.obsMaxW || '1600');
    setVal('set-obs-max-h', this.prefs.obsMaxH || '1200');
    
    setInner('set-size-val', this.prefs.size + 'rem');
    setInner('set-obs-opacity-val', (this.prefs.obsOpacity || '0') + '%');
    setInner('set-obs-x-val', (this.prefs.obsX || '50') + '%');
    setInner('set-obs-y-val', (this.prefs.obsY || '50') + '%');
    setInner('set-obs-scale-val', parseFloat(this.prefs.obsScale || '1').toFixed(1) + 'x');
    setInner('set-obs-max-w-val', (this.prefs.obsMaxW || '1600') + 'px');
    setInner('set-obs-max-h-val', (this.prefs.obsMaxH || '1200') + 'px');
    
    setVal('key-next', this.prefs.keyNext);
    setVal('key-correct', this.prefs.keyCorrect);
    setVal('key-wrong', this.prefs.keyWrong);

    const btnCor = document.getElementById('btn-clear-sfx-correct');
    if (btnCor) btnCor.style.display = this.prefs.hasCustomSfxCorrect ? 'inline-block' : 'none';
    const btnWr = document.getElementById('btn-clear-sfx-wrong');
    if (btnWr) btnWr.style.display = this.prefs.hasCustomSfxWrong ? 'inline-block' : 'none';
  },

  captureKey: function(event, inputId) {
    event.preventDefault(); 
    const prefMap = { 'key-next': 'keyNext', 'key-correct': 'keyCorrect', 'key-wrong': 'keyWrong' };
    const prefKey = prefMap[inputId];
    const el = document.getElementById(inputId);
    
    if (event.code === 'Backspace' || event.code === 'Delete') {
      this.prefs[prefKey] = ''; 
      if (el) el.value = '';
    } else {
      this.prefs[prefKey] = event.code; 
      if (el) el.value = event.code;
    }
    this.save();
  },
  
  uploadSFX: async function(type, event) {
    const file = event.target.files[0];
    if (!file) return;
    const mediaId = `sfx_${type}`; 
    await db.saveMedia(mediaId, file);
    if (type === 'correct') this.prefs.hasCustomSfxCorrect = true;
    if (type === 'wrong') this.prefs.hasCustomSfxWrong = true;
    this.save(); this.updateUI();
  },
  
  clearSFX: async function(type) {
    const mediaId = `sfx_${type}`;
    await db.deleteMedia(mediaId); 
    if (type === 'correct') this.prefs.hasCustomSfxCorrect = false;
    if (type === 'wrong') this.prefs.hasCustomSfxWrong = false;
    const el = document.getElementById(`file-sfx-${type}`);
    if (el) el.value = '';
    this.save(); this.updateUI();
  }
};