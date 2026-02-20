/* ---------------- Music helpers ---------------- */
let A4 = 440;
const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const NATURALS   = ['C','D','E','F','G','A','B'];

function freqToMidi(f) { return 69 + 12 * Math.log2(f / A4); }
function midiToFreq(m) { return A4 * Math.pow(2, (m - 69) / 12); }
function midiToNoteName(m) {
  const n = Math.round(m);
  const name = NOTE_NAMES[((n % 12) + 12) % 12];
  const octave = Math.floor(n / 12) - 1;
  return `${name}${octave}`;
}
function centsOff(freq, midiRounded) {
  const ref = midiToFreq(midiRounded);
  return 1200 * Math.log2(freq / ref);
}
function nearestMidiNatural(freq){
  const m = freqToMidi(freq);
  const r = Math.round(m);
  const name = NOTE_NAMES[((r % 12) + 12) % 12];
  if (!name.includes('#')) return { midi:r, letter:name };
  const left=r-1, right=r+1;
  const leftDiff=Math.abs(m-left), rightDiff=Math.abs(m-right);
  const pick = (leftDiff <= rightDiff) ? left : right;
  return { midi: pick, letter: NOTE_NAMES[((pick % 12) + 12) % 12] };
}

/* -------------- Pitch detection (autocorrelation) -------------- */
function autoCorrelate(buf, sampleRate) {
  const N = buf.length;
  let rms=0; for (let i=0;i<N;i++){ const v=buf[i]; rms += v*v; }
  rms = Math.sqrt(rms/N);
  if (rms < 0.008) return {freq:null, rms};

  // remove DC
  let mean=0; for (let i=0;i<N;i++) mean += buf[i]; mean/=N;
  for (let i=0;i<N;i++) buf[i]-=mean;

  const MAX=N>>1; const ac=new Float32Array(MAX);
  for (let lag=0; lag<MAX; lag++){
    let sum=0;
    for (let i=0;i<MAX;i++) sum += buf[i]*buf[i+lag];
    ac[lag]=sum;
  }

  // find peak
  let bestLag=-1, best=0, i=1;
  while (i<MAX-1 && ac[i]>ac[i+1]) i++;
  for (; i<MAX-1; i++){
    if (ac[i]>ac[i-1] && ac[i]>ac[i+1]) {
      if (ac[i]>best){ best=ac[i]; bestLag=i; }
    }
  }
  if (bestLag<0) return {freq:null, rms};

  const y1=ac[bestLag-1]||ac[bestLag], y2=ac[bestLag], y3=ac[bestLag+1]||ac[bestLag];
  const denom=(y1-2*y2+y3); let shift=0; if (denom!==0) shift = 0.5 * (y1 - y3) / denom;
  const lag = bestLag + shift;
  const f = sampleRate / lag;
  if (f < 40 || f > 2000) return {freq:null, rms};
  return {freq:f, rms};
}

/* ------------------- UI refs and boot ------------------- */
let ui = null;

