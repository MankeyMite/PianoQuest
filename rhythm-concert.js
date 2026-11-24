/* Rhythm Concert: no dependencies. Musical times use quarter-note beats;
   audio, input, and the stationary score all share the Web Audio clock. */
(function(root){
  'use strict';

  const PATTERNS = {
    quarter:{duration:1, notes:[[0,1]]},
    rest:{duration:1, notes:[], rests:[[0,1]]},
    'eighth-pair':{duration:1, notes:[[0,.5],[.5,.5]], beam:true},
    half:{duration:2, notes:[[0,2]]},
    'half-rest':{duration:2, notes:[], rests:[[0,2]]},
    offbeat:{duration:1, notes:[[.5,.5]], rests:[[0,.5]]},
    syncopated:{duration:2, notes:[[0,.5],[.5,1],[1.5,.5]]},
    sixteenths:{duration:1, notes:[[0,.25],[.25,.25],[.5,.25],[.75,.25]], beam:true},
    'mixed-sixteenths':{duration:1, notes:[[0,.5],[.5,.25],[.75,.25]], beam:true},
    'dotted-quarter':{duration:2, notes:[[0,1.5],[1.5,.5]]},
    'dotted-eighth':{duration:1, notes:[[0,.75],[.75,.25]], beam:true},
    'reverse-dotted-quarter':{duration:2, notes:[[0,.5],[.5,1.5]]},
    'reverse-dotted-eighth':{duration:1, notes:[[0,.25],[.25,.75]], beam:true}
  };
  const hasDottedNotes=pattern=>pattern.notes.some(([,duration])=>duration===1.5 || duration===.75);
  const hasSixteenths=pattern=>pattern.notes.some(([,duration])=>duration===.25);
  const LEVELS = Object.freeze({
    beginner: Object.freeze({ name:'Beginner', beats:4, beatUnit:4, bpm:80, hitWindow:0.16,
      nearWindow:0.26, maxRests:2, maxFastGroups:0,
      description:'Quarter notes, quarter rests, and pairs of eighth notes.',
      patterns:['quarter', 'rest', 'eighth-pair'],
      openings:[['quarter','quarter','quarter','quarter'], ['quarter','rest','eighth-pair','quarter']] }),
    intermediate: Object.freeze({ name:'Intermediate', beats:4, beatUnit:4, bpm:90, hitWindow:0.12,
      nearWindow:0.20, maxRests:2, maxFastGroups:0,
      description:'Adds half notes, half rests, eighth rests, and syncopation.',
      patterns:['quarter', 'rest', 'eighth-pair', 'half', 'half-rest', 'offbeat', 'syncopated'],
      openings:[['half','quarter','quarter'], ['syncopated','offbeat','eighth-pair']] }),
    advanced: Object.freeze({ name:'Advanced', beats:4, beatUnit:4, bpm:100, hitWindow:0.07,
      nearWindow:0.12, maxRests:2, maxFastGroups:2,
      description:'Adds sixteenth notes and mixed eighth/sixteenth groups. A quicker groove!',
      patterns:['quarter', 'rest', 'eighth-pair', 'half', 'half-rest', 'offbeat', 'syncopated', 'sixteenths', 'mixed-sixteenths'],
      openings:[['sixteenths','quarter','eighth-pair','quarter'], ['mixed-sixteenths','offbeat','syncopated']] })
  });

  const CAMPAIGN = Object.freeze([
    {name:'Find the beat', description:'Find a steady beat, then keep it through one quarter rest.', difficulty:'beginner', bpm:76, rounds:4, maxRests:1, patterns:['quarter','rest'], openings:[['quarter','quarter','quarter','quarter']],
      variations:Array.from({length:4},(_,restBeat)=>Array.from({length:4},(_,beat)=>beat===restBeat ? 'rest' : 'quarter'))},
    {name:'Make room for silence', description:'Quarter notes and quarter rests. Keep counting through silence.', difficulty:'beginner', bpm:78, rounds:4, patterns:['quarter','rest'], openings:[['quarter','rest','quarter','quarter']]},
    {name:'Two notes to a beat', difficulty:'beginner', bpm:80, rounds:5},
    {name:'The long and short of it', description:'Adds half notes and half rests, with quarters and eighth pairs.', difficulty:'intermediate', bpm:80, rounds:5, patterns:['quarter','rest','eighth-pair','half','half-rest'], openings:[['half','quarter','quarter'],['half-rest','quarter','quarter']]},
    {name:'Play the offbeat', description:'Adds eighth rests and offbeat eighth notes.', difficulty:'intermediate', bpm:84, rounds:5, patterns:['quarter','rest','eighth-pair','half','half-rest','offbeat'], openings:[['offbeat','quarter','eighth-pair','quarter']]},
    {name:'A little syncopation', difficulty:'intermediate', bpm:90, rounds:6},
    {name:'Four notes to a beat', description:'Adds sixteenth notes, with at most one fast group per bar.', difficulty:'advanced', bpm:90, rounds:6, maxFastGroups:1, patterns:['quarter','rest','eighth-pair','half','half-rest','offbeat','syncopated','sixteenths'], openings:[['sixteenths','quarter','quarter','quarter']]},
    {name:'Mix it up', difficulty:'advanced', bpm:96, rounds:6},
    {name:'Take the spotlight', difficulty:'advanced', bpm:104, rounds:7},
    {name:'The headline concert', difficulty:'advanced', bpm:112, rounds:8, maxFastGroups:3}
  ].map((level,index)=>Object.freeze({...level,id:index+1})));

  function getRunSettings(selection=1, round=1){
    const survival=selection==='survival';
    const stage=survival ? (round<=4 ? 'beginner' : round<=8 ? 'intermediate' : 'advanced') : null;
    const concert=survival ? null : CAMPAIGN[Number(selection)-1];
    if (!survival && (!Number.isInteger(Number(selection)) || !concert)) throw new Error('Choose a Rhythm Concert level.');
    const difficulty=survival ? stage : concert.difficulty;
    const base=LEVELS[difficulty];
    const bpm=survival ? Math.min(140,80+2*(round-1)) : concert.bpm;
    // Faster subdivisions keep distinct timing windows instead of overlapping hits.
    const timingScale=Math.min(1,base.bpm/bpm);
    const rules={...base,...concert,bpm,hitWindow:base.hitWindow*timingScale,nearWindow:base.nearWindow*timingScale};
    if (survival && difficulty==='advanced') rules.maxFastGroups=Math.min(4,2+Math.floor((round-9)/8));
    let introRound=survival ? round-(difficulty==='beginner' ? 0 : difficulty==='intermediate' ? 4 : 8) : round;
    let rhythmLabel='Endless concert';
    if (survival && round>=32){
      // BPM reaches 140 at round 31. Later challenges grow musically, not faster.
      const dotted=['dotted-quarter'];
      let stageStart=32;
      rules.openings=[['dotted-quarter','quarter','quarter'],['quarter','quarter','dotted-quarter']];
      rhythmLabel='Dotted quarters';
      if (round>=40){
        dotted.push('dotted-eighth');stageStart=40;
        rules.openings=[['dotted-eighth','quarter','dotted-quarter'],['dotted-quarter','dotted-eighth','quarter']];
        rhythmLabel='Dotted eighths';
      }
      if (round>=48){
        dotted.push('reverse-dotted-quarter','reverse-dotted-eighth');stageStart=48;
        rules.openings=[['reverse-dotted-quarter','reverse-dotted-eighth','quarter'],['dotted-eighth','reverse-dotted-eighth','offbeat','quarter']];
        rhythmLabel='Dotted mix';
      }
      if (round>=64) rhythmLabel='Dotted challenge';
      rules.patterns=[...base.patterns,...dotted];
      rules.minDottedGroups=round>=64 ? 3 : round>=48 ? 2 : 1;
      introRound=round-stageStart+1;
    }
    return {mode:survival ? 'survival' : 'level', selection:survival ? 'survival' : concert.id,
      levelId:concert ? concert.id : null, rounds:concert ? concert.rounds : null,
      name:concert ? concert.name : 'Survival', difficulty,rules,rhythmLabel,introRound};
  }

  function generateMeasure(level=LEVELS.beginner, random=Math.random, round=3, previousMeasure=null){
    // Each level introduces its new symbols before generating varied measures.
    let patterns = level.openings[round-1];
    if (!patterns && level.variations){
      const previous=previousMeasure?.symbols.map(symbol=>symbol.kind).join(',');
      const choices=level.variations.filter(variation=>variation.join(',')!==previous);
      patterns=choices[Math.floor(random()*choices.length)];
    }
    if (!patterns){
      patterns = [];
      let rests = 0, fastGroups = 0, dottedGroups = 0, noteCount = 0, beat = 0;
      const dottedDurations=level.patterns.filter(kind=>hasDottedNotes(PATTERNS[kind])).map(kind=>PATTERNS[kind].duration);
      const shortestDotted=dottedDurations.length ? Math.min(...dottedDurations) : 0;
      while (beat<level.beats){
        const previous = PATTERNS[patterns[patterns.length-1]];
        const choices = level.patterns.filter(kind=>{
          const p = PATTERNS[kind];
          const silence = (p.rests || []).reduce((sum,r)=>sum+r[1],0);
          const dottedNeeded=Math.max(0,(level.minDottedGroups||0)-dottedGroups-(hasDottedNotes(p) ? 1 : 0));
          return p.duration<=level.beats-beat && (p.duration<2 || beat%2===0) &&
            rests+silence<=level.maxRests && !(silence && previous?.rests) &&
            (!hasSixteenths(p) || fastGroups<level.maxFastGroups) &&
            level.beats-beat-p.duration>=dottedNeeded*shortestDotted &&
            (beat+p.duration<level.beats || noteCount+p.notes.length>=2);
        });
        const pattern = choices[Math.floor(random() * choices.length)];
        patterns.push(pattern);
        const p = PATTERNS[pattern];
        rests += (p.rests || []).reduce((sum,r)=>sum+r[1],0);
        if (hasSixteenths(p)) fastGroups++;
        if (hasDottedNotes(p)) dottedGroups++;
        noteCount += p.notes.length;
        beat += p.duration;
      }
    }
    const symbols = [], notes = [];
    let beat = 0;
    patterns.forEach(kind=>{
      const pattern = PATTERNS[kind];
      symbols.push({ kind, beat, duration:pattern.duration });
      pattern.notes.forEach(([offset,duration])=>notes.push({beat:beat+offset,duration}));
      beat += pattern.duration;
    });
    return { symbols, notes, onsets:notes.map(note=>note.beat), beats:level.beats, beatUnit:level.beatUnit };
  }

  function renderNotationGuide(selection=1){
    const run=getRunSettings(selection);
    const labels={quarter:'Quarter note',rest:'Quarter rest','eighth-pair':'Eighth notes',half:'Half note',
      'half-rest':'Half rest',offbeat:'Eighth rest',syncopated:'Syncopation',sixteenths:'Sixteenth notes',
      'mixed-sixteenths':'Mixed notes','dotted-quarter':'Dotted quarter','dotted-eighth':'Dotted eighth',
      'reverse-dotted-quarter':'Reverse dotted quarter','reverse-dotted-eighth':'Reverse dotted eighth'};
    // Survival eventually uses the full vocabulary, including dotted combinations.
    const kinds=run.mode==='survival' ? getRunSettings('survival',64).rules.patterns : run.rules.patterns;
    const svg=(content,staff)=>`<svg viewBox="0 0 112 72" aria-hidden="true" focusable="false">${staff ? '<path d="M10 52H102" stroke="currentColor" stroke-opacity=".25"/>' : ''}${content}</svg>`;
    const card=(kind,label,content)=>`<figure class="rhythm-symbol" data-rhythm-symbol="${kind}">${svg(content,kind!=='time-signature')}<figcaption>${label}</figcaption></figure>`;
    const cards=kinds.map(kind=>{
      const pattern=PATTERNS[kind];
      const single=pattern.notes.length+(pattern.rests?.length||0)===1;
      const x=offset=>single ? 52 : 22+offset/pattern.duration*82;
      const parts=[];
      for(const [offset,duration] of pattern.rests||[]){
        const nx=x(offset);
        if(duration===2) parts.push(`<path d="M${nx-7} 52h14v-6h-14z" fill="currentColor"/>`);
        else if(duration===.5) parts.push(`<g transform="translate(${nx} 0)" fill="currentColor"><ellipse cx="-1" cy="36" rx="4" ry="3"/><path d="M-2 37Q6 42 7 32L-1 60" fill="none" stroke="currentColor" stroke-width="2.5"/></g>`);
        else parts.push(`<path transform="translate(${nx} 41)" d="M-3-12L6-3 1 4 7 12C-3 6-4 14 1 18C-10 14-8 4 0 6L-6-1 0-7Z" fill="currentColor"/>`);
      }
      for(const [offset,duration] of pattern.notes){
        const nx=x(offset);
        parts.push(`<ellipse cx="${nx}" cy="52" rx="6" ry="4.3" transform="rotate(-20 ${nx} 52)" fill="${duration===2 ? 'var(--rhythm-paper)' : 'currentColor'}" stroke="currentColor" stroke-width="1.8"/><path d="M${nx+5} 52V19" stroke="currentColor" stroke-width="2.2"/>`);
        if(duration===1.5||duration===.75) parts.push(`<circle cx="${nx+12}" cy="48" r="2" fill="currentColor"/>`);
        if(duration<1&&!pattern.beam) parts.push(`<path d="M${nx+5} 19c1 11 16 9 7 25 5-13-6-9-7-16Z" fill="currentColor"/>`);
      }
      if(pattern.beam){
        const beam=(from,to,y)=>`<path d="M${x(from)+5} ${y}H${x(to)+5}" stroke="currentColor" stroke-width="4"/>`;
        parts.push(beam(pattern.notes[0][0],pattern.notes.at(-1)[0],20));
        const sixteenths=pattern.notes.filter(([,duration])=>duration===.25);
        if(sixteenths.length>1) parts.push(beam(sixteenths[0][0],sixteenths.at(-1)[0],27));
        else if(sixteenths.length===1){
          const onset=sixteenths[0][0],hook=onset===pattern.notes[0][0] ? onset+.125 : onset-.125;
          parts.push(beam(Math.min(onset,hook),Math.max(onset,hook),27));
        }
      }
      return card(kind,labels[kind],parts.join(''));
    });
    const time=card('time-signature','4 beats / bar','<text x="56" y="34" text-anchor="middle" fill="currentColor" font-size="27" font-weight="800">4</text><text x="56" y="58" text-anchor="middle" fill="currentColor" font-size="27" font-weight="800">4</text>');
    const clef=card('percussion-clef','Snare drum','<path d="M47 22V52M58 22V52" stroke="currentColor" stroke-width="5"/>');
    return `<div class="rhythm-preview-meta"><span>${run.mode==='survival' ? 'Endless rounds' : run.rounds+' rounds'}</span><span>${run.mode==='survival' ? '80–140' : run.rules.bpm} BPM</span></div><div class="rhythm-guide-heading">${run.mode==='survival' ? 'Symbols you’ll meet' : 'In this level'}</div><div class="rhythm-symbol-grid" aria-label="Rhythm symbols">${cards.join('')}</div><div class="rhythm-misc-grid" aria-label="Staff symbols">${time}${clef}</div>`;
  }

  function evaluatePerformance(expected, performed, hitWindow=0.16, nearWindow=0.26){
    // Sequence alignment gives one-to-one matches, even around eighth pairs.
    // A tap cannot earn credit for two notes. Both arrays contain seconds.
    const taps = performed.map((time, index)=>({time,index})).sort((a,b)=>a.time-b.time);
    const n = expected.length, m = taps.length;
    const dp = Array.from({length:n+1}, ()=>Array(m+1).fill(Infinity));
    const path = Array.from({length:n+1}, ()=>Array(m+1));
    dp[0][0] = 0;
    for (let i=0; i<=n; i++) for (let j=0; j<=m; j++){
      if (i && dp[i-1][j]+1 < dp[i][j]){ dp[i][j]=dp[i-1][j]+1; path[i][j]='miss'; }
      if (j && dp[i][j-1]+1 < dp[i][j]){ dp[i][j]=dp[i][j-1]+1; path[i][j]='extra'; }
      if (i && j){
        const error = Math.abs(taps[j-1].time - expected[i-1]);
        if (error <= nearWindow + 1e-9 && dp[i-1][j-1] + error/nearWindow < dp[i][j]){
          dp[i][j] = dp[i-1][j-1] + error/nearWindow; path[i][j] = 'match';
        }
      }
    }
    const notes = expected.map(time=>({time, status:'missed', tapIndex:null, error:null}));
    const extras = [];
    let i=n, j=m;
    while (i || j){
      const step = path[i][j];
      if (step === 'match'){
        const error = taps[j-1].time - expected[i-1];
        notes[i-1] = {time:expected[i-1], tapIndex:taps[j-1].index, error,
          status:Math.abs(error) <= hitWindow + 1e-9 ? 'correct' : (error<0 ? 'early' : 'late')};
        i--; j--;
      } else if (step === 'miss') i--;
      else { extras.push(taps[j-1].index); j--; }
    }
    const correct = notes.filter(note=>note.status === 'correct').length;
    const missed = notes.filter(note=>note.status === 'missed').length;
    const near = n - correct - missed;
    const accuracy = n ? Math.max(0, Math.min(1, (correct + near*0.5 - extras.length*0.75)/n)) : 0;
    return { notes, extras, correct, missed, near, accuracy,
      perfect:correct === n && n>0 && extras.length === 0 };
  }

  const PHASES = [
    {id:'new', start:0, end:2, title:'Meet your rhythm', sub:'Read it. Feel the beat.'},
    {id:'count-demo', start:2, end:6, title:'Count in · listen next', sub:'Listen first. Your turn is coming.'},
    {id:'listen', start:6, end:10, title:'Listen to the drummer', sub:'Follow the notes. Leave the rests quiet.'},
    {id:'count-player', start:10, end:14, title:'Get ready to play', sub:'Four beats, then it’s your turn!'},
    {id:'play', start:14, end:18, title:'Your turn!', sub:'Tap the drum or press SPACE'},
    {id:'feedback', start:18, end:20, title:'Let’s hear how you did', sub:''},
    {id:'replay', start:20, end:24, title:'This is what you played', sub:'Listen to your own timing.'},
    {id:'next', start:24, end:26, title:'Keep the concert going', sub:'A fresh rhythm is on its way.'}
  ];
  const COLORS = { ink:'#27324d', correct:'#16876e', missed:'#bd4b68', early:'#af6b12', late:'#af6b12' };

  class Concert {
    constructor({canvas, getAudioContext, getVolume, onStart, onResult, onEnd, announce}){
      Object.assign(this, {canvas, getAudioContext, getVolume, onStart, onResult, onEnd, announce});
      this.ctx = canvas.getContext('2d');
      this.level = LEVELS.beginner;
      this.beat = 60 / this.level.bpm;
      this.active = false;
      this.paused = false;
      this.sources = new Set();
      this.score = 0;
      this.crowd = 50;
      this.round = 0;
      this.completedRounds = 0;
      this.run = null;
      this.events = [];
      this.visuals = [];
      this.sticks = [-10,-10];
      this.nextStick = 0;
      this.reducedMotion = root.matchMedia ? root.matchMedia('(prefers-reduced-motion: reduce)').matches : false;
      this.audienceCanvas = root.document ? root.document.createElement('canvas') : null;
      if (this.audienceCanvas){ this.audienceCanvas.width=360; this.audienceCanvas.height=220; }
      this.people = Array.from({length:72}, (_,i)=>({
        x:((i%12)+0.5)*30 + Math.sin(i*71)*8,
        y:98 + Math.floor(i/12)*19, phase:i*1.73,
        color:['#5c548d','#537b9b','#926977','#507f7e'][i%4]
      }));
    }

    async start(selection=1){
      this.stop();
      this.selection = selection;
      this.run = getRunSettings(selection);
      this.level = this.run.rules;
      this.beat = 60 / this.level.bpm;
      const token = this.startToken;
      try {
        this.audio = this.getAudioContext();
        await this.audio.resume();
        if (token !== this.startToken) return false;
        if (this.audio.state !== 'running') throw new Error('Audio could not start. Please try again.');
        this.makeNoise();
        this.active = true;
        this.score = 0; this.crowd = 50; this.round = 0;
        this.completedRounds = 0;
        this.confettiUntil = 0;
        this.onStart();
        this.beginRound();
        this.timer = root.setInterval(()=>this.schedule(), 25);
        return true;
      } catch (error){
        this.announce('Sound could not start. Click to try again.');
        console.warn('Rhythm Concert audio:', error);
        return false;
      }
    }

    makeNoise(){
      if (this.noise && this.noise.sampleRate === this.audio.sampleRate) return;
      this.noise = this.audio.createBuffer(1, this.audio.sampleRate*0.24, this.audio.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i=0;i<data.length;i++) data[i]=Math.random()*2-1;
    }

    track(source, nodes){
      this.sources.add(source);
      source.onended = ()=>{
        this.sources.delete(source);
        source.disconnect();
        nodes.forEach(node=>node.disconnect());
      };
    }

    sound(time, kind='snare'){
      const ac = this.audio;
      time = Math.max(ac.currentTime, time);
      const volume = Math.max(0, Math.min(1, this.getVolume()));
      if (volume === 0) return;
      if (kind === 'cheer' || kind === 'boo'){
        // Rising cheers and low, falling boos use a small chorus of voices.
        // Formants soften the sawtooth into a cartoon crowd voice; no downloads.
        // Fit crowd reactions before replay, including early taps and fast tempos.
        const boo=kind==='boo';
        const replayStart=this.origin+20*this.beat+(boo ? Math.min(0,...this.taps) : 0);
        const pace=Math.max(.2,Math.min(1,(replayStart-time-.04)/.76));
        for (let voice=0;voice<3;voice++){
          const offset=voice*.045*pace, start=time+offset;
          const oscillator=ac.createOscillator(), vowel=ac.createBiquadFilter();
          const soften=ac.createBiquadFilter(), gain=ac.createGain();
          const pitch=boo ? 120+voice*23+Math.random()*12 : 230+voice*57+Math.random()*35;
          oscillator.type='sawtooth';
          oscillator.frequency.setValueAtTime(pitch,start);
          oscillator.frequency.exponentialRampToValueAtTime(pitch*(boo ? 1.02 : 1.65),start+.2*pace);
          oscillator.frequency.exponentialRampToValueAtTime(pitch*(boo ? .78 : .92),start+.6*pace);
          vowel.type='bandpass'; vowel.Q.value=1.3;
          vowel.frequency.setValueAtTime(boo ? 350+voice*35 : 650+voice*90,start);
          vowel.frequency.linearRampToValueAtTime(boo ? 300+voice*30 : 1050+voice*110,start+.22*pace);
          vowel.frequency.linearRampToValueAtTime(boo ? 240+voice*25 : 550+voice*70,start+.6*pace);
          soften.type='lowpass'; soften.frequency.value=boo ? 1000 : 2100;
          gain.gain.setValueAtTime(.001,start);
          gain.gain.linearRampToValueAtTime(volume*.14,start+.075*pace);
          gain.gain.setValueAtTime(volume*.12,start+.3*pace);
          gain.gain.exponentialRampToValueAtTime(.001,start+.64*pace);
          oscillator.connect(vowel); vowel.connect(soften); soften.connect(gain); gain.connect(ac.destination);
          this.track(oscillator,[vowel,soften,gain]);
          oscillator.start(start); oscillator.stop(start+.67*pace);
        }
        return;
      }
      if (kind === 'snare' || kind === 'applause'){
        const source = ac.createBufferSource(), filter = ac.createBiquadFilter(), gain = ac.createGain();
        source.buffer = this.noise;
        filter.type = 'highpass'; filter.frequency.value = kind === 'snare' ? 1100 : 700;
        gain.gain.setValueAtTime(volume*(kind === 'snare' ? 0.65 : 0.15), time);
        gain.gain.exponentialRampToValueAtTime(0.001, time+0.19);
        source.connect(filter); filter.connect(gain); gain.connect(ac.destination);
        this.track(source, [filter,gain]);
        source.start(time); source.stop(time+0.23);
        if (kind !== 'snare') return;
      }
      const oscillator = ac.createOscillator(), gain = ac.createGain();
      const click = kind !== 'snare';
      oscillator.type = click ? 'sine' : 'triangle';
      oscillator.frequency.setValueAtTime(click ? (kind === 'accent' ? 1100 : 760) : 190, time);
      if (!click) oscillator.frequency.exponentialRampToValueAtTime(65,time+0.12);
      gain.gain.setValueAtTime(volume*(click ? 0.13 : 0.5), time);
      gain.gain.exponentialRampToValueAtTime(0.001,time+(click ? 0.045 : 0.14));
      oscillator.connect(gain); gain.connect(ac.destination);
      this.track(oscillator, [gain]);
      oscillator.start(time); oscillator.stop(time+0.16);
    }

    clearScheduled(){
      for (const source of this.sources){ try { source.stop(); } catch (_) {} }
      this.sources.clear();
      this.events = []; this.visuals = [];
    }

    stop(){
      this.startToken = (this.startToken || 0) + 1;
      this.active = false; this.paused = false;
      root.clearInterval(this.timer);
      this.clearScheduled();
    }

    pause(){
      if (!this.active || this.paused) return;
      this.pausedAt = this.audio.currentTime;
      this.paused = true;
      this.clearScheduled();
      this.announce('Intermission. Resume to get a fresh count-in.');
    }

    async resume(){
      if (!this.active || !this.paused) return;
      await this.audio.resume();
      if (!this.active || !this.paused || this.audio.state !== 'running') return;
      this.paused = false;
      // Scored measures are never counted twice; unfinished attempts are discarded.
      if (this.result && this.shouldEnd()){ this.finishRun(); return; }
      this.beginRound(Boolean(this.result));
    }

    beginRound(fresh=true, origin=this.audio.currentTime+0.1){
      if (fresh){
        this.round++;
        if (this.run){
          this.run=getRunSettings(this.selection,this.round);
          this.level=this.run.rules;
          this.beat=60/this.level.bpm;
        }
        let measure = generateMeasure(this.level, Math.random, this.run ? this.run.introRound : this.round, this.measure);
        if (this.round>2 && this.measure){
          for (let i=0;i<5 && JSON.stringify(measure.symbols) === JSON.stringify(this.measure.symbols);i++){
            measure=generateMeasure(this.level);
          }
        }
        this.measure = measure;
      }
      this.origin = origin;
      this.lastClock = this.audio.currentTime;
      this.taps = []; this.result = null; this.phase = '';
      this.scoreAnimation = null;
      this.events = []; this.visuals = []; this.sticks = [-10,-10];
      this.flash = -10;
      // Count-ins, reference performance, and a quiet quarter-note pulse on your turn.
      for (const start of [2,6,10,14]) for (let b=0;b<4;b++){
        this.queue(this.origin+(start+b)*this.beat, b === 0 ? 'accent' : 'click');
      }
      for (const onset of this.measure.onsets){
        this.queue(this.origin+(6+onset)*this.beat, 'snare', {type:'demo',beat:onset});
      }
      this.schedule();
    }

    queue(time, sound, visual){
      this.events.push({time,sound,visual});
      this.events.sort((a,b)=>a.time-b.time);
    }

    schedule(){
      if (!this.active || this.paused || this.audio.state !== 'running') return;
      const now = this.audio.currentTime;
      if (now-this.lastClock>0.5){ this.pause(); return; }
      this.lastClock = now;
      // Evaluate using the clock, not frame durations; allow the final note its window.
      if (!this.result && now >= this.origin+18*this.beat+this.level.hitWindow) this.evaluate();
      while (this.events.length && this.events[0].time < now+0.12){
        const event = this.events.shift();
        // Never bunch up old scheduled hits after the browser was interrupted.
        if (event.time < now-0.06) continue;
        this.sound(event.time,event.sound);
        if (event.visual) this.visuals.push({...event.visual,time:event.time});
      }
    }

    strike(time){
      this.sticks[this.nextStick] = time;
      this.nextStick = 1-this.nextStick;
      this.flash = time;
    }

    tap(){
      if (!this.active || this.paused || this.audio.state !== 'running') return;
      const now = this.audio.currentTime;
      this.sound(now);
      this.strike(now);
      const relative = now - (this.origin+14*this.beat);
      if (!this.result && relative >= -this.level.hitWindow && relative <= 4*this.beat+this.level.hitWindow){
        // A bounded buffer prevents a stuck controller from growing work indefinitely.
        if (this.taps.length<128) this.taps.push(relative);
      }
    }

    evaluate(){
      if (this.result) return;
      this.result = evaluatePerformance(this.measure.onsets.map(b=>b*this.beat), this.taps,
        this.level.hitWindow, this.level.nearWindow);
      const r = this.result;
      const earned = Math.round(r.accuracy*100) + (r.perfect ? 25 : 0);
      const previousScore = this.score;
      this.score += earned;
      this.completedRounds++;
      this.scoreAnimation = {
        from:previousScore, earned, start:this.audio.currentTime,
        end:this.origin+23*this.beat, settleEnd:this.origin+24*this.beat
      };
      const change = r.perfect ? 15 : (r.accuracy >= 0.7 ? 9 : (r.accuracy>=0.4 ? -7 : -22));
      this.crowd = Math.max(0,Math.min(100,this.crowd+change));
      this.reaction = r.perfect ? 'Perfect rhythm! Take the spotlight!' :
        r.accuracy>=0.7 ? 'Great groove! The crowd loves it.' :
        r.accuracy>=0.4 ? 'You’re getting there. Keep the beat!' : 'The crowd boos. Listen closely and find the beat!';
      this.summary = `${r.correct} on beat · ${r.missed} missed · ${r.near} early/late · ${r.extras.length} extra`;
      this.onResult(this.score,{rounds:this.completedRounds,selection:this.selection});
      this.announce(`${this.reaction} ${this.summary}. ${earned} points. Audience ${this.crowd} percent.`);
      if (r.accuracy>=0.7){
        const reactionStart=this.audio.currentTime+.03;
        const room=this.origin+20*this.beat-.04-reactionStart;
        if (room>.18) this.queue(reactionStart,'cheer');
        if (r.perfect && room>.4) this.queue(reactionStart+Math.min(.25,this.beat*.4),'cheer');
        const claps = r.perfect ? 10 : 6;
        const spacing=Math.min(.065,Math.max(0,(room-.23)/(claps-1)));
        if (room>=.23) for (let i=0;i<claps;i++) this.queue(reactionStart+i*spacing, 'applause');
        if (r.perfect) this.confettiUntil = this.audio.currentTime+5;
      } else if (r.accuracy<0.4){
        const reactionStart=this.audio.currentTime+.03;
        const replayStart=this.origin+20*this.beat+Math.min(0,...this.taps);
        if (replayStart-.04-reactionStart>.18) this.queue(reactionStart,'boo');
      }
      // Replay every recorded tap at its original offset, including extras and silence.
      this.taps.forEach(time=>this.queue(this.origin+20*this.beat+time, 'snare', {type:'replay',beat:time/this.beat}));
    }

    scorePresentation(now){
      const a=this.scoreAnimation;
      if (!a) return {total:this.score, earned:0, scale:1};
      const progress=Math.max(0,Math.min(1,(now-a.start)/Math.max(.01,a.end-a.start)));
      const earned=Math.floor(a.earned*(1-Math.pow(1-progress,1.5)));
      const settle=Math.max(0,Math.min(1,(now-a.end)/Math.max(.01,a.settleEnd-a.end)));
      const growth=a.earned>0 && !this.reducedMotion ? .42*progress*(1-settle)**2 : 0;
      return {total:a.from+earned, earned, scale:1+growth};
    }

    roundsLeft(){
      return this.run?.mode==='level' ? Math.max(0,this.run.rounds-this.completedRounds) : null;
    }

    shouldEnd(){
      return this.crowd<=0 || this.roundsLeft()===0;
    }

    finishRun(){
      if (!this.active) return;
      this.active=false; this.paused=false;
      if (this.scoreAnimation){
        const now=this.audio.currentTime;
        this.scoreAnimation.start=Math.min(this.scoreAnimation.start,now-.02);
        this.scoreAnimation.end=now-.01;
        this.scoreAnimation.settleEnd=now;
      }
      root.clearInterval(this.timer);
      this.clearScheduled();
      this.onEnd({score:this.score,rounds:this.completedRounds,selection:this.selection,
        levelId:this.run ? this.run.levelId : null,
        won:this.run?.mode==='level' && this.roundsLeft()===0 && this.crowd>0});
    }

    update(){
      if (!this.active || this.paused) return;
      if (this.audio.state !== 'running'){ this.pause(); return; }
      const now = this.audio.currentTime;
      let beat = (now-this.origin)/this.beat;
      if (beat>=26){
        if (!this.result) this.evaluate();
        if (this.shouldEnd()){ this.finishRun(); return; }
        // Compute the boundary using the old tempo before the new round ramps up.
        this.beginRound(true,this.origin+26*this.beat);
        beat=(now-this.origin)/this.beat;
      }
      const phase = PHASES.find(p=>beat<p.end) || PHASES[0];
      if (phase.id !== this.phase){
        this.phase = phase.id;
        if (phase.id !== 'feedback') this.announce(phase.title+'. '+phase.sub+
          (phase.id==='new' ? (this.roundsLeft()===null ? ` Survival round ${this.round}, ${this.level.bpm} BPM.` : ` Round ${this.round} of ${this.run.rounds}. ${this.roundsLeft()} rounds left.`) : ''));
      }
      while (this.visuals.length && this.visuals[0].time<=now){
        const event = this.visuals.shift();
        this.strike(event.time);
      }
    }

    text(value,x,y,size=12,color='#ecedff',weight=600,align='center'){
      const c = this.ctx;
      c.font = `${weight} ${size}px system-ui, sans-serif`;
      c.fillStyle = color; c.textAlign = align;
      c.fillText(value,x,y);
    }

    box(x,y,w,h,r,fill,stroke){
      const c=this.ctx;
      c.beginPath(); c.roundRect(x,y,w,h,r); c.fillStyle=fill; c.fill();
      if (stroke){ c.strokeStyle=stroke; c.lineWidth=1; c.stroke(); }
    }

    ellipse(x,y,rx,ry,fill,stroke,width=1){
      const c=this.ctx;
      c.beginPath(); c.ellipse(x,y,rx,ry,0,0,Math.PI*2); c.fillStyle=fill; c.fill();
      if (stroke){ c.lineWidth=width; c.strokeStyle=stroke; c.stroke(); }
    }

    draw(){
      const c=this.ctx;
      // Fit the existing 360 × 640 canvas; no changes to the other game modes.
      c.save(); c.scale(this.canvas.width/360,this.canvas.height/640);
      const now = this.paused ? this.pausedAt : this.audio ? this.audio.currentTime : 0;
      const points = this.scorePresentation(now);
      const beat = this.origin ? (now-this.origin)/this.beat : 0;
      const phase = PHASES.find(p=>p.id===this.phase) || PHASES[0];
      const background=c.createLinearGradient(0,0,0,640);
      background.addColorStop(0,'#14152e'); background.addColorStop(.5,'#302346'); background.addColorStop(1,'#11182b');
      c.fillStyle=background; c.fillRect(0,0,360,640);
      this.drawAudience(now);
      this.drawLights(now);

      this.box(12,12,336,64,12,'rgba(10,13,30,.86)','#555079');
      this.text('RHYTHM CONCERT',24,31,12,'#ddc9ff',900,'left');
      const scoreText=`${points.total} pts`;
      c.font=`900 ${18*points.scale}px system-ui, sans-serif`;
      const scoreSize=18*points.scale*Math.min(1,155/c.measureText(scoreText).width);
      this.text(scoreText,336,36,scoreSize,'#ffe3a1',900,'right');
      this.text(`${this.run?.mode==='level' ? 'LEVEL '+this.run.levelId : this.run ? 'SURVIVAL' : this.level.name.toUpperCase()} · ${this.level.bpm} BPM`,24,49,9,'#b9bad8',700,'left');
      this.text(`ROUND ${this.round || 1}${this.run?.mode==='level' ? '/'+this.run.rounds : ''}`,336,49,9,'#b9bad8',800,'right');
      this.text('AUDIENCE',24,65,8,'#cac7e3',800,'left');
      this.box(83,57,212,7,3,'#343047');
      const meterColor=this.crowd<=28 ? '#ffb786' : '#7be4cb';
      if (this.crowd>0) this.box(83,57,212*this.crowd/100,7,3,meterColor);
      this.text(`${this.crowd}%`,334,65,9,meterColor,800,'right');
      if (this.run){
        this.box(100,80,160,18,9,'rgba(10,13,30,.85)');
        const remaining=this.roundsLeft();
        this.text(remaining===null ? this.run.rhythmLabel.toUpperCase() : `${remaining} ROUND${remaining===1 ? '' : 'S'} LEFT`,180,93,9,'#ffe3a1',800);
      }
      this.box(104,176,152,20,10,'rgba(10,13,30,.8)');
      this.text(this.crowd>80 ? 'THE CROWD IS CHEERING!' : this.crowd<=28 ? 'Keep the beat to stay onstage!' : 'THE LITTLE STAR CLUB',180,190,8,'#e0d8ee',800);

      this.text(phase.title,180,226,19,'#fff0d2',850);
      const showingResult = Boolean(this.result) && ['feedback','replay','next'].includes(this.phase);
      this.text(showingResult ? this.reaction : phase.sub,180,247,10,'#d3cce8',600);
      this.drawNotation(beat,showingResult);
      this.drawBeatDots(beat,phase);

      if (showingResult){
        this.text(this.summary,180,410,9,'#e3d9ed',700);
        this.text(this.phase==='replay' && !this.taps.length ? 'No taps recorded — this is your quiet measure.' :
          '✓ on beat   × missed   ← early   → late',180,426,10,'#c7bddb',600);
      } else {
        const kinds=this.measure ? this.measure.symbols.map(s=>s.kind) : [];
        const tip=kinds.some(k=>k.includes('dotted')) ? 'A dot adds half the note’s value.' :
          kinds.some(k=>k.includes('sixteenth')) ? 'Sixteenth notes: count “1 e & a”.' :
          kinds.includes('half') ? 'Half note: one strike, lasting two beats.' :
          kinds.includes('offbeat') ? 'Eighth rest: stay quiet for half a beat.' :
          kinds.includes('half-rest') ? 'Half rest: two quiet beats.' :
          kinds.includes('rest') ? 'A quarter rest means one quiet beat.' : 'Quarter notes: one strike on each beat.';
        this.text(this.phase==='play' ? 'You’ve got this. Feel the steady pulse.' : tip,180,417,11,'#c7bddb');
      }
      c.save(); c.translate(0,12); this.drawDrum(now); c.restore();
      if (!showingResult) this.text('SPACE  /  TAP THE DRUM',180,594,10,'#dbd5eb',800);
      else this.text(`+${points.earned} POINTS`,180,594,11*points.scale,'#ffe3a1',900);
      if (this.confettiUntil>now && !this.reducedMotion){
        const age=5-(this.confettiUntil-now);
        for (let i=0;i<48;i++){
          c.save(); c.translate((i*79+Math.sin(i)*age*24)%360, (i*37+age*90)%600);
          c.rotate(age*2+i); c.fillStyle=['#ffc96b','#79e7d3','#b997ff','#ff92b8'][i%4];
          c.fillRect(-2,-3,4,7); c.restore();
        }
      }
      c.restore();
    }

    drawAudience(now){
      const c=this.ctx, happy=this.crowd/100;
      // Blur one composited layer rather than every spectator on every frame.
      const a=this.audienceCanvas ? this.audienceCanvas.getContext('2d') : c;
      if (this.audienceCanvas) a.clearRect(0,0,360,220);
      const ellipse=(x,y,rx,ry,color)=>{
        a.beginPath(); a.ellipse(x,y,rx,ry,0,0,Math.PI*2); a.fillStyle=color; a.fill();
      };
      for (const person of this.people){
        const sway=this.reducedMotion ? 0 : Math.sin(now*(happy>0.8 ? 4 : 1.7)+person.phase)*happy*3;
        const x=person.x+sway, y=person.y;
        ellipse(x,y+13,10,14,'#14172c');
        ellipse(x,y,6,7,person.color);
        if (happy>0.7){
          a.strokeStyle=person.color; a.lineWidth=3; a.beginPath();
          a.moveTo(x-8,y+11); a.lineTo(x-15,y-4+sway); a.moveTo(x+8,y+11); a.lineTo(x+14,y-6-sway); a.stroke();
        }
      }
      if (this.audienceCanvas){
        c.save(); c.filter='blur(0.8px)'; c.drawImage(this.audienceCanvas,0,0); c.restore();
      }
      const haze=c.createLinearGradient(0,80,0,216);
      haze.addColorStop(0,'rgba(18,18,40,.6)'); haze.addColorStop(1,'rgba(124,92,163,.22)');
      c.fillStyle=haze; c.fillRect(0,80,360,136);
      c.fillStyle='#6d5386'; c.fillRect(0,209,360,3);
    }

    drawLights(now){
      const c=this.ctx;
      for (const side of [-1,1]){
        const x=side<0 ? 17 : 343;
        const gradient=c.createLinearGradient(x,207,180,570);
        gradient.addColorStop(0,'rgba(255,220,156,.38)'); gradient.addColorStop(1,'rgba(190,159,255,0)');
        c.fillStyle=gradient; c.beginPath(); c.moveTo(x,207);
        c.lineTo(180+side*90,570); c.lineTo(180-side*70,550); c.closePath(); c.fill();
        this.box(x-11,198,22,15,4,'#24243d','#8a7a9b');
        this.ellipse(x,211,9,5,'#ffe0a0');
        const glow=c.createRadialGradient(x,211,2,x,211,55);
        glow.addColorStop(0,'rgba(255,223,156,.45)'); glow.addColorStop(1,'rgba(255,223,156,0)');
        c.fillStyle=glow; c.fillRect(x-55,156,110,110);
      }
      if (!this.reducedMotion){
        for (let i=0;i<14;i++) this.ellipse((i*83)%360,260+(i*41+now*6)%300,.8,.8,'#b5a9c344');
      }
    }

    notationX(beat){
      // Every symbol, subdivision, and beat label uses this same time axis.
      return 84+beat*59;
    }

    activeBeat(beat){
      const phase=PHASES.find(p=>p.id===this.phase);
      if (!phase || !['count-demo','listen','count-player','play','replay'].includes(phase.id)) return -1;
      // Audio-time conversion can land a few floating-point ulps below a beat.
      const relative=beat-phase.start+1e-9;
      return relative>=0 && relative<4 ? Math.floor(relative) : -1;
    }

    drawNotation(beat,showResult){
      const c=this.ctx;
      this.box(17,261,326,110,12,'#fff8e7','#efdcba');
      this.text('SNARE',30,278,7,'#82788b',800,'left');
      // A one-line percussion staff is standard for a single unpitched drum.
      c.strokeStyle='#686074'; c.lineWidth=1.2;
      c.beginPath(); c.moveTo(28,321); c.lineTo(329,321);
      c.moveTo(28,295); c.lineTo(28,337); c.moveTo(325,295); c.lineTo(325,337);
      c.moveTo(329,295); c.lineTo(329,337); c.stroke();
      c.lineWidth=3; c.beginPath(); c.moveTo(36,304); c.lineTo(36,321); c.moveTo(42,304); c.lineTo(42,321); c.stroke();
      this.text('4',56,310,19,COLORS.ink,800); this.text('4',56,330,19,COLORS.ink,800);
      if (!this.measure) return;
      const phaseStart=this.phase==='listen' ? 6 : this.phase==='play' ? 14 : -100;
      const currentBeat=this.activeBeat(beat);
      for (let b=0;b<4;b++){
        const x=this.notationX(b), current=b===currentBeat;
        if (current) this.ellipse(x,356,8,8,'#f4deb0');
        this.text(String(b+1),x,359,9,current ? '#6c4c28' : '#90808b',current ? 900 : 700);
      }
      let noteIndex=0;
      for (const symbol of this.measure.symbols){
        const pattern=PATTERNS[symbol.kind];
        for (const [offset,duration] of pattern.rests || []) this.drawRest(this.notationX(symbol.beat+offset),duration);
        for (const [offset,duration] of pattern.notes){
            const onset=symbol.beat+offset, nx=this.notationX(onset);
            const note=this.result && this.result.notes[noteIndex];
            const active=beat-phaseStart>=onset && beat-phaseStart<onset+Math.min(duration,.25);
            const color=showResult && note ? COLORS[note.status] : active ? '#7355bc' : COLORS.ink;
            if (active){ this.ellipse(nx,321,duration===.25 ? 8 : 12,10,'#d9c9ff'); }
            c.save(); c.translate(nx,321); c.rotate(-.35);
            this.ellipse(0,0,duration===.25 ? 5.5 : 6.5,4.6,duration===2 ? '#fff8e7' : color,duration===2 ? color : null,2); c.restore();
            if (duration===1.5 || duration===.75) this.ellipse(nx+10,316,1.8,1.8,color);
            c.strokeStyle=color; c.lineWidth=2.2; c.beginPath(); c.moveTo(nx+5,321); c.lineTo(nx+5,287); c.stroke();
            if (duration<1 && !pattern.beam){
              c.fillStyle=color; c.beginPath(); c.moveTo(nx+5,287);
              c.bezierCurveTo(nx+6,298,nx+21,296,nx+12,312);
              c.bezierCurveTo(nx+17,299,nx+6,303,nx+5,296); c.closePath(); c.fill();
            }
            if (showResult && note){
              const mark={correct:'✓',missed:'×',early:'←',late:'→'}[note.status];
              this.text(mark,nx,343,duration===.25 ? 10 : 12,color,900);
            }
            noteIndex++;
        }
        if (pattern.beam){
          const beam=(from,to,y)=>{
            c.strokeStyle=COLORS.ink; c.lineWidth=4; c.beginPath();
            c.moveTo(this.notationX(symbol.beat+from)+5,y); c.lineTo(this.notationX(symbol.beat+to)+5,y); c.stroke();
          };
          beam(pattern.notes[0][0],pattern.notes[pattern.notes.length-1][0],288);
          const sixteenths=pattern.notes.filter(n=>n[1]===.25);
          if (sixteenths.length>1) beam(sixteenths[0][0],sixteenths[sixteenths.length-1][0],295);
          else if (sixteenths.length===1){
            const onset=sixteenths[0][0];
            const hook=onset===pattern.notes[0][0] ? onset+.125 : onset-.125;
            beam(Math.min(onset,hook),Math.max(onset,hook),295);
          }
        }
      }
      // Extra taps sit underneath their musical position, separate from note marks.
      if (showResult) for (const index of this.result.extras){
        const x=Math.max(76,Math.min(318,this.notationX(this.taps[index]/this.beat)));
        this.text('+',x,369,10,COLORS.missed,900);
      }
    }

    drawRest(x,duration){
      const c=this.ctx;
      if (duration===2){ c.fillStyle=COLORS.ink; c.fillRect(x-5,315,12,6); return; }
      if (duration===.5){
        this.ellipse(x-1,305,3.6,3,COLORS.ink);
        c.strokeStyle=COLORS.ink; c.lineWidth=2;
        c.beginPath(); c.moveTo(x-2,306); c.quadraticCurveTo(x+6,311,x+7,301); c.lineTo(x-1,329); c.stroke();
        return;
      }
      // Engraved quarter-rest outline, independent of installed music fonts.
      c.save(); c.translate(x,310); c.fillStyle=COLORS.ink; c.beginPath();
      c.moveTo(-3,-12); c.lineTo(6,-3); c.lineTo(1,4); c.lineTo(7,12);
      c.bezierCurveTo(-3,6,-4,14,1,18); c.bezierCurveTo(-10,14,-8,4,0,6);
      c.lineTo(-6,-1); c.lineTo(0,-7); c.closePath(); c.fill(); c.restore();
    }

    drawBeatDots(beat,phase){
      const c=this.ctx;
      const counting=phase.id==='count-demo' || phase.id==='count-player';
      const currentBeat=this.activeBeat(beat);
      for (let i=0;i<4;i++){
        const current=currentBeat===i;
        this.ellipse(141+i*26,389,current ? 10 : 8,current ? 10 : 8,current ? '#ffe1a0' : '#4a3b62');
        this.text(String(i+1),141+i*26,393,10,current ? '#382d49' : '#cbc0db',800);
      }
      if (counting) this.text('COUNT',99,393,8,'#c9b9d9',800);
    }

    drawDrum(now){
      const c=this.ctx, hit=Math.max(0,1-(now-this.flash)/.18);
      this.ellipse(180,562,143,26,'#0b102299');
      // Shell, chrome lugs, and a large foreshortened snare head.
      const shell=c.createLinearGradient(60,0,300,0);
      shell.addColorStop(0,'#68486e'); shell.addColorStop(.3,'#be759c'); shell.addColorStop(.75,'#895f9d'); shell.addColorStop(1,'#463d69');
      c.fillStyle=shell; c.beginPath(); c.ellipse(180,511,117,53,0,0,Math.PI);
      c.lineTo(63,486); c.lineTo(297,486); c.closePath(); c.fill();
      this.ellipse(180,518,117,43,'#00000000','#b6a4ce',4);
      for (const x of [77,113,180,247,283]){
        this.box(x-3,509+Math.sqrt(Math.max(0,1-((x-180)/120)**2))*22,6,22,2,'#c7bbda','#675b7d');
      }
      const head=c.createRadialGradient(169,475,4,180,485,120);
      head.addColorStop(0,hit>0 ? '#ffefc3' : '#fff3db'); head.addColorStop(.85,'#d5cee5'); head.addColorStop(1,'#9a91b2');
      this.ellipse(180,485,120,61,'#44415e','#b6b0cc',5);
      this.ellipse(180,485,112,54,head,'#eee8f9',2);
      this.ellipse(180,485,101,45,'#ffffff00','#aaa0be55',1);
      this.text('PIANOQUEST',180,503,8,'#8a829e',800);
      if (hit>0 && !this.reducedMotion) this.ellipse(180,477,15+(1-hit)*50,6+(1-hit)*20,'#ffffff00',`rgba(255,226,155,${hit})`,2);
      this.sticks.forEach((time,i)=>{
        const age=now-time;
        const swing=age>=0 && age<.18 ? Math.sin(age/.18*Math.PI) : 0;
        const left=i===0;
        c.save(); c.translate(left ? 76 : 284,561);
        c.rotate((left ? .65 : -.65)+(left ? 1 : -1)*swing*.22);
        c.shadowColor='#0007'; c.shadowBlur=5; c.shadowOffsetY=4;
        c.strokeStyle='#8d5e43'; c.lineWidth=10; c.lineCap='round';
        c.beginPath(); c.moveTo(0,0); c.lineTo(0,-112+swing*15); c.stroke();
        c.strokeStyle='#f1c58d'; c.lineWidth=7; c.stroke();
        this.ellipse(0,-118+swing*15,4.5,8,'#ffe0ad'); c.restore();
      });
    }
  }

  const api = {LEVELS, CAMPAIGN, getRunSettings, generateMeasure, renderNotationGuide, evaluatePerformance, Concert};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RhythmConcert = api;
})(typeof window !== 'undefined' ? window : globalThis);
