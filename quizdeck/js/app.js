window.isOBS = new URLSearchParams(window.location.search).get('mode') === 'obs';
const urlParams = new URLSearchParams(window.location.search);
const userHash = urlParams.get('u'); 

// Active connections tracker for the Host
window.obsConnections = new Set(); 

// Broadcast helper for the Host
window.broadcastToOBS = function(payload) {
  window.obsConnections.forEach(conn => {
    if (conn && conn.open) {
      try {
        conn.send(payload);
      } catch (err) {
        console.warn('Failed sending to OBS peer, removing stale connection:', err);
        window.obsConnections.delete(conn);
      }
    } else {
      // Remove silently disconnected or closed peers to prevent memory leaks
      window.obsConnections.delete(conn);
    }
  });
};

// Copy OBS URL to clipboard with unique Host ID
window.copyOBSLink = function() {
  let hostId = localStorage.getItem('quizdeck_host_id');
  if (!hostId) {
    hostId = Math.random().toString(36).substring(2, 9);
    localStorage.setItem('quizdeck_host_id', hostId);
  }
  
  const obsUrl = window.location.href.split('?')[0] + '?mode=obs&u=' + hostId;
  
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(obsUrl).then(() => {
      alert('✅ OBS Link copied! Paste this as a Browser Source URL in OBS.');
    }).catch(err => {
      console.error('Clipboard failed', err);
      prompt("Copy this link for OBS:", obsUrl);
    });
  } else {
    prompt("Copy this link for OBS:", obsUrl);
  }
};

document.addEventListener('DOMContentLoaded', async () => {
  try {
    await db.init();
    console.log('QuizDeck Local Database Initialized!');
    
    settings.init();
    
    // --- OBS SOURCE MODE (RECEIVER) ---
    if (window.isOBS) {
      document.body.classList.add('obs-mode');
      settings.prefs.showControls = false; 
      
      document.querySelectorAll('.view').forEach(el => {
        el.classList.remove('active');
        el.classList.add('hidden');
      });

      if (!userHash) {
        document.body.innerHTML = "<h1 style='color:white; text-align:center;'>Error: No User Hash. Use the Copy OBS Link button!</h1>";
        return; 
      }

      window.obsPeer = new Peer(); 
      
      function connectToController() {
        console.log("Searching for Controller broadcast...");
        const conn = window.obsPeer.connect(`quizdeck-host-${userHash}`); 
        
        conn.on('open', () => { 
          console.log("Connected to Controller Broadcast!");
        });
        
        conn.on('data', async (msg) => { 
          if (msg.type === 'SETTINGS') {
            settings.prefs = msg.prefs;
            settings.applyToDOM();
            if (typeof perform !== 'undefined') perform.fitContent();
          }
          if (msg.type === 'PREVIEW_START') {
            document.body.classList.add('previewing-layout');
            
            // Force the perform view to be visible so the box renders
            const viewPerf = document.getElementById('view-perform');
            viewPerf.classList.remove('hidden');
            viewPerf.classList.add('active');
            
            // Inject dummy content if the screen is currently empty
            const contentDiv = document.getElementById('perf-content');
            if (!contentDiv.innerHTML.trim()) {
                contentDiv.innerHTML = '<div class="title-card"><h1>Layout Preview</h1><h3>Adjust settings in the controller</h3></div>';
            }
          }
          if (msg.type === 'PREVIEW_STOP') {
            document.body.classList.remove('previewing-layout');
            
            // Re-hide the view if a quiz isn't actively running
            if (!document.body.classList.contains('perform-active')) {
                document.getElementById('view-perform').classList.remove('active');
                document.getElementById('view-perform').classList.add('hidden');
                document.getElementById('perf-content').innerHTML = '';
            }
          }
          if (msg.type === 'START') perform.startRemote();
          if (msg.type === 'SYNC') perform.syncOBS(msg.stateData);
          if (msg.type === 'SFX') perform.playSFX(msg.sfxType, true, msg.buffer, msg.mimeType);
          if (msg.type === 'EXIT') perform.exitOBS();
        });
        
        conn.on('close', () => { 
          console.log("Connection lost. Retrying...");
          setTimeout(connectToController, 3000); 
        });
      }
      
      window.obsPeer.on('open', connectToController); 
      window.obsPeer.on('error', (err) => { 
        if (err.type === 'peer-unavailable') { 
          console.log("Controller not found yet. Retrying in 3 seconds...");
          setTimeout(connectToController, 3000); 
        }
      });
      
      return; 
    }
    
    // --- STANDARD CONTROLLER MODE (HOST) ---
    let hostId = localStorage.getItem('quizdeck_host_id');
    if (!hostId) {
      hostId = Math.random().toString(36).substring(2, 9);
      localStorage.setItem('quizdeck_host_id', hostId);
    }

    window.hostPeer = new Peer(`quizdeck-host-${hostId}`); 

    window.hostPeer.on('open', (id) => { 
      console.log(`QuizDeck Controller Online: ${id}`);
    });

    window.hostPeer.on('connection', (conn) => { 
      console.log("New OBS source joined the broadcast!");
      window.obsConnections.add(conn); 
      
      // NEW: Send preferences to OBS the instant it connects
      conn.on('open', () => {
        conn.send({ type: 'SETTINGS', prefs: settings.prefs });
        
        // Bonus: If you refresh OBS while a quiz is running, sync it back up
        if (document.getElementById('view-perform').classList.contains('active')) {
          if (typeof perform !== 'undefined') perform.broadcast();
        }
      });

      conn.on('close', () => window.obsConnections.delete(conn)); 
      conn.on('error', () => window.obsConnections.delete(conn)); 
    });

    if (!localStorage.getItem('quizdeck_tutorial_loaded')) {
      await browse.createTutorial();
      localStorage.setItem('quizdeck_tutorial_loaded', 'true');
    }

    navigate('browse');
    
  } catch (error) {
    console.error('Failed to initialize QuizDeck DB:', error);
    alert('Browser storage is required to use QuizDeck.');
  }
});