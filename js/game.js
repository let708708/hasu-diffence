// ゲーム状態と進行（手札、ウェーブ、移動、攻撃、おやつ、勝敗）
(function () {
  'use strict';
  const HD = window.HD;

  class Game {
    constructor(emit, rng) {
      this.emit = emit || function () {};
      this.rng = rng || Math.random;
      this.reset();
    }

    reset() {
      const C = HD.CONFIG;
      this.hp = C.baseHp;
      this.maxHp = C.baseHp;
      this.snack = C.startSnack;
      this.earned = 0;
      this.wave = 0;
      this.totalWaves = HD.WAVES.length;
      this.state = 'prep'; // prep | wave | won | lost
      this.units = [];
      this.enemies = [];
      this.projectiles = [];
      this.effects = [];
      this.queue = [];
      this.waveTime = 0;
      this.time = 0;
      this.halfWarned = false;
      this.nextId = 1;
      // 最初の手札には攻撃できるスタンプを2枚以上入れる
      this.hand = HD.dealHand(this.rng, 2);
      this.freeRerolls = 0;
    }

    get isOver() {
      return this.state === 'won' || this.state === 'lost';
    }

    canStartWave() {
      return this.state === 'prep' && this.wave < this.totalWaves;
    }

    startWave() {
      if (!this.canStartWave()) return false;
      this.wave++;
      this.queue = HD.buildWave(HD.WAVES[this.wave - 1]);
      this.waveTime = 0;
      this.state = 'wave';
      this.emit('waveStart', { wave: this.wave, last: this.wave === this.totalWaves });
      return true;
    }

    enemiesLeft() {
      return this.queue.length + this.enemies.filter((e) => !e.gone).length;
    }

    // ---- 手札 ----
    rerollCost() {
      return this.freeRerolls > 0 ? 0 : HD.REROLL_COST;
    }

    reroll() {
      if (this.isOver) return 'over';
      const cost = this.rerollCost();
      if (this.snack < cost) return 'snack';
      if (cost === 0) this.freeRerolls--;
      else this.snack -= cost;
      this.hand = HD.dealHand(this.rng, 0);
      this.emit('reroll', { free: cost === 0 });
      return 'ok';
    }

    // ---- スタンプの操作 ----
    unitAtSlot(slot) {
      return this.units.find((u) => u.slot === slot) || null;
    }

    // 手札の index 番目のスタンプを配置ポイント slot に貼る
    place(slot, index) {
      const type = this.hand[index];
      if (!type) return 'nocard';
      const def = HD.STAMPS[type];
      if (this.isOver || this.unitAtSlot(slot)) return 'occupied';
      if (this.snack < def.cost) return 'snack';
      this.snack -= def.cost;
      const p = HD.SLOTS[slot];
      const unit = {
        id: this.nextId++,
        type,
        slot,
        x: p.x,
        y: p.y,
        level: 1,
        spent: def.cost,
        cooldown: 0,
        placeT: 0,
        bounce: 0,
        timer: 0, // 成長・おやつ生産用
        grow: 0,
        tilt: (((slot * 37) % 11) - 5) * 0.012, // 手で貼ったような少しの傾き
      };
      this.units.push(unit);
      // 使ったカードの場所に新しいカードを補充（ほかの手札と重ならないように）
      const others = this.hand.filter((_, i) => i !== index);
      this.hand[index] = HD.drawCard(others, this.rng);
      this.emit('place', unit);
      this.emit('deal', { index });
      return 'ok';
    }

    upgrade(unit) {
      const cost = HD.upgradeCost(unit.type, unit.level);
      if (cost == null) return 'max';
      if (this.snack < cost) return 'snack';
      this.snack -= cost;
      unit.spent += cost;
      unit.level++;
      unit.placeT = 0;
      this.emit('upgrade', unit);
      return 'ok';
    }

    sellValue(unit) {
      return Math.floor(unit.spent * HD.CONFIG.sellRate);
    }

    sell(unit) {
      const refund = this.sellValue(unit);
      this.snack += refund;
      this.units = this.units.filter((u) => u !== unit);
      this.emit('sell', { unit, refund });
      return refund;
    }

    // 「父は森！」による射程アップ（いちばん高い効果だけ）
    rangeBuffFor(unit) {
      let best = 0;
      for (const f of this.units) {
        if (f === unit || f.type !== 'chichi') continue;
        const st = HD.unitStats(f.type, f.level);
        if (Math.hypot(f.x - unit.x, f.y - unit.y) <= st.aura) best = Math.max(best, st.rangeBuff);
      }
      return best;
    }

    // 実際の性能（レベル、成長、森の効果を反映）
    effectiveStats(unit) {
      const st = HD.unitStats(unit.type, unit.level);
      if (st.noAttack) return st;
      st.buff = this.rangeBuffFor(unit);
      st.range *= 1 + st.buff;
      st.damage += unit.grow;
      return st;
    }

    // ---- 毎フレームの更新 ----
    update(dt) {
      this.updateEffects(dt);
      if (this.isOver) return;
      this.time += dt;

      if (this.state === 'wave') {
        this.waveTime += dt;
        while (this.queue.length && this.queue[0].t <= this.waveTime) {
          this.spawn(this.queue.shift().type);
        }
      }

      this.updateEnemies(dt);
      if (this.isOver) return;
      this.updateUnits(dt);
      this.updateProjectiles(dt);
      this.enemies = this.enemies.filter((e) => !e.gone);

      if (this.state === 'wave' && !this.queue.length && !this.enemies.length) this.endWave();
    }

    endWave() {
      const bonus = HD.CONFIG.waveBonus;
      this.snack += bonus;
      this.earned += bonus;

      // 「母は偉大なり！」の回復
      let heal = 0;
      for (const u of this.units) {
        if (u.type === 'haha') heal += HD.unitStats(u.type, u.level).heal;
      }
      const healed = Math.min(heal, this.maxHp - this.hp);
      if (healed > 0) {
        this.hp += healed;
        this.effects.push({ kind: 'text', x: HD.HOUSE.x, y: HD.HOUSE.y - 50, t: 0, life: 1.2, text: '+' + healed, color: '#db2777' });
        this.emit('heal', { amount: healed });
      }

      if (this.wave >= this.totalWaves) {
        this.state = 'won';
        this.emit('won');
      } else {
        this.state = 'prep';
        this.freeRerolls = 1; // 持ち越せるのは1回まで
        this.emit('waveClear', { wave: this.wave, bonus });
      }
    }

    spawn(type) {
      const def = HD.ENEMIES[type];
      const p = HD.pathPoint(0);
      this.enemies.push({
        id: this.nextId++,
        type,
        def,
        hp: def.hp,
        maxHp: def.hp,
        d: 0,
        x: p.x,
        y: p.y,
        slowT: 0,
        slowF: 1,
        markT: 0,
        markF: 0,
        flash: 0,
        gone: false,
        wobble: this.rng() * Math.PI * 2,
      });
      if (def.boss) this.emit('bossSpawn');
    }

    updateEnemies(dt) {
      for (const e of this.enemies) {
        if (e.gone) continue;
        e.flash = Math.max(0, e.flash - dt);
        if (e.slowT > 0) {
          e.slowT -= dt;
          if (e.slowT <= 0) e.slowF = 1;
        }
        if (e.markT > 0) {
          e.markT -= dt;
          if (e.markT <= 0) e.markF = 0;
        }
        e.d += e.def.speed * e.slowF * dt;

        if (e.d >= HD.PATH_LEN) {
          e.gone = true;
          this.hp = Math.max(0, this.hp - e.def.damage);
          this.effects.push({ kind: 'text', x: HD.HOUSE.x, y: HD.HOUSE.y - 50, t: 0, life: 1, text: '-' + e.def.damage, color: '#dc2626' });
          this.emit('houseHit', { damage: e.def.damage, boss: !!e.def.boss });
          if (this.hp <= 0) {
            this.state = 'lost';
            this.emit('lost');
            return;
          }
          if (!this.halfWarned && this.hp <= this.maxHp / 2) {
            this.halfWarned = true;
            this.emit('half');
          }
          continue;
        }
        const p = HD.pathPoint(e.d);
        e.x = p.x;
        e.y = p.y;
      }
    }

    updateUnits(dt) {
      for (const u of this.units) {
        u.placeT += dt;
        u.bounce = Math.max(0, u.bounce - dt);
        const base = HD.unitStats(u.type, u.level);

        // ウェーブ中だけ進む、時間で効果が出るスタンプ
        if (this.state === 'wave' && (base.incomeEvery || base.growEvery)) {
          u.timer += dt;
          const every = base.incomeEvery || base.growEvery;
          if (u.timer >= every) {
            u.timer -= every;
            if (base.income) {
              this.snack += base.income;
              this.earned += base.income;
              u.bounce = 0.15;
              this.effects.push({ kind: 'text', x: u.x, y: u.y - 30, t: 0, life: 1, text: '+' + base.income, color: '#c2410c' });
              this.emit('income', { amount: base.income });
            } else if (u.grow < base.growCap) {
              u.grow++;
              u.bounce = 0.15;
              this.effects.push({ kind: 'text', x: u.x, y: u.y - 30, t: 0, life: 1, text: '育った！', color: '#15803d' });
            }
          }
        }

        if (base.noAttack) continue;
        u.cooldown -= dt;
        if (u.cooldown > 0) continue;

        const st = this.effectiveStats(u);
        const r2 = st.range * st.range;
        let target = null;
        for (const e of this.enemies) {
          if (e.gone) continue;
          const dx = e.x - u.x;
          const dy = e.y - u.y;
          // 射程内で、いちばんおうちに近い（先頭の）敵を狙う
          if (dx * dx + dy * dy <= r2 && (!target || e.d > target.d)) target = e;
        }
        if (!target) {
          u.cooldown = 0;
          continue;
        }
        this.projectiles.push({ x: u.x, y: u.y - 8, target, tx: target.x, ty: target.y, type: u.type, stats: st, done: false });
        u.cooldown = st.interval;
        u.bounce = 0.15;
        this.emit('shot', { type: u.type });
      }
    }

    updateProjectiles(dt) {
      const step = HD.CONFIG.projectileSpeed * dt;
      for (const p of this.projectiles) {
        if (p.target && !p.target.gone) {
          p.tx = p.target.x;
          p.ty = p.target.y;
        }
        const dx = p.tx - p.x;
        const dy = p.ty - p.y;
        const dist = Math.hypot(dx, dy);
        if (dist <= step + 4) {
          this.hit(p);
          p.done = true;
        } else {
          p.x += (dx / dist) * step;
          p.y += (dy / dist) * step;
        }
      }
      this.projectiles = this.projectiles.filter((p) => !p.done);
    }

    hit(p) {
      const s = p.stats;
      const color = HD.STAMPS[p.type].shotColor;
      if (s.splash) {
        for (const e of this.enemies) {
          if (e.gone) continue;
          if (Math.hypot(e.x - p.tx, e.y - p.ty) <= s.splash + e.def.r * 0.5) this.damage(e, s.damage);
        }
        this.effects.push({ kind: 'ring', x: p.tx, y: p.ty, t: 0, life: 0.35, r: s.splash, color });
        return;
      }
      const t = p.target;
      if (t && !t.gone) {
        this.damage(t, s.damage);
        if (s.slow) {
          t.slowF = Math.min(t.slowF, s.slow);
          t.slowT = Math.max(t.slowT, s.slowTime);
        }
        if (s.mark) {
          t.markF = Math.max(t.markF, s.mark);
          t.markT = Math.max(t.markT, s.markTime);
        }
      }
      if (p.type === 'zazen') this.effects.push({ kind: 'ring', x: p.tx, y: p.ty, t: 0, life: 0.3, r: 26, color });
      else this.effects.push({ kind: 'spark', x: p.tx, y: p.ty, t: 0, life: 0.2, color });
    }

    damage(e, amount) {
      if (e.markT > 0) amount *= 1 + e.markF;
      e.hp -= amount;
      e.flash = 0.08;
      if (e.hp > 0 || e.gone) return;
      e.gone = true;
      this.snack += e.def.reward;
      this.earned += e.def.reward;
      this.effects.push({ kind: 'poof', x: e.x, y: e.y, t: 0, life: 0.4, r: e.def.r, color: e.def.color });
      this.effects.push({ kind: 'text', x: e.x, y: e.y - e.def.r, t: 0, life: 0.8, text: '+' + e.def.reward, color: '#c2410c' });
      if (e.def.boss) this.emit('bossDown');
      else this.emit('kill');
    }

    updateEffects(dt) {
      for (const f of this.effects) f.t += dt;
      this.effects = this.effects.filter((f) => f.t < f.life);
    }
  }

  HD.Game = Game;
})();
