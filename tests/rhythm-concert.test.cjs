const {test} = require('node:test');
const assert = require('node:assert/strict');
const {LEVELS, CAMPAIGN, getRunSettings, generateMeasure, renderNotationGuide, evaluatePerformance, Concert} = require('../rhythm-concert.js');

test('beginner measures fill 4/4 with valid quarter beats and beamed eighth pairs', ()=>{
  let seed=397;
  const random=()=>{ seed=(seed*1664525+1013904223)>>>0; return seed/2**32; };
  const seen=new Set();
  for (let i=0;i<1000;i++){
    const measure=generateMeasure(LEVELS.beginner,random);
    assert.equal(measure.symbols.reduce((sum,s)=>sum+s.duration,0),4);
    assert.ok(measure.onsets.length>=2 && measure.onsets.length<=8);
    assert.ok(measure.onsets.every(b=>b>=0 && b<4 && Number.isInteger(b*2)));
    assert.ok(measure.symbols.filter(s=>s.kind==='rest').length<=2);
    assert.equal(new Set(measure.onsets).size,measure.onsets.length);
    seen.add(JSON.stringify(measure.symbols));
  }
  assert.ok(seen.size>20);
});

test('opening measures teach quarters, then rests and eighth pairs', ()=>{
  assert.deepEqual(generateMeasure(undefined,undefined,1).onsets,[0,1,2,3]);
  assert.deepEqual(generateMeasure(undefined,undefined,2).onsets,[0,2,2.5,3]);
});

test('forgiving beginner window accepts early/late hits without requiring perfection', ()=>{
  const result=evaluatePerformance([0,.75,1.5,2.25],[-.15,.89,1.48,2.4]);
  assert.equal(result.perfect,true);
  assert.equal(result.accuracy,1);
});

test('timing feedback distinguishes early, late, missed, and extra taps', ()=>{
  const result=evaluatePerformance([0,.75,1.5,2.25],[.2,.55,2.9]);
  assert.deepEqual(result.notes.map(n=>n.status),['late','early','missed','missed']);
  assert.equal(result.extras.length,1);
  assert.equal(result.perfect,false);
});

test('one tap cannot satisfy two eighth notes and extra taps reduce points', ()=>{
  const one=evaluatePerformance([0,.375],[.16]);
  assert.equal(one.correct,1);
  assert.equal(one.missed,1);
  const clean=evaluatePerformance([0,.375],[0,.375]);
  const spam=evaluatePerformance([0,.375],[0,.375,.1,.2,.5]);
  assert.equal(spam.correct,2);
  assert.equal(spam.extras.length,3);
  assert.ok(spam.accuracy<clean.accuracy);
});

test('silence, taps in rests, boundary windows, and unsorted taps are evaluated safely', ()=>{
  assert.equal(evaluatePerformance([0,.75],[]).missed,2);
  const rest=evaluatePerformance([0,1.5],[0,.75,1.5]);
  assert.equal(rest.extras.length,1);
  assert.equal(evaluatePerformance([0],[.16]).correct,1);
  assert.equal(evaluatePerformance([0],[.26]).near,1);
  assert.equal(evaluatePerformance([0],[.261]).missed,1);
  assert.equal(evaluatePerformance([0,.75],[.75,0]).perfect,true);
});

test('extra hits cost three quarters of a note and can turn a round into an audience loss', ()=>{
  const h=harness(),c=h.concert;
  c.taps=[0,.75,1.5,2.25,.3,1.05];h.seek(18.3);c.evaluate();
  assert.equal(c.result.correct,4);
  assert.equal(c.result.extras.length,2);
  assert.equal(c.result.accuracy,.625);
  assert.equal(c.score,63);
  assert.equal(c.crowd,43);
  assert.equal(c.events.filter(e=>e.sound==='cheer' || e.sound==='boo').length,0);
  assert.equal(evaluatePerformance([0],[0,.3,.6,.9]).accuracy,0);
  c.stop();
});

