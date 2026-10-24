// Canvasへの描画（背景、配置ポイント、スタンプ、敵、弾、エフェクト）
(function () {
  'use strict';
  const HD = window.HD;
  let background = null;

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function font(size, weight) {
    return (weight || 800) + ' ' + size + 'px ' + HD.FONT;
  }

  function outlinedText(ctx, text, x, y, size, color) {
    ctx.font = font(size);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#fff';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }

  // ---- 背景（1回だけ描いて使い回す） ----
  function buildBackground() {
    const c = document.createElement('canvas');
    c.width = HD.W;
    c.height = HD.H;
    const g = c.getContext('2d');
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

    g.fillStyle = '#a9d68b';
    g.fillRect(0, 0, HD.W, HD.H);

    // 草のまだら模様
    for (let i = 0; i < 260; i++) {
      g.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.10)' : 'rgba(60,120,40,0.10)';
      g.beginPath();
      g.ellipse(rnd() * HD.W, rnd() * HD.H, 6 + rnd() * 14, 3 + rnd() * 6, 0, 0, Math.PI * 2);
      g.fill();
    }

    const farFromThings = (x, y, pad) =>
      HD.distToPath(x, y) > pad &&
      HD.SLOTS.every((s) => Math.hypot(s.x - x, s.y - y) > pad) &&
      Math.hypot(HD.HOUSE.x - x, HD.HOUSE.y - y) > 70;

    // 小さな花
    const flowerColors = ['#fff', '#fde68a', '#fbcfe8', '#fecaca'];
    for (let i = 0; i < 90; i++) {
      const x = rnd() * HD.W;
      const y = rnd() * HD.H;
      if (!farFromThings(x, y, 30)) continue;
      g.fillStyle = flowerColors[i % flowerColors.length];
      g.beginPath();
      g.arc(x, y, 2.5, 0, Math.PI * 2);
      g.fill();
    }

    // 道
    g.lineCap = 'round';
    g.lineJoin = 'round';
    const tracePath = () => {
      g.beginPath();
      HD.PATH.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
    };
    tracePath();
    g.strokeStyle = '#b98b56';
    g.lineWidth = 50;
    g.stroke();
    tracePath();
    g.strokeStyle = '#e6c793';
    g.lineWidth = 40;
    g.stroke();
    tracePath();
    g.setLineDash([6, 14]);
    g.strokeStyle = 'rgba(150,110,60,0.35)';
    g.lineWidth = 3;
    g.stroke();
    g.setLineDash([]);

    // 木
    const trees = [];
    for (let i = 0; i < 400 && trees.length < 26; i++) {
      const x = 20 + rnd() * (HD.W - 40);
      const y = 20 + rnd() * (HD.H - 40);
      if (!farFromThings(x, y, 52)) continue;
      if (trees.some((t) => Math.hypot(t.x - x, t.y - y) < 44)) continue;
      trees.push({ x, y, r: 15 + rnd() * 8 });
    }
    trees.sort((a, b) => a.y - b.y);
    for (const t of trees) {
      g.fillStyle = 'rgba(0,0,0,0.15)';
      g.beginPath();
      g.ellipse(t.x, t.y + t.r * 0.9, t.r, t.r * 0.35, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#8b5a2b';
      g.fillRect(t.x - 3, t.y, 6, t.r * 0.8);
      g.fillStyle = '#4d9a45';
      g.beginPath();
      g.arc(t.x, t.y - 4, t.r, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#6cbf5a';
      g.beginPath();
      g.arc(t.x - t.r * 0.3, t.y - 4 - t.r * 0.3, t.r * 0.5, 0, Math.PI * 2);
      g.fill();
    }

    // 入口の看板
    g.fillStyle = '#8b5a2b';
    g.fillRect(18, 128, 5, 26);
    roundRect(g, 0, 118, 44, 18, 4);
    g.fillStyle = '#fef3c7';
    g.fill();
    g.strokeStyle = '#8b5a2b';
    g.lineWidth = 2;
    g.stroke();
    g.fillStyle = '#7c2d12';
    g.font = font(11);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('入口', 22, 128);
    return c;
  }

  // ---- おうち ----
  function drawHouse(ctx, game, shake) {
    const { x, y } = HD.HOUSE;
    const sx = shake > 0 ? Math.sin(shake * 80) * 4 : 0;
    ctx.save();
    ctx.translate(x + sx, y);
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath();
    ctx.ellipse(0, 32, 40, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff7e6';
    ctx.strokeStyle = '#7c4a1e';
    ctx.lineWidth = 3;
    roundRect(ctx, -30, -18, 60, 50, 4);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#e8574a';
    ctx.beginPath();
    ctx.moveTo(-40, -14);
    ctx.lineTo(0, -52);
    ctx.lineTo(40, -14);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#a0612d';
    roundRect(ctx, -9, 8, 18, 24, 3);
    ctx.fill();
    ctx.fillStyle = '#bde3f5';
    ctx.fillRect(13, -6, 11, 11);
    ctx.strokeRect(13, -6, 11, 11);
    ctx.restore();

    // 耐久値ゲージ
    const ratio = game.hp / game.maxHp;
    const w = 64;
    roundRect(ctx, x - w / 2, y + 44, w, 8, 4);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fill();
    if (ratio > 0) {
      roundRect(ctx, x - w / 2, y + 44, w * ratio, 8, 4);
      ctx.fillStyle = ratio > 0.5 ? '#22c55e' : ratio > 0.25 ? '#f59e0b' : '#ef4444';
      ctx.fill();
    }
  }

  function selectedType(game, ui) {
    return ui.selectedCard != null ? game.hand[ui.selectedCard] || null : null;
  }

  // スタンプの効果範囲（攻撃なら射程、「父は森！」なら支援の範囲）
  function drawUnitArea(ctx, game, type, level, x, y, unit) {
    const def = HD.STAMPS[type];
    if (type === 'chichi') {
      drawRange(ctx, x, y, HD.unitStats(type, level).aura, def.color, true);
      return;
    }
    if (def.noAttack) return;
    const range = unit ? game.effectiveStats(unit).range : HD.unitStats(type, level).range * (1 + game.rangeBuffFor({ x, y }));
    drawRange(ctx, x, y, range, def.color);
  }

  // ---- 配置ポイント ----
  function drawSlots(ctx, game, ui) {
    const selType = selectedType(game, ui);
    const sel = selType ? HD.STAMPS[selType] : null;
    const affordable = sel && game.snack >= sel.cost;
    HD.SLOTS.forEach((s, i) => {
      if (game.unitAtSlot(i)) return;
      const hover = ui.hoverSlot === i;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 26, 0, Math.PI * 2);
      ctx.fillStyle = sel ? (hover ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.5)') : 'rgba(255,255,255,0.28)';
      ctx.fill();
      ctx.setLineDash([5, 5]);
      ctx.lineWidth = sel ? 3 : 2;
      ctx.strokeStyle = sel ? (affordable ? sel.color : '#dc2626') : 'rgba(110,75,35,0.55)';
      ctx.stroke();
      ctx.setLineDash([]);
      if (sel) {
        ctx.fillStyle = affordable ? sel.color : '#dc2626';
        ctx.font = font(24);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('+', s.x, s.y + 1);
      }
    });
  }

  function drawRange(ctx, x, y, r, color, dashed) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = dashed ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.18)';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = color;
    if (dashed) ctx.setLineDash([8, 6]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // ---- スタンプ（戦場では小さなステッカーとして表示） ----
  function drawUnit(ctx, u, selected, buffed) {
    const def = HD.STAMPS[u.type];
    const img = HD.images[def.img];
    let scale = 1;
    if (u.placeT < 0.2) {
      const k = u.placeT / 0.2;
      scale = 1.45 - 0.45 * (1 - (1 - k) * (1 - k)); // ぺたっと押し付ける
    }
    scale += (u.bounce / 0.15) * 0.12; // 攻撃時に弾む

    ctx.save();
    ctx.translate(u.x, u.y);
    ctx.rotate(u.tilt);
    ctx.scale(scale, scale);

    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    roundRect(ctx, -32, -27, 70, 62, 10);
    ctx.fill();

    ctx.fillStyle = '#fff';
    roundRect(ctx, -35, -31, 70, 62, 10);
    ctx.fill();
    if (img && img.complete && img.naturalWidth) ctx.drawImage(img, -32, -28, 64, 55);
    ctx.lineWidth = 4;
    ctx.strokeStyle = def.color;
    roundRect(ctx, -35, -31, 70, 62, 10);
    ctx.stroke();
    if (selected) {
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#facc15';
      roundRect(ctx, -40, -36, 80, 72, 13);
      ctx.stroke();
    }

    // 役割バッジ
    ctx.beginPath();
    ctx.arc(-31, -27, 12, 0, Math.PI * 2);
    ctx.fillStyle = def.color;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#fff';
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = font(13);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(def.badge, -31, -26);

    // 「父は森！」の射程アップを受けている印（葉っぱ）
    if (buffed) {
      ctx.save();
      ctx.translate(31, -27);
      ctx.rotate(-0.6);
      ctx.beginPath();
      ctx.ellipse(0, 0, 9, 5, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#22c55e';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#fff';
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-7, 0);
      ctx.lineTo(7, 0);
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = '#14532d';
      ctx.stroke();
      ctx.restore();
    }

    // レベル
    if (u.level > 1) {
      roundRect(ctx, 10, 20, 30, 16, 8);
      ctx.fillStyle = '#f59e0b';
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = font(11);
      ctx.fillText('Lv' + u.level, 25, 28.5);
    }
    ctx.restore();
  }

  // ---- 敵（だらけもの） ----
  function drawEnemy(ctx, e, t) {
    const r = e.def.r;
    const bob = Math.sin(t * 6 + e.wobble) * 1.5;
    ctx.save();
    ctx.translate(e.x, e.y + bob);

    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(0, r * 0.9 - bob, r * 0.9, r * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();

    const body = e.flash > 0 ? '#ffffff' : e.def.color;
    ctx.beginPath();
    if (e.def.boss) {
      const spikes = 14;
      for (let i = 0; i <= spikes * 2; i++) {
        const a = (i / (spikes * 2)) * Math.PI * 2 + t * 0.4;
        const rr = i % 2 ? r * 1.2 : r;
        const px = Math.cos(a) * rr;
        const py = Math.sin(a) * rr;
        i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      ctx.closePath();
    } else {
      ctx.ellipse(0, 0, r * 1.08, r, 0, 0, Math.PI * 2);
    }
    ctx.fillStyle = body;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = e.def.dark;
    ctx.stroke();

    // ねむそうな目
    const ex = r * 0.4;
    const ey = -r * 0.12;
    const er = Math.max(2.2, r * 0.24);
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(sx * ex, ey, er, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(sx * ex, ey + er * 0.35, er * 0.55, 0, Math.PI * 2);
      ctx.fillStyle = e.def.boss ? '#ef4444' : '#1f2937';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(sx * ex, ey, er + 0.5, Math.PI, Math.PI * 2);
      ctx.fillStyle = body;
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(sx * ex - er, ey);
      ctx.lineTo(sx * ex + er, ey);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = e.def.dark;
      ctx.stroke();
    }
    // 口
    ctx.beginPath();
    ctx.arc(0, r * 0.38, r * 0.18, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = e.def.dark;
    ctx.stroke();

    // 足止め中の印
    if (e.slowT > 0) {
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.arc(0, 0, r + 5, 0, Math.PI * 2);
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#475569';
      ctx.stroke();
      ctx.setLineDash([]);
    }
    // 弱体化の印
    if (e.markT > 0) {
      ctx.beginPath();
      ctx.arc(0, -r - 9, 7, 0, Math.PI * 2);
      ctx.fillStyle = '#a855f7';
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = font(11);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('!', 0, -r - 8.5);
    }
    ctx.restore();

    // 体力バー
    if (e.hp < e.maxHp) {
      const w = Math.max(22, r * 2 + 4);
      const y = e.y - r - (e.def.boss ? 16 : 10);
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(e.x - w / 2, y, w, 4);
      ctx.fillStyle = e.def.boss ? '#f43f5e' : '#22c55e';
      ctx.fillRect(e.x - w / 2, y, w * Math.max(0, e.hp / e.maxHp), 4);
    }
  }

  function drawProjectile(ctx, p) {
    const color = HD.STAMPS[p.type].shotColor;
    ctx.save();
    ctx.translate(p.x, p.y);
    if (p.type === 'yatchi') {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(0, -8);
      ctx.quadraticCurveTo(6, 0, 0, 5);
      ctx.quadraticCurveTo(-6, 0, 0, -8);
      ctx.fill();
    } else if (p.type === 'fukanou') {
      ctx.rotate(p.x * 0.05);
      ctx.fillStyle = color;
      ctx.fillRect(-4, -4, 8, 8);
    } else {
      const r = p.type === 'zazen' ? 8 : 4.5;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(-r * 0.25, -r * 0.25, r * 0.4, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();
    }
    ctx.restore();
  }

  function drawEffect(ctx, f) {
    const k = f.t / f.life;
    ctx.save();
    ctx.globalAlpha = 1 - k;
    if (f.kind === 'ring') {
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r * (0.35 + 0.65 * k), 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(125,211,252,0.25)';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = f.color;
      ctx.stroke();
    } else if (f.kind === 'spark') {
      ctx.beginPath();
      ctx.arc(f.x, f.y, 4 + 8 * k, 0, Math.PI * 2);
      ctx.lineWidth = 2;
      ctx.strokeStyle = f.color;
      ctx.stroke();
    } else if (f.kind === 'poof') {
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const d = f.r * (0.4 + 1.2 * k);
        ctx.beginPath();
        ctx.arc(f.x + Math.cos(a) * d, f.y + Math.sin(a) * d, f.r * 0.35 * (1 - k * 0.5), 0, Math.PI * 2);
        ctx.fillStyle = f.color;
        ctx.fill();
      }
    } else if (f.kind === 'text') {
      outlinedText(ctx, f.text, f.x, f.y - 26 * k, 16, f.color);
    }
    ctx.restore();
  }

  HD.render = function (ctx, game, ui) {
    if (!background) background = buildBackground();
    ctx.drawImage(background, 0, 0);
    drawHouse(ctx, game, ui.houseShake);
    drawSlots(ctx, game, ui);

    // 射程・効果範囲の表示
    const selType = selectedType(game, ui);
    if (selType && ui.hoverSlot >= 0 && !game.unitAtSlot(ui.hoverSlot)) {
      const s = HD.SLOTS[ui.hoverSlot];
      drawUnitArea(ctx, game, selType, 1, s.x, s.y, null);
    }
    if (ui.selectedUnit) {
      const u = ui.selectedUnit;
      drawUnitArea(ctx, game, u.type, u.level, u.x, u.y, u);
    }

    const enemies = game.enemies.filter((e) => !e.gone).sort((a, b) => a.y - b.y);
    for (const e of enemies) drawEnemy(ctx, e, game.time);
    for (const u of game.units) {
      drawUnit(ctx, u, u === ui.selectedUnit, HD.canAttack(u.type) && game.rangeBuffFor(u) > 0);
    }
    for (const p of game.projectiles) drawProjectile(ctx, p);
    for (const f of game.effects) drawEffect(ctx, f);

    if (ui.paused && !game.isOver) {
      ctx.fillStyle = 'rgba(30,20,10,0.45)';
      ctx.fillRect(0, 0, HD.W, HD.H);
      outlinedText(ctx, '一時停止中', HD.W / 2, HD.H / 2 - 10, 40, '#7c2d12');
      outlinedText(ctx, 'スペースキーか「再開」で戻る', HD.W / 2, HD.H / 2 + 30, 16, '#7c2d12');
    }
  };
})();
