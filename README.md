This is an alpha version. For now it is meant for testing only.
https://mankeymite.github.io/PianoQuest/

## Rhythm Concert

Open `index.html` in a modern browser, then choose **Choose mode → Rhythm Concert**, select a numbered level tile or **Survival**, press **Start**, then **Take the stage**. No microphone or MIDI device is needed. In the main **Settings** panel, **Music volume** controls menu and game background music; **Sound volume** independently controls drums, count-in clicks, crowd cheers, and game effects. Both are saved between visits. Turning music down or off leaves rhythm sounds at their own volume. Retry keeps your selected level; **Select level** returns to the tiles.

All levels use 4/4. Read the stationary one-line snare staff, hear a four-beat count-in and demonstration, then wait for another count-in and play with **Space**, mouse, or touch. Levels begin with introductory measures, then generate rhythms within their own rules. The HUD shows the current round/total and rounds remaining. The remaining count includes the current attempt until it is evaluated; feedback and replay finish before a level ends.

| Level | Tempo | Rounds | Focus |
| --- | --- | --- | --- |
| 1 · Find the beat | 76 BPM | 4 | Steady quarter notes |
| 2 · Make room for silence | 78 BPM | 4 | Adds quarter rests |
| 3 · Two notes to a beat | 80 BPM | 5 | Adds beamed eighth-note pairs |
| 4 · The long and short of it | 80 BPM | 5 | Adds half notes and half rests |
| 5 · Play the offbeat | 84 BPM | 5 | Adds eighth rests and offbeat eighth notes |
| 6 · A little syncopation | 90 BPM | 6 | Adds eighth–quarter–eighth syncopation |
| 7 · Four notes to a beat | 90 BPM | 6 | Adds sixteenths, at most one fast group per bar |
| 8 · Mix it up | 96 BPM | 6 | Mixed eighth/sixteenth groups, up to two fast groups |
| 9 · Take the spotlight | 104 BPM | 7 | Faster advanced rhythms |
| 10 · The headline concert | 112 BPM | 8 | Up to three fast groups per bar |

Complete every round with the audience meter above zero to clear the level and unlock the next. Completed tiles show a check mark; locked levels show their requirements and cannot be started. Each profile saves Rhythm Concert unlocks, clears, and per-level bests independently from Meteor Sky. Wins use the existing double coin reward and a one-time first-clear bonus. Replaying a cleared level does not repeat the first-clear bonus. Old Rhythm Concert aggregate records remain intact.

**Survival** is available from the start and has no round limit. It begins at 80 BPM and adds 2 BPM per round, reaching its **140 BPM cap at round 31**. Rounds 1–4 use beginner rhythms, rounds 5–8 add intermediate rhythms, and round 9 onward introduces advanced rhythms. The permitted number of fast groups grows from two at round 9 to three at round 17 and four at round 25.

After the tempo cap, difficulty increases through rhythm rather than speed: round 32 introduces dotted quarters, round 40 adds dotted eighths, and round 48 adds reversed dotted combinations with at least two dotted groups per bar. Round 64 onward requires at least three dotted groups. A dotted quarter lasts 1½ beats; a dotted eighth lasts ¾ of a beat and can pair with a sixteenth lasting ¼ of a beat. Dots are drawn beside the noteheads, with the appropriate partial beam on the paired sixteenth. **Sixteenths remain the shortest note value; no dotted sixteenths or thirty-second notes are generated.** Numbered campaign levels keep their existing rhythms.

Difficulty and tempo change only between rounds, with a fresh count-in at the new tempo. Survival ends when the audience meter empties and saves its own best score and most rounds played; it does not unlock numbered levels.

Half notes are struck once and last two beats; rests are always silent. Sixteenths divide a beat into four (count “1 e & a”). Longer patterns align with half-bars, rhythms fill the measure exactly, and generated bars contain at least two strikes and no more than two beats of rests. The 1–2–3–4 under the staff align with the noteheads and rests at those beats; subdivisions fall proportionally between the numbers. The highlighted number follows the audio clock, including through rests.

Each attempt receives note-by-note feedback: a green check means on beat, a cross means missed, arrows mean early/late, and a small red plus below the staff marks an extra tap. The game then plays every recorded tap back at its original timing, including mistakes. The quiet quarter-note click helps keep a steady pulse during your turn.

Every good performance restores audience enthusiasm and triggers synthesized crowd cheers and applause, with a bigger reaction and confetti for perfect measures. During feedback and replay, the total score and earned points count upward and grow, settling back to normal size before the next bar. Reduced-motion preferences retain the count-up without the size animation. Repeated struggling performances empty the audience meter and end the concert with a gentle invitation to try again. Scores, play time, and concert rewards use the existing player profiles. Leaving early follows the other modes’ no-coin-reward behavior.

**Pause** or **Escape** takes an intermission. Switching tabs or losing focus also pauses. Resume gives a new count-in without penalizing an unfinished attempt or increasing Survival difficulty. A measure already scored advances on resume, or finishes the concert if it was the last round, so points cannot be earned twice.

### Implementation and checks

`rhythm-concert.js` contains the pattern vocabulary, level rules, generator, timing evaluation, Web Audio scheduler, score presentation, and concert drawing. `main.js` connects it to the shared level tiles, ready screen, game loop, result overlay, audio context, and profiles. There are no new packages or runtime network dependencies. Vocabulary presets live in `RhythmConcert.LEVELS`, the ten numbered definitions in `RhythmConcert.CAMPAIGN`, and run/Survival settings in `getRunSettings`. Scores are committed once at evaluation; their animation uses the same audio clock as the performance and never changes gameplay totals.

Run the timing and lifecycle checks with Node.js:

```sh
node --test tests/rhythm-concert.test.cjs
node --check main.js
node --check rhythm-concert.js
```

For a manual check, open the Rhythm Concert tiles and confirm only level 1 and Survival are initially available. Finish level 1, watch the rounds-left counter reach zero, then check level 2 unlocks and the unlock survives a reload. Check another profile starts with its own progress. In Survival, play through rounds 5 and 9 to hear the faster tempo and new rhythm types. Compare the note marks and replay with your taps; listen for cheers, watch points grow and settle, try holding Space (it should not repeat), pause during a measure or the final review, and return to Meteor Sky or Note Reading to check their progression is separate.

Useful next steps are tempo selection with latency calibration, a repeat-example option, reading-only practice, and new time signatures such as 3/4 and 6/8. Venue unlocks can build on the existing profile progression later.