function boot(){
  ui = {
    btnMidi: document.getElementById('btnMidi'),
    inputSelect: document.getElementById('inputSelect'),
    permMsg: document.getElementById('permMsg'),
    midiMsg: document.getElementById('midiMsg'),
    lvl: document.getElementById('lvl'),
    detNote: document.getElementById('detNote'),
    detFreq: document.getElementById('detFreq'),
    detCents: document.getElementById('detCents'),
    tol: document.getElementById('tol'),
    a4: document.getElementById('a4'),
    status: document.getElementById('status'),
    canvas: document.getElementById('game'),
    overlay: document.getElementById('gameOverOverlay'),
    overlayScore: document.getElementById('overlayScore'),
    overlayBest: document.getElementById('overlayBest'),
    playAgainBtn: document.getElementById('playAgainBtn'),
    selectLevelBtn: document.getElementById('selectLevelBtn'),
    mainMenuBtn: document.getElementById('mainMenuBtn'),
    mainMenuOverlay: document.getElementById('mainMenuOverlay'),
    chooseModeBtn: document.getElementById('chooseModeBtn'),
    settingsBtn: document.getElementById('settingsBtn'),
    chooseModePanel: document.getElementById('chooseModePanel'),
    modesList: document.getElementById('modesList'),
    settingsPanel: document.getElementById('settingsPanel'),
    backBtn: document.getElementById('backBtn'),
    readyOverlay: document.getElementById('readyOverlay'),
    musicToggle: document.getElementById('musicToggle'),
    musicVolume: document.getElementById('musicVolume'),
    settingsCloseBtn: document.getElementById('settingsCloseBtn'),
    menuFloatingActions: document.querySelector('.menu-floating-actions'),
    modeLevels: document.getElementById('modeLevels'),
    levelsGrid: document.getElementById('levelsGrid'),
    levelTimer: document.getElementById('levelTimer'),
    // calibration UI refs
    calibrateBtn: document.getElementById('calibrateBtn'),
    calibPanel: document.getElementById('calibPanel'),
    calibLevel: document.getElementById('calibLevel'),
    calibDetected: document.getElementById('calibDetected'),
    calibSuggestedTol: document.getElementById('calibSuggestedTol'),
    calibTargetBtn: document.getElementById('calibTargetBtn'),
    calibVerifyBtn: document.getElementById('calibVerifyBtn'),
    calibThreshold: document.getElementById('calibThreshold'),
    calibRecordBtn: document.getElementById('calibRecordBtn'),
    calibDbReadout: document.getElementById('calibDbReadout'),
    tolVal: document.getElementById('tolVal'),
    calibSaveBtn: document.getElementById('calibSaveBtn'),
    calibCloseBtn: document.getElementById('calibCloseBtn'),
    calibMsg: document.getElementById('calibMsg'),
    clearRecordsBtn: document.getElementById('clearRecordsBtn'),
  };
  // lightweight on-screen debug panel (created if missing) to show mapping info
  if (!document.getElementById('detDebug')){
    const dd = document.createElement('div');
    dd.id = 'detDebug';
    dd.style.position = 'fixed'; dd.style.right = '12px'; dd.style.bottom = '12px';
    dd.style.padding = '8px 10px'; dd.style.background = 'rgba(0,0,0,0.6)'; dd.style.color = '#fff';
    dd.style.fontFamily = 'monospace'; dd.style.fontSize = '12px'; dd.style.borderRadius = '6px'; dd.style.zIndex = 9999;
    dd.style.maxWidth = '320px'; dd.style.whiteSpace = 'pre-wrap';
    dd.textContent = 'detDebug ready';
    document.body.appendChild(dd);
  }
  ui.detDebug = document.getElementById('detDebug');
  // expose for legacy functions and console debugging
  window.ui = ui;
    // menu music element (created lazily)
    ui._menuAudio = null;
    function createMenuAudio(){
      if (ui._menuAudio) return ui._menuAudio;
      const candidates = ['Assets/Sounds/menu-loop.wav','Assets/Sounds/menu-loop.mp3'];
      for (const src of candidates){
        try{
          const a = new Audio(src);
          a.loop = true; a.volume = 0.55;
          // don't immediately play here; store and return the audio element
          ui._menuAudio = a;
          return a;
        }catch(e){ console.warn('menu audio create failed for', src, e); }
      }
      console.warn('menu audio not available');
      return null;
    }
    function playMenuMusic(){
      if (ui.musicToggle && !ui.musicToggle.checked) return;
      const a = createMenuAudio(); if (!a) return;
      a.play().catch(e=>{ console.warn('menu music play failed', e); });
    }
    function stopMenuMusic(){ if (ui._menuAudio) try{ ui._menuAudio.pause(); ui._menuAudio.currentTime = 0; }catch(e){} }
    // game music (one per game mode) - Meteor game song
    ui._gameAudio = null;
    function createGameAudio(){
      if (ui._gameAudio) return ui._gameAudio;
      const candidates = ['Assets/Sounds/Meteor game song.wav','Assets/Sounds/Meteor game song.mp3'];
      for (const src of candidates){
        try{
          const a = new Audio(src);
          a.loop = true; a.volume = (ui.musicVolume ? Number(ui.musicVolume.value)/100 : 0.55);
          ui._gameAudio = a;
          return a;
        }catch(e){ console.warn('game audio create failed for', src, e); }
      }
      console.warn('game audio not available');
      return null;
    }
    function playGameMusic(){
      if (ui.musicToggle && !ui.musicToggle.checked) return;
      const a = createGameAudio(); if (!a) return; a.play().catch(e=>{ console.warn('game music play failed', e); });
    }
    function stopGameMusic(){ if (ui._gameAudio) try{ ui._gameAudio.pause(); ui._gameAudio.currentTime = 0; }catch(e){} }
    // play crash sfx (creates transient Audio so multiple can overlap)
    function playCrashSfx(){
      try{
        const src = 'Assets/Sounds/Meteor crash.wav';
        const a = new Audio(src);
        const vol = (ui.musicVolume ? Number(ui.musicVolume.value)/100 : 0.55) * 0.9;
        a.volume = Math.max(0, Math.min(1, vol));
        a.play().catch(e=>{ console.warn('crash sfx play failed', e); });
      }catch(e){ console.warn('crash sfx error', e); }
    }
  if (ui.a4) ui.a4.addEventListener('change', ()=>{ A4 = Number(ui.a4.value)||440; });
  // music toggle persistence (controls both menu and game music; preserves old key)
  if (ui.musicToggle){
    const saved = localStorage.getItem('music_enabled');
    if (saved === null) ui.musicToggle.checked = localStorage.getItem('menu_music') !== 'off';
    else ui.musicToggle.checked = saved !== 'off';
    ui.musicToggle.addEventListener('change', ()=>{
      const on = ui.musicToggle.checked;
      localStorage.setItem('music_enabled', on ? 'on' : 'off');
      try{
        if (on){
          // if a game is running, prefer game music; else play menu music
          if (typeof game !== 'undefined' && game.started && !game.over) playGameMusic();
          else playMenuMusic();
        } else {
          stopGameMusic(); stopMenuMusic();
        }
      }catch(e){ try{ stopGameMusic(); stopMenuMusic(); }catch(_){} }
    });
  }

  /* ------------------- Web MIDI ------------------- */
  let midiAccess = null;
  function handleMIDIMessage(event){
    const data = event.data; // [status, note, velocity]
    const status = data[0] & 0xf0;
    const note = data[1];
    const vel = data[2];
    // Note On
    if (status === 0x90 && vel > 0){
      // Shift incoming MIDI note down by 3 semitones to correct mapping
      const shifted = Math.max(0, note - 3);
      const f = midiToFreq(shifted);
      const name = midiToNoteName(shifted);
      if (ui.detNote) ui.detNote.textContent = name;
      if (ui.detFreq) ui.detFreq.textContent = f.toFixed(1) + ' Hz';
      if (ui.detCents) ui.detCents.textContent = '0 ¢';
      if (ui.status) ui.status.textContent = `MIDI: note ${note} on (shifted to ${shifted})`;

      // Try direct letter match from the shifted MIDI note
      const letter = NOTE_NAMES[((shifted % 12) + 12) % 12];
      const hit = matchLowestByLetter(letter);
      console.log('MIDI note', note, 'shifted', shifted, name, 'letter', letter, 'hit?', hit);
    }
  }

  // Match by a note letter (e.g., 'C','D') coming from MIDI input.
  function matchLowestByLetter(letter){
    // don't allow matching when the game isn't actively running (or after game over)
    if (!game.started || game.over) return false;
    if (game.comets.length === 0) return false;
    let idx = 0, maxY = -Infinity;
    for (let i = 0; i < game.comets.length; i++){
      if (game.comets[i].y > maxY){ maxY = game.comets[i].y; idx = i; }
    }
    const target = game.comets[idx];
    const plain = letter.replace('#','');
    if (plain === target.note){
      const now = performance.now();
      if (now - game.lastHitAt > 120){
        // stronger shatter effect for MIDI hits
        explodeAt(target.x, target.y, target.note);
        for (let i=0;i<12;i++){ explodeAt(target.x + (Math.random()-0.5)*10, target.y + (Math.random()-0.5)*10, target.note); }
        // score based on height: top->10, ground->1 (floor)
        try{
          const topY = -60; // spawn Y used by spawnComet
          const span = (typeof groundY !== 'undefined') ? Math.max(1, groundY - topY) : 700;
          const frac = Math.max(0, Math.min(1, ( (groundY - target.y) / span )) );
            const points = Math.floor(1 + frac * 9);
            addScore(points);
        }catch(e){ addScore(1); }
        game.comets.splice(idx,1);
        game.lastHitAt = now;
        return true;
      }
    }
    return false;
  }

  async function initMIDI(){
    if (!navigator.requestMIDIAccess) {
      ui.midiMsg.textContent = 'Web MIDI not supported in this browser.';
      return;
    }
    try{
      midiAccess = await navigator.requestMIDIAccess({ sysex: false });
      const inputs = Array.from(midiAccess.inputs.values());
      if (inputs.length === 0) ui.midiMsg.textContent = 'No MIDI inputs detected.';
      else ui.midiMsg.textContent = 'MIDI connected: ' + inputs.map(i=>i.name).join(', ');
      for (const input of inputs) input.onmidimessage = handleMIDIMessage;
      midiAccess.onstatechange = (e) => {
        const inputs = Array.from(midiAccess.inputs.values());
        ui.midiMsg.textContent = inputs.length ? ('MIDI: ' + inputs.map(i=>i.name).join(', ')) : 'No MIDI inputs';
        for (const input of inputs) input.onmidimessage = handleMIDIMessage;
      };
    }catch(e){
      console.error('MIDI init failed', e);
      ui.midiMsg.textContent = 'MIDI permission denied or unavailable.';
    }
  }

  ui.btnMidi.addEventListener('click', ()=>{ initMIDI(); });
  if (ui.playAgainBtn) ui.playAgainBtn.addEventListener('click', async ()=>{
    hideGameOver();
    if (window.currentMode === 'note-reading') {
      try { await startNoteReading(); } catch(e){ console.warn('startNoteReading failed', e); }
    } else {
      // restart the selected mode/level properly so timers and speeds reset
      try { await startGame(); } catch(e){ console.warn('startGame failed on playAgain', e); }
      game.over = false;
      lastTs = performance.now();
    }
  });
  if (ui.mainMenuBtn) ui.mainMenuBtn.addEventListener('click', ()=>{
    // hide game over overlay and show the main menu (full-screen banner view)
    hideGameOver();
    // reset note reading state when returning to menu
    if (typeof nr !== 'undefined') { nr.active = false; nr.over = false; }
    if (ui.mainMenuOverlay) {
      ui.mainMenuOverlay.classList.remove('show-card');
      ui.mainMenuOverlay.style.display = 'flex';
    }
    // restore floating actions so user can choose mode or settings
    if (ui.menuFloatingActions) ui.menuFloatingActions.style.display = '';
    // stop any game music and play menu music when returning to the banner view
    try{ stopGameMusic(); }catch(e){}
    try{ playMenuMusic(); }catch(e){}
  });

  // (menu buttons handled later; floating actions are managed when reveal-card is toggled)

  if (ui.backBtn) ui.backBtn.addEventListener('click', ()=>{
    // go back to main menu overview: hide panels and hide the card
    if (ui.settingsPanel) ui.settingsPanel.style.display = 'none';
    if (ui.chooseModePanel) ui.chooseModePanel.style.display = 'none';
    if (ui.mainMenuOverlay) ui.mainMenuOverlay.classList.remove('show-card');
    ui.backBtn.style.display = 'none';
    // restore floating actions and main menu button
    if (ui.menuFloatingActions) ui.menuFloatingActions.style.display = '';
    if (ui.mainMenuBtn) ui.mainMenuBtn.style.display = '';
  });
  // menu is intentionally non-closable

  // ready overlay click -> start game
  if (ui.readyOverlay){
    ui.readyOverlay.addEventListener('click', ()=>{
      ui.readyOverlay.style.display = 'none';
      // trigger start flow directly
      stopMenuMusic();
      if (window.currentMode === 'note-reading') {
        startNoteReading();
      } else {
        startGame();
      }
    });
  }

  // populate modes list (initial sample)

    // auto-detect and init MIDI on boot
    try{ initMIDI(); }catch(e){ console.warn('Auto initMIDI failed', e); }

    // PC keyboard support: press A-G to hit matching note (ignores typing in inputs)
    document.addEventListener('keydown', (ev) => {
      try{
        if (ev.repeat) return;
        const tag = ev.target && ev.target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || (ev.target && ev.target.isContentEditable)) return;
        const k = (ev.key || '').toUpperCase();
        if (!/^[A-G]$/.test(k)) return;

        // Note Reading mode: match by letter name only (octave doesn't matter)
        if (nr.active && !nr.over && nr.currentNote) {
          if (k === nr.currentNote.name) {
            const elapsed = (performance.now() - nr.noteSpawnTime) / 1000;
            const frac = Math.max(0, 1 - elapsed / nr.timerMax);
            const points = Math.max(1, Math.ceil(10 * frac));
            nr.score += points;
            nr.lastPoints = points;
            nr.flashCorrect = 1.0;
            nr.scorePop = Math.min(2.5, 0.6 + Math.sqrt(points) * 0.18);
            nr.lastAdd = { val: points, t: 0, life: 1.0 };
            // particles
            const nx = NR_NX, ny = nrY(nr.currentNote.staffPos);
            for (let i = 0; i < 20; i++){
              nr.particles.push({ x:nx+(Math.random()-.5)*10, y:ny+(Math.random()-.5)*10,
                vx:(Math.random()*2-1)*80, vy:(Math.random()*2-1)*80,
                life:0.5+Math.random()*0.5, t:0,
                color:['#4ade80','#a3e635','#facc15','#ffffff'][Math.floor(Math.random()*4)] });
            }
            if (nr.score > nr.best){ nr.best = nr.score; localStorage.setItem('nr_best', String(nr.best)); }
            nr.timerMax = Math.max(3, nr.timerMax - 0.5);
            nrSpawnNote();
          }
          return;  // don't fall through to meteor-sky handler
        }

        if (ui && ui.status) ui.status.textContent = `Key ${k} pressed`;
        const hit = matchLowestByLetter(k);
        if (hit && ui && ui.status) {
          ui.status.textContent = `Hit ${k}!`;
          setTimeout(()=>{ if (ui && ui.status) ui.status.textContent = ''; }, 650);
        }
      }catch(e){ console.warn('keyboard handler error', e); }
    });

    // Select level button -> reveal the mode/levels card
    if (ui.selectLevelBtn) ui.selectLevelBtn.addEventListener('click', ()=>{
      try{
        // hide game over overlay
        hideGameOver();
        // note reading has no levels; go straight to main menu
        if (window.currentMode === 'note-reading') {
          if (typeof nr !== 'undefined') { nr.active = false; nr.over = false; }
          if (ui.mainMenuOverlay) { ui.mainMenuOverlay.classList.remove('show-card'); ui.mainMenuOverlay.style.display = 'flex'; }
          if (ui.menuFloatingActions) ui.menuFloatingActions.style.display = '';
          return;
        }
        // ensure overlay is visible (inline style may be 'none' from gameplay), then reveal the card
        if (ui.mainMenuOverlay) {
          ui.mainMenuOverlay.style.display = 'flex';
          ui.mainMenuOverlay.classList.add('show-card');
        }
        if (ui.chooseModePanel) ui.chooseModePanel.style.display = 'block';
        if (ui.modeLevels) ui.modeLevels.style.display = 'block';
        if (ui.backBtn) ui.backBtn.style.display = 'inline-block';
        if (ui.menuFloatingActions) ui.menuFloatingActions.style.display = 'none';
        if (ui.mainMenuBtn) ui.mainMenuBtn.style.display = 'none';
        window.currentMode = window.currentMode || 'meteor-sky';
        renderLevels();
      }catch(e){ console.warn('selectLevel handler error', e); }
    });
  if (ui.modesList){
    // already seeded in HTML; ensure it's scrollable and ready for future items
    ui.modesList.style.overflowY = 'auto';
    // attach click handlers to mode items so selecting a mode starts the game
    const items = ui.modesList.querySelectorAll('.mode-item');
    for (const it of items){
      it.style.cursor = 'pointer';
      it.addEventListener('click', async ()=>{
        const mode = it.dataset.mode || it.querySelector('.mode-name')?.textContent || 'meteor-sky';
        console.log('Selecting mode', mode);
        window.currentMode = mode;

        if (mode === 'note-reading') {
          // Note reading has no levels; go straight to ready overlay
          window.selectedLevel = null;
          if (ui.mainMenuOverlay) ui.mainMenuOverlay.style.display = 'none';
          if (ui.chooseModePanel) ui.chooseModePanel.style.display = 'none';
          if (ui.modeLevels) ui.modeLevels.style.display = 'none';
          if (ui.readyOverlay) ui.readyOverlay.style.display = 'flex';
          return;
        }
        // hide menu and panels
        // keep main menu open but reveal the levels panel for this mode
        if (ui.modeLevels) ui.modeLevels.style.display = 'block';
        if (ui.chooseModePanel) ui.chooseModePanel.style.display = 'block';
        // populate levels grid for the selected mode
        renderLevels();
      });
    }
  }

  // floating actions (visible over banner) should reveal the menu card and panels
  if (ui.chooseModeBtn) ui.chooseModeBtn.addEventListener('click', ()=>{
    if (ui.mainMenuOverlay) ui.mainMenuOverlay.classList.add('show-card');
    if (ui.chooseModePanel) ui.chooseModePanel.style.display = 'block';
    if (ui.settingsPanel) ui.settingsPanel.style.display = 'none';
    if (ui.backBtn) ui.backBtn.style.display = 'inline-block';
    // hide floating actions and main-menu button while viewing the full-screen menu
    if (ui.menuFloatingActions) ui.menuFloatingActions.style.display = 'none';
    if (ui.mainMenuBtn) ui.mainMenuBtn.style.display = 'none';
  });
  if (ui.settingsBtn) ui.settingsBtn.addEventListener('click', ()=>{
    if (ui.mainMenuOverlay) ui.mainMenuOverlay.classList.add('show-card');
    if (ui.settingsPanel) ui.settingsPanel.style.display = 'block';
    if (ui.chooseModePanel) ui.chooseModePanel.style.display = 'none';
    if (ui.backBtn) ui.backBtn.style.display = 'inline-block';
    if (ui.menuFloatingActions) ui.menuFloatingActions.style.display = 'none';
    if (ui.mainMenuBtn) ui.mainMenuBtn.style.display = 'none';
  });

  // Settings: volume slider wiring and Close button
  if (ui.musicVolume){
    const saved = Number(localStorage.getItem('menu_volume'));
    ui.musicVolume.value = isNaN(saved) ? 55 : saved;
    ui.musicVolume.addEventListener('input', ()=>{
      const v = Number(ui.musicVolume.value) || 55;
      localStorage.setItem('menu_volume', String(v));
      const a = createMenuAudio(); if (a) a.volume = v/100;
      try{ const g = createGameAudio(); if (g) g.volume = v/100; }catch(e){}
    });
    // apply initial volume to any created audio
    try{ const a0 = createMenuAudio(); if (a0) a0.volume = Number(ui.musicVolume.value)/100; }catch(e){}
  }
  if (ui.settingsCloseBtn) ui.settingsCloseBtn.addEventListener('click', ()=>{
    if (ui.settingsPanel) ui.settingsPanel.style.display = 'none';
    if (ui.mainMenuOverlay) ui.mainMenuOverlay.classList.remove('show-card');
    if (ui.menuFloatingActions) ui.menuFloatingActions.style.display = '';
    if (ui.mainMenuBtn) ui.mainMenuBtn.style.display = '';
  });

  if (ui.clearRecordsBtn) ui.clearRecordsBtn.addEventListener('click', ()=>{
    try{
      if (!confirm('Clear all records? This will reset high scores and unlocked levels.')) return;
      const keys = Object.keys(localStorage);
      for (const k of keys){
        if (k.startsWith('meteor_level_best_') || k === 'meteor_survival_best' || k === 'dino_best' || k === 'unlocked_level_meteor_sky' || k === 'nr_best'){
          localStorage.removeItem(k);
        }
      }
      // reset unlocked flag and in-memory values where possible
      try{ localStorage.setItem('unlocked_level_meteor_sky', '1'); if (typeof unlockedLevel !== 'undefined') unlockedLevel = 1; }catch(e){}
      try{ game.best = 0; if (ui.overlayBest) ui.overlayBest.textContent = '0'; }catch(e){}
      try{ renderLevels(); }catch(e){}
      if (ui.permMsg) ui.permMsg.textContent = 'Records cleared.';
    }catch(e){ if (ui.permMsg) ui.permMsg.textContent = 'Failed to clear records.'; }
  });

  // Calibration persistence: apply saved tolerance if present
  try{
    const savedTol = Number(localStorage.getItem('mic_tol_cents'));
    if (!isNaN(savedTol) && ui.tol) ui.tol.value = String(savedTol);
  }catch(e){}

  // apply saved threshold (dB) if present
  try{
    const savedTh = Number(localStorage.getItem('mic_thresh_db'));
    if (!isNaN(savedTh) && ui.calibThreshold) ui.calibThreshold.value = String(savedTh);
  }catch(e){}
  // show tol value label if present
  if (ui.tol && ui.tolVal) ui.tolVal.textContent = String(ui.tol.value || 35);
  if (ui.calibThreshold && ui.calibDbReadout) ui.calibDbReadout.textContent = `${ui.calibThreshold.value} dB`;

  // Calibration UI handlers and helpers
  async function ensureMicForCalibration(){
    if (audio.running && audio.analyser) return true;
    try{
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation:false, noiseSuppression:false, autoGainControl:false } });
      if (!audio.ctx) audio.ctx = new (window.AudioContext || window.webkitAudioContext)();
      const src = audio.ctx.createMediaStreamSource(stream);
      audio.analyser = audio.ctx.createAnalyser();
      audio.analyser.fftSize = 2048;
      audio.analyser.smoothingTimeConstant = 0;
      audio.sampleRate = audio.ctx.sampleRate;
      audio.data = new Float32Array(audio.analyser.fftSize);
      src.connect(audio.analyser);
      audio.running = true;
      return true;
    }catch(e){ if (ui.calibMsg) ui.calibMsg.textContent = 'Microphone permission denied.'; return false; }
  }

  function setCalibLevel(pct){ if (ui.calibLevel) ui.calibLevel.style.width = Math.max(0, Math.min(100, pct)) + '%'; }
  function rmsToDb(rms){ return 20 * Math.log10(rms + 1e-6); }

  function measureAmbient(durationMs = 2000){
    return new Promise(async (resolve)=>{
      const ok = await ensureMicForCalibration(); if (!ok) return resolve({ok:false});
      const samples = [];
      const t0 = performance.now();
      const iv = setInterval(()=>{
        audio.analyser.getFloatTimeDomainData(audio.data);
        let rms=0; for (let i=0;i<audio.data.length;i++){ const v=audio.data[i]; rms += v*v; } rms = Math.sqrt(rms/audio.data.length);
        samples.push(rms);
        const db = rmsToDb(rms); const pct = Math.min(100, Math.max(0, (db + 60) * 1.6)); setCalibLevel(pct);
        if (performance.now() - t0 >= durationMs){ clearInterval(iv); const avg = samples.reduce((a,b)=>a+b,0)/samples.length; resolve({ok:true, rms:avg, db:rmsToDb(avg)}); }
      }, 120);
    });
  }

  function measurePitch(durationMs = 2000){
    return new Promise(async (resolve)=>{
      const ok = await ensureMicForCalibration(); if (!ok) return resolve({ok:false});
      const notes = [];
      const cents = [];
      const t0 = performance.now();
      const iv = setInterval(()=>{
        audio.analyser.getFloatTimeDomainData(audio.data);
        const res = autoCorrelate(audio.data.slice(), audio.sampleRate);
        if (res.freq){
          const { midi, letter } = nearestMidiNatural(res.freq);
          const c = Math.round(centsOff(res.freq, midi));
          notes.push(letter); cents.push(c);
          if (ui.calibDetected) ui.calibDetected.textContent = `${letter} (${res.freq.toFixed(1)} Hz, ${c}¢)`;
          try{
            const midiF = freqToMidi(res.freq);
            console.debug('calib-sample', {freq: res.freq.toFixed(2), A4, midiFloat: midiF.toFixed(3), midiNearest: midi, letter, cents: c});
            if (ui && ui.detDebug) ui.detDebug.textContent = `A4: ${A4}\nfreq: ${res.freq.toFixed(2)} Hz\nmidiFloat: ${midiF.toFixed(3)}\nmidiNearest: ${midi}\nletter: ${letter}\ncents: ${c}`;
          }catch(e){}
        }
        if (performance.now() - t0 >= durationMs){ clearInterval(iv); if (notes.length===0) return resolve({ok:true, count:0});
          const tally = {}; for (const n of notes) tally[n] = (tally[n]||0)+1; const sorted = Object.keys(tally).sort((a,b)=>tally[b]-tally[a]); const common = sorted[0];
          const minC = Math.min(...cents); const maxC = Math.max(...cents); const spread = maxC - minC; const avg = cents.reduce((a,b)=>a+b,0)/cents.length;
          resolve({ok:true, count:notes.length, letter:common, centsAvg:Math.round(avg), centsSpread:spread}); }
      }, 120);
    });
  }

  // start/stop target capture (no time limit) so user can find the key at their pace
  function startTargetCapture(){
    // legacy generic capture kept for compatibility
    if (!audio.analyser) { ensureMicForCalibration().then(ok=>{ if (!ok) return; startTargetCapture(); }); return; }
    game._targetNotes = [];
    game._targetCents = [];
    if (ui.calibTargetBtn) ui.calibTargetBtn.textContent = 'Stop capture';
    game._targetCaptureIv = setInterval(()=>{
      audio.analyser.getFloatTimeDomainData(audio.data);
      const res = autoCorrelate(audio.data.slice(), audio.sampleRate);
      if (res.freq){ const { midi, letter } = nearestMidiNatural(res.freq); const c = Math.round(centsOff(res.freq, midi)); game._targetNotes.push(letter); game._targetCents.push(c); if (ui.calibDetected) ui.calibDetected.textContent = `${letter} (${res.freq.toFixed(1)} Hz, ${c}¢)`; }
    }, 120);
  }

  function stopTargetCapture(){
    if (game._targetCaptureIv){ clearInterval(game._targetCaptureIv); game._targetCaptureIv = null; }
    if (ui.calibTargetBtn) ui.calibTargetBtn.textContent = 'Capture target (play note)';
    const notes = game._targetNotes || [];
    const cents = game._targetCents || [];
    if (!notes.length){ if (ui.calibMsg) ui.calibMsg.textContent = 'No pitch captured. Try again.'; return; }
    const tally = {}; for (const n of notes) tally[n] = (tally[n]||0)+1; const sorted = Object.keys(tally).sort((a,b)=>tally[b]-tally[a]); const common = sorted[0];
    const minC = Math.min(...cents); const maxC = Math.max(...cents); const spread = maxC - minC; const avg = cents.reduce((a,b)=>a+b,0)/cents.length;
    const suggested = Math.max(20, Math.ceil(spread * 1.2));
    if (ui.calibSuggestedTol) ui.calibSuggestedTol.textContent = String(suggested);
    if (ui.calibMsg) ui.calibMsg.textContent = `Captured ${common} (spread ${spread}¢). Suggested tol ${suggested}¢.`;
    game._calib = { ambient: game._calib && game._calib.ambient ? game._calib.ambient : null, target: { letter: common, centsAvg: Math.round(avg), centsSpread: spread }, suggested };
  }

  async function runQuickCalibration(){
    if (ui.calibMsg) ui.calibMsg.textContent = 'Measuring ambient...';
    const amb = await measureAmbient(2000);
    if (!amb.ok){ if (ui.calibMsg) ui.calibMsg.textContent = 'Microphone needed.'; return; }
    if (ui.calibMsg) ui.calibMsg.textContent = `Ambient: ${Math.round(amb.db)} dB`;
    if (ui.calibMsg) ui.calibMsg.textContent = 'Now play the target note...';
    const targ = await measurePitch(2000);
    if (!targ.ok || targ.count===0){ if (ui.calibMsg) ui.calibMsg.textContent = 'Could not detect a pitch. Try closer/louder.'; return; }
    const suggested = Math.max(20, Math.ceil(targ.centsSpread * 1.2));
    if (ui.calibSuggestedTol) ui.calibSuggestedTol.textContent = String(suggested);
    if (ui.calibMsg) ui.calibMsg.textContent = `Captured ${targ.letter} (spread ${targ.centsSpread}¢). Suggested tol ${suggested}¢.`;
    game._calib = { ambient: amb, target: targ, suggested };
  }

  async function runVerifyDifferent(){
    if (!game._calib || !game._calib.target){ if (ui.calibMsg) ui.calibMsg.textContent = 'Capture target first.'; return; }
    if (ui.calibMsg) ui.calibMsg.textContent = 'Now play a different note (2s)...';
    const v = await measurePitch(2000);
    if (!v.ok || v.count===0){ if (ui.calibMsg) ui.calibMsg.textContent = 'No pitch detected during verify.'; return; }
    const target = game._calib.target.letter.replace('#','');
    const match = v.letter.replace('#','') === target;
    const within = Math.abs(v.centsAvg || 0) <= (game._calib.suggested || 35);
    if (match && within){ if (ui.calibMsg) ui.calibMsg.textContent = 'Verification failed: different note was detected as the same. Increase tolerance or reduce noise.'; }
    else { if (ui.calibMsg) ui.calibMsg.textContent = 'Verification passed: different note was not mistaken.'; }
  }

  function saveCalibration(){
    if (!game._calib){ if (ui.calibMsg) ui.calibMsg.textContent = 'No calibration data to save.'; return; }
    try{ localStorage.setItem('mic_tol_cents', String(game._calib.suggested)); if (ui.tol) ui.tol.value = String(game._calib.suggested); if (ui.calibMsg) ui.calibMsg.textContent = 'Calibration saved.'; }catch(e){ if (ui.calibMsg) ui.calibMsg.textContent = 'Save failed.'; }
  }

  if (ui.calibrateBtn) ui.calibrateBtn.addEventListener('click', ()=>{ if (ui.calibPanel) ui.calibPanel.style.display = (ui.calibPanel.style.display === 'none' ? 'block' : 'none'); });
  // Tolerance slider -> update label and persist on change
  if (ui.tol){ ui.tol.addEventListener('input', ()=>{ if (ui.tolVal) ui.tolVal.textContent = String(ui.tol.value); try{ localStorage.setItem('mic_tol_cents', String(Number(ui.tol.value)||35)); }catch(e){} }); }

  // Threshold slider -> update readout and persist
  if (ui.calibThreshold){ ui.calibThreshold.addEventListener('input', ()=>{ if (ui.calibDbReadout) ui.calibDbReadout.textContent = `${ui.calibThreshold.value} dB`; try{ localStorage.setItem('mic_thresh_db', String(Number(ui.calibThreshold.value)||-40)); }catch(e){} }); }

  // Calibrate pitch (explicitly for C) - toggle behavior
  async function startCalibratePitch(expectedLetter='C'){
    if (!audio.analyser) { const ok = await ensureMicForCalibration(); if (!ok) { if (ui.calibMsg) ui.calibMsg.textContent = 'Microphone needed.'; return; } }
    game._targetNotes = [];
    game._targetCents = [];
    game._acceptedSamples = 0;
    if (ui.calibTargetBtn) ui.calibTargetBtn.textContent = 'Stop';
    if (ui.calibMsg) ui.calibMsg.textContent = `Please play a ${expectedLetter} repeatedly.`;
    const thresholdDb = ui.calibThreshold ? Number(ui.calibThreshold.value) : -40;
    game._targetCaptureIv = setInterval(()=>{
      audio.analyser.getFloatTimeDomainData(audio.data);
      // compute rms and db
      let rms=0; for (let i=0;i<audio.data.length;i++){ const v=audio.data[i]; rms += v*v; } rms = Math.sqrt(rms/audio.data.length);
      const db = rmsToDb(rms);
      if (ui.calibDbReadout) ui.calibDbReadout.textContent = `${Math.round(db)} dB`;
      // update record button color when above threshold
      if (ui.calibRecordBtn) ui.calibRecordBtn.style.background = (db >= thresholdDb ? '#ff4d4d' : '#330000');
      // small level bar show
      const pct = Math.min(100, Math.max(0, (db + 60) * 1.6)); setCalibLevel(pct);
      if (db < thresholdDb) return; // ignore low signals
      const res = autoCorrelate(audio.data.slice(), audio.sampleRate);
      if (res.freq){ const near = nearestMidiNatural(res.freq); const c = Math.round(centsOff(res.freq, near.midi)); if (ui.calibDetected) ui.calibDetected.textContent = `${near.letter} (${res.freq.toFixed(1)} Hz, ${c}¢)`; if (near.letter.replace('#','') === expectedLetter){ game._targetNotes.push(near.letter); game._targetCents.push(c); game._acceptedSamples++; }
      }
      // auto-stop after a number of accepted samples
      if (game._acceptedSamples >= 8){ stopCalibratePitch(); }
    }, 120);
  }

  function stopCalibratePitch(){ if (game._targetCaptureIv){ clearInterval(game._targetCaptureIv); game._targetCaptureIv = null; }
    if (ui.calibTargetBtn) ui.calibTargetBtn.textContent = 'Calibrate pitch (play C)';
    const notes = game._targetNotes || [];
    const cents = game._targetCents || [];
    if (!notes.length){ if (ui.calibMsg) ui.calibMsg.textContent = 'No pitch captured. Try again.'; return; }
    const tally = {}; for (const n of notes) tally[n] = (tally[n]||0)+1; const sorted = Object.keys(tally).sort((a,b)=>tally[b]-tally[a]); const common = sorted[0];
    const minC = Math.min(...cents); const maxC = Math.max(...cents); const spread = maxC - minC; const avg = cents.reduce((a,b)=>a+b,0)/cents.length;
    const suggested = Math.max(20, Math.ceil(spread * 1.2));
    if (ui.calibSuggestedTol) ui.calibSuggestedTol.textContent = String(suggested);
    if (ui.calibMsg) ui.calibMsg.textContent = `Captured ${common} (spread ${spread}¢). Suggested tol ${suggested}¢.`;
    game._calib = { ambient: game._calib && game._calib.ambient ? game._calib.ambient : null, target: { letter: common, centsAvg: Math.round(avg), centsSpread: spread }, suggested };
  }

  if (ui.calibTargetBtn) ui.calibTargetBtn.addEventListener('click', ()=>{ if (game._targetCaptureIv) stopCalibratePitch(); else startCalibratePitch('C'); });
  if (ui.calibVerifyBtn) ui.calibVerifyBtn.addEventListener('click', ()=>{ runVerifyDifferent(); });
  if (ui.calibSaveBtn) ui.calibSaveBtn.addEventListener('click', ()=>{ saveCalibration(); });
  if (ui.calibCloseBtn) ui.calibCloseBtn.addEventListener('click', ()=>{ if (ui.calibPanel) ui.calibPanel.style.display = 'none'; });

  // level system state
  const MAX_LEVELS = 10;
  const unlockedKey = 'unlocked_level_meteor_sky';
  let unlockedLevel = Number(localStorage.getItem(unlockedKey) || 1);
  function saveUnlocked(){ localStorage.setItem(unlockedKey, String(unlockedLevel)); }

  function spawnIntervalForLevel(l){
    // linear map from 2000ms (level1) to 500ms (level10)
    const min = 500, max = 2000; const t = (l-1)/9;
    return Math.round(max + (min - max) * t);
  }
  // level 1 = 30 px/s, then +10 px/s per level
  function speedMultiplierForLevel(l){
    const target = 30 + (Math.max(1, l) - 1) * 10; // px/s for this level
    return target / game.baseBaseSpeed;
  }

  function renderLevels(){
    if (!ui.levelsGrid) return;
    ui.levelsGrid.innerHTML = '';
    for (let i=1;i<=MAX_LEVELS;i++){
      const el = document.createElement('div');
      el.className = 'level-item ' + (i<=unlockedLevel ? 'unlocked' : 'locked');
      el.textContent = String(i);
      el.dataset.level = String(i);
      el.addEventListener('click', ()=>{
        const lvl = Number(el.dataset.level);
        if (lvl > unlockedLevel) { ui.permMsg.textContent = 'Level locked'; return; }
        // select level
        window.selectedLevel = lvl;
        // load per-level best for HUD and overlays
        try{
          const key = 'meteor_level_best_' + String(lvl);
          game.best = Number(localStorage.getItem(key) || 0);
        }catch(e){ console.warn('load per-level best failed', e); }
        // hide menus since we're about to play
        if (ui.mainMenuOverlay) ui.mainMenuOverlay.style.display = 'none';
        if (ui.chooseModePanel) ui.chooseModePanel.style.display = 'none';
        if (ui.modeLevels) ui.modeLevels.style.display = 'none';
        // show ready overlay
        if (ui.readyOverlay) ui.readyOverlay.style.display = 'flex';
      });
      ui.levelsGrid.appendChild(el);
    }
    // add a Survival mode tile after the regular levels
    const surv = document.createElement('div');
    surv.className = 'level-item unlocked survival';
    surv.textContent = 'Survival';
    surv.dataset.level = 'survival';
    surv.addEventListener('click', ()=>{
      window.selectedLevel = 'survival';
      try{ const key = 'meteor_survival_best'; game.best = Number(localStorage.getItem(key) || 0); }catch(e){}
      if (ui.mainMenuOverlay) ui.mainMenuOverlay.style.display = 'none';
      if (ui.chooseModePanel) ui.chooseModePanel.style.display = 'none';
      if (ui.modeLevels) ui.modeLevels.style.display = 'none';
      if (ui.readyOverlay) ui.readyOverlay.style.display = 'flex';
    });
    ui.levelsGrid.appendChild(surv);
  }

  // when level completes, unlock next and show menu
  function levelComplete(){
    const lvl = window.selectedLevel || 1;
    if (lvl >= 1 && lvl < MAX_LEVELS){ unlockedLevel = Math.max(unlockedLevel, lvl+1); saveUnlocked(); }
    // update per-level record and show a styled win overlay
    const key = 'meteor_level_best_' + String(lvl);
    const prevBest = Number(localStorage.getItem(key) || 0);
    const isNew = game.score > prevBest;
    if (isNew) localStorage.setItem(key, String(game.score));

    // graceful fallback: if overlay DOM isn't available, show a simple message
    if (!ui || !ui.overlay){
      ui.permMsg.textContent = 'Level complete! Unlocked level ' + Math.min(unlockedLevel, MAX_LEVELS);
      if (ui.mainMenuOverlay) ui.mainMenuOverlay.style.display = 'flex';
      if (ui.modeLevels) ui.modeLevels.style.display = 'none';
      renderLevels();
      return;
    }

    // Update overlay title and styling to match the "Well Done!" win state
    try{
      const titleEl = ui.overlay.querySelector('.go-title') || ui.overlay.querySelector('h2');
      if (titleEl){ titleEl.textContent = 'Well Done!'; titleEl.style.color = '#ffb86b'; }

      // Score + optional new-high badge
      if (ui.overlayScore) ui.overlayScore.textContent = String(game.score);
      // remove prior badge
      const existingBadge = ui.overlayScore && ui.overlayScore.parentElement && ui.overlayScore.parentElement.querySelector('.new-high');
      if (existingBadge) existingBadge.remove();
      if (isNew && ui.overlayScore && ui.overlayScore.parentElement){
        const span = document.createElement('span');
        span.className = 'new-high';
        span.textContent = ' New high score!';
        span.style.color = '#ff8c42';
        span.style.fontWeight = '800';
        span.style.marginLeft = '8px';
        ui.overlayScore.parentElement.appendChild(span);
      }

      // Record for this level (show the record underneath)
      const record = isNew ? game.score : prevBest;
      if (ui.overlayBest) ui.overlayBest.textContent = String(record);

      // show overlay and hide floating actions
      ui.overlay.style.display = 'flex';
      if (ui.mainMenuBtn) ui.mainMenuBtn.style.display = '';
      if (ui.menuFloatingActions) ui.menuFloatingActions.style.display = 'none';
      if (ui.modeLevels) ui.modeLevels.style.display = 'none';
      if (ui.chooseModePanel) ui.chooseModePanel.style.display = 'none';
      renderLevels();
    }catch(e){
      // fallback behaviour
      ui.permMsg.textContent = 'Level complete! Unlocked level ' + Math.min(unlockedLevel, MAX_LEVELS);
      if (ui.mainMenuOverlay) ui.mainMenuOverlay.style.display = 'flex';
      if (ui.modeLevels) ui.modeLevels.style.display = 'none';
      renderLevels();
    }
  }

  /* ------------------- Unified Start (mic or midi) ------------------- */
  async function startGame(mode){
    mode = mode || (ui.inputSelect ? ui.inputSelect.value : 'mic');

    // start or restart game
    resetGame();
    if (ui.overlay) ui.overlay.style.display = 'none';
    // configure selected level if any
      if (window.selectedLevel){
      const lvl = Number(window.selectedLevel) || 1;
      game.level = lvl;
      game.levelDuration = 60; // seconds per level
      game.levelTimeRemaining = game.levelDuration;
      game.currentSpawnInterval = spawnIntervalForLevel(lvl);
      game.baseSpeed = game.baseBaseSpeed * speedMultiplierForLevel(lvl);
        if (ui.levelTimer) { ui.levelTimer.textContent = `Level ${lvl}: ${game.levelTimeRemaining.toFixed(0)}s`; ui.levelTimer.style.display = 'none'; }
    } else {
      game.level = null; game.currentSpawnInterval = null; game.levelTimeRemaining = 0;
        if (ui.levelTimer) { ui.levelTimer.textContent = ''; ui.levelTimer.style.display = ''; }
    }

    if (mode === 'mic'){
      if (!audio.running){
        try{
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation:false, noiseSuppression:false, autoGainControl:false }
          });
          audio.ctx = new (window.AudioContext || window.webkitAudioContext)();
          const src = audio.ctx.createMediaStreamSource(stream);
          audio.analyser = audio.ctx.createAnalyser();
          audio.analyser.fftSize = 2048;
          audio.analyser.smoothingTimeConstant = 0;
          audio.sampleRate = audio.ctx.sampleRate;
          audio.data = new Float32Array(audio.analyser.fftSize);
          src.connect(audio.analyser);
          audio.running = true;
          ui.permMsg.textContent = 'Microphone running.';
          if (ui.a4) A4 = Number(ui.a4.value)||440;
          lastTs = performance.now();
          requestAnimationFrame(updateAudio);
        } catch(e){
          console.error(e);
          ui.permMsg.textContent = 'Microphone permission denied or unavailable.';
        }
      } else {
        ui.permMsg.textContent = 'Microphone already running.';
        if (audio.running && !audio.updating){ lastTs = performance.now(); requestAnimationFrame(updateAudio); }
      }
    } else if (mode === 'midi'){
      // ensure MIDI is initialized and inform the user
      if (!midiAccess) await initMIDI();
      ui.permMsg.textContent = 'Using MIDI input.';
      // game loop already runs via requestAnimationFrame(step) at boot
    }
    // show a short level banner when a specific level is started
    if (window.selectedLevel){
      if (window.selectedLevel === 'survival'){
        game.survival = true;
        game.level = null;
        game.levelBanner = { t: 0, life: 2.0, level: 'Survival' };
        try{ const key = 'meteor_survival_best'; game.best = Number(localStorage.getItem(key) || 0); }catch(e){}
        // ensure base speed starts like level 1
        game.baseSpeed = game.baseBaseSpeed;
      } else {
        const lvl = Number(window.selectedLevel) || 1;
        game.level = lvl;
        game.levelBanner = { t: 0, life: 2.0, level: Number(window.selectedLevel) };
      }
    } else {
      game.levelBanner = null;
    }
    // ensure HUD shows per-level best when a level is active
    if (window.selectedLevel){
      try{
        const key = 'meteor_level_best_' + String(window.selectedLevel);
        game.best = Number(localStorage.getItem(key) || 0);
      }catch(e){ console.warn('load per-level best on start failed', e); }
    }
    // If playing a mode/game (e.g., Meteor sky), start the game music.
    try{
      if (window.currentMode === 'meteor-sky'){
        try{ stopMenuMusic(); }catch(e){}
        try{ playGameMusic(); }catch(e){ console.warn('playGameMusic failed', e); }
      } else {
        try{ stopGameMusic(); }catch(e){}
      }
    }catch(e){ console.warn('game music handling failed', e); }
  }

  /* ------------------- Canvas / Game ------------------- */
  const ctx = ui.canvas.getContext('2d');
  const W = ui.canvas.width, H = ui.canvas.height;
  const groundY = H - 40;

  // Starfield and aurora state
  let stars = [];
  function initStars(n = 120){
    stars.length = 0;
    for (let i=0;i<n;i++){
      stars.push({
        x: Math.random() * W,
        y: Math.random() * (groundY * 0.7),
        r: Math.random() * 1.5 + 0.4,
        base: 0.25 + Math.random() * 0.7,
        speed: 0.5 + Math.random() * 1.5,
        phase: Math.random() * Math.PI * 2
      });
    }
  }

  /* visuals */
  function drawBackground(){
  ctx.fillStyle = '#071026'; ctx.fillRect(0,0,W,H);

  // gentle aurora bands
  const t = performance.now() / 1000;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i=0;i<3;i++){
    const phase = t * (0.2 + i*0.05) + i;
    const a = 0.04 + 0.02 * Math.sin(phase * 1.2);
    const grad = ctx.createLinearGradient(0, H*0.08 + i*6, 0, H*0.5 + i*6);
    if (i===0){ grad.addColorStop(0, `rgba(110,248,180,${a})`); grad.addColorStop(1, `rgba(36,80,60,0)`); }
    else if (i===1){ grad.addColorStop(0, `rgba(110,200,255,${a*0.9})`); grad.addColorStop(1, `rgba(36,80,100,0)`); }
    else { grad.addColorStop(0, `rgba(200,150,255,${a*0.7})`); grad.addColorStop(1, `rgba(50,30,60,0)`); }
    ctx.fillStyle = grad;
    // draw with a wavy alpha mask
    ctx.beginPath();
    ctx.moveTo(0, H*0.08);
    for (let x=0;x<=W;x+=20){
      const y = H*0.08 + Math.sin((x/ W) * Math.PI * (1.5 + i*0.2) + phase) * (18 + i*8);
      ctx.lineTo(x, y);
    }
    ctx.lineTo(W, H*0.5 + i*6);
    ctx.lineTo(0, H*0.5 + i*6);
    ctx.closePath();
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.restore();

  // subtle starfield background (pixelated dots)
  ctx.fillStyle = '#0b1220';
  for (let y=4; y<H; y+=10) for (let x=3; x<W; x+=10) if (((x*13+y*7)&31)===0) ctx.fillRect(x,y,1,1);
  ctx.fillStyle = '#23314e'; ctx.fillRect(0,groundY,W,H-groundY);
  ctx.fillStyle = '#2c3b5c';
  for (let x=0;x<W;x+=6) ctx.fillRect(x,groundY,4,2);
  function dino(px,py,flip=false){
    ctx.save(); ctx.translate(px,py); if (flip) ctx.scale(-1,1);
    ctx.fillStyle = '#3ccf91';
    ctx.fillRect(0,-16,20,14);
    ctx.fillRect(14,-22,6,8);
    ctx.fillRect(6,-2,6,3);
    ctx.fillRect(14,-2,6,3);
    ctx.fillStyle = '#0f1424'; ctx.fillRect(18,-20,1,1);
    ctx.restore();
  }
  dino(24,groundY);
  dino(W-48,groundY,true);

  // draw animated stars
  const time = performance.now() / 1000;
  for (const s of stars){
    const a = s.base + 0.25 * Math.sin(s.phase + time * s.speed);
    ctx.globalAlpha = Math.max(0, Math.min(1, a));
    ctx.fillStyle = '#ffffff';
    const size = s.r;
    ctx.fillRect((s.x|0), (s.y|0), size, size);
  }
  ctx.globalAlpha = 1;
}

  /* ------------------- Note palettes for explosions ------------------- */
  const NOTE_PALETTES = {
    C: ['#ff5c5c','#ffc4c4'],
    D: ['#ffb86b','#ffe3c2'],
    E: ['#fff56b','#fff9d1'],
    F: ['#8ef56b','#d9ffdc'],
    G: ['#6bd9ff','#cfeeff'],
    A: ['#b68eff','#e6d9ff'],
    B: ['#ff8cf5','#ffd9f7']
  };

