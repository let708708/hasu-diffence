// 起動、画面切り替え、入力、HTML側のUI、演出
(function () {
  'use strict';
  const HD = window.HD;
  const $ = (id) => document.getElementById(id);
  const sound = HD.Audio;

  // ---- 画像の読み込み ----
  HD.images = {};
  HD.IMAGE_IDS.forEach((id) => {
    const img = new Image();
    img.src = HD.imgPath(id);
    HD.images[id] = img;
  });

  const canvas = $('field');
  const ctx = canvas.getContext('2d');
  // selectedCard: 選んでいる手札の番号（0〜3）
  const ui = { selectedCard: null, selectedUnit: null, hoverSlot: -1, paused: false, speed: 1, houseShake: 0 };
  let game = null;
  let reactionIndex = 0;
  let resultTimer = null;
  let toastTimer = null;
  let infoKey = '';
  let shownHand = [];

  // ---- 演出 ----
  function playAnim(el, src, cls) {
    el.src = src;
    el.className = el.dataset.base;
    void el.offsetWidth; // アニメーションを最初から再生し直す
    el.className = el.dataset.base + ' ' + cls;
  }
  function cutin(id, mini) {
    playAnim($('cutin'), HD.imgPath(id), mini ? 'show mini' : 'show');
  }
  function reaction() {
    const list = HD.FX.houseHit;
    playAnim($('reaction'), HD.imgPath(list[reactionIndex++ % list.length]), 'show');
  }
  function toast(text) {
    const el = $('toast');
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 1600);
  }
  function noSnack() {
    sound.sfx('error');
    toast('おやつが足りません');
  }

  function onGameEvent(name, data) {
    switch (name) {
      case 'waveStart':
        cutin(data.last ? HD.FX.lastWave : HD.FX.waveStart);
        sound.sfx('waveStart');
        if (data.last) {
          sound.playBgm('boss');
          toast('最終ウェーブ！「欲望のかたまり」がやってくる');
        }
        break;
      case 'waveClear':
        cutin(HD.FX.waveClear);
        sound.sfx('waveClear');
        toast('ウェーブ' + data.wave + 'クリア！ おやつ +' + data.bonus + '・無料引き直し1回');
        break;
      case 'houseHit':
        ui.houseShake = 0.3;
        reaction();
        sound.sfx('houseHit');
        break;
      case 'half':
        cutin(HD.FX.half);
        sound.sfx('half');
        break;
      case 'heal':
        sound.sfx('heal');
        break;
      case 'income':
        sound.sfx('coin');
        break;
      case 'bossSpawn':
        sound.sfx('bossSpawn');
        break;
      case 'bossDown':
        cutin(HD.FX.bossDown);
        sound.sfx('bossDown');
        break;
      case 'upgrade':
        cutin(HD.FX.upgrade, true);
        sound.sfx('upgrade');
        break;
      case 'place':
        sound.sfx('place');
        break;
      case 'deal':
        setTimeout(() => sound.sfx('deal'), 120);
        break;
      case 'reroll':
        sound.sfx('shuffle');
        break;
      case 'sell':
        sound.sfx('sell');
        break;
      case 'shot':
        sound.sfx('shot_' + data.type);
        break;
      case 'kill':
        sound.sfx('kill');
        break;
      case 'won':
      case 'lost':
        sound.jingle(name === 'won' ? 'win' : 'lose');
        finish(name === 'won');
        break;
    }
  }

  // ---- 画面切り替え ----
  function showScreen(name) {
    $('screenTitle').classList.toggle('hidden', name !== 'title');
    $('screenBattle').classList.toggle('hidden', name !== 'battle');
    $('result').classList.add('hidden');
    if (name === 'title') sound.playBgm('title');
    if (name === 'battle') sound.playBgm('battle');
  }

  function startGame() {
    clearTimeout(resultTimer);
    game = new HD.Game(onGameEvent);
    Object.assign(ui, { selectedCard: null, selectedUnit: null, hoverSlot: -1, paused: false, speed: 1, houseShake: 0 });
    reactionIndex = 0;
    infoKey = '';
    shownHand = [];
    showScreen('battle');
    refreshUI();
  }

  function finish(won) {
    clearSelection();
    clearTimeout(resultTimer);
    resultTimer = setTimeout(() => showResult(won), 1200);
  }

  function showResult(won) {
    $('cutin').className = 'cutin';
    $('reaction').className = 'reaction';
    const imgs = won ? HD.FX.win : HD.FX.lose;
    $('resultTitle').textContent = won ? 'おうちを守りきった！' : 'おうちが占領された…';
    $('resultTitle').className = won ? 'win' : 'lose';
    $('resultImg1').src = HD.imgPath(imgs[0]);
    $('resultImg2').src = HD.imgPath(imgs[1]);
    $('resultStats').innerHTML =
      '<div><dt>到達ウェーブ</dt><dd>' + game.wave + ' / ' + game.totalWaves + '</dd></div>' +
      '<div><dt>おうちの耐久値</dt><dd>' + game.hp + ' / ' + game.maxHp + '</dd></div>' +
      '<div><dt>獲得したおやつ</dt><dd>' + game.earned + '</dd></div>';
    $('result').classList.remove('hidden');
  }

  // ---- 手札 ----
  function cardHtml(type, i) {
    const s = HD.STAMPS[type];
    return (
      '<span class="card-badge">' + s.badge + '</span>' +
      '<kbd>' + (i + 1) + '</kbd>' +
      '<img src="' + HD.imgPath(s.img) + '" alt="' + s.name + '">' +
      '<span class="card-role">' + s.role + '</span>' +
      '<span class="card-cost">おやつ ' + s.cost + '</span>'
    );
  }

  // 手札が変わったときだけカードを作り直す。新しく配られたカードには登場アニメーションを付ける
  function syncHand() {
    const bar = $('stampBar');
    if (bar.children.length !== HD.HAND_SIZE) {
      bar.innerHTML = '';
      for (let i = 0; i < HD.HAND_SIZE; i++) {
        const btn = document.createElement('button');
        btn.className = 'card';
        btn.addEventListener('click', () => selectCard(i));
        bar.appendChild(btn);
      }
      shownHand = [];
    }
    game.hand.forEach((type, i) => {
      if (shownHand[i] === type) return;
      const btn = bar.children[i];
      btn.dataset.key = type;
      btn.style.setProperty('--role', HD.STAMPS[type].color);
      btn.innerHTML = cardHtml(type, i);
      btn.classList.remove('dealt');
      void btn.offsetWidth;
      btn.classList.add('dealt');
    });
    shownHand = game.hand.slice();
  }

  function selectCard(i) {
    if (!game || game.isOver) return;
    ui.selectedCard = ui.selectedCard === i ? null : i;
    ui.selectedUnit = null;
  }

  function reroll() {
    if (!game || game.isOver) return;
    const r = game.reroll();
    if (r === 'snack') noSnack();
    else if (r === 'ok') ui.selectedCard = null;
  }

  // ---- 情報パネル ----
  function fmt(n) {
    return Math.round(n * 10) / 10;
  }
  function pct(n) {
    return Math.round(n * 100) + '%';
  }
  function row(label, value) {
    return '<div><dt>' + label + '</dt><dd>' + value + '</dd></div>';
  }

  function statsHtml(type, level, unit) {
    const st = unit ? game.effectiveStats(unit) : HD.unitStats(type, level);
    let rows = '';
    if (st.noAttack) {
      if (type === 'chichi') rows = row('効果範囲', st.aura + 'px') + row('射程アップ', '+' + pct(st.rangeBuff));
      if (type === 'haha') rows = row('回復量', '+' + st.heal + '（ウェーブ終了時）');
      if (type === 'cheat') rows = row('おやつ', '+' + st.income + '（' + st.incomeEvery + '秒ごと）');
      rows += row('攻撃', 'しない');
    } else {
      let special = 'なし';
      if (st.splash) special = '半径' + st.splash + 'pxの範囲攻撃';
      if (st.slow) special = '移動速度' + pct(st.slow) + '（' + fmt(st.slowTime) + '秒）';
      if (st.mark) special = '被ダメージ+' + pct(st.mark) + '（' + st.markTime + '秒）';
      if (st.growCap) special = st.growEvery + '秒ごとに攻撃力+1（上限+' + st.growCap + '）';
      let damage = String(fmt(st.damage));
      if (unit && unit.grow) damage += '（成長+' + unit.grow + '）';
      let range = Math.round(st.range) + 'px';
      if (unit && st.buff) range += '（森+' + pct(st.buff) + '）';
      rows = row('攻撃力', damage) + row('射程', range) + row('攻撃間隔', st.interval + '秒') + row('特殊効果', special);
    }
    return '<dl class="stats">' + rows + '</dl>';
  }

  function header(s, extra) {
    return '<h3><span class="pill" style="--role:' + s.color + '">' + s.role + '</span>' + s.name + (extra || '') + '</h3>';
  }

  function renderInfo() {
    const info = $('info');
    const u = ui.selectedUnit;
    const cardType = ui.selectedCard != null ? game.hand[ui.selectedCard] : null;
    if (u) {
      const s = HD.STAMPS[u.type];
      const cost = HD.upgradeCost(u.type, u.level);
      info.innerHTML =
        '<img class="info-img" src="' + HD.imgPath(s.img) + '" alt="' + s.name + '">' +
        '<div class="info-body">' +
        header(s, ' <small>Lv' + u.level + '</small>') +
        statsHtml(u.type, u.level, u) +
        '<div class="info-actions">' +
        (cost == null
          ? '<button class="btn" disabled>最大レベル</button>'
          : '<button class="btn primary" data-act="upgrade" id="btnUpgrade">強化（おやつ ' + cost + '）</button>') +
        '<button class="btn" data-act="sell">売却（+' + game.sellValue(u) + '）</button>' +
        '</div></div>';
    } else if (cardType) {
      const s = HD.STAMPS[cardType];
      info.innerHTML =
        '<img class="info-img" src="' + HD.imgPath(s.img) + '" alt="' + s.name + '">' +
        '<div class="info-body">' +
        header(s) +
        '<p class="desc">' + s.desc + '</p>' +
        statsHtml(cardType, 1) +
        '<p class="hint">道のそばの丸い配置ポイントをクリックして貼る（右クリック・Escでやめる）</p>' +
        '</div>';
    } else {
      info.innerHTML =
        '<div class="info-body help">' +
        '<h3>あそびかた</h3>' +
        '<p>手札のスタンプを選んで、道のそばの丸い配置ポイントに貼ろう。貼ると新しいカードが配られます。</p>' +
        '<p>欲しいスタンプがないときは「引き直し」。貼ったスタンプをクリックすると強化・売却ができます。</p>' +
        '</div>';
    }
  }

  // ---- HUDなどの表示更新（毎フレーム） ----
  function setText(el, text) {
    if (el.textContent !== text) el.textContent = text;
  }

  function refreshUI() {
    if (!game) return;
    setText($('hudHp'), game.hp + ' / ' + game.maxHp);
    $('hpBar').style.width = (game.hp / game.maxHp) * 100 + '%';
    $('hpBar').dataset.level = game.hp / game.maxHp > 0.5 ? 'ok' : game.hp / game.maxHp > 0.25 ? 'warn' : 'danger';
    setText($('hudSnack'), String(game.snack));
    setText($('hudWave'), game.wave + ' / ' + game.totalWaves);

    let status = '';
    if (game.state === 'prep') {
      status = game.wave === 0 ? '準備中：手札のスタンプを貼ってから「ウェーブ開始」を押そう' : '準備中：配置・強化・引き直しを見直そう';
    } else if (game.state === 'wave') {
      status = 'ウェーブ' + game.wave + ' 進行中（残りの敵 ' + game.enemiesLeft() + '）';
    } else if (game.state === 'won') {
      status = 'ステージクリア！';
    } else {
      status = 'おうちの耐久値が0になった…';
    }
    setText($('hudStatus'), status);

    $('btnWave').disabled = !game.canStartWave();
    setText($('btnWave'), game.wave === 0 ? 'ウェーブ開始' : '次のウェーブ');
    setText($('btnPause'), ui.paused ? '再開' : '一時停止');
    $('btnPause').disabled = game.isOver;
    setText($('btnSpeed'), ui.speed === 2 ? '2倍速：ON' : '2倍速：OFF');
    $('btnSpeed').classList.toggle('on', ui.speed === 2);
    sound.setDuck(ui.paused && !game.isOver);

    syncHand();
    document.querySelectorAll('#stampBar .card').forEach((card, i) => {
      const s = HD.STAMPS[game.hand[i]];
      card.classList.toggle('selected', ui.selectedCard === i);
      card.classList.toggle('poor', game.snack < s.cost);
      card.disabled = game.isOver;
    });
    const free = game.freeRerolls > 0;
    setText($('rerollCost'), free ? '無料' : 'おやつ ' + HD.REROLL_COST);
    $('btnReroll').classList.toggle('free', free);
    $('btnReroll').disabled = game.isOver;

    const u = ui.selectedUnit;
    const cardType = ui.selectedCard != null ? game.hand[ui.selectedCard] : null;
    const key = u
      ? 'u' + u.id + ':' + u.level + ':' + u.grow + ':' + game.rangeBuffFor(u)
      : cardType
        ? 'c' + ui.selectedCard + cardType
        : 'none';
    if (key !== infoKey) {
      infoKey = key;
      renderInfo();
    }
    const up = $('btnUpgrade');
    if (up && u) up.disabled = game.snack < HD.upgradeCost(u.type, u.level);
  }

  // ---- 入力 ----
  function toCanvas(ev) {
    const r = canvas.getBoundingClientRect();
    return { x: ((ev.clientX - r.left) * HD.W) / r.width, y: ((ev.clientY - r.top) * HD.H) / r.height };
  }
  function slotAt(p) {
    return HD.SLOTS.findIndex((s) => Math.hypot(s.x - p.x, s.y - p.y) <= 34);
  }
  function clearSelection() {
    ui.selectedCard = null;
    ui.selectedUnit = null;
  }

  canvas.addEventListener('mousemove', (ev) => {
    ui.hoverSlot = slotAt(toCanvas(ev));
    canvas.style.cursor = ui.hoverSlot >= 0 ? 'pointer' : 'default';
  });
  canvas.addEventListener('mouseleave', () => (ui.hoverSlot = -1));
  canvas.addEventListener('contextmenu', (ev) => {
    ev.preventDefault();
    clearSelection();
  });
  canvas.addEventListener('click', (ev) => {
    if (!game || game.isOver) return;
    const slot = slotAt(toCanvas(ev));
    if (ui.selectedCard != null && slot >= 0 && !game.unitAtSlot(slot)) {
      const result = game.place(slot, ui.selectedCard);
      if (result === 'snack') noSnack();
      else if (result === 'ok') ui.selectedCard = null;
      return;
    }
    ui.selectedUnit = slot >= 0 ? game.unitAtSlot(slot) : null;
    ui.selectedCard = null;
  });

  $('info').addEventListener('click', (ev) => {
    const btn = ev.target.closest('button[data-act]');
    if (!btn || !game || !ui.selectedUnit) return;
    if (btn.dataset.act === 'upgrade') {
      if (game.upgrade(ui.selectedUnit) === 'snack') noSnack();
    } else if (btn.dataset.act === 'sell') {
      const refund = game.sell(ui.selectedUnit);
      ui.selectedUnit = null;
      toast('売却しました（おやつ +' + refund + '）');
    }
  });

  $('btnStart').addEventListener('click', startGame);
  $('btnHowto').addEventListener('click', () => $('howto').classList.toggle('hidden'));
  $('btnRetry').addEventListener('click', startGame);
  $('btnToTitle').addEventListener('click', () => {
    clearTimeout(resultTimer);
    game = null;
    showScreen('title');
  });
  $('btnWave').addEventListener('click', () => game && game.startWave());
  $('btnPause').addEventListener('click', () => {
    if (game && !game.isOver) ui.paused = !ui.paused;
  });
  $('btnSpeed').addEventListener('click', () => (ui.speed = ui.speed === 2 ? 1 : 2));
  $('btnReroll').addEventListener('click', reroll);

  document.addEventListener('keydown', (ev) => {
    if (!game || $('screenBattle').classList.contains('hidden')) return;
    if (ev.code === 'Space') {
      ev.preventDefault();
      // フォーカス中のボタンがスペースで押されるのを防ぐ
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      if (!game.isOver) ui.paused = !ui.paused;
    } else if (ev.key === 'Escape') {
      clearSelection();
    } else if (/^[1-9]$/.test(ev.key) && Number(ev.key) <= HD.HAND_SIZE) {
      selectCard(Number(ev.key) - 1);
    } else if (ev.key === 'r' || ev.key === 'R') {
      reroll();
    }
  });

  // ---- メインループ ----
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (game) {
      if (!ui.paused) {
        for (let i = 0; i < ui.speed; i++) game.update(dt);
      }
      ui.houseShake = Math.max(0, ui.houseShake - dt);
      if (ui.selectedUnit && !game.units.includes(ui.selectedUnit)) ui.selectedUnit = null;
      HD.render(ctx, game, ui);
      refreshUI();
    }
    requestAnimationFrame(frame);
  }

  // ---- サウンド設定 ----
  function refreshSoundButtons() {
    const s = sound.settings;
    $('btnBgm').textContent = 'BGM：' + (s.bgm ? 'ON' : 'OFF');
    $('btnSfx').textContent = '効果音：' + (s.sfx ? 'ON' : 'OFF');
    $('btnBgm').classList.toggle('on', s.bgm);
    $('btnSfx').classList.toggle('on', s.sfx);
  }
  $('btnBgm').addEventListener('click', () => {
    sound.setBgm(!sound.settings.bgm);
    refreshSoundButtons();
  });
  $('btnSfx').addEventListener('click', () => {
    sound.setSfx(!sound.settings.sfx);
    refreshSoundButtons();
  });
  // ブラウザーは操作があるまで音を出せないので、最初の操作で音を有効にする
  ['pointerdown', 'keydown'].forEach((type) => document.addEventListener(type, sound.unlock, true));
  // ボタンのクリック音（引き直しは専用の音を鳴らすので除く）
  document.addEventListener('click', (ev) => {
    if (ev.target.closest('button:not(:disabled):not(#btnReroll)')) sound.sfx('click');
  });

  refreshSoundButtons();
  showScreen('title');
  requestAnimationFrame(frame);
})();
