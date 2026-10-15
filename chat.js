// Task chat: every plan task is done by talking with Aisha. URL: chat.html?task=<planId>.<day>.<taskIdx>
(() => {
  const { t, esc, store, day: today, hooks, $ } = App;
  if (!$('tcLog')) return;
  const [planId, dayS, idxS] = (new URLSearchParams(location.search).get('task') || '').split('.');
  const dayNo = +dayS, idx = +idxS;
  $('backLink').href = 'assistant.html?plan=' + planId;

  let plan = null, msgs = [], quick = [], completed = false, busy = false, doneInfo = null, fatal = '';
  const taskOf = () => { const d = plan && plan.days.find(x => x.day === dayNo); return d && d.tasks[idx]; };
  const dayOf = () => plan && plan.days.find(x => x.day === dayNo);

  const ERR = { day_locked: 'This task is locked. Finish the previous day first.', chat_too_long: 'This conversation has reached its limit. Your progress is saved.',
    rate_limited: 'You are writing too fast. Please wait a little.', unauthorized: 'Your session expired. Please log in again.' };

  function paintHead() {
    const k = taskOf(), d = dayOf();
    if (fatal || !k) { $('taskHead').innerHTML = `<p>${esc(t(fatal || 'This task is locked or not available. Finish the previous day first.'))}</p>`; return; }
    $('taskHead').innerHTML = `
      <p class="eyebrow">${esc(t('Day'))} ${dayNo} · ${esc(d.theme)}</p>
      <h1>${esc(k.title)}</h1>
      ${k.technique ? `<span class="tech">${esc(k.technique)}</span>` : ''}
      ${completed ? `<span class="badge done-b">✓ ${esc(t('Task completed'))}</span>` : ''}
      <details class="more"><summary>${esc(t('About this task'))}</summary>
        <p>${esc(k.details)}</p>
        ${(k.steps || []).length ? `<ol>${k.steps.map(x => `<li>${esc(x)}</li>`).join('')}</ol>` : ''}
        ${k.example ? `<p class="ex"><strong>${esc(t('Example'))}:</strong> ${esc(k.example)}</p>` : ''}</details>`;
  }

  function paintLog(typing) {
    $('tcLog').innerHTML = msgs.map(m => `<div class="msg ${m.role === 'user' ? 'me' : 'bot'}">${esc(m.content)}</div>`).join('')
      + (typing ? `<div class="msg bot typing"><i></i><i></i><i></i></div>` : '');
    $('tcLog').scrollTop = $('tcLog').scrollHeight;
    $('tcQuick').innerHTML = !typing && !busy ? quick.map(q => `<button type="button" class="chip-btn">${esc(q)}</button>`).join('') : '';
    $('tcQuick').querySelectorAll('button').forEach((b, i) => b.onclick = () => send(quick[i]));
  }

  function paintDone() {
    if (!completed) { $('tcDone').hidden = true; return; }
    const d = dayOf();
    const next = d ? d.tasks.findIndex((x, i) => i !== idx && !x.entry && !(doneInfo && doneInfo.doneIdx && doneInfo.doneIdx.includes(i))) : -1;
    $('tcDone').hidden = false;
    $('tcDone').innerHTML = `<strong>✅ ${esc(t('Task completed'))}</strong>
      ${doneInfo && doneInfo.plan_done ? `<p>${esc(t('You finished the whole plan!'))}</p>` : doneInfo && doneInfo.day_done ? `<p>${esc(t('You finished this day. The next day is now unlocked.'))}</p>` : ''}
      <div class="t-nav">${next >= 0 ? `<a class="btn btn-dark" href="chat.html?task=${planId}.${dayNo}.${next}">${esc(t('Next task'))}</a>` : ''}
        <a class="btn ${next >= 0 ? 'btn-soft' : 'btn-dark'}" href="assistant.html?plan=${planId}">${esc(t('Back to my plan'))}</a></div>`;
  }

  async function call(message) {
    const { data, error } = await Auth.sb.functions.invoke('task-chat', {
      body: { plan_id: planId, day: dayNo, task_idx: idx, message, lang: App.lang } });
    if (error) {
      let code = 'failed';
      try { code = (await error.context.json()).error || code; } catch (e) {}
      throw new Error(code);
    }
    return data;
  }

  async function turn(text) {
    busy = true; $('tcSend').disabled = true; quick = [];
    if (text) msgs.push({ role: 'user', content: text });
    paintLog(true);
    try {
      const r = await call(text);
      if (!r.noop) {
        msgs.push({ role: 'assistant', content: r.reply });
        quick = r.suggestions || [];
        if (r.completed && !completed) { completed = true; doneInfo = r; }
        if (r.just_completed) { doneInfo = r; mirrorToDiary(r.answers); }
        paintHead(); paintDone();
      }
    } catch (e) {
      console.error('task-chat failed', e);
      msgs.push({ role: 'assistant', content: t(ERR[e.message] || 'Could not reach Aisha. Please try again.'), err: true });
    } finally {
      busy = false; $('tcSend').disabled = false; paintLog(false);
    }
  }

  const send = text => {
    text = (text || '').trim();
    if (!text || busy) return;
    $('tcIn').value = ''; $('tcIn').style.height = '';
    turn(text);
  };
  $('tcForm').onsubmit = e => { e.preventDefault(); send($('tcIn').value); };
  $('tcIn').onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send($('tcIn').value); } };
  $('tcIn').oninput = () => { $('tcIn').style.height = 'auto'; $('tcIn').style.height = Math.min($('tcIn').scrollHeight, 120) + 'px'; };

  // Finished tasks also appear in the diary (replaces an earlier copy of the same task).
  function mirrorToDiary(text) {
    const k = taskOf(); if (!k || !text) return;
    const tid = `plan-${planId}-${dayNo}-${idx}`;
    const all = store.get('journal', []).filter(e => e.tid !== tid);
    all.push({ id: Date.now(), tid, d: today(), m: '', text, task: k.title });
    store.set('journal', all);
  }

  hooks.push(() => {
    $('tcIn').placeholder = t('Write to Aisha…');
    $('tcNote').textContent = t('Aisha is an AI coach, not a clinician. In danger? Call your local emergency number.');
    if (plan) { paintHead(); paintLog(busy); paintDone(); }
  });

  (async () => {
    if (!Auth.configured) return;
    const user = await Auth.require();
    if (!user) return;
    const { data: p } = await Auth.sb.rpc('get_plan', { p_id: planId });
    plan = p;
    if (!taskOf()) { paintHead(); $('tcForm').hidden = true; return; }
    paintHead();
    const { data: row } = await Auth.sb.from('task_chats').select('messages, completed').eq('plan_id', planId).eq('day', dayNo).eq('task_idx', idx).maybeSingle();
    msgs = (row && row.messages) || [];
    completed = !!(row && row.completed);
    paintHead(); paintDone();
    if (msgs.length) paintLog(false); else turn('');   // brand-new task: Aisha opens the conversation
  })();
})();