/* ------------------- Uniform speed game ------------------- */
const NATURAL_POOL = ['C','D','E','F','G','A','B'];
const game = {
  started:false, over:false, time:0,
  score:0,
  best: Number(localStorage.getItem('dino_best') || 0),
  hsPop: 0,
  lives:3,
  livesMax: 3,
  heartPops: [],
  comets:[], particles:[],
  lastSpawn:0,
  baseSpeed: 30,
  speedFactor: 1,
  lastHitAt: 0
};
// transient score pop state (for center big score)
game.scorePop = 0; // visual pop strength (decays)
game.lastAdd = { val: 0, t: 10, life: 0 };
// detection/debug state
game.detected = { freq: null, letter: null, cents: 0, db: -999 };
game.detectFlash = 0;
// stability tracking for sustained detection (ms timestamp)
game._stable = { letter: null, start: 0, cents: 0 };
// next spawn absolute timestamp (ms) for level mode
game.nextSpawnTime = 0;
// accumulator for deterministic spawn timing
game.spawnAccumulator = 0;
// preserve base speed for level multipliers
game.baseBaseSpeed = game.baseSpeed;

function currentSpeed(){ return game.baseSpeed * game.speedFactor; }

function resetGame(){
  game.started=true; game.over=false; game.time=0;
  game.score=0;
  game.hsPop = 0;
  game.lives = game.livesMax;
  game.heartPops = new Array(game.livesMax).fill(0);
  game.comets.length=0; game.particles.length=0;
  game.lastSpawn=0; game.speedFactor=1;
  game.spawnAccumulator = 0;
  game.nextSpawnTime = 0;
  game.survival = false;
}