function harness(selection){
  const ac={currentTime:0,state:'running',resume:async()=>{ac.state='running';}};
  let ended=0, scored=0;
  const results=[];
  const concert=new Concert({canvas:{getContext:()=>({})},getAudioContext:()=>ac,
    getVolume:()=>.55,onStart:()=>{},onResult:()=>scored++,onEnd:result=>{ended++;results.push(result);},announce:()=>{}});
  concert.audio=ac;
  concert.active=true;
  const sounds=[];
  concert.sound=(time,kind='snare')=>sounds.push({time,kind});
  if (selection!==undefined){
    concert.selection=selection;
    concert.run=getRunSettings(selection);
    concert.level=concert.run.rules;
    concert.beat=60/concert.level.bpm;
  }
  concert.beginRound();
  const seek=beat=>{
    ac.currentTime=concert.origin+beat*concert.beat;
    concert.lastClock=ac.currentTime;
  };
  return {concert,ac,sounds,seek,results,ended:()=>ended,scored:()=>scored};
}

test('campaign and Survival starts and retries reset the audience to neutral', async()=>{
  const h=harness(),c=h.concert;
  assert.equal(c.crowd,50);
  c.makeNoise=()=>{};
  for(const selection of [1,'survival',1]){
    c.crowd=3;
    assert.equal(await c.start(selection),true);
    assert.equal(c.crowd,50);
    c.stop();
  }
});

test('input uses the audio clock, ignores demonstration/count-in, records early first taps', ()=>{
  const h=harness(), c=h.concert;
  h.seek(7); c.tap(); assert.equal(c.taps.length,0);
  h.seek(12); c.tap(); assert.equal(c.taps.length,0);
  h.seek(14-.15/c.beat); c.tap(); assert.ok(Math.abs(c.taps[0]+.15)<1e-9);
  h.seek(15); c.tap(); assert.ok(Math.abs(c.taps[1]-.75)<1e-9);
  assert.equal(h.sounds.length,4);
  c.stop();
});

test('evaluation preserves every original tap offset for replay, including extras', ()=>{
  const h=harness(), c=h.concert;
  c.events=[];
  c.taps=[-.1,.75,1.2,1.5,2.3];
  h.seek(18.3); c.schedule();
  const replay=c.events.filter(e=>e.visual?.type==='replay');
  assert.equal(replay.length,5);
  replay.forEach((event,i)=>assert.ok(Math.abs(event.time-(c.origin+20*c.beat+c.taps[i]))<1e-9));
  assert.equal(h.scored(),1);
  c.schedule(); assert.equal(h.scored(),1);
  c.stop();
});

test('pause cancels audio, discards unfinished taps, and resumes the same unscored measure', async()=>{
  const h=harness(), c=h.concert;
  const measure=c.measure;
  let stopped=false;
  c.sources.add({stop:()=>{stopped=true;}});
  h.seek(15); c.tap();
  c.pause();
  assert.equal(stopped,true);
  assert.equal(c.events.length,0);
  c.tap(); assert.equal(c.taps.length,1);
  await c.resume();
  assert.equal(c.round,1);
  assert.equal(c.measure,measure);
  assert.equal(c.taps.length,0);
  assert.equal(c.crowd,50);
  c.stop();
});

test('resuming after feedback advances without awarding points twice', async()=>{
  const h=harness(), c=h.concert;
  c.taps=[0,.75,1.5,2.25]; c.evaluate();
  assert.equal(c.score,125);
  c.pause(); await c.resume();
  assert.equal(c.round,2);
  assert.equal(c.score,125);
  assert.equal(h.scored(),1);
  c.stop();
});

test('repeated poor measures end the concert after replay; success restores enthusiasm', ()=>{
  const h=harness(), c=h.concert;
  c.taps=[0,.75,1.5,2.25]; c.evaluate();
  assert.equal(c.crowd,65);
  for (let i=0;i<5;i++){
    c.beginRound(); c.evaluate(); h.seek(26.1); c.update();
    if (!c.active) break;
  }
  assert.equal(c.crowd,0);
  assert.equal(h.ended(),1);
  assert.equal(c.active,false);
  c.stop();
});

test('scheduler interruptions pause rather than penalize or bunch stale drum hits', ()=>{
  const h=harness(), c=h.concert;
  h.ac.currentTime+=2; c.schedule();
  assert.equal(c.paused,true);
  assert.equal(c.crowd,50);
  assert.equal(h.scored(),0);
  c.stop();
});

test('automatic measures stay on the same beat grid regardless of mistakes', ()=>{
  const h=harness(), c=h.concert, origin=c.origin;
  c.evaluate(); h.seek(26.02); c.update();
  assert.ok(Math.abs(c.origin-(origin+26*c.beat))<1e-9);
  assert.equal(c.round,2);
  c.stop();
});

