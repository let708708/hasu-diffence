// 味方スタンプ・敵・ウェーブ・マップのデータと、それを扱う小さな関数
(function () {
  'use strict';
  const HD = (window.HD = window.HD || {});

  HD.W = 960;
  HD.H = 540;
  HD.FONT = '"M PLUS Rounded 1c", "Hiragino Maru Gothic ProN", "Meiryo", sans-serif';
  HD.imgPath = (id) => 'img/7442239' + id + '.png';

  HD.CONFIG = {
    baseHp: 20,
    startSnack: 200,
    waveBonus: 30,
    sellRate: 0.6,
    spawnInterval: 0.9, // 敵の出現間隔（秒）
    bossDelay: 3, // 通常の敵が出終わってからボスが出るまで（秒）
    projectileSpeed: 420,
  };

  // ---- 仲間スタンプ（Lv1の性能） ----
  HD.STAMPS = {
    omaemo: {
      key: 'omaemo',
      name: 'おまえもな！',
      nickname: 'ハスキー隊長',
      role: '通常攻撃',
      badge: '攻',
      color: '#3b82f6',
      shotColor: '#1d4ed8',
      img: '37',
      cost: 50,
      damage: 8,
      range: 120,
      interval: 0.8,
      desc: '言われたら言い返す。射程内の先頭の敵1体に、テンポよく攻撃する主力。',
    },
    yatchi: {
      key: 'yatchi',
      name: 'やっちまった！',
      nickname: 'うっかりハスキー',
      role: '範囲攻撃',
      badge: '範',
      color: '#06b6d4',
      shotColor: '#38bdf8',
      img: '39',
      cost: 70,
      damage: 14,
      range: 100,
      interval: 1.5,
      splash: 50,
      desc: 'うっかり水をぶちまける。着弾点のまわり（半径50px）の敵もまとめてびしょぬれに。',
    },
    fukanou: {
      key: 'fukanou',
      name: '不可能です！',
      nickname: '檻のぬいぐるみ',
      role: '足止め',
      badge: '止',
      color: '#64748b',
      shotColor: '#475569',
      img: '54',
      cost: 60,
      damage: 4,
      range: 110,
      interval: 1.2,
      slow: 0.5,
      slowTime: 2,
      desc: 'ここから先は通行不可能。当たった敵の移動速度を2秒間、半分にする。',
    },
    wasureru: {
      key: 'wasureru',
      name: '忘れるなよ！',
      nickname: '根に持つクマ',
      role: '弱体化',
      badge: '弱',
      color: '#a855f7',
      shotColor: '#9333ea',
      img: '38',
      cost: 55,
      damage: 3,
      range: 110,
      interval: 1.0,
      mark: 0.3,
      markTime: 3,
      desc: 'この恨み、忘れるなよ！ 当たった敵に印をつけ、3秒間ほかの仲間から受けるダメージを増やす。',
    },
    neruko: {
      key: 'neruko',
      name: '寝る子は育つ',
      nickname: 'おねむハスキー',
      role: '成長型',
      badge: '育',
      color: '#22c55e',
      shotColor: '#16a34a',
      img: '56',
      cost: 40,
      damage: 4,
      range: 110,
      interval: 1.0,
      growEvery: 10,
      growCap: 12,
      desc: '最初は眠そうで弱いが、ウェーブ中10秒ごとに攻撃力が1ずつ育つ。育った分はずっと残る。',
    },
    zazen: {
      key: 'zazen',
      name: '座禅する！',
      nickname: '無心のハスキー',
      role: '溜め型',
      badge: '溜',
      color: '#ef4444',
      shotColor: '#dc2626',
      img: '48',
      cost: 80,
      damage: 60,
      range: 150,
      interval: 4.0,
      desc: '心を静めて、ためにためた一撃。攻撃は遅いが、硬い敵やボスに強い。',
    },
    chichi: {
      key: 'chichi',
      name: '父は森！',
      nickname: '森そのもの',
      role: '支援型',
      badge: '森',
      color: '#166534',
      img: '44',
      cost: 70,
      noAttack: true,
      aura: 160,
      rangeBuff: 0.2,
      desc: '父は森のように大きい。まわり160pxにいる仲間の射程を20%伸ばす（重ねがけはしない）。',
    },
    haha: {
      key: 'haha',
      name: '母は偉大なり！',
      nickname: '偉大な母',
      role: '回復型',
      badge: '癒',
      color: '#ec4899',
      img: '43',
      cost: 90,
      noAttack: true,
      heal: 2,
      desc: 'ウェーブを終えるたびに、おうちの耐久値を2回復する（最大値まで）。',
    },
    cheat: {
      key: 'cheat',
      name: '今日はチートデイ',
      nickname: '食いしんぼう',
      role: '経済型',
      badge: '稼',
      color: '#f97316',
      img: '58',
      cost: 60,
      noAttack: true,
      incomeEvery: 10,
      income: 8,
      desc: '今日だけは食べ放題。ウェーブ中、10秒ごとにおやつを8つ持ってくる。',
    },
  };
  HD.STAMP_ORDER = ['omaemo', 'yatchi', 'fukanou', 'wasureru', 'neruko', 'zazen', 'chichi', 'haha', 'cheat'];
  HD.MAX_LEVEL = 3;

  // ---- 手札 ----
  HD.HAND_SIZE = 4;
  HD.REROLL_COST = 10;
  // 出やすさ（重み）。基本の3種が出やすく、攻撃しないスタンプは出にくい
  HD.WEIGHTS = { omaemo: 3, yatchi: 3, fukanou: 3, wasureru: 2, neruko: 2, zazen: 2, chichi: 1, haha: 1, cheat: 1 };

  HD.canAttack = (type) => !HD.STAMPS[type].noAttack;

  // exclude に含まれないスタンプを、重みに従って1枚引く
  HD.drawCard = function (exclude, rng) {
    const pool = HD.STAMP_ORDER.filter((k) => !exclude.includes(k));
    const total = pool.reduce((sum, k) => sum + HD.WEIGHTS[k], 0);
    let r = (rng || Math.random)() * total;
    for (const k of pool) {
      r -= HD.WEIGHTS[k];
      if (r < 0) return k;
    }
    return pool[pool.length - 1];
  };

  // 重複のない手札を作る。minAttack 枚以上の攻撃スタンプを保証する
  HD.dealHand = function (rng, minAttack) {
    for (let tries = 0; tries < 100; tries++) {
      const hand = [];
      while (hand.length < HD.HAND_SIZE) hand.push(HD.drawCard(hand, rng));
      if (hand.filter(HD.canAttack).length >= (minAttack || 0)) return hand;
    }
    return ['omaemo', 'yatchi', 'fukanou', 'neruko'];
  };

  // レベルを反映した性能
  HD.unitStats = function (type, level) {
    const s = HD.STAMPS[type];
    const k = level - 1;
    if (s.noAttack) {
      return {
        noAttack: true,
        aura: s.aura || 0,
        rangeBuff: s.rangeBuff ? s.rangeBuff + 0.05 * k : 0,
        heal: s.heal ? s.heal + k : 0,
        income: s.income ? s.income + 4 * k : 0,
        incomeEvery: s.incomeEvery || 0,
      };
    }
    return {
      damage: s.damage * (1 + 0.4 * k),
      range: s.range * (1 + 0.1 * k),
      interval: s.interval,
      splash: s.splash || 0,
      slow: s.slow || 0,
      slowTime: s.slow ? s.slowTime + 0.5 * k : 0,
      mark: s.mark ? s.mark + 0.1 * k : 0,
      markTime: s.markTime || 0,
      growEvery: s.growEvery || 0,
      growCap: s.growCap ? s.growCap + 4 * k : 0,
    };
  };

  // 次のレベルへの強化費用（最大レベルなら null）
  HD.upgradeCost = function (type, level) {
    const cost = HD.STAMPS[type].cost;
    if (level === 1) return Math.round(cost * 0.8);
    if (level === 2) return Math.round(cost * 1.2);
    return null;
  };

  // ---- 敵 ----
  HD.ENEMIES = {
    normal: { name: 'だらけもの', hp: 40, speed: 50, reward: 5, damage: 1, r: 13, color: '#9ca3af', dark: '#4b5563' },
    fast: { name: 'せかせかだらけもの', hp: 25, speed: 90, reward: 6, damage: 1, r: 9, color: '#facc15', dark: '#a16207' },
    tank: { name: 'どっしりだらけもの', hp: 150, speed: 35, reward: 12, damage: 2, r: 19, color: '#a78bfa', dark: '#5b21b6' },
    boss: { name: '欲望のかたまり', hp: 1000, speed: 25, reward: 100, damage: 10, r: 30, color: '#7f1d1d', dark: '#2b0a0a', boss: true },
  };

  HD.WAVES = [
    { normal: 10 },
    { normal: 12, fast: 5 },
    { normal: 10, fast: 8, tank: 2 },
    { normal: 12, fast: 10, tank: 5 },
    { normal: 10, fast: 8, tank: 4, boss: 1 },
  ];

  // 種類ごとの敵を均等に混ぜて出現順を作る
  HD.buildWave = function (wave) {
    const items = [];
    ['normal', 'fast', 'tank'].forEach((type) => {
      const n = wave[type] || 0;
      for (let i = 0; i < n; i++) items.push({ type, key: (i + 0.5) / n });
    });
    items.sort((a, b) => a.key - b.key);
    const queue = items.map((it, i) => ({ type: it.type, t: i * HD.CONFIG.spawnInterval }));
    const lastT = queue.length ? queue[queue.length - 1].t : 0;
    for (let i = 0; i < (wave.boss || 0); i++) {
      queue.push({ type: 'boss', t: lastT + HD.CONFIG.bossDelay + i * 2 });
    }
    return queue;
  };

  // ---- マップ「森の入口」 ----
  HD.PATH = [
    { x: -30, y: 100 },
    { x: 220, y: 100 },
    { x: 220, y: 400 },
    { x: 480, y: 400 },
    { x: 480, y: 150 },
    { x: 740, y: 150 },
    { x: 740, y: 430 },
    { x: 880, y: 430 },
  ];
  HD.HOUSE = { x: 915, y: 425 };

  HD.SLOTS = [
    { x: 110, y: 35 },
    { x: 150, y: 190 },
    { x: 300, y: 200 },
    { x: 150, y: 330 },
    { x: 350, y: 310 },
    { x: 350, y: 480 },
    { x: 405, y: 225 },
    { x: 610, y: 75 },
    { x: 565, y: 265 },
    { x: 660, y: 330 },
    { x: 830, y: 300 },
    { x: 810, y: 505 },
  ];

  const segLens = [];
  HD.PATH_LEN = 0;
  for (let i = 0; i < HD.PATH.length - 1; i++) {
    const a = HD.PATH[i];
    const b = HD.PATH[i + 1];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    segLens.push(len);
    HD.PATH_LEN += len;
  }

  // ルートの始点から距離 d の位置
  HD.pathPoint = function (d) {
    let rest = Math.max(0, d);
    for (let i = 0; i < segLens.length; i++) {
      if (rest <= segLens[i]) {
        const a = HD.PATH[i];
        const b = HD.PATH[i + 1];
        const t = rest / segLens[i];
        return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      }
      rest -= segLens[i];
    }
    const end = HD.PATH[HD.PATH.length - 1];
    return { x: end.x, y: end.y };
  };

  // 点からルートまでの最短距離（背景の木を道に置かないために使う）
  HD.distToPath = function (x, y) {
    let best = Infinity;
    for (let i = 0; i < HD.PATH.length - 1; i++) {
      const a = HD.PATH[i];
      const b = HD.PATH[i + 1];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy)));
      best = Math.min(best, Math.hypot(x - (a.x + dx * t), y - (a.y + dy * t)));
    }
    return best;
  };

  // ---- 演出に使う画像（子どもの写真 55・57 は企画書の方針により使わない） ----
  HD.FX = {
    title: '60',
    waveStart: '59',
    lastWave: '60',
    houseHit: ['40', '52', '53'],
    half: '51',
    waveClear: '41',
    bossDown: '49',
    upgrade: '45',
    win: ['46', '42'],
    lose: ['47', '50'],
  };
  HD.IMAGE_IDS = ['37', '39', '54', '38', '56', '48', '44', '43', '58', '40','41', '42', '45', '46', '47', '49', '50', '51', '52', '53', '59', '60'];
})();