function showGameOver(){
  if (!ui || !ui.overlay) return;
  // ensure overlay shows the losing state (reset any previous win title/styling)
  try{
    const titleEl = ui.overlay.querySelector('.go-title') || ui.overlay.querySelector('h2');
    if (titleEl){ titleEl.textContent = 'Game Over!'; titleEl.style.color = '#ff6b6b'; }
  }catch(e){}
  ui.overlay.style.display = 'flex';
  ui.overlayScore.textContent = String(game.score);
  // if survival mode, update per-mode best
  try{
    if (game.survival){
      const key = 'meteor_survival_best';
      const prevBest = Number(localStorage.getItem(key) || 0);
      const isNew = game.score > prevBest;
      if (isNew) localStorage.setItem(key, String(game.score));
      // badge
      const existingBadge = ui.overlayScore && ui.overlayScore.parentElement && ui.overlayScore.parentElement.querySelector('.new-high');
      if (existingBadge) existingBadge.remove();
      if (isNew && ui.overlayScore && ui.overlayScore.parentElement){
        const span = document.createElement('span'); span.className = 'new-high'; span.textContent = ' New high score!'; span.style.color = '#ff8c42'; span.style.fontWeight = '800'; span.style.marginLeft = '8px'; ui.overlayScore.parentElement.appendChild(span);
      }
      ui.overlayBest.textContent = String(Math.max(game.score, prevBest));
    } else {
      ui.overlayBest.textContent = String(game.best);
    }
  }catch(e){ ui.overlayBest.textContent = String(game.best); }
  // ensure the main menu button is visible in the Game Over popup
  if (ui.mainMenuBtn) ui.mainMenuBtn.style.display = '';
  // hide floating actions while Game Over is displayed; restore only when Main menu is pressed
  if (ui.menuFloatingActions) ui.menuFloatingActions.style.display = 'none';
  try{ stopGameMusic(); }catch(e){}
}

