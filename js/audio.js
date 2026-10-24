// BGMと効果音（Web Audio APIでその場で合成する。音声ファイルは使わない）
(function () {
  'use strict';
  const HD = (window.HD = window.HD || {});

  const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
  const _ = null; // 休符

  // ---- 曲データ（1要素 = 8分音符1つ） ----
  const TRACKS = {
    // タイトル：ゆったり（C - G - Am - F）
    title: {
      bpm: 92,
      lead: 'triangle',
      leadGain: 0.13,
      melody: [
        76, _, _, 79, 77, _, 76, _,
        74, _, _, 71, 74, _, _, _,
        72, _, _, 76, 74, _, 72, _,
        69, _, 72, _, 74, _, _, _,
      ],
      bass: [48, _, _, _, 55, _, _, _, 43, _, _, _, 50, _, _, _, 45, _, _, _, 52, _, _, _, 41, _, _, _, 48, _, _, _],
      pad: [[60, 64, 67], [59, 62, 67], [57, 60, 64], [57, 60, 65]],
      drums: { hat: [2, 6] },
    },
    // 戦闘：明るく弾む（C - Am - F - G を2周、後半はメロディ違い）
    battle: {
      bpm: 120,
      lead: 'square',
      leadGain: 0.07,
      melody: [
        72, _, 76, 79, 76, _, 74, 72,
        69, _, 72, 76, 74, _, 72, 69,
        65, 69, 72, _, 77, _, 76, 74,
        74, _, 71, 74, 79, _, _, _,
        79, _, 77, 76, 74, _, 72, _,
        76, _, 74, 72, 69, _, 72, _,
        77, _, 76, 77, 79, _, 81, _,
        79, 77, 76, 74, 71, _, 74, _,
      ],
      bass: [].concat(
        [48, _, 60, _, 48, _, 55, _], [45, _, 57, _, 45, _, 52, _], [41, _, 53, _, 41, _, 48, _], [43, _, 55, _, 43, _, 50, _],
        [48, _, 60, _, 48, _, 55, _], [45, _, 57, _, 45, _, 52, _], [41, _, 53, _, 41, _, 48, _], [43, _, 55, _, 43, _, 50, _]
      ),
      drums: { kick: [0, 4], snare: [2, 6], hat: [1, 3, 5, 7] },
    },
    // 最終ウェーブ：緊張感（Am - F - G - E）
    boss: {
      bpm: 140,
      lead: 'sawtooth',
      leadGain: 0.05,
      melody: [
        69, _, 72, _, 76, _, 75, 76,
        77, _, 76, _, 72, _, 69, _,
        71, _, 74, _, 79, _, 77, 74,
        76, _, _, _, 68, _, 71, _,
      ],
      bass: [].concat(
        [45, 45, 57, 45, 45, 45, 57, 45], [41, 41, 53, 41, 41, 41, 53, 41], [43, 43, 55, 43, 43, 43, 55, 43], [40, 40, 52, 40, 40, 40, 52, 40]
      ),
      drums: { kick: [0, 2, 4, 6], snare: [2, 6], hat: [0, 1, 2, 3, 4, 5, 6, 7] },
    },
  };

  const JINGLES = {
    win: { bpm: 150, lead: 'square', leadGain: 0.09, melody: [72, 76, 79, 84, _, 79, 84, _, _, _, _, _], chord: [60, 64, 67, 72] },
    lose: { bpm: 80, lead: 'triangle', leadGain: 0.14, melody: [72, 71, 70, 69, _, _, _, _], chord: [57, 60, 64] },
  };

  let ctx = null;
  let master, bgmBus, sfxBus, noiseBuf;
  let settings = { bgm: true, sfx: true };
  let ducked = false;
  let current = null; // 再生中の曲
  let wanted = null; // 音が使えるようになったら流す曲
  let step = 0;
  let nextTime = 0;
  let timer = null;
  const lastPlayed = {};

  try {
    const saved = JSON.parse(localStorage.getItem('hasu-sound') || 'null');
    if (saved) settings = Object.assign(settings, saved);
  } catch (e) {
    /* 保存できない環境でも既定値で動く */
  }

  function save() {
    try {
      localStorage.setItem('hasu-sound', JSON.stringify(settings));
    } catch (e) {
      /* 無視 */
    }
  }

  function bgmLevel() {
    return settings.bgm ? (ducked ? 0.18 : 0.5) : 0;
  }

  // 最初のクリックやキー入力のときに呼ぶ（ブラウザーの自動再生制限のため）
  function unlock() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.8;
      master.connect(ctx.destination);
      bgmBus = ctx.createGain();
      bgmBus.gain.value = bgmLevel();
      bgmBus.connect(master);
      sfxBus = ctx.createGain();
      sfxBus.gain.value = settings.sfx ? 0.9 : 0;
      sfxBus.connect(master);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') ctx.resume();
    if (wanted && wanted !== current) startTrack(wanted);
  }

  // ---- 音の部品 ----
  function tone(freq, t, dur, opts) {
    const o = opts || {};
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(freq, t);
    if (o.slideTo) osc.frequency.exponentialRampToValueAtTime(o.slideTo, t + dur);
    const peak = o.gain == null ? 0.2 : o.gain;
    const attack = o.attack || 0.005;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(o.dest || sfxBus);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  function noise(t, dur, opts) {
    const o = opts || {};
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const filter = ctx.createBiquadFilter();
    filter.type = o.filter || 'lowpass';
    filter.frequency.value = o.freq || 1000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(o.gain == null ? 0.2 : o.gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(o.dest || sfxBus);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  // ---- BGM ----
  function holdSteps(arr, i, max) {
    let n = 1;
    while (n < max && arr[(i + n) % arr.length] === null) n++;
    return n;
  }

  function scheduleStep(track, i, t) {
    const sd = 30 / track.bpm; // 8分音符の長さ
    const m = track.melody[i % track.melody.length];
    if (m != null) {
      const len = holdSteps(track.melody, i % track.melody.length, 4);
      tone(midi(m), t, sd * len * 0.95, { type: track.lead, gain: track.leadGain, dest: bgmBus });
    }
    const b = track.bass[i % track.bass.length];
    if (b != null) {
      const len = holdSteps(track.bass, i % track.bass.length, 4);
      tone(midi(b), t, sd * len * 0.9, { type: 'triangle', gain: 0.22, dest: bgmBus });
    }
    const inBar = i % 8;
    if (track.pad && inBar === 0) {
      const chord = track.pad[Math.floor(i / 8) % track.pad.length];
      chord.forEach((n) => tone(midi(n), t, sd * 8, { type: 'sine', gain: 0.05, attack: 0.3, dest: bgmBus }));
    }
    const d = track.drums || {};
    if (d.kick && d.kick.includes(inBar)) tone(150, t, 0.18, { slideTo: 45, gain: 0.5, dest: bgmBus });
    if (d.snare && d.snare.includes(inBar)) noise(t, 0.12, { filter: 'highpass', freq: 1500, gain: 0.12, dest: bgmBus });
    if (d.hat && d.hat.includes(inBar)) noise(t, 0.04, { filter: 'highpass', freq: 7000, gain: 0.05, dest: bgmBus });
  }

  function tick() {
    if (!ctx || !current) return;
    const track = TRACKS[current];
    // タブを裏に回して戻ったときに、たまった音がまとめて鳴らないようにする
    if (nextTime < ctx.currentTime - 0.1) nextTime = ctx.currentTime + 0.05;
    while (nextTime < ctx.currentTime + 0.15) {
      scheduleStep(track, step, nextTime);
      nextTime += 30 / track.bpm;
      step++;
    }
  }

  function startTrack(name) {
    current = name;
    step = 0;
    nextTime = ctx.currentTime + 0.08;
    if (!timer) timer = setInterval(tick, 25);
  }

  function playBgm(name) {
    wanted = name;
    if (!ctx || current === name) return;
    startTrack(name);
  }

  function stopBgm() {
    wanted = null;
    current = null;
  }

  function jingle(name) {
    stopBgm();
    if (!ctx || !settings.bgm) return;
    const j = JINGLES[name];
    const sd = 30 / j.bpm;
    const t0 = ctx.currentTime + 0.05;
    j.melody.forEach((n, i) => {
      if (n == null) return;
      const len = holdSteps(j.melody, i, 8);
      tone(midi(n), t0 + i * sd, sd * len, { type: j.lead, gain: j.leadGain, dest: bgmBus });
    });
    const tc = t0 + 4 * sd;
    j.chord.forEach((n) => tone(midi(n), tc, sd * 8, { type: 'triangle', gain: 0.08, attack: 0.02, dest: bgmBus }));
  }

  // ---- 効果音 ----
  const MIN_GAP = {
    shot_omaemo: 0.06,
    shot_yatchi: 0.08,
    shot_fukanou: 0.08,
    shot_wasureru: 0.08,
    shot_neruko: 0.08,
    shot_zazen: 0.1,
    kill: 0.05,
    coin: 0.08,
  };

  const SFX = {
    click(t) {
      tone(900, t, 0.04, { type: 'square', gain: 0.04 });
    },
    place(t) {
      tone(320, t, 0.14, { slideTo: 110, gain: 0.35 });
      noise(t, 0.06, { freq: 1200, gain: 0.15 });
    },
    shot_omaemo(t) {
      tone(1200, t, 0.06, { type: 'square', slideTo: 700, gain: 0.04 });
    },
    shot_yatchi(t) {
      noise(t, 0.2, { filter: 'bandpass', freq: 900, gain: 0.18 });
      tone(500, t, 0.12, { slideTo: 220, gain: 0.08 });
    },
    shot_fukanou(t) {
      tone(1800, t, 0.12, { type: 'triangle', gain: 0.05 });
      tone(2700, t, 0.08, { type: 'sine', gain: 0.03 });
    },
    // 弱体化：ねばっこい「ビヨン」
    shot_wasureru(t) {
      tone(500, t, 0.12, { type: 'sawtooth', slideTo: 300, gain: 0.035 });
    },
    // 成長型：小さくてゆるい「ぽふ」
    shot_neruko(t) {
      tone(600, t, 0.07, { type: 'sine', slideTo: 400, gain: 0.07 });
    },
    // 溜め型：重い「ドーン」
    shot_zazen(t) {
      tone(220, t, 0.35, { type: 'square', slideTo: 70, gain: 0.08 });
      noise(t, 0.25, { freq: 800, gain: 0.18 });
    },
    kill(t) {
      tone(660, t, 0.07, { type: 'square', slideTo: 990, gain: 0.05 });
      tone(1320, t + 0.06, 0.08, { type: 'square', gain: 0.04 });
    },
    houseHit(t) {
      tone(140, t, 0.3, { slideTo: 55, gain: 0.45 });
      noise(t, 0.22, { freq: 400, gain: 0.3 });
    },
    waveStart(t) {
      [523, 659, 784, 1047].forEach((f, i) => tone(f, t + i * 0.07, 0.12, { type: 'square', gain: 0.07 }));
    },
    waveClear(t) {
      [784, 988, 1175, 1568].forEach((f, i) => tone(f, t + i * 0.08, i === 3 ? 0.4 : 0.12, { type: 'triangle', gain: 0.14 }));
    },
    upgrade(t) {
      tone(660, t, 0.25, { type: 'triangle', slideTo: 1320, gain: 0.14 });
      tone(1568, t + 0.18, 0.15, { gain: 0.08 });
      tone(2093, t + 0.26, 0.2, { gain: 0.07 });
    },
    sell(t) {
      tone(988, t, 0.08, { type: 'triangle', gain: 0.12 });
      tone(784, t + 0.08, 0.12, { type: 'triangle', gain: 0.12 });
    },
    error(t) {
      tone(170, t, 0.1, { type: 'square', gain: 0.06 });
      tone(150, t + 0.12, 0.12, { type: 'square', gain: 0.06 });
    },
    half(t) {
      [880, 660, 880, 660].forEach((f, i) => tone(f, t + i * 0.13, 0.11, { type: 'square', gain: 0.06 }));
    },
    // 手札にカードが配られる「シュッ」
    deal(t) {
      noise(t, 0.08, { filter: 'bandpass', freq: 3000, gain: 0.12 });
      tone(1400, t + 0.02, 0.05, { type: 'triangle', gain: 0.04 });
    },
    // 手札の引き直し（シャッフル）
    shuffle(t) {
      for (let i = 0; i < 5; i++) noise(t + i * 0.045, 0.04, { filter: 'bandpass', freq: 2500 + i * 300, gain: 0.1 });
      tone(700, t + 0.25, 0.1, { type: 'triangle', slideTo: 1050, gain: 0.08 });
    },
    // 「今日はチートデイ」がおやつを持ってくる
    coin(t) {
      tone(1046, t, 0.06, { type: 'triangle', gain: 0.08 });
      tone(1568, t + 0.06, 0.1, { type: 'triangle', gain: 0.07 });
    },
    // 「母は偉大なり！」の回復
    heal(t) {
      [523, 659, 784].forEach((f, i) => tone(f, t + i * 0.09, 0.3, { type: 'sine', gain: 0.12, attack: 0.03 }));
    },
    bossSpawn(t) {
      tone(70, t, 1.4, { type: 'sawtooth', slideTo: 40, gain: 0.18, attack: 0.2 });
      noise(t, 1.2, { freq: 250, gain: 0.25 });
    },
    bossDown(t) {
      noise(t, 0.5, { freq: 2000, gain: 0.3 });
      [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, t + 0.1 + i * 0.06, 0.25, { type: 'square', gain: 0.06 }));
    },
  };

  function sfx(name) {
    if (!ctx || !settings.sfx || !SFX[name]) return;
    const now = ctx.currentTime;
    if (MIN_GAP[name] && lastPlayed[name] && now - lastPlayed[name] < MIN_GAP[name]) return;
    lastPlayed[name] = now;
    SFX[name](now + 0.005);
  }

  // ---- 設定 ----
  function setBgm(on) {
    settings.bgm = on;
    save();
    if (bgmBus) bgmBus.gain.setTargetAtTime(bgmLevel(), ctx.currentTime, 0.05);
  }
  function setSfx(on) {
    settings.sfx = on;
    save();
    if (sfxBus) sfxBus.gain.setTargetAtTime(on ? 0.9 : 0, ctx.currentTime, 0.05);
  }
  // 一時停止中はBGMを小さくする
  function setDuck(on) {
    if (ducked === on) return;
    ducked = on;
    if (bgmBus) bgmBus.gain.setTargetAtTime(bgmLevel(), ctx.currentTime, 0.1);
  }

  HD.Audio = {
    unlock,
    playBgm,
    stopBgm,
    jingle,
    sfx,
    setBgm,
    setSfx,
    setDuck,
    get settings() {
      return Object.assign({}, settings);
    },
  };
})();