test('leaving while audio unlocks cancels the pending start', async()=>{
  const h=harness(), c=h.concert;
  let unlock;
  h.ac.resume=()=>new Promise(resolve=>{unlock=resolve;});
  const starting=c.start();
  c.stop(); unlock();
  assert.equal(await starting,false);
  assert.equal(c.active,false);
});

test('all difficulties generate valid, bounded 4/4 bars with their own rhythm vocabulary', ()=>{
  let seed=4183;
  const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/2**32;};
  for (const [id,level] of Object.entries(LEVELS)){
    const seen=new Set();
    for (let round=1;round<=1000;round++){
      const m=generateMeasure(level,random,round);
      assert.equal(m.beats,4);
      assert.equal(m.symbols.reduce((sum,s)=>sum+s.duration,0),4);
      assert.ok(m.onsets.length>=2 && m.onsets.length<=12);
      assert.equal(new Set(m.onsets).size,m.onsets.length);
      const grid=id==='advanced' ? 4 : 2;
      assert.ok(m.onsets.every(b=>b>=0 && b<4 && Number.isInteger(b*grid)));
      let beat=0, silence=0;
      for (const s of m.symbols){
        assert.ok(level.patterns.includes(s.kind));
        assert.equal(s.beat,beat);
        if (s.duration===2) assert.equal(s.beat%2,0,'long patterns align with half-bars');
        silence+=s.kind==='rest'?1:s.kind==='half-rest'?2:s.kind==='offbeat'?.5:0;
        beat+=s.duration;
        seen.add(s.kind);
      }
      assert.ok(silence<=level.maxRests);
      assert.ok(m.symbols.filter(s=>s.kind.includes('sixteenth')).length<=level.maxFastGroups);
    }
    for (const pattern of level.patterns) assert.ok(seen.has(pattern),`${id} introduces ${pattern}`);
  }
});

test('higher-level introductions include half notes, syncopation, and sixteenth subdivisions', ()=>{
  assert.deepEqual(generateMeasure(LEVELS.intermediate,undefined,1).onsets,[0,2,3]);
  assert.deepEqual(generateMeasure(LEVELS.intermediate,undefined,2).onsets,[0,.5,1.5,2.5,3,3.5]);
  assert.deepEqual(generateMeasure(LEVELS.advanced,undefined,1).onsets,[0,.25,.5,.75,1,2,2.5,3]);
  assert.deepEqual(generateMeasure(LEVELS.advanced,undefined,2).onsets,[0,.5,.75,1.5,2,2.5,3.5]);
});

test('review points count upward, grow, and settle before the next bar on every difficulty', ()=>{
  for (const level of Object.values(LEVELS)){
    const h=harness(),c=h.concert;
    c.level=level;c.beat=60/level.bpm;c.beginRound(false);
    c.score=200;
    c.taps=c.measure.onsets.map(b=>b*c.beat);
    h.seek(18.3);c.evaluate();
    assert.equal(c.score,325,'actual score is committed once');
    const a=c.scoreAnimation;
    const start=c.scorePresentation(a.start), middle=c.scorePresentation((a.start+a.end)/2);
    const end=c.scorePresentation(a.end), next=c.scorePresentation(a.settleEnd);
    assert.deepEqual(start,{total:200,earned:0,scale:1});
    assert.ok(middle.total>200 && middle.total<325);
    assert.ok(middle.earned>0 && middle.earned<125);
    assert.ok(middle.scale>1 && middle.scale<end.scale);
    assert.equal(end.total,325);
    assert.equal(end.earned,125);
    assert.equal(next.scale,1);
    assert.equal(c.scorePresentation(c.origin+26*c.beat).scale,1);
    assert.equal(h.scored(),1);
    c.beginRound();assert.equal(c.scorePresentation(h.ac.currentTime).total,325);
    assert.equal(c.scorePresentation(h.ac.currentTime).scale,1);
    c.stop();
  }
});

test('zero points and reduced-motion preferences do not enlarge numbers', ()=>{
  const h=harness(),c=h.concert;
  h.seek(18.3);c.evaluate();
  assert.equal(c.scorePresentation(c.origin+22*c.beat).scale,1);
  c.beginRound();c.reducedMotion=true;
  c.taps=c.measure.onsets.map(b=>b*c.beat);h.seek(18.3);c.evaluate();
  const points=c.scorePresentation(c.origin+22*c.beat);
  assert.ok(points.earned>0);
  assert.equal(points.scale,1);
  c.stop();
});

