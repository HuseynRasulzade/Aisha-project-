// Per-page behaviour. Each block runs only if its elements exist on the current page.
(() => {
  const { t, store, day, esc, hooks, $ } = App;
  const q = s => document.querySelector(s);
  const MOODS = [['Good', '😊', 5], ['Okay', '🙂', 4], ['Neutral', '😐', 3], ['Low', '😔', 2], ['Rough', '😣', 1]];
  const MOOD_REPLY = {
    Good: 'Lovely. Hold on to what is going well today.',
    Okay: 'Steady is fine. A small pause might still help.',
    Neutral: 'Neutral is a valid place to be. Notice what you need.',
    Low: 'Sorry it feels heavy. Try a slow breath or write a few lines.',
    Rough: 'That sounds hard. Be gentle with yourself and consider reaching out to someone you trust.',
  };
  const moodScore = m => (MOODS.find(x => x[0] === m) || [0, 0, 0])[2];
  const AZ_M = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avqust', 'sentyabr', 'oktyabr', 'noyabr', 'dekabr'];
  const AZ_D = ['B.', 'B.e.', 'Ç.a.', 'Çər.', 'C.a.', 'Cüm.', 'Şən.'];
  const fmtDate = (d, opts) => {
    if (App.lang === 'az') {
      if (opts.weekday) return AZ_D[d.getDay()];
      return d.getDate() + ' ' + AZ_M[d.getMonth()];
    }
    return d.toLocaleDateString(App.lang, opts);
  };
  const dateLabel = (iso, opts) => fmtDate(new Date(iso + 'T12:00:00'), opts);

  // ---------- Tabs (diary, calm, health, more) ----------
  const tabBtns = document.querySelectorAll('.tabs [data-tab]');
  if (tabBtns.length) {
    const show = name => {
      if (!$('tab-' + name)) name = tabBtns[0].dataset.tab;
      tabBtns.forEach(b => b.classList.toggle('on', b.dataset.tab === name));
      document.querySelectorAll('.tabpanel').forEach(p => p.classList.toggle('on', p.id === 'tab-' + name));
      const on = q('.tabs .on'); if (on && on.scrollIntoView) on.scrollIntoView({ inline: 'center', block: 'nearest' });
    };
    tabBtns.forEach(b => b.onclick = () => { history.replaceState(null, '', '#' + b.dataset.tab); show(b.dataset.tab); });
    window.addEventListener('hashchange', () => show(location.hash.slice(1)));
    show(location.hash.slice(1));
  }

  // ---------- Home: onboarding + tool grid ----------
  if ($('toolGrid')) {
    const tools = [
      ['chat', 'Chat', 'Talk any time, without judgement.', 'calm.html#chat'],
      ['book', 'Journal & mood', 'Emotion wheel and gentle insights.', 'diary.html'],
      ['wind', 'Breathing', '4-7-8 and box breathing.', 'calm.html#breathing'],
      ['leaf', 'Meditations', 'Body scan, self-compassion, sleep.', 'calm.html#meditation'],
      ['rain', 'Soundscapes', 'Rain, ocean, forest mixes.', 'calm.html#sounds'],
      ['brain', 'Reframe thoughts', 'Balanced thinking with CBT.', 'diary.html'],
      ['target', 'Habits & challenges', 'Tiny steps toward change.', 'diary.html#habits'],
      ['calendar', 'Planner', 'Tasks, calendar and reminders.', 'health.html#meds'],
      ['compass', 'Programs', 'Multi-week guided paths.', 'more.html#programs'],
      ['person', 'Movement & yoga', 'Short stretches for body and mind.', 'health.html#yoga'],
      ['heart', 'Gratitude', 'A two-minute daily practice.', 'diary.html#gratitude'],
      ['clipboard', 'Assessments', 'PHQ-9, GAD-7 self-checks.', 'more.html#assessments'],
    ];
    hooks.push(() => {
      $('toolGrid').innerHTML = tools.map(([i, title, d, href]) =>
        `<a class="card link" href="${href}"><span class="ico">${icon(i)}</span><h3>${t(title)}</h3><p>${t(d)}</p></a>`).join('');
    });
  }

  if ($('onboard')) {
    const slides = [
      ['Welcome to Sakina', 'Your gentle companion for calm, focus and emotional wellbeing.'],
      ['Check in daily', 'Log your mood and notice how you really feel.'],
      ['Breathe & meditate', 'Short guided practices to settle your body.'],
      ['Reflect & grow', 'Journal, reframe thoughts and build habits.'],
      ['Private by design', 'Your data stays encrypted and yours alone.'],
    ];
    let idx = 0;
    const ob = $('onboard');
    const render = () => {
      $('obTitle').textContent = t(slides[idx][0]);
      $('obText').textContent = t(slides[idx][1]);
      $('dots').innerHTML = slides.map((_, i) => `<i class="${i === idx ? 'on' : ''}"></i>`).join('');
      $('prev').style.visibility = idx ? 'visible' : 'hidden';
      $('next').textContent = t(idx === slides.length - 1 ? 'Start' : 'Next');
    };
    const close = () => { ob.classList.remove('open'); try { sessionStorage.setItem('seen', '1'); } catch (e) {} };
    $('next').onclick = () => idx < slides.length - 1 ? (idx++, render()) : close();
    $('prev').onclick = () => { if (idx) { idx--; render(); } };
    $('skip').onclick = close;
    hooks.push(render);
    let seen = false; try { seen = sessionStorage.getItem('seen'); } catch (e) {}
    if (!seen) ob.classList.add('open');
  }

  // ---------- Dashboard ----------
  if ($('moods') && $('statCards')) {
    const paintMood = () => {
      const cur = (store.get('moods', []).find(x => x.d === day()) || {}).m;
      $('moods').innerHTML = MOODS.map(([k, e]) =>
        `<button class="${cur === k ? 'sel' : ''}" data-m="${k}">${e}<span>${t(k)}</span></button>`).join('');
      $('moodMsg').textContent = cur ? t(MOOD_REPLY[cur]) : '';
      $('moods').querySelectorAll('button').forEach(b => b.onclick = () => {
        const log = store.get('moods', []).filter(x => x.d !== day());
        log.push({ d: day(), m: b.dataset.m });
        store.set('moods', log);
        paintMood(); paintStats();
      });
    };
    const streak = () => {
      const days = new Set([...store.get('moods', []).map(x => x.d), ...store.get('journal', []).map(x => x.d)]);
      let n = 0, d = new Date();
      if (!days.has(day(d))) d.setDate(d.getDate() - 1);
      while (days.has(day(d))) { n++; d.setDate(d.getDate() - 1); }
      return n;
    };
    const paintStats = () => {
      const water = (store.get('water', {})[day()]) || 0;
      const cards = [
        ['flame', streak(), 'Day streak'],
        ['smile', store.get('moods', []).length, 'Check-ins'],
        ['droplet', water + '/8', 'Glasses today'],
        ['wind', store.get('breaths', 0), 'Breathing sessions'],
      ];
      $('statCards').innerHTML = cards.map(([i, v, l]) =>
        `<div class="stat"><span class="ico">${icon(i)}</span><strong>${v}</strong><span>${t(l)}</span></div>`).join('');
      const log = store.get('moods', []);
      const bars = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(); d.setDate(d.getDate() - i);
        const iso = day(d), e = log.find(x => x.d === iso);
        bars.push(`<div class="bar"><div class="fill" style="height:${e ? moodScore(e.m) * 20 : 4}%"></div><span>${dateLabel(iso, { weekday: 'short' })}</span></div>`);
      }
      $('weekBars').innerHTML = bars.join('');
      const wk = log.filter(x => (new Date() - new Date(x.d + 'T12:00:00')) / 864e5 < 7);
      $('trendTxt').textContent = wk.length < 2 ? t('Log at least two days to see your trend.')
        : `${t('Average this week')}: ${(wk.reduce((a, x) => a + moodScore(x.m), 0) / wk.length).toFixed(1)} / 5`;
      $('sumTxt').textContent = wk.length ? `${wk.length} ${t('check-ins in the last 7 days.')}` : t('Add a few entries first to see your summary.');
    };
    hooks.push(() => { paintMood(); paintStats(); });
  }

  // ---------- Diary ----------
  if ($('jList')) {
    let jMood = 'Okay';
    const paint = () => {
      $('jMood').innerHTML = MOODS.map(([k, e]) =>
        `<button type="button" class="${jMood === k ? 'sel' : ''}" data-m="${k}" title="${t(k)}">${e}</button>`).join('');
      $('jMood').querySelectorAll('button').forEach(b => b.onclick = () => { jMood = b.dataset.m; paint(); });
      const list = store.get('journal', []).slice().reverse();
      $('jList').innerHTML = list.length ? list.map(e =>
        `<article class="item"><div class="item-top"><span>${(MOODS.find(x => x[0] === e.m) || [0, ''])[1]} ${dateLabel(e.d, { day: 'numeric', month: 'long' })}</span>
         <button class="x" data-del="${e.id}" aria-label="${t('Delete')}">${icon('trash')}</button></div><p>${esc(e.text)}</p></article>`).join('')
        : `<p class="empty">${t('No entries yet.')}</p>`;
      $('jList').querySelectorAll('[data-del]').forEach(b => b.onclick = () => {
        store.set('journal', store.get('journal', []).filter(e => String(e.id) !== b.dataset.del)); paint();
      });
      // gratitude
      const gl = store.get('gratitude', []).slice().reverse();
      $('gList').innerHTML = gl.length ? gl.map(e =>
        `<article class="item"><div class="item-top"><span>${dateLabel(e.d, { day: 'numeric', month: 'long' })}</span></div><ul class="bul">${e.items.map(i => `<li>${esc(i)}</li>`).join('')}</ul></article>`).join('')
        : `<p class="empty">${t('No entries yet.')}</p>`;
      // habits
      const hs = store.get('habits', []);
      $('hList').innerHTML = hs.length ? hs.map(h => {
        const done = h.done.includes(day());
        return `<article class="item habit"><button class="check ${done ? 'on' : ''}" data-h="${h.id}" aria-label="${t('Mark done today')}">${icon('check')}</button>
          <div class="grow"><strong>${esc(h.name)}</strong><span class="muted small">${h.done.length} ${t('days done')}</span></div>
          <button class="x" data-hx="${h.id}" aria-label="${t('Delete')}">${icon('trash')}</button></article>`;
      }).join('') : `<p class="empty">${t('No habits yet. Add a tiny one.')}</p>`;
      $('hList').querySelectorAll('[data-h]').forEach(b => b.onclick = () => {
        const all = store.get('habits', []), h = all.find(x => String(x.id) === b.dataset.h);
        h.done = h.done.includes(day()) ? h.done.filter(d => d !== day()) : [...h.done, day()];
        store.set('habits', all); paint();
      });
      $('hList').querySelectorAll('[data-hx]').forEach(b => b.onclick = () => {
        store.set('habits', store.get('habits', []).filter(x => String(x.id) !== b.dataset.hx)); paint();
      });
    };
    $('jSave').onclick = () => {
      const text = $('jText').value.trim(); if (!text) return;
      const all = store.get('journal', []); all.push({ id: Date.now(), d: day(), m: jMood, text });
      store.set('journal', all); $('jText').value = ''; paint();
    };
    $('gSave').onclick = () => {
      const items = ['g1', 'g2', 'g3'].map(i => $(i).value.trim()).filter(Boolean); if (!items.length) return;
      const all = store.get('gratitude', []); all.push({ d: day(), items });
      store.set('gratitude', all); ['g1', 'g2', 'g3'].forEach(i => $(i).value = ''); paint();
    };
    $('hAdd').onclick = () => {
      const name = $('hName').value.trim(); if (!name) return;
      const all = store.get('habits', []); all.push({ id: Date.now(), name, done: [] });
      store.set('habits', all); $('hName').value = ''; paint();
    };
    hooks.push(paint);
  }

  // ---------- Calm: chat ----------
  if ($('chatLog')) {
    const msgs = [{ me: false, k: 'Hi, I am here to listen. How are you feeling right now?' }];
    const replies = [
      'Thank you for sharing that. Tell me a little more.',
      'That sounds like a lot to carry. What feels hardest about it?',
      'I hear you. What would feel kind to do for yourself right now?',
      'It makes sense that you feel this way. Would a slow breath together help?',
      'You are not alone in this. What is one small thing that could help today?',
    ];
    const danger = /suicid|kill myself|hurt myself|end my life|öldür|intihar/i;
    let n = 0;
    const paint = () => {
      $('chatLog').innerHTML = msgs.map(m => `<div class="msg ${m.me ? 'me' : 'bot'}">${m.me ? esc(m.text) : t(m.k)}</div>`).join('');
      $('chatLog').scrollTop = $('chatLog').scrollHeight;
    };
    $('chatForm').onsubmit = e => {
      e.preventDefault();
      const text = $('chatIn').value.trim(); if (!text) return;
      msgs.push({ me: true, text }); $('chatIn').value = '';
      msgs.push({ me: false, k: danger.test(text)
        ? 'I am concerned about your safety. Please contact your local emergency number or someone you trust right now.'
        : replies[n++ % replies.length] });
      paint();
    };
    hooks.push(paint);
  }

  // ---------- Calm: breathing ----------
  if ($('bMode')) {
    const MODES = { box: ['Box', [4, 4, 4, 4]], '478': ['4-7-8', [4, 7, 8, 0]], calm: ['Gentle', [5, 0, 5, 0]] };
    const PH = ['Breathe in…', 'Hold…', 'Breathe out…', 'Hold…'];
    let mode = 'box', running = false, timer, cycles = 0;
    const paintSeg = () => {
      $('bMode').innerHTML = Object.entries(MODES).map(([k, v]) => `<button class="${mode === k ? 'on' : ''}" data-k="${k}">${t(v[0])}</button>`).join('');
      $('bMode').querySelectorAll('button').forEach(b => b.onclick = () => { if (running) stop(); mode = b.dataset.k; paintSeg(); });
      $('bBtn').textContent = t(running ? 'Stop' : 'Start');
      $('bCycles').textContent = cycles ? `${t('Cycles')}: ${cycles}` : '';
      if (!running) $('bLabel').textContent = t('Ready when you are');
    };
    const stop = () => { running = false; clearTimeout(timer); $('orb').style.transform = ''; $('orbCount').textContent = '·'; paintSeg(); };
    const run = (phase = 0) => {
      const dur = MODES[mode][1][phase];
      if (!dur) return run((phase + 1) % 4);
      const orb = $('orb');
      orb.style.transitionDuration = dur + 's';
      if (phase === 0) orb.style.transform = 'scale(1.45)';
      if (phase === 2) orb.style.transform = 'scale(1)';
      $('bLabel').textContent = t(PH[phase]);
      let left = dur; $('orbCount').textContent = left;
      const tick = () => {
        left--;
        if (left > 0) { $('orbCount').textContent = left; timer = setTimeout(tick, 1000); }
        else { if (phase === 3 || (phase === 2 && !MODES[mode][1][3])) { cycles++; paintSeg(); } run((phase + 1) % 4); }
      };
      timer = setTimeout(tick, 1000);
    };
    $('bBtn').onclick = () => {
      if (running) return stop();
      running = true; store.set('breaths', store.get('breaths', 0) + 1);
      paintSeg(); run(0);
    };
    hooks.push(paintSeg);
  }

  // ---------- Calm: meditation ----------
  if ($('medList')) {
    const MEDS = [
      ['Body scan', 5, 'Move attention slowly from head to toe.'],
      ['Self-compassion', 8, 'Offer yourself the kindness you would give a friend.'],
      ['Sleep wind-down', 10, 'Let the day soften before you rest.'],
      ['RAIN practice', 6, 'Recognise, allow, investigate and nurture a feeling.'],
    ];
    const LINES = ['Notice your breath.', 'Relax your shoulders.', 'Let thoughts pass like clouds.', 'Return gently to the breath.'];
    let active = -1, left = 0, timer;
    const fmt = s => Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
    const paint = () => {
      $('medList').innerHTML = MEDS.map((m, i) => `<article class="card med ${active === i ? 'live' : ''}">
        <span class="ico">${icon(i === 2 ? 'moon' : 'leaf')}</span><h3>${t(m[0])}</h3><p>${t(m[2])}</p>
        <div class="med-row"><span class="chip-s">${m[1]} ${t('min')}</span>
        <button class="btn ${active === i ? 'btn-soft' : 'btn-dark'} sm" data-i="${i}">${icon(active === i ? 'stop' : 'play')}${t(active === i ? 'Stop' : 'Start')}</button></div>
        ${active === i ? `<div class="med-live"><strong id="medT">${fmt(left)}</strong><span id="medL">${t(LINES[Math.floor((MEDS[i][1] * 60 - left) / 20) % LINES.length])}</span></div>` : ''}</article>`).join('');
      $('medList').querySelectorAll('[data-i]').forEach(b => b.onclick = () => {
        const i = +b.dataset.i; clearInterval(timer);
        if (active === i) { active = -1; return paint(); }
        active = i; left = MEDS[i][1] * 60; paint();
        timer = setInterval(() => {
          left--; if (left <= 0) { clearInterval(timer); active = -1; return paint(); }
          const tt = $('medT'); if (tt) tt.textContent = fmt(left);
          const ll = $('medL'); if (ll) ll.textContent = t(LINES[Math.floor((MEDS[i][1] * 60 - left) / 20) % LINES.length]);
        }, 1000);
      });
    };
    hooks.push(paint);
  }

  // ---------- Calm: sounds (Web Audio noise) ----------
  if ($('soundList')) {
    const SOUNDS = [['rain', 'Rain', 'rain'], ['ocean', 'Ocean', 'waves'], ['wind', 'Wind', 'wind'], ['forest', 'Forest', 'tree']];
    let ctx; const playing = {};
    const build = kind => {
      const len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
      const f = ctx.createBiquadFilter(), g = ctx.createGain();
      const cfg = { rain: ['highpass', 1200, 0.7, 0.22], ocean: ['lowpass', 450, 0.7, 0.5], wind: ['bandpass', 500, 0.8, 0.5], forest: ['bandpass', 3200, 4, 0.12] }[kind];
      f.type = cfg[0]; f.frequency.value = cfg[1]; f.Q.value = cfg[2]; g.gain.value = cfg[3];
      src.connect(f); f.connect(g); g.connect(ctx.destination);
      const nodes = [src];
      if (kind === 'ocean' || kind === 'wind') {
        const lfo = ctx.createOscillator(), depth = ctx.createGain();
        lfo.frequency.value = kind === 'ocean' ? 0.12 : 0.2; depth.gain.value = cfg[3] * 0.7;
        lfo.connect(depth); depth.connect(g.gain); lfo.start(); nodes.push(lfo);
      }
      src.start();
      return nodes;
    };
    const paint = () => {
      $('soundList').innerHTML = SOUNDS.map(([k, n, i]) => `<button class="card sound ${playing[k] ? 'on' : ''}" data-s="${k}">
        <span class="ico">${icon(i)}</span><h3>${t(n)}</h3><span class="chip-s">${t(playing[k] ? 'Playing' : 'Tap to play')}</span></button>`).join('');
      $('soundList').querySelectorAll('[data-s]').forEach(b => b.onclick = () => {
        const k = b.dataset.s;
        if (!ctx) { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return; ctx = new AC(); }
        if (ctx.state === 'suspended') ctx.resume();
        if (playing[k]) { playing[k].forEach(n => n.stop()); delete playing[k]; } else playing[k] = build(k);
        paint();
      });
    };
    hooks.push(paint);
  }

  // ---------- Health ----------
  if ($('glasses')) {
    const goal = 8;
    const paintW = () => {
      const n = store.get('water', {})[day()] || 0;
      $('glasses').innerHTML = Array.from({ length: goal }, (_, i) => `<span class="glass ${i < n ? 'on' : ''}">${icon('droplet')}</span>`).join('');
      $('waterTxt').textContent = `${n} / ${goal} ${t('glasses')}`;
    };
    const bump = d => { const w = store.get('water', {}); w[day()] = Math.max(0, Math.min(12, (w[day()] || 0) + d)); store.set('water', w); paintW(); };
    $('wPlus').onclick = () => bump(1); $('wMinus').onclick = () => bump(-1);

    const paintS = () => {
      $('sleepVal').textContent = $('sleepRange').value + ' ' + t('h');
      const log = store.get('sleep', {}), bars = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(); d.setDate(d.getDate() - i); const iso = day(d), h = log[iso];
        bars.push(`<div class="bar"><div class="fill alt" style="height:${h ? Math.min(100, h / 12 * 100) : 4}%"></div><span>${dateLabel(iso, { weekday: 'short' })}</span></div>`);
      }
      $('sleepBars').innerHTML = bars.join('');
    };
    const sl = store.get('sleep', {})[day()]; if (sl) $('sleepRange').value = sl;
    $('sleepRange').oninput = paintS;
    $('sleepSave').onclick = () => { const s = store.get('sleep', {}); s[day()] = +$('sleepRange').value; store.set('sleep', s); paintS(); };

    const paintM = () => {
      const ms = store.get('meds', []);
      $('mList').innerHTML = ms.length ? ms.map(m => `<article class="item habit"><button class="check ${m.taken.includes(day()) ? 'on' : ''}" data-m="${m.id}" aria-label="${t('Mark done today')}">${icon('check')}</button>
        <div class="grow"><strong>${esc(m.name)}</strong><span class="muted small">${icon('bell')} ${m.time}</span></div>
        <button class="x" data-mx="${m.id}" aria-label="${t('Delete')}">${icon('trash')}</button></article>`).join('')
        : `<p class="empty">${t('No reminders yet.')}</p>`;
      $('mList').querySelectorAll('[data-m]').forEach(b => b.onclick = () => {
        const all = store.get('meds', []), m = all.find(x => String(x.id) === b.dataset.m);
        m.taken = m.taken.includes(day()) ? m.taken.filter(d => d !== day()) : [...m.taken, day()]; store.set('meds', all); paintM();
      });
      $('mList').querySelectorAll('[data-mx]').forEach(b => b.onclick = () => { store.set('meds', store.get('meds', []).filter(x => String(x.id) !== b.dataset.mx)); paintM(); });
    };
    $('mAdd').onclick = () => {
      const name = $('mName').value.trim(); if (!name) return;
      const all = store.get('meds', []); all.push({ id: Date.now(), name, time: $('mTime').value || '09:00', taken: [] });
      store.set('meds', all); $('mName').value = ''; paintM();
    };

    const paintC = () => {
      const c = store.get('cycle', null);
      if (c) { $('cStart').value = c.start; $('cLen').value = c.len; }
      if (!c) { $('cOut').textContent = ''; return; }
      const next = new Date(c.start + 'T12:00:00'); next.setDate(next.getDate() + c.len);
      const left = Math.round((next - new Date()) / 864e5);
      $('cOut').textContent = `${t('Next period expected')}: ${fmtDate(next, { day: 'numeric', month: 'long' })} (${left >= 0 ? left + ' ' + t('days left') : Math.abs(left) + ' ' + t('days late')})`;
    };
    $('cSave').onclick = () => { if (!$('cStart').value) return; store.set('cycle', { start: $('cStart').value, len: +$('cLen').value || 28 }); paintC(); };

    const YOGA = [
      ['Morning stretch', 5, ['Reach both arms overhead and breathe in.', 'Fold forward slowly and let your head hang.', 'Roll up one vertebra at a time.']],
      ['Desk reset', 4, ['Roll your shoulders back ten times.', 'Turn your head gently side to side.', 'Stretch your wrists and fingers.']],
      ['Evening wind-down', 8, ['Sit on the floor and fold forward.', 'Lie on your back and hug your knees.', 'Rest with legs up the wall for two minutes.']],
      ['Back relief', 6, ['Move through slow cat and cow.', 'Sink back into child pose.', 'Lie down and twist knees to each side.']],
    ];
    const paintY = () => {
      $('yogaList').innerHTML = YOGA.map(y => `<details class="card yoga"><summary><span class="ico">${icon('person')}</span><div><h3>${t(y[0])}</h3><span class="chip-s">${y[1]} ${t('min')}</span></div></summary>
        <ol>${y[2].map(s => `<li>${t(s)}</li>`).join('')}</ol></details>`).join('');
    };
    hooks.push(() => { paintW(); paintS(); paintM(); paintC(); paintY(); });
  }

  // ---------- More ----------
  if ($('progList')) {
    const PROGS = [
      ['Mindfulness basics', 4, 'Four weeks of short daily practices to build presence.'],
      ['Better sleep', 3, 'Evening routines and wind-downs for deeper rest.'],
      ['Calm through anxiety', 6, 'Breathing and thought-reframing, step by step.'],
      ['Gratitude habit', 3, 'Notice the good in your day with a small daily note.'],
    ];
    const CHALS = [
      ['7 days of journaling', 'Write a few lines every day for a week.'],
      ['Drink 8 glasses for 5 days', 'Hit your water goal five days in a row.'],
      ['3 breathing sessions this week', 'Slow your body down three times.'],
      ['One walk a day', 'Ten minutes outside, any pace.'],
    ];
    const paint = () => {
      const pr = store.get('programs', {}), ch = store.get('challenges', {});
      $('progList').innerHTML = PROGS.map((p, i) => `<article class="card"><span class="ico">${icon('compass')}</span><h3>${t(p[0])}</h3><p>${t(p[2])}</p>
        <div class="med-row"><span class="chip-s">${p[1]} ${t('weeks')}</span><button class="btn ${pr[i] ? 'btn-soft' : 'btn-dark'} sm" data-p="${i}">${t(pr[i] ? 'Enrolled' : 'Start')}</button></div></article>`).join('');
      $('chalList').innerHTML = CHALS.map((c, i) => `<article class="item habit"><span class="ico">${icon('award')}</span>
        <div class="grow"><strong>${t(c[0])}</strong><span class="muted small">${t(c[1])}</span></div>
        <button class="btn ${ch[i] ? 'btn-soft' : 'btn-dark'} sm" data-c="${i}">${t(ch[i] ? 'Joined' : 'Join')}</button></article>`).join('');
      $('progList').querySelectorAll('[data-p]').forEach(b => b.onclick = () => { const o = store.get('programs', {}); o[b.dataset.p] = !o[b.dataset.p]; store.set('programs', o); paint(); });
      $('chalList').querySelectorAll('[data-c]').forEach(b => b.onclick = () => { const o = store.get('challenges', {}); o[b.dataset.c] = !o[b.dataset.c]; store.set('challenges', o); paint(); });
    };
    hooks.push(paint);

    // Library
    const LIB = [
      ['Understanding anxiety', 'Signs, causes and what helps.', 'brain'],
      ['A beginner\'s guide to sleep', 'Habits that make rest easier.', 'moon'],
      ['Self-compassion in practice', 'Talking to yourself like a friend.', 'heart'],
      ['CBT thought records', 'A step-by-step way to rebalance thoughts.', 'pencil'],
      ['Burnout and recovery', 'Spotting it early and recovering well.', 'flame'],
      ['Mindful breathing', 'Five minutes to calm the body.', 'wind'],
    ];
    hooks.push(() => { $('libList').innerHTML = LIB.map(l => `<article class="card"><span class="ico">${icon(l[2])}</span><h3>${t(l[0])}</h3><p>${t(l[1])}</p></article>`).join(''); });

    // PHQ-9
    const Q = [
      'Little interest or pleasure in doing things',
      'Feeling down, depressed, or hopeless',
      'Trouble falling or staying asleep, or sleeping too much',
      'Feeling tired or having little energy',
      'Poor appetite or overeating',
      'Feeling bad about yourself, or that you are a failure or have let yourself or your family down',
      'Trouble concentrating on things, such as reading or watching television',
      'Moving or speaking so slowly that others could notice, or being much more restless than usual',
      'Thoughts that you would be better off dead, or of hurting yourself in some way',
    ];
    const OPT = ['Not at all', 'Several days', 'More than half the days', 'Nearly every day'];
    const paintPhq = () => {
      const keep = {}; $('phqForm').querySelectorAll('input:checked').forEach(r => keep[r.name] = r.value);
      $('phqForm').innerHTML = Q.map((qq, i) => `<fieldset><legend>${i + 1}. ${t(qq)}</legend>
        <div class="opts">${OPT.map((o, v) => `<label><input type="radio" name="q${i}" value="${v}" ${keep['q' + i] == v ? 'checked' : ''}><span>${t(o)}</span></label>`).join('')}</div></fieldset>`).join('')
        + `<button class="btn btn-dark" type="submit">${t('See result')}</button>`;
    };
    $('phqForm').onsubmit = e => {
      e.preventDefault();
      const vals = Q.map((_, i) => { const c = $('phqForm').querySelector(`input[name=q${i}]:checked`); return c ? +c.value : null; });
      if (vals.includes(null)) { $('phqOut').textContent = t('Please answer every question.'); return; }
      const s = vals.reduce((a, b) => a + b, 0);
      const band = s < 5 ? 'Minimal' : s < 10 ? 'Mild' : s < 15 ? 'Moderate' : s < 20 ? 'Moderately severe' : 'Severe';
      $('phqOut').textContent = `${t('Score')}: ${s}/27 — ${t(band)}.` + (vals[8] > 0 ? ' ' + t('You noted thoughts of self-harm. Please contact a professional or emergency services now.') : '');
    };
    hooks.push(paintPhq);

    // Safety plan
    const sp = store.get('safety', {});
    ['sp1', 'sp2', 'sp3', 'sp4'].forEach(id => { if (sp[id]) $(id).value = sp[id]; });
    $('spSave').onclick = () => { const o = {}; ['sp1', 'sp2', 'sp3', 'sp4'].forEach(id => o[id] = $(id).value); store.set('safety', o); $('spOut').textContent = t('Saved on this device.'); };

    // Reports
    hooks.push(() => {
      const moods = store.get('moods', []), j = store.get('journal', []), sl = Object.values(store.get('sleep', {})), w = Object.values(store.get('water', {}));
      const avg = a => a.length ? (a.reduce((x, y) => x + y, 0) / a.length) : 0;
      const rows = [
        ['smile', 'Mood check-ins', moods.length],
        ['chart', 'Average mood (1-5)', moods.length ? avg(moods.map(m => moodScore(m.m))).toFixed(1) : '–'],
        ['pencil', 'Journal entries', j.length],
        ['moon', 'Average sleep (h)', sl.length ? avg(sl).toFixed(1) : '–'],
        ['droplet', 'Average glasses of water', w.length ? avg(w).toFixed(1) : '–'],
        ['wind', 'Breathing sessions', store.get('breaths', 0)],
      ];
      $('repOut').innerHTML = `<div class="grid g3">${rows.map(r => `<div class="stat"><span class="ico">${icon(r[0])}</span><strong>${r[2]}</strong><span>${t(r[1])}</span></div>`).join('')}</div>
        <p class="muted small center">${t('Reports are built from what you log on this device.')}</p>`;
    });
  }

  App.start();
})();