function hideGameOver(){
  if (!ui || !ui.overlay) return;
  ui.overlay.style.display = 'none';
}

function spawnComet(){
  const note = NATURAL_POOL[Math.floor(Math.random()*NATURAL_POOL.length)];
  const margin = 20;
  // pick an x that isn't too close to the last spawned comet to avoid visual overlap
  let x = margin + Math.random()*(W - margin*2);
  const maxAttempts = 6; let attempts = 0;
  while (game.lastSpawnX != null && Math.abs(x - game.lastSpawnX) < 40 && attempts < maxAttempts){
    x = margin + Math.random()*(W - margin*2);
    attempts++;
  }
  const r = 18;
  // use a fixed spawn Y so meteors appear from the same height (prevents apparent timing differences)
  const yStart = -60;
  game.comets.push({ x, y: yStart, r, note });
  game.lastSpawnX = x;
}

function explodeAt(x,y,note){
  const plain = (note || '').replace('#','');
  const palette = NOTE_PALETTES[plain] || ['#ffde7a','#ffa36b'];
  const count = 26;
  for (let i=0;i<count;i++){
    const c = palette[i % palette.length];
    game.particles.push({
      x: x + (Math.random()-0.5) * 8,
      y: y + (Math.random()-0.5) * 8,
      vx: (Math.random()*2-1) * (40 + Math.random()*80),
      vy: (Math.random()*2-1) * (40 + Math.random()*80),
      life: 0.5 + Math.random() * 0.7,
      t: 0,
      color: c
    });
  }
}

// Centralized scoring helper so we can animate score pops and handle high-score logic.
function addScore(points){
  if (typeof points !== 'number') points = Number(points) || 0;
  // increment main score
  game.score += points;
  // update per-level/local bests handled elsewhere; keep global backup
  try{
    if (game.score > game.best){ game.best = game.score; localStorage.setItem('dino_best', String(game.best)); game.hsPop = 1.0; }
  }catch(e){ /* ignore */ }
  // set lastAdd so drawHighScore can render a fading +X; reset timer if already active
  game.lastAdd = { val: points, t: 0, life: 1.0 };
  // scorePop scales with points (bigger rewards -> bigger pop)
  const strength = Math.min(2.5, 0.6 + Math.sqrt(Math.max(1, points)) * 0.18);
  game.scorePop = Math.max(game.scorePop, strength);
}

function updateParticles(dt){
  const g = 40;
  for (let p of game.particles){
    p.t += dt; p.x += p.vx*dt; p.vy += g*dt*0.6; p.y += p.vy*dt;
  }
  game.particles = game.particles.filter(p => p.t < p.life);
}

function drawComets(){
  const vy = currentSpeed();
  const nowT = performance.now() / 1000;
  for (const c of game.comets){
    // tail pointing upward (opposite vertical velocity)
    const tailLength = Math.min(120, 12 + vy * 0.6);
    const tailWidth = Math.max(6, c.r * 1.6);

    // intensity pulse + reduce with higher speed to simulate air resistance
    const pulse = 0.18 * Math.sin(nowT * 4 + c.x);
    const speedRatio = vy / Math.max(1, (game.baseBaseSpeed || vy));
    const intensity = Math.max(0.3, 1 - (speedRatio - 1) * 0.45 + pulse);

    // tail gradient (bright near comet, fading upwards)
    const grad = ctx.createLinearGradient(c.x, c.y, c.x, c.y - tailLength);
    grad.addColorStop(0, `rgba(247,143,63,${0.95 * intensity})`);
    grad.addColorStop(0.6, `rgba(255,184,120,${0.5 * intensity})`);
    grad.addColorStop(1, `rgba(255,184,120,0)`);

    ctx.save();
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(c.x - tailWidth/2, c.y);
    ctx.lineTo(c.x, c.y - tailLength);
    ctx.lineTo(c.x + tailWidth/2, c.y);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // soft glow around comet
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, c.r * 3.5);
    g.addColorStop(0, `rgba(255,200,140,${0.9 * intensity})`);
    g.addColorStop(0.25, `rgba(255,160,100,${0.5 * intensity})`);
    g.addColorStop(1, 'rgba(255,160,100,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(c.x, c.y, c.r * 3.5, 0, Math.PI*2); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();

    // comet head
    ctx.fillStyle = '#ffb84d'; ctx.beginPath(); ctx.arc(c.x, c.y, c.r, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = '#e67d2e'; ctx.lineWidth = 1; ctx.stroke();

    // draw a clear, high-contrast letter centered in the comet
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const fontSize = Math.max(16, Math.round(c.r * 1.4));
    ctx.font = `bold ${fontSize}px monospace`;
    ctx.lineWidth = Math.max(3, Math.round(fontSize * 0.2));
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.fillStyle = '#ffffff';
    ctx.strokeText(c.note, c.x, c.y);
    ctx.fillText(c.note, c.x, c.y);
    ctx.restore();
  }
}

function drawParticles(){
  for (const p of game.particles){
    const alpha = Math.max(0, 1 - p.t/p.life);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x|0, p.y|0, 2, 2);
    ctx.globalAlpha = 1;
  }
}