test('each good performance queues cheers; perfect performances get a bigger reaction', ()=>{
  const h=harness(),c=h.concert;
  c.taps=[0,.75,1.5];h.seek(18.3);c.evaluate();
  assert.equal(c.events.filter(e=>e.sound==='cheer').length,1);
  const acceptableClaps=c.events.filter(e=>e.sound==='applause').length;
  c.beginRound(false);c.taps=[0,.75,1.5,2.25];h.seek(18.3);c.evaluate();
  assert.equal(c.events.filter(e=>e.sound==='cheer').length,2);
  assert.ok(c.events.filter(e=>e.sound==='applause').length>acceptableClaps);
  const count=c.events.length;c.evaluate();assert.equal(c.events.length,count);
  c.beginRound(false);h.seek(18.3);c.evaluate();
  assert.equal(c.events.filter(e=>e.sound==='cheer').length,0);
  c.stop();
});

test('bad failures draw boos once, drain the neutral audience, and end after replay', ()=>{
  const h=harness(1),c=h.concert;
  for(const crowd of [28,6,0]){
    h.seek(18.3);c.evaluate();
    assert.equal(c.crowd,crowd);
    assert.match(c.reaction,/boos/);
    assert.equal(c.events.filter(e=>e.sound==='boo').length,1);
    assert.equal(c.events.filter(e=>e.sound==='cheer' || e.sound==='applause').length,0);
    const count=c.events.length;c.evaluate();assert.equal(c.events.length,count);
    h.seek(24.5);c.update();assert.equal(c.active,true);
    h.seek(26.01);c.update();
  }
  assert.equal(c.active,false);
  assert.equal(c.completedRounds,3);
  assert.equal(h.results[0].won,false);
  c.stop();
});

test('pause/resume retains difficulty and awarded points without restarting the score animation', async()=>{
  const h=harness(),c=h.concert;
  c.level=LEVELS.advanced;c.beat=60/c.level.bpm;c.beginRound(false);
  c.taps=c.measure.onsets.map(b=>b*c.beat);h.seek(18.3);c.evaluate();
  c.pause();await c.resume();
  assert.equal(c.level,LEVELS.advanced);
  assert.equal(c.beat,.6);
  assert.equal(c.score,125);
  assert.deepEqual(c.scorePresentation(h.ac.currentTime),{total:125,earned:0,scale:1});
  c.stop();
});

test('beat numbers align with noteheads and rest positions on the score time axis', ()=>{
  const h=harness(),c=h.concert;
  let seed=197;
  const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/2**32;};
  const labels=[],heads=[],rests=[];
  c.ctx=new Proxy({}, {get:(target,key)=>target[key] || (()=>{})});
  c.ctx.translate=(x,y)=>{if(y===321)heads.push(x);};
  c.box=()=>{};c.ellipse=()=>{};
  c.text=(value,x,y)=>{if(y===359)labels.push(x);};
  c.drawRest=x=>rests.push(x);
  for (const level of Object.values(LEVELS)) for (let round=1;round<=100;round++){
    labels.length=0;heads.length=0;rests.length=0;
    c.measure=generateMeasure(level,random,round);
    c.drawNotation(0,false);
    assert.deepEqual(labels,[84,143,202,261]);
    assert.deepEqual(heads,c.measure.onsets.map(b=>84+b*59));
    for(const s of c.measure.symbols){
      if(s.kind==='rest' || s.kind==='half-rest' || s.kind==='offbeat') assert.ok(rests.includes(labels[s.beat]));
    }
    for(let beat=0;beat<4;beat++){
      const head=c.measure.onsets.indexOf(beat);
      if(head>=0)assert.equal(labels[beat],heads[head],'quarter-beat labels sit directly under their noteheads');
    }
  }
  c.stop();
});

test('score beat highlights and count-in indicators follow scheduled audio beats at every tempo', ()=>{
  for(const level of Object.values(LEVELS)){
    const h=harness(),c=h.concert;
    c.level=level;c.beat=60/level.bpm;c.beginRound(false);
    for(const [phase,start] of [['count-demo',2],['listen',6],['count-player',10],['play',14],['replay',20]]){
      c.phase=phase;
      for(let beat=0;beat<4;beat++){
        const event=c.events.find(e=>Math.abs(e.time-(c.origin+(start+beat)*c.beat))<1e-9 && ['click','accent'].includes(e.sound));
        if(phase!=='replay')assert.ok(event,`${phase} has a pulse for beat ${beat+1}`);
        const time=event ? event.time : c.origin+(start+beat)*c.beat;
        assert.equal(c.activeBeat((time-c.origin)/c.beat),beat);
        assert.equal(c.activeBeat(start+beat+.99),beat);
      }
      assert.equal(c.activeBeat(start-.01),-1);
      assert.equal(c.activeBeat(start+4),-1);
    }
    for(const phase of ['new','feedback','next']){c.phase=phase;assert.equal(c.activeBeat(0),-1);}
    c.stop();
  }
});