/* ===== Big, juicy high score number ===== */
function drawHighScore(){
  // Hide the big number when score is zero and no pop animation
  if (game.score === 0 && game.hsPop <= 0) return;
  const text = String(game.score);
  const y = groundY - 72;
  // combine high-score pop and recent-score pop into a single scale
  const hsFactor = 0.25 * Math.sin(Math.PI * Math.min(1, game.hsPop));
  const recentFactor = 0.35 * (game.scorePop || 0);
  const s = 1 + hsFactor + recentFactor;

  ctx.save();
  ctx.translate(W/2, y);
  ctx.scale(s, s);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // draw the fading +points to the left of the big score (if active)
  if (game.lastAdd && game.lastAdd.t < game.lastAdd.life){
    const fade = Math.max(0, 1 - game.lastAdd.t / game.lastAdd.life);
    const plus = (game.lastAdd.val >= 0 ? '+' : '') + String(game.lastAdd.val);
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.font = '700 22px monospace';
    ctx.fillStyle = '#ffd56b';
    // position the plus slightly left of the main number
    // measure main number width at the main font
    ctx.font = '900 48px monospace';
    const mainW = ctx.measureText(text).width;
    ctx.font = '700 22px monospace';
    const plusW = ctx.measureText(plus).width;
    const px = - (mainW / 2) - plusW - 12;
    ctx.fillText(plus, px, 0);
    ctx.restore();
  }

  ctx.font = '900 48px monospace';
  ctx.lineWidth = 6;
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.strokeText(text, 0, 0);

  ctx.fillStyle = '#ff4d4d';
  ctx.fillText(text, 0, 0);

  ctx.restore();
}

function drawLevelBanner(){
  if (!game.levelBanner || game.levelBanner.t >= game.levelBanner.life) return;
  const alpha = 1 - (game.levelBanner.t / game.levelBanner.life);
  const level = game.levelBanner.level || 1;
  const now = performance.now() / 1000;
  // centered banner near top/center
  ctx.save();
  ctx.globalAlpha = Math.max(0, alpha);
  // subtle backdrop
  ctx.fillStyle = 'rgba(6,8,14,0.7)';
  const w = W * 0.9; const h = 110;
  const x = (W - w) / 2; const y = H * 0.18;
  ctx.fillRect(x, y, w, h);

  // big level text
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = '900 42px monospace';
  ctx.fillStyle = '#ffd24d';
  ctx.lineWidth = 6;
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  const title = `Level ${level}`;
  ctx.strokeText(title, W/2, y + 34);
  ctx.fillText(title, W/2, y + 34);

  // subtitle (omit for level 1)
  if (level > 1) {
    ctx.font = '600 14px monospace';
    ctx.fillStyle = '#dfefff';
    ctx.fillText('the meteors are getting faster...', W/2, y + 66);
  }

  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawHUD(){
  // Score label + emphasized numeric score
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  const scoreLabel = 'Score:';
  ctx.fillStyle = '#ffffff';
  ctx.font = '600 12px monospace';
  ctx.fillText(scoreLabel, 8, 18);
  const labelW = ctx.measureText(scoreLabel + ' ').width;
  ctx.font = '900 16px monospace';
  ctx.fillStyle = '#ff4d4d';
  ctx.fillText(String(game.score), 8 + labelW, 18);

  // Best label beneath the score (with emphasized number)
  const bestLabel = 'Best:';
  ctx.font = '600 11px monospace';
  ctx.fillStyle = '#eaf6ff';
  ctx.fillText(bestLabel, 8, 30);
  const bestLabelW = ctx.measureText(bestLabel + ' ').width;
  ctx.font = '700 12px monospace';
  ctx.fillStyle = '#ffdede';
  ctx.fillText(String(game.best), 8 + bestLabelW, 30);

  // draw hearts for lives (shifted down to make room for best)
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 12px monospace';
  const heartY = 46;
  const heartSize = 14;
  const spacing = 8;
  // shift hearts slightly left to remove awkward space
  const startX = 8 + 12;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (let i = 0; i < (game.livesMax || 3); i++){
    const cx = startX + i * (heartSize + spacing);
    const pop = (game.heartPops && game.heartPops[i]) ? game.heartPops[i] : 0;
    const scale = 1 + 0.6 * pop;
    const isFilled = i < game.lives;
    ctx.save();
    ctx.translate(cx, heartY);
    ctx.scale(scale, scale);
    ctx.font = `${heartSize}px serif`;
    if (isFilled){
      ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 2; ctx.strokeText('❤', 0, 0);
      ctx.fillStyle = '#ff4d4d'; ctx.fillText('❤', 0, 0);
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillText('❤', 0, 0);
    }
    ctx.restore();
  }
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.fillText(`Speed ${currentSpeed().toFixed(0)}px/s`, 8, 62);
  // show level and timer inside the game canvas when a level is active
  if (game.level && typeof game.levelTimeRemaining === 'number'){
    const txt = `Level ${game.level}  ${Math.ceil(game.levelTimeRemaining)}s`;
    ctx.textAlign = 'right';
    ctx.fillText(txt, W - 8, 18);
    ctx.textAlign = 'left';
  }
  // overlay handled by DOM when game.over is true
  // draw an in-game detector box and flash when microphone detects a note
  try{
    // detection display area (bottom-center)
    const dx = W/2; const dy = H - 18;
    // flash circle
    if (game.detectFlash && game.detectFlash > 0){
      const alpha = Math.max(0, Math.min(1, game.detectFlash));
      const radius = 22 + 28 * alpha;
      ctx.save(); ctx.globalAlpha = 0.35 * alpha; ctx.fillStyle = '#ffde7a';
      ctx.beginPath(); ctx.arc(dx, dy - 36, radius, 0, Math.PI*2); ctx.fill(); ctx.restore();
      game.detectFlash = Math.max(0, game.detectFlash - 0.9 * (1/60));
    }
    // small rounded rect with detected note
    ctx.save();
    const boxW = 160, boxH = 34; const bx = (W - boxW)/2; const by = H - boxH - 8;
    ctx.fillStyle = 'rgba(6,8,14,0.6)';
    roundRect(ctx, bx, by, boxW, boxH, 8, true, false);
    ctx.fillStyle = '#eaf6ff'; ctx.font = '700 14px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const det = game.detected && game.detected.letter ? `${game.detected.letter} (${game.detected.db} dB)` : (game.detected && game.detected.freq ? `— (${game.detected.db} dB)` : 'No input');
    ctx.fillText(det, bx + boxW/2, by + boxH/2);
    ctx.restore();
  }catch(e){}
}

// small helper to draw rounded rects
function roundRect(ctx, x, y, w, h, r, fill, stroke){
  if (typeof r === 'undefined') r = 5;
  ctx.beginPath(); ctx.moveTo(x+r, y); ctx.arcTo(x+w, y, x+w, y+h, r); ctx.arcTo(x+w, y+h, x, y+h, r); ctx.arcTo(x, y+h, x, y, r); ctx.arcTo(x, y, x+w, y, r); ctx.closePath();
  if (fill) ctx.fill(); if (stroke) ctx.stroke();
}

/* ——— Lowest comet must be cleared first (instant) ——— */
function matchLowestCometIfAny(freq) {
  // prevent matching while not in active play
  if (!game.started || game.over) return false;
  if (game.comets.length === 0) return false;

  // find the lowest comet
  let idx = 0, maxY = -Infinity;
  for (let i = 0; i < game.comets.length; i++) {
    if (game.comets[i].y > maxY) { maxY = game.comets[i].y; idx = i; }
  }

  const target = game.comets[idx];
  const tol = ui.tol ? (Number(ui.tol.value) || 35) : 35;

  // map detected freq to nearest natural letter
  const { midi, letter } = nearestMidiNatural(freq);
  const cents = centsOff(freq, midi);

  // instant pass if correct letter (any octave) within tolerance
  if (letter.replace('#','') === target.note && Math.abs(cents) <= tol) {
    const now = performance.now();
    if (now - game.lastHitAt > 120) {
      explodeAt(target.x, target.y, target.note);

      // score based on height: top->10, ground->1 (floor)
      try{
        const topY = -60; // spawn Y used by spawnComet
        const span = (typeof groundY !== 'undefined') ? Math.max(1, groundY - topY) : 700;
        const frac = Math.max(0, Math.min(1, ( (groundY - target.y) / span )) );
        const points = Math.floor(1 + frac * 9);
        addScore(points);
      }catch(e){ addScore(1); }

      game.comets.splice(idx, 1);
      game.lastHitAt = now;
      return true;
    }
  }
  return false;
}

/* ================ Note Reading Mini-Game ================ */
// Note pool: A3 to C5 (naturals), staffPos relative to E4 (bottom line = 0)
const NR_POOL = [
  { midi:57, name:'A', octave:3, staffPos:-4 },
  { midi:59, name:'B', octave:3, staffPos:-3 },
  { midi:60, name:'C', octave:4, staffPos:-2 },
  { midi:62, name:'D', octave:4, staffPos:-1 },
  { midi:64, name:'E', octave:4, staffPos: 0 },
  { midi:65, name:'F', octave:4, staffPos: 1 },
  { midi:67, name:'G', octave:4, staffPos: 2 },
  { midi:69, name:'A', octave:4, staffPos: 3 },
  { midi:71, name:'B', octave:4, staffPos: 4 },
  { midi:72, name:'C', octave:5, staffPos: 5 },
];

const nr = {
  active: false, over: false,
  score: 0,
  best: Number(localStorage.getItem('nr_best') || 0),
  round: 0,
  currentNote: null,
  timerMax: 15,
  timerRemaining: 15,
  noteSpawnTime: 0,
  flashCorrect: 0,
  lastPoints: 0,
  scorePop: 0,
  lastAdd: { val:0, t:10, life:0 },
  particles: [],
};

// Staff layout
const NR_SP   = 34;           // pixels between adjacent staff lines
const NR_BOT  = 380;          // y of bottom line (E4, staffPos 0)
const NR_LEFT = 30;
const NR_RIGHT= 330;
const NR_NX   = 220;          // x center for the note

function nrY(pos){ return NR_BOT - pos * (NR_SP / 2); }

function nrReset(){
  nr.active = false; nr.over = false;
  nr.score = 0; nr.round = 0;
  nr.currentNote = null;
  nr.timerMax = 15; nr.timerRemaining = 15;
  nr.noteSpawnTime = 0;
  nr.flashCorrect = 0; nr.lastPoints = 0;
  nr.scorePop = 0;
  nr.lastAdd = { val:0, t:10, life:0 };
  nr.particles = [];
  nr.best = Number(localStorage.getItem('nr_best') || 0);
}

function nrSpawnNote(){
  let pick, attempts = 0;
  do { pick = NR_POOL[Math.floor(Math.random() * NR_POOL.length)]; attempts++;
  } while (nr.currentNote && pick.midi === nr.currentNote.midi && attempts < 20);
  nr.currentNote = { ...pick };
  nr.timerRemaining = nr.timerMax;
  nr.noteSpawnTime = performance.now();
  nr.round++;
}

function nrCheckMatch(freq){
  if (!nr.active || nr.over || !nr.currentNote) return false;
  const { midi } = nearestMidiNatural(freq);
  const tol = ui.tol ? (Number(ui.tol.value) || 35) : 35;
  const cents = centsOff(freq, midi);
  if (midi === nr.currentNote.midi && Math.abs(cents) <= tol){
    const elapsed = (performance.now() - nr.noteSpawnTime) / 1000;
    const frac = Math.max(0, 1 - elapsed / nr.timerMax);
    const points = Math.max(1, Math.ceil(10 * frac));
    nr.score += points;
    nr.lastPoints = points;
    nr.flashCorrect = 1.0;
    nr.scorePop = Math.min(2.5, 0.6 + Math.sqrt(points) * 0.18);
    nr.lastAdd = { val: points, t: 0, life: 1.0 };
    // particles
    const nx = NR_NX, ny = nrY(nr.currentNote.staffPos);
    for (let i = 0; i < 20; i++){
      nr.particles.push({ x:nx+(Math.random()-.5)*10, y:ny+(Math.random()-.5)*10,
        vx:(Math.random()*2-1)*80, vy:(Math.random()*2-1)*80,
        life:0.5+Math.random()*0.5, t:0,
        color:['#4ade80','#a3e635','#facc15','#ffffff'][Math.floor(Math.random()*4)] });
    }
    if (nr.score > nr.best){ nr.best = nr.score; localStorage.setItem('nr_best', String(nr.best)); }
    nr.timerMax = Math.max(3, nr.timerMax - 0.5);
    nrSpawnNote();
    return true;
  }
  return false;
}

function nrShowGameOver(){
  nr.over = true;
  const prev = Number(localStorage.getItem('nr_best') || 0);
  const isNew = nr.score > prev;
  if (isNew){ nr.best = nr.score; localStorage.setItem('nr_best', String(nr.score)); }
  if (!ui || !ui.overlay) return;
  const t = ui.overlay.querySelector('.go-title') || ui.overlay.querySelector('h2');
  if (t){ t.textContent = 'Game Over!'; t.style.color = '#ff6b6b'; }
  ui.overlay.style.display = 'flex';
  if (ui.overlayScore) ui.overlayScore.textContent = String(nr.score);
  if (ui.overlayBest) ui.overlayBest.textContent = String(Math.max(nr.score, prev));
  const eb = ui.overlayScore && ui.overlayScore.parentElement && ui.overlayScore.parentElement.querySelector('.new-high');
  if (eb) eb.remove();
  if (isNew && ui.overlayScore && ui.overlayScore.parentElement){
    const s = document.createElement('span'); s.className='new-high'; s.textContent=' New high score!';
    s.style.color='#ff8c42'; s.style.fontWeight='800'; s.style.marginLeft='8px';
    ui.overlayScore.parentElement.appendChild(s);
  }
  if (ui.mainMenuBtn) ui.mainMenuBtn.style.display = '';
  if (ui.menuFloatingActions) ui.menuFloatingActions.style.display = 'none';
  try{ stopGameMusic(); }catch(e){}
}

// -------- Drawing helpers for Note Reading --------
function drawNRBg(){
  // Vibrant gradient: warm yellow-gold top → sky-mint bottom
  const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
  bgGrad.addColorStop(0,   '#fffde4');   // creamy yellow
  bgGrad.addColorStop(0.45,'#d4f5f5');   // light teal
  bgGrad.addColorStop(1,   '#b2ebd4');   // soft mint
  ctx.fillStyle = bgGrad; ctx.fillRect(0, 0, W, H);

  // Animated soft blobs/circles for visual interest
  const t = performance.now() / 1000;
  const blobs = [
    { x: W*0.15, y: H*0.12, r: 68, hue: 50,  sat: 95, li: 82 },
    { x: W*0.82, y: H*0.18, r: 54, hue: 185, sat: 80, li: 82 },
    { x: W*0.72, y: H*0.70, r: 72, hue: 160, sat: 80, li: 82 },
    { x: W*0.20, y: H*0.75, r: 50, hue: 42,  sat: 90, li: 85 },
    { x: W*0.50, y: H*0.90, r: 60, hue: 200, sat: 75, li: 85 },
  ];
  for (const b of blobs){
    const ox = Math.sin(t * 0.4 + b.hue) * 14;
    const oy = Math.cos(t * 0.3 + b.sat) * 12;
    const gr = ctx.createRadialGradient(b.x+ox, b.y+oy, 0, b.x+ox, b.y+oy, b.r);
    gr.addColorStop(0,   `hsla(${b.hue},${b.sat}%,${b.li}%,0.55)`);
    gr.addColorStop(1,   `hsla(${b.hue},${b.sat}%,${b.li}%,0)`);
    ctx.fillStyle = gr;
    ctx.beginPath(); ctx.arc(b.x+ox, b.y+oy, b.r, 0, Math.PI*2); ctx.fill();
  }

}

function drawNRStaff(){
  ctx.strokeStyle = '#222222'; ctx.lineWidth = 2;
  for (let i = 0; i < 5; i++){
    const y = NR_BOT - i * NR_SP;
    ctx.beginPath(); ctx.moveTo(NR_LEFT, y); ctx.lineTo(NR_RIGHT, y); ctx.stroke();
  }
}

function drawTrebleClef(cx, gY, sp){
  // Draw treble clef image (if available) and align it to the staff's G-line.
  // The image file should be placed at Assets/Pictures/treble-clef.png
  if (!drawTrebleClef.img){
    const im = new Image();
    im.src = 'Assets/Pictures/treble-clef.png';
    drawTrebleClef.img = im;
    // no need to await; drawing will occur on next frames once loaded
  }
  const img = drawTrebleClef.img;
  if (!img) return;

  // Desired height should cover the staff area (approx 4.8 lines)
  const desiredHeight = sp * 4.8;
  // Determine aspect ratio if loaded; otherwise assume a tall glyph
  const aspect = (img.naturalWidth && img.naturalHeight) ? (img.naturalWidth / img.naturalHeight) : 0.45;
  const desiredWidth = desiredHeight * aspect;

  // We want the curl of the clef to sit on the G line (gY).
  // Reduce the offset so the clef sits higher on the staff.
  const curlOffset = 0.58 * desiredHeight;

  // Position the image slightly left of cx so it sits over the left staff margin
  const x = cx - desiredWidth * 0.45;
  const y = gY - curlOffset;

  if (img.complete && img.naturalHeight){
    ctx.drawImage(img, x, y, desiredWidth, desiredHeight);
  }
}

function drawNoteOnStaff(note){
  if (!note) return;
  const ny = nrY(note.staffPos), nx = NR_NX, sp = NR_SP;
  // ledger lines for notes below / above the staff
  ctx.strokeStyle = '#222222'; ctx.lineWidth = 2;
  const lw = sp * 1.6;
  // Below staff: middle-C (staffPos -2) and lower need ledger lines at even positions
  if (note.staffPos <= -1){
    // Draw ledger lines at each even staffPos from -2 down to the note
    for (let p = -2; p >= note.staffPos; p -= 2){
      const ly = nrY(p);
      ctx.beginPath(); ctx.moveTo(nx - lw/2, ly); ctx.lineTo(nx + lw/2, ly); ctx.stroke();
    }
  }
  // Above staff: above the top line (staffPos 8) need ledger lines at even positions
  if (note.staffPos >= 10){
    for (let p = 10; p <= note.staffPos; p += 2){
      const ly = nrY(p);
      ctx.beginPath(); ctx.moveTo(nx - lw/2, ly); ctx.lineTo(nx + lw/2, ly); ctx.stroke();
    }
  }
  // correct-hit glow
  if (nr.flashCorrect > 0){
    ctx.save(); ctx.globalAlpha = 0.55 * nr.flashCorrect;
    const gr = sp * (1.2 + nr.flashCorrect);
    const gl = ctx.createRadialGradient(nx, ny, 0, nx, ny, gr);
    gl.addColorStop(0,'#d1f7d6'); gl.addColorStop(1,'rgba(209,247,214,0)');
    ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(nx, ny, gr, 0, Math.PI*2); ctx.fill();
    ctx.restore();
  }
  // note head (filled ellipse) — black for high contrast on light bg
  const hw = sp * 0.48, hh = sp * 0.36;
  ctx.save();
  ctx.translate(nx, ny);
  ctx.rotate(-0.2);  // slight tilt like real notation
  ctx.beginPath();
  ctx.ellipse(0, 0, hw, hh, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#111111';
  ctx.fill();
  ctx.strokeStyle = '#111111';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
  // stem
  const stemH = sp * 2.8;
  ctx.strokeStyle = '#111111'; ctx.lineWidth = 2.6;
  ctx.beginPath();
  if (note.staffPos >= 4){
    // stem goes down from left side of note
    ctx.moveTo(nx - hw + 2, ny); ctx.lineTo(nx - hw + 2, ny + stemH);
  } else {
    // stem goes up from right side of note
    ctx.moveTo(nx + hw - 2, ny); ctx.lineTo(nx + hw - 2, ny - stemH);
  }
  ctx.stroke();
}

function drawNRTimerBar(frac){
  const bx = 20, by = 18, bw = W - 40, bh = 14, br = 7;
  ctx.fillStyle = 'rgba(0,0,0,0.4)'; roundRect(ctx, bx, by, bw, bh, br, true, false);
  const fw = Math.max(0, bw * frac);
  if (fw > 0){
    let col;
    if (frac > 0.5){ const t=(frac-0.5)*2; col=`rgb(${Math.round(255*(1-t))},220,60)`; }
    else { const t=frac*2; col=`rgb(255,${Math.round(180*t+40)},50)`; }
    ctx.save(); ctx.beginPath(); roundRect(ctx, bx, by, bw, bh, br, false, false); ctx.clip();
    ctx.fillStyle = col; ctx.fillRect(bx, by, fw, bh); ctx.restore();
    if (frac < 0.25){
      const pulse = 0.3 + 0.3 * Math.sin(performance.now() / 150);
      ctx.save(); ctx.globalAlpha = pulse;
      ctx.strokeStyle = frac < 0.1 ? '#ff3333' : '#ff6633'; ctx.lineWidth = 2;
      roundRect(ctx, bx, by, bw, bh, br, false, true); ctx.restore();
    }
  }
}

function drawNRHUD(){
  // Score (dark text for light background)
  ctx.textAlign='left'; ctx.textBaseline='alphabetic';
  ctx.font='600 13px monospace'; ctx.fillStyle='#444444'; ctx.fillText('Score:',8,55);
  const slw=ctx.measureText('Score: ').width;
  ctx.font='900 18px monospace'; ctx.fillStyle='#111111'; ctx.fillText(String(nr.score),8+slw,55);
  // Best
  ctx.font='600 11px monospace'; ctx.fillStyle='#555555'; ctx.fillText('Best:',8,70);
  const blw=ctx.measureText('Best: ').width;
  ctx.font='700 12px monospace'; ctx.fillStyle='#222222'; ctx.fillText(String(nr.best),8+blw,70);
  // Round & timer
  ctx.textAlign='right';
  ctx.font='600 11px monospace'; ctx.fillStyle='#444444'; ctx.fillText('Round '+nr.round, W-8, 55);
  ctx.font='700 14px monospace';
  ctx.fillStyle = nr.timerRemaining < 3 ? '#d9534f' : '#222222';
  ctx.fillText(nr.timerRemaining.toFixed(1)+'s', W-8, 70);
  ctx.textAlign='left';
  // fading +points
  if (nr.lastAdd && nr.lastAdd.t < nr.lastAdd.life){
    const fade = Math.max(0,1-nr.lastAdd.t/nr.lastAdd.life);
    const rise = nr.lastAdd.t * 30;
    ctx.save(); ctx.globalAlpha=fade; ctx.font='900 28px monospace';
    ctx.textAlign='center'; ctx.fillStyle='#4ade80';
    ctx.fillText('+'+nr.lastAdd.val, W/2, 130 - rise); ctx.restore();
  }
  // big center score
  if (nr.score > 0 || nr.scorePop > 0){
    const txt = String(nr.score), sy = H - 80;
    const sc = 1 + 0.35*(nr.scorePop||0);
    ctx.save(); ctx.translate(W/2,sy); ctx.scale(sc,sc);
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.font='900 40px monospace'; ctx.lineWidth=4;
    ctx.strokeStyle='rgba(0,0,0,0.4)'; ctx.strokeText(txt,0,0);
    ctx.fillStyle='#f0e6d0'; ctx.fillText(txt,0,0); ctx.restore();
  }
  // detection indicator (subtle on light bg)
  ctx.save();
  const dbW=160, dbH=30, dbx=(W-dbW)/2, dby=H-dbH-10;
  ctx.fillStyle='rgba(0,0,0,0.06)'; roundRect(ctx, dbx, dby, dbW, dbH, 6, true, false);
  ctx.fillStyle='#222222'; ctx.font='700 13px monospace';
  ctx.textAlign='center'; ctx.textBaseline='middle';
  const det = game.detected && game.detected.letter
    ? game.detected.letter + ' (' + game.detected.db + ' dB)'
    : 'Listening...';
  ctx.fillText(det, dbx+dbW/2, dby+dbH/2); ctx.restore();
}

function stepNoteReading(dt){
  drawNRBg();
  drawNRStaff();
  const gLineY = NR_BOT - NR_SP; // G4 = 2nd line from bottom
  drawTrebleClef(NR_LEFT + 38, gLineY, NR_SP);

  // Debug: always show state at bottom of canvas
  ctx.save(); ctx.fillStyle='#ff0'; ctx.font='bold 11px monospace'; ctx.textAlign='left'; ctx.textBaseline='alphabetic';
  ctx.fillText('active='+nr.active+' over='+nr.over+' note='+(nr.currentNote ? nr.currentNote.name+nr.currentNote.octave+' pos='+nr.currentNote.staffPos : 'null'), 4, H-4);
  ctx.restore();

  if (nr.active && !nr.over){
    nr.timerRemaining -= dt;
    if (nr.timerRemaining <= 0){ nr.timerRemaining = 0; nrShowGameOver(); }
    if (nr.flashCorrect > 0) nr.flashCorrect = Math.max(0, nr.flashCorrect - dt*3);
    if (nr.scorePop > 0) nr.scorePop = Math.max(0, nr.scorePop - dt*2.5);
    if (nr.lastAdd && nr.lastAdd.t < nr.lastAdd.life) nr.lastAdd.t += dt;
    // Draw the note
    if (nr.currentNote){
      try {
        drawNoteOnStaff(nr.currentNote);
      } catch(e) {
        console.error('drawNoteOnStaff error:', e);
        ctx.save(); ctx.fillStyle='#ff0000'; ctx.font='bold 16px monospace';
        ctx.textAlign='center'; ctx.fillText('ERR:'+e.message, W/2, H/2); ctx.restore();
      }
    } else {
      ctx.save(); ctx.fillStyle='#ff0000'; ctx.font='bold 20px monospace';
      ctx.textAlign='center'; ctx.fillText('No note!', W/2, H/2); ctx.restore();
    }
    // particles
    for (let p of nr.particles){ p.t+=dt; p.x+=p.vx*dt; p.vy+=30*dt; p.y+=p.vy*dt; }
    nr.particles = nr.particles.filter(p => p.t < p.life);
    for (const p of nr.particles){
      ctx.globalAlpha = Math.max(0,1-p.t/p.life);
      ctx.fillStyle = p.color; ctx.fillRect(p.x|0, p.y|0, 3, 3);
    }
    ctx.globalAlpha = 1;
  } else if (nr.over){
    if (nr.currentNote) {
      ctx.save(); ctx.globalAlpha=0.3; drawNoteOnStaff(nr.currentNote); ctx.restore();
    }
  } else {
    ctx.save(); ctx.fillStyle='#ffff00'; ctx.font='bold 16px monospace';
    ctx.textAlign='center'; ctx.fillText('active:'+nr.active+' over:'+nr.over, W/2, H/2 - 20); ctx.restore();
  }

  drawNRTimerBar(nr.timerMax > 0 ? nr.timerRemaining / nr.timerMax : 0);
  drawNRHUD();
}

async function startNoteReading(){
  nrReset(); nr.active = true;
  // hide any overlays from previous games
  if (ui.overlay) ui.overlay.style.display = 'none';
  if (ui.mainMenuOverlay) ui.mainMenuOverlay.style.display = 'none';
  // spawn first note immediately (before async mic setup)
  nrSpawnNote();
  console.log('NR started, note:', nr.currentNote, 'active:', nr.active);
  // ensure mic running
  if (!audio.running){
    try{
      const stream = await navigator.mediaDevices.getUserMedia(
        { audio:{ echoCancellation:false, noiseSuppression:false, autoGainControl:false }});
      if (!audio.ctx) audio.ctx = new (window.AudioContext||window.webkitAudioContext)();
      const src = audio.ctx.createMediaStreamSource(stream);
      audio.analyser = audio.ctx.createAnalyser();
      audio.analyser.fftSize = 2048; audio.analyser.smoothingTimeConstant = 0;
      audio.sampleRate = audio.ctx.sampleRate;
      audio.data = new Float32Array(audio.analyser.fftSize);
      src.connect(audio.analyser); audio.running = true;
      if (ui.permMsg) ui.permMsg.textContent = 'Microphone running.';
    } catch(e){
      console.error(e);
      if (ui.permMsg) ui.permMsg.textContent = 'Microphone permission denied.';
      return;
    }
  }
  if (!audio.updating){ lastTs = performance.now(); requestAnimationFrame(updateAudio); }
  try{ stopMenuMusic(); }catch(e){}
  try{ stopGameMusic(); }catch(e){}
  if (ui.levelTimer) ui.levelTimer.style.display = 'none';
}

/* ------------------- Game loop ------------------- */
let lastTs = 0;
function step(ts){
  const dt = Math.min(0.033, (ts - lastTs)/1000 || 0.016);
  lastTs = ts;

  // Branch: Note Reading mode — always render the Note Reading screen when selected
  if (window.currentMode === 'note-reading'){
    try { stepNoteReading(dt); } catch(e) {
      console.error('stepNoteReading crashed:', e);
      ctx.save(); ctx.fillStyle='red'; ctx.font='bold 14px monospace'; ctx.textAlign='center';
      ctx.fillText('RENDER ERROR: '+e.message, W/2, H/2+40); ctx.restore();
    }
    requestAnimationFrame(step);
    return;
  }

  drawBackground();

  if (game.started && !game.over){
    game.time += dt;

    // High-score pop animation decay
    if (game.hsPop > 0) {
      game.hsPop = Math.max(0, game.hsPop - dt * 2.5);
    }

      // score pop decay and lastAdd timer (for +x fade)
      if (game.scorePop > 0) game.scorePop = Math.max(0, game.scorePop - dt * 2.5);
      if (game.lastAdd && game.lastAdd.t < game.lastAdd.life) game.lastAdd.t += dt;
      // level banner timer
      if (game.levelBanner && game.levelBanner.t < game.levelBanner.life) game.levelBanner.t += dt;

      // heart pop decay (for lost-life pop animation)
      if (game.heartPops && game.heartPops.length) {
        for (let i=0;i<game.heartPops.length;i++){
          if (game.heartPops[i] > 0) game.heartPops[i] = Math.max(0, game.heartPops[i] - dt * 2.5);
        }
      }

    // speed handling:
    // - fixed for explicit levels
    // - survival: start at baseBaseSpeed and increase by 1 px/s each second
    // - otherwise (endless non-level mode): gentle percent ramp
    if (game.level) {
      game.speedFactor = 1;
    } else if (game.survival) {
      // want currentSpeed = baseBaseSpeed + 1 * time
      game.speedFactor = (game.baseBaseSpeed + game.time) / game.baseBaseSpeed;
    } else {
      game.speedFactor = 1 + game.time * 0.02;
    }
    // spawn spacing: use level spawn interval when a level is active, otherwise fallback
    if (game.level && game.currentSpawnInterval){
      // use absolute nextSpawnTime scheduling so spawns remain evenly spaced
      if (!game.nextSpawnTime) game.nextSpawnTime = ts + game.currentSpawnInterval;
      if (ts >= game.nextSpawnTime) {
        spawnComet();
        game.lastSpawn = ts;
        // schedule next spawn based on actual spawn time to keep even wall-clock spacing
        game.nextSpawnTime = ts + game.currentSpawnInterval;
      }
    } else {
      const spawnNow = Math.max(1500, 3000 - game.time * 10);
      if (ts - game.lastSpawn > spawnNow) { spawnComet(); game.lastSpawn = ts; }
    }

    // level timer handling
    if (game.level && typeof game.levelTimeRemaining === 'number'){
      game.levelTimeRemaining = Math.max(0, game.levelTimeRemaining - dt);
      if (ui.levelTimer) ui.levelTimer.textContent = `Level ${game.level}: ${Math.ceil(game.levelTimeRemaining)}s`;
      if (game.levelTimeRemaining <= 0){
        // player beat the level
        game.started = false;
        levelComplete();
      }
    }
    // if survival mode, hide level timer
    if (game.survival){ if (ui.levelTimer) ui.levelTimer.style.display = 'none'; }

    const vy = currentSpeed();
    for (const c of game.comets) c.y += vy * dt;

    for (let i = game.comets.length - 1; i >= 0; i--){
      const c = game.comets[i];
      if (c.y >= groundY - c.r){
      explodeAt(c.x, groundY-3, c.note);
        try{ playCrashSfx(); }catch(e){}
        game.comets.splice(i,1);
        // trigger heart pop animation for the life that will be lost
        const losingIndex = Math.max(0, game.lives - 1);
        if (game.heartPops && game.heartPops[losingIndex] !== undefined) game.heartPops[losingIndex] = 1.0;
        game.lives -= 1;
        if (game.lives <= 0) { game.over = true; showGameOver(); break; }
      }
    }
  }

  drawComets();
  updateParticles(dt);
  drawParticles();
  drawHighScore();   // big juicy number
  drawLevelBanner();
  drawHUD();

  requestAnimationFrame(step);
}

/* ------------------- Audio ------------------- */
const audio = { ctx:null, analyser:null, data:null, running:false, sampleRate:48000, updating:false, _raf:null };

function updateAudio(){
  if (!audio.running) { audio.updating = false; return; }
  audio.updating = true;
  audio.analyser.getFloatTimeDomainData(audio.data);

  let rms=0; for (let i=0;i<audio.data.length;i++){ const v=audio.data[i]; rms += v*v; }
  rms = Math.sqrt(rms / audio.data.length);
  const dbApprox = 20 * Math.log10(rms + 1e-6);
  const pct = Math.min(100, Math.max(0, (dbApprox + 60) * 1.6));
  if (ui.lvl) ui.lvl.style.width = pct + '%';

  const res = autoCorrelate(audio.data.slice(), audio.sampleRate);
  // decide threshold for ignoring low-level noise (dB)
  const savedTh = Number(localStorage.getItem('mic_thresh_db'));
  const thresholdDb = (ui && ui.calibThreshold) ? Number(ui.calibThreshold.value) : (isNaN(savedTh) ? -40 : savedTh);

  if (res.freq){
    const m = freqToMidi(res.freq);
    const name = midiToNoteName(m);
    const cents = Math.round(centsOff(res.freq, Math.round(m)));
    // update UI detector fields
    if (ui.detNote) ui.detNote.textContent = name;
    if (ui.detFreq) ui.detFreq.textContent = res.freq.toFixed(1)+' Hz';
    if (ui.detCents) ui.detCents.textContent = (cents>0?'+':'') + cents + ' ¢';
    if (ui.status) ui.status.textContent = 'Listening…';

    // record detection only if above threshold; otherwise ignore for matching
    if (dbApprox >= thresholdDb){
      const near = nearestMidiNatural(res.freq);
      const detectedLetter = (near.letter || '').replace('#','');
      const detectedCents = Math.round(centsOff(res.freq, near.midi));
      // stability: require the same natural detected within tolerance for at least 100ms
      const now = performance.now();
      const tol = ui && ui.tol ? Number(ui.tol.value) : (Number(localStorage.getItem('mic_tol_cents')) || 35);
      if (game._stable.letter === detectedLetter){
        // still same letter; if cents within tolerance then ensure start time is set
        if (Math.abs(detectedCents) <= tol){ if (!game._stable.start) game._stable.start = now; }
        else { game._stable.start = 0; }
      } else {
        // new letter seen; start fresh if within tolerance
        game._stable.letter = detectedLetter; game._stable.cents = detectedCents; game._stable.start = (Math.abs(detectedCents) <= tol) ? now : 0;
      }

      game.detected = { freq: res.freq, letter: near.letter, cents: detectedCents, db: Math.round(dbApprox) };
      // flash visual
      if (game._stable.start) game.detectFlash = Math.max(game.detectFlash, 1.0);
      // debug panel update
      try{ console.debug('pitch-detect', {freq: res.freq.toFixed(2), A4, midiFloat: m.toFixed(3), midiRounded: Math.round(m), midiName: name, nearestNatural: near, db: Math.round(dbApprox), stableStart: game._stable.start}); }catch(e){}
      // Only match when the detection has been stable long enough
      if (game._stable.start && (now - game._stable.start) >= 100){
        if (nr.active && !nr.over){
          nrCheckMatch(res.freq);
        } else {
          matchLowestCometIfAny(res.freq);
        }
      }
    } else {
      // below threshold: show weak reading but do not match and reset stability
      game.detected = { freq: res.freq, letter: null, cents: Math.round(centsOff(res.freq, Math.round(m))), db: Math.round(dbApprox) };
      game._stable.start = 0; game._stable.letter = null;
    }
  } else {
    if (ui.detNote) ui.detNote.textContent = '—';
    if (ui.detFreq) ui.detFreq.textContent = '— Hz';
    if (ui.detCents) ui.detCents.textContent = '—';
    game.detected = { freq: null, letter: null, cents: 0, db: Math.round(dbApprox) };
  }

  audio._raf = requestAnimationFrame(updateAudio);
}

/* ------------------- Boot ------------------- */
  initStars(140);
  drawBackground(); requestAnimationFrame(step);
  // show main menu on app start
  if (ui && ui.mainMenuOverlay) ui.mainMenuOverlay.style.display = 'flex';
  // Due to browser autoplay restrictions, start menu music on the first user gesture
  if (ui && ui.musicToggle && ui.musicToggle.checked){
    const startMusicOnGesture = () => { try{ playMenuMusic(); }catch(e){}; document.removeEventListener('pointerdown', startMusicOnGesture); };
    document.addEventListener('pointerdown', startMusicOnGesture, { once: true });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