test('ten campaign levels have valid introductory and random bars within their own rules', ()=>{
  assert.equal(CAMPAIGN.length,10);
  let seed=241;
  const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/2**32;};
  for (const campaign of CAMPAIGN){
    const run=getRunSettings(campaign.id);
    assert.equal(run.mode,'level');assert.equal(run.levelId,campaign.id);
    assert.ok(run.rounds>=4 && run.rounds<=8);
    for(let round=1;round<=200;round++){
      const measure=generateMeasure(run.rules,random,round);
      assert.equal(measure.symbols.reduce((n,s)=>n+s.duration,0),4);
      assert.ok(measure.onsets.length>=2 && measure.onsets.length<=16);
      assert.ok(measure.onsets.every(b=>b>=0 && b<4));
      assert.ok(measure.symbols.every(s=>run.rules.patterns.includes(s.kind)));
      assert.ok(measure.symbols.filter(s=>s.kind.includes('sixteenth')).length<=run.rules.maxFastGroups);
    }
  }
  for(const selection of [0,11,-1,1.5,'beginner'])assert.throws(()=>getRunSettings(selection));
});

test('level 1 keeps its steady introduction then varies a single rest without consecutive repeats', ()=>{
  const rules=getRunSettings(1).rules;
  assert.deepEqual(generateMeasure(rules,()=>0,1).onsets,[0,1,2,3]);
  const seen=new Set();
  for(const random of [()=>0,()=>.25,()=>.5,()=>.999]){
    let previous=generateMeasure(rules,random,1);
    for(let round=2;round<=4;round++){
      const measure=generateMeasure(rules,random,round,previous);
      assert.equal(measure.onsets.length,3);
      assert.equal(measure.symbols.filter(s=>s.kind==='rest').length,1);
      assert.ok(measure.onsets.every(Number.isInteger));
      assert.notDeepEqual(measure.symbols,previous.symbols);
      seen.add(measure.symbols.find(s=>s.kind==='rest').beat);
      previous=measure;
    }
  }
  assert.equal(seen.size,4,'the rest can fall on any beat');
  const h=harness(1),c=h.concert;
  for(let round=2;round<=4;round++){
    const previous=c.measure;
    c.beginRound();
    assert.equal(c.measure.onsets.length,3);
    assert.notDeepEqual(c.measure.symbols,previous.symbols);
  }
  c.stop();
});

test('each pre-level notation guide contains exactly its playable vocabulary and staff symbols', ()=>{
  for(const {id} of CAMPAIGN){
    const run=getRunSettings(id),html=renderNotationGuide(id);
    const symbols=[...html.matchAll(/data-rhythm-symbol="([^"]+)"/g)].map(match=>match[1]);
    assert.deepEqual(symbols,[...run.rules.patterns,'time-signature','percussion-clef']);
    assert.equal((html.match(/<svg /g)||[]).length,symbols.length);
    assert.ok(html.includes(run.rounds+' rounds'));
    assert.ok(html.includes(run.rules.bpm+' BPM'));
    assert.ok(!html.includes('Listen.</strong>'));
  }
  const survival=renderNotationGuide('survival');
  for(const kind of getRunSettings('survival',64).rules.patterns){
    assert.ok(survival.includes(`data-rhythm-symbol="${kind}"`));
  }
  assert.ok(survival.includes('Endless rounds'));
  assert.ok(survival.includes('80–140 BPM'));
});

test('finite levels count only scored rounds and finish once after final review', ()=>{
  const h=harness(1),c=h.concert,total=c.run.rounds;
  assert.equal(c.roundsLeft(),4);
  for(let round=1;round<=total;round++){
    assert.equal(c.round,round);
    assert.equal(c.roundsLeft(),total-round+1);
    c.taps=c.measure.onsets.map(b=>b*c.beat);h.seek(18.3);c.evaluate();
    assert.equal(c.roundsLeft(),total-round);
    c.evaluate();assert.equal(c.completedRounds,round);
    h.seek(24.5);c.update();assert.equal(c.active,true,'complete the replay before ending');
    h.seek(26.01);c.update();
  }
  assert.equal(c.active,false);assert.equal(c.round,4);assert.equal(c.score,500);
  assert.equal(h.results.length,1);assert.equal(h.results[0].won,true);
  assert.equal(h.results[0].levelId,1);assert.equal(h.results[0].rounds,4);
  c.update();assert.equal(h.results.length,1);c.stop();
});

test('empty audience ends a campaign without awarding a clear, even on its final round', ()=>{
  const h=harness(1),c=h.concert;
  c.crowd=88; // Four bad rounds drain exactly 88, testing the final-round boundary.
  for(let round=0;round<4;round++){h.seek(18.3);c.evaluate();h.seek(26.01);c.update();}
  assert.equal(c.crowd,0);assert.equal(c.roundsLeft(),0);
  assert.equal(h.results[0].won,false);assert.equal(c.active,false);c.stop();
});

test('resuming after final evaluation finishes the level without creating a phantom round', async()=>{
  const h=harness(1),c=h.concert;
  for(let round=0;round<3;round++){
    c.taps=c.measure.onsets.map(b=>b*c.beat);h.seek(18.3);c.evaluate();h.seek(26.01);c.update();
  }
  c.taps=c.measure.onsets.map(b=>b*c.beat);h.seek(18.3);c.evaluate();c.pause();await c.resume();
  assert.equal(c.round,4);assert.equal(c.completedRounds,4);assert.equal(c.score,500);
  assert.equal(h.results.length,1);assert.equal(h.results[0].won,true);c.stop();
});

test('Survival escalates musical vocabulary and BPM with a playable tempo cap', ()=>{
  let last=0;
  for(let round=1;round<=100;round++){
    const run=getRunSettings('survival',round);
    assert.equal(run.rounds,null);assert.equal(run.mode,'survival');
    assert.equal(run.rules.bpm,Math.min(140,80+(round-1)*2));
    assert.ok(run.rules.bpm>=last);last=run.rules.bpm;
    assert.equal(run.difficulty,round<=4?'beginner':round<=8?'intermediate':'advanced');
    assert.ok(run.rules.hitWindow<=LEVELS[run.difficulty].hitWindow);
    const measure=generateMeasure(run.rules,undefined,run.introRound);
    assert.equal(measure.symbols.reduce((sum,s)=>sum+s.duration,0),4);
    if(round>=9)assert.ok(run.rules.hitWindow<60/run.rules.bpm/8,'sixteenth hit windows stay distinct');
  }
  assert.equal(getRunSettings('survival',5).introRound,1);
  assert.equal(getRunSettings('survival',9).introRound,1);
  assert.equal(getRunSettings('survival',25).rules.maxFastGroups,4);
});

test('Survival changes tempo between rounds and preserves each musical boundary', ()=>{
  const h=harness('survival'),c=h.concert;
  for(let round=1;round<=12;round++){
    const oldBeat=c.beat, nextBoundary=c.origin+26*oldBeat;
    assert.equal(c.roundsLeft(),null);
    c.taps=c.measure.onsets.map(b=>b*c.beat);h.seek(18.3);c.evaluate();
    assert.equal(c.beat,oldBeat,'no speed change while a measure is being played or reviewed');
    h.seek(26.001);c.update();
    assert.equal(c.origin,nextBoundary);
    assert.equal(c.round,round+1);
    assert.equal(c.level.bpm,80+round*2);
    const firstCount=c.events.find(e=>e.sound==='accent');
    assert.ok(Math.abs(firstCount.time-(nextBoundary+2*c.beat))<1e-9);
    assert.equal(h.ended(),0);
  }
  c.stop();
});

test('pausing an unfinished Survival round preserves tempo, difficulty, and rounds played', async()=>{
  const h=harness('survival'),c=h.concert;
  h.seek(15);c.tap();c.pause();await c.resume();
  assert.equal(c.round,1);assert.equal(c.completedRounds,0);assert.equal(c.level.bpm,80);
  assert.equal(c.run.difficulty,'beginner');assert.equal(c.roundsLeft(),null);
  c.stop();
});

test('the final review settles all awarded points before the result screen, even after pause', async()=>{
  const h=harness(1),c=h.concert;
  c.completedRounds=c.run.rounds-1;
  c.taps=c.measure.onsets.map(b=>b*c.beat);h.seek(18.3);c.evaluate();
  assert.equal(c.scorePresentation(h.ac.currentTime).total,0);
  c.pause();await c.resume();
  assert.equal(c.active,false);
  assert.deepEqual(c.scorePresentation(h.ac.currentTime),{total:125,earned:125,scale:1});
  c.stop();
});

test('fast Survival applause and voiced cheers finish before the student replay starts', ()=>{
  const h=harness('survival'),c=h.concert;
  c.run=getRunSettings('survival',100);c.level=c.run.rules;c.beat=60/c.level.bpm;
  c.taps=c.measure.onsets.map(b=>b*c.beat);h.seek(18.3);c.evaluate();
  const stops=[];
  const parameter=()=>({setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){},value:0});
  const node=()=>({connect(){},disconnect(){},start(){},stop(time){if(time!==undefined)stops.push(time);},
    frequency:parameter(),Q:parameter(),gain:parameter()});
  Object.assign(h.ac,{createOscillator:node,createGain:node,createBiquadFilter:node,createBufferSource:node,destination:{}});
  c.noise={};
  for(const event of c.events.filter(e=>e.sound==='cheer' || e.sound==='applause')){
    Concert.prototype.sound.call(c,event.time,event.sound);
  }
  assert.ok(stops.length>=10);
  assert.ok(Math.max(...stops)<=c.origin+20*c.beat-.039);
  c.stop();
});

test('boos use descending voices, respect mute, and finish before an early replay tap at every tempo', ()=>{
  for(const round of [1,9,100]){
    const h=harness('survival'),c=h.concert;
    c.run=getRunSettings('survival',round);c.level=c.run.rules;c.beat=60/c.level.bpm;
    c.taps=[-c.level.hitWindow];h.seek(18.3);c.evaluate();
    const events=c.events.filter(e=>e.sound==='boo');
    assert.equal(events.length,1);
    const stops=[],pitches=[];
    const parameter=()=>({setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){},value:0});
    const node=()=>({connect(){},disconnect(){},start(){},stop(time){if(time!==undefined)stops.push(time);},
      frequency:parameter(),Q:parameter(),gain:parameter()});
    h.ac.createOscillator=()=>{
      const oscillator=node(),values=[];
      oscillator.frequency.setValueAtTime=value=>values.push(value);
      oscillator.frequency.exponentialRampToValueAtTime=value=>values.push(value);
      pitches.push(values);return oscillator;
    };
    Object.assign(h.ac,{createGain:node,createBiquadFilter:node,destination:{}});
    Concert.prototype.sound.call(c,events[0].time,'boo');
    assert.equal(stops.length,3);
    assert.ok(pitches.every(values=>values.at(-1)<values[0]));
    assert.ok(Math.max(...stops)<=c.origin+20*c.beat+c.taps[0]-.039);
    c.getVolume=()=>0;
    Concert.prototype.sound.call(c,events[0].time,'boo');
    assert.equal(stops.length,3,'muted effects create no voices');
    c.pause();assert.equal(c.events.length,0);assert.equal(c.sources.size,0);
    c.stop();
  }
});

test('Survival caps at 140 BPM and introduces dotted quarters, eighths, and harder combinations', ()=>{
  assert.equal(getRunSettings('survival',30).rules.bpm,138);
  for(const round of [31,32,40,48,64,100,1000])assert.equal(getRunSettings('survival',round).rules.bpm,140);
  assert.ok(!getRunSettings('survival',31).rules.patterns.some(k=>k.includes('dotted')));
  assert.ok(getRunSettings('survival',32).rules.patterns.includes('dotted-quarter'));
  assert.ok(!getRunSettings('survival',39).rules.patterns.includes('dotted-eighth'));
  assert.ok(getRunSettings('survival',40).rules.patterns.includes('dotted-eighth'));
  assert.ok(getRunSettings('survival',48).rules.patterns.includes('reverse-dotted-eighth'));
  assert.equal(getRunSettings('survival',48).rules.minDottedGroups,2);
  assert.equal(getRunSettings('survival',64).rules.minDottedGroups,3);
  for(const campaign of CAMPAIGN)assert.ok(!getRunSettings(campaign.id).rules.patterns.some(k=>k.includes('dotted')));
});

test('dotted introductions have exact musical durations and preserve the quarter-beat time axis', ()=>{
  const expected=new Map([[32,[0,1.5,2,3]],[40,[0,.75,1,2,3.5]],[48,[0,.5,2,2.25,3]],[49,[0,.75,1,1.25,2.5,3]]]);
  for(const [round,onsets] of expected){
    const run=getRunSettings('survival',round);
    const m=generateMeasure(run.rules,undefined,run.introRound);
    assert.deepEqual(m.onsets,onsets);
    assert.equal(m.symbols.reduce((sum,s)=>sum+s.duration,0),4);
    for(const note of m.notes){
      assert.ok([.25,.5,.75,1,1.5,2].includes(note.duration));
      assert.equal(note.beat*4,Math.round(note.beat*4));
    }
  }
});

test('late Survival bars contain the required dotted groups without dotted sixteenths or faster notes', ()=>{
  let seed=5241;
  const seeded=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/2**32;};
  const seen=new Set();
  for(const round of [32,33,34,39,40,41,42,47,48,49,50,63,64,80,100,1000]){
    const run=getRunSettings('survival',round);
    for(const random of [()=>0,()=>.999999,()=>.5,seeded])for(let i=0;i<100;i++){
      const m=generateMeasure(run.rules,random,run.introRound);
      assert.equal(m.symbols.reduce((n,s)=>n+s.duration,0),4);
      const restBeats=m.symbols.reduce((n,s)=>n+(s.kind==='rest'?1:s.kind==='half-rest'?2:s.kind==='offbeat'?.5:0),0);
      assert.equal(m.notes.reduce((sum,n)=>sum+n.duration,0)+restBeats,4);
      assert.ok(m.symbols.filter(s=>s.kind.includes('dotted')).length>=run.rules.minDottedGroups);
      assert.ok(m.notes.every(n=>n.duration>=.25 && Number.isInteger(n.duration*4)));
      assert.ok(m.onsets.every((b,index)=>index===0 || b-m.onsets[index-1]>=.25));
      assert.ok(4-m.onsets[m.onsets.length-1]>=.25);
      m.symbols.filter(s=>s.kind.includes('dotted')).forEach(s=>seen.add(s.kind));
    }
  }
  assert.deepEqual([...seen].sort(),['dotted-eighth','dotted-quarter','reverse-dotted-eighth','reverse-dotted-quarter']);
});

test('dotted notation draws augmentation dots and inward secondary beam hooks for single sixteenths', ()=>{
  const h=harness(),c=h.concert;
  const dots=[],segments=[];let from;
  c.ctx=new Proxy({}, {get:(target,key)=>target[key] || (()=>{})});
  c.ctx.moveTo=(x,y)=>{from={x,y};};
  c.ctx.lineTo=(x,y)=>{if(from?.y===295 && y===295)segments.push({from:from.x,to:x});};
  c.box=()=>{};c.text=()=>{};c.drawRest=()=>{};
  c.ellipse=(x,y,rx,ry)=>{if(rx===1.8 && ry===1.8)dots.push({x,y});};
  for(const round of [40,48]){
    dots.length=0;segments.length=0;
    const run=getRunSettings('survival',round);
    c.measure=generateMeasure(run.rules,undefined,run.introRound);c.drawNotation(0,false);
    const expected=c.measure.notes.filter(n=>n.duration===.75 || n.duration===1.5).map(n=>({x:c.notationX(n.beat)+10,y:316}));
    assert.deepEqual(dots,expected);
    assert.ok(segments.some(s=>Math.abs(s.to-s.from-59*.125)<1e-9),'short secondary beam has a visible inward hook');
  }
  c.stop();
});

test('dotted demonstration, tap scoring, and replay retain their exact timings at the tempo cap', ()=>{
  const h=harness('survival'),c=h.concert;
  c.round=39;c.beginRound();
  assert.equal(c.level.bpm,140);
  const expected=c.measure.onsets.map(b=>c.origin+(6+b)*c.beat);
  assert.deepEqual(c.events.filter(e=>e.visual?.type==='demo').map(e=>e.time),expected);
  c.taps=c.measure.onsets.map(b=>b*c.beat);h.seek(18.3);c.evaluate();
  assert.equal(c.result.perfect,true);
  assert.deepEqual(c.events.filter(e=>e.visual?.type==='replay').map(e=>e.time),c.taps.map(t=>c.origin+20*c.beat+t));
  h.seek(26.01);c.update();assert.equal(c.level.bpm,140);
  c.stop();
});
