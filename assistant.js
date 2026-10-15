// AI assistant: collect personal problems -> Edge Function -> 7-day plan, saved per user in Supabase.
(() => {
  const { t, esc, hooks, $ } = App;
  if (!$('probForm')) return;

  const SUGGEST = {
    az: ['Özümə güvənmirəm.', 'Gələcəyimlə bağlı nə edəcəyimi bilmirəm.', 'Ailəmlə tez-tez mübahisə edirəm.', 'Hər şeyi təxirə salıram.'],
    en: ['I do not trust myself.', 'I do not know what to do about my future.', 'I argue with my family often.', 'I procrastinate on everything.'],
  };
  const MAX = 6;
  let problems = [];
  let current = null;      // {id, plan, progress, problems, created_at}
  let history = [];
  let busy = false;
  let genKey = '';         // key of the status message currently shown

  const setMsg = (key, ok) => {
    genKey = key || '';
    $('genMsg').className = 'form-msg ' + (ok ? 'ok' : 'err');
    $('genMsg').textContent = key ? t(key) : '';
  };

  // ---------- problems input ----------
  function paintProblems() {
    $('probList').innerHTML = problems.map((p, i) =>
      `<li><span>${esc(p)}</span><button type="button" class="x" data-i="${i}" aria-label="${esc(t('Remove'))}">×</button></li>`).join('');
    $('probList').querySelectorAll('.x').forEach(b => b.onclick = () => { problems.splice(+b.dataset.i, 1); paintProblems(); });
    $('genBtn').disabled = busy || !problems.length;
    $('genBtn').textContent = t(busy ? 'Aisha is writing your plan (about a minute)…' : 'Create my 7-day plan');
    paintSuggest();
  }
  function paintSuggest() {
    const list = (SUGGEST[App.lang] || SUGGEST.en).filter(s => !problems.includes(s));
    $('suggest').innerHTML = list.map(s => `<button type="button" class="chip-btn">${esc(s)}</button>`).join('');
    $('suggest').querySelectorAll('button').forEach((b, i) => b.onclick = () => addProblem(list[i]));
  }
  function addProblem(text) {
    text = (text || '').trim();
    if (!text) return;
    if (problems.length >= MAX) return setMsg('You can add up to 6 problems.', false);
    if (!problems.includes(text)) problems.push(text);
    setMsg('');
    paintProblems();
  }
  $('probForm').onsubmit = e => { e.preventDefault(); addProblem($('probIn').value); $('probIn').value = ''; };
  $('probIn').onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('probForm').requestSubmit(); } };

  // ---------- generate ----------
  async function fetchPlan(id, tries = 3) {
    for (let i = 0; i < tries; i++) {
      const { data, error } = await Auth.sb.rpc('get_plan', { p_id: id });
      if (!error && data) return data;
      console.error('get_plan failed', error);
      if (i < tries - 1) await new Promise(r => setTimeout(r, 1500));
    }
    throw new Error('load_failed');
  }
  $('genBtn').onclick = async () => {
    if (busy || !problems.length) return;
    busy = true; setMsg(''); paintProblems();
    try {
      const { data, error } = await Auth.sb.functions.invoke('generate-plan', { body: { problems, lang: App.lang } });
      if (error) {
        let code = '';
        try { code = (await error.context.json()).error; } catch (e) {}
        throw new Error(code || 'failed');
      }
      current = await fetchPlan(data.id);
      await loadHistory();
      show(current);
      problems = [];
      $('planView').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e) {
      console.error('plan creation failed', e);
      if (e.message === 'load_failed') await loadHistory().catch(() => {});
      paintHistory();
      setMsg(e.message === 'rate_limited' ? 'Daily limit reached. Please try again tomorrow.'
        : e.message === 'unauthorized' ? 'Your session expired. Please log in again.'
        : e.message === 'load_failed' ? 'Your plan was created but could not be opened. Reload the page and pick it from your previous plans.'
        : 'Could not create your plan. Please try again.', false);
    } finally {
      busy = false; paintProblems();
    }
  };

  // ---------- plan view ----------
  const WHEN = { morning: 'Morning', afternoon: 'Afternoon', evening: 'Evening' };
  const taskLink = (r, day, idx) => `chat.html?task=${r.id}.${day}.${idx}`;

  const taskMore = k => (k.steps && k.steps.length) || k.why || k.example ? `
    <details class="more"><summary>${esc(t('How to do it'))}</summary>
      ${(k.steps || []).length ? `<ol>${k.steps.map(x => `<li>${esc(x)}</li>`).join('')}</ol>` : ''}
      ${k.why ? `<p><strong>${esc(t('Why it helps'))}:</strong> ${esc(k.why)}</p>` : ''}
      ${k.example ? `<p class="ex"><strong>${esc(t('Example'))}:</strong> ${esc(k.example)}</p>` : ''}
    </details>` : '';

  function taskHtml(r, d, k, ti) {
    const done = !!k.entry;
    return `<li class="task ${done ? 'done' : ''}">
      <span class="tick ${done ? 'on' : ''}">${done ? icon('check') : ''}</span>
      <div class="t-main">
        <em class="when">${esc(t(WHEN[k.when] || 'Morning'))} · ${esc(k.minutes)} ${esc(t('min'))}</em>
        <strong>${esc(k.title)}</strong>
        ${k.technique ? `<span class="tech">${esc(k.technique)}</span>` : ''}
        <small>${esc(k.details)}</small>
        ${taskMore(k)}
        ${done ? `<details class="more note"><summary>${esc(t('Your answers'))}</summary><p>${esc(k.entry.content)}</p></details>` : ''}
        <a class="btn ${done ? 'btn-soft' : 'btn-dark'} t-btn" href="${taskLink(r, d.day, ti)}">${esc(t(done ? 'Open conversation' : 'Talk it through with Aisha'))}</a>
      </div></li>`;
  }

  function show(r) {
    current = r;
    const pct = Math.round(r.done / Math.max(1, r.total) * 100);
    const firstOpen = r.days.findIndex(d => !d.done);
    $('planView').hidden = false;
    $('planView').innerHTML = `
      <div class="panel plan-head">
        <p class="eyebrow">${esc(t('Your 7-day plan'))}</p>
        <p>${esc(r.summary)}</p>
        ${r.professional_help_note ? `<div class="alert-box"><i>${icon('alert')}</i><p>${esc(r.professional_help_note)}</p></div>` : ''}
        <div class="focus">${(r.focus_areas || []).map(f => `<div><strong>${esc(f.problem)}</strong><span>${esc(f.approach)}</span></div>`).join('')}</div>
        <div class="progress" aria-label="${esc(t('Progress'))}"><div class="progress-bar"><i style="width:${pct}%"></i></div><span>${r.done}/${r.total}</span></div>
      </div>
      <div class="days">${r.days.map((d, di) => `
        <details class="day ${d.done ? 'finished' : ''}" ${di === firstOpen || (firstOpen < 0 && di === r.days.length - 1) ? 'open' : ''}>
          <summary><b>${esc(t('Day'))} ${esc(d.day)}</b><span>${esc(d.theme)}</span>${d.done ? `<i class="ok">${icon('check')}</i>` : ''}</summary>
          <p class="goal"><strong>${esc(t('Goal'))}:</strong> ${esc(d.goal)}</p>
          ${d.intro ? `<p class="intro">${esc(d.intro)}</p>` : ''}
          <ul class="tasks">${d.tasks.map((k, ti) => taskHtml(r, d, k, ti)).join('')}</ul>
          ${(d.tips || []).length ? `<div class="tips"><strong>${esc(t('Tips for today'))}</strong><ul>${d.tips.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
          <p class="reflect">💭 ${esc(d.reflection_question)}</p>
        </details>`).join('')}
        ${r.locked.map(n => `<div class="day locked"><span class="lk">${icon('lock')}</span><div><b>${esc(t('Day'))} ${esc(n)}</b><small>${esc(t('Finish every task of the previous day to unlock this day.'))}</small></div></div>`).join('')}
      </div>
      ${r.finished && r.closing_tip ? `<div class="panel tip"><i>${icon('sparkles')}</i><div><strong>${esc(t('You finished the whole plan. Well done!'))}</strong><p>${esc(r.closing_tip)}</p></div></div>` : ''}`;
    paintHistory();
  }

  // ---------- history ----------
  async function loadHistory() {
    const { data } = await Auth.sb.rpc('list_plans');
    history = data || [];
  }
  function paintHistory() {
    $('historyWrap').hidden = !history.length;
    $('history').innerHTML = history.map((r, i) => {
      const date = new Date(r.created_at).toLocaleDateString(App.lang === 'az' ? 'az-Latn-AZ' : App.lang, { day: 'numeric', month: 'short', year: 'numeric' });
      return `<div class="hist ${current && current.id === r.id ? 'on' : ''}">
        <button type="button" class="hist-open" data-i="${i}"><strong>${esc((r.problems || []).join(' · ').slice(0, 90))}</strong><small>${esc(date)} · ${r.done}/${r.total} ${esc(t('tasks done'))}</small></button>
        <button type="button" class="x" data-del="${i}" aria-label="${esc(t('Delete'))}">${icon('trash')}</button></div>`;
    }).join('');
    $('history').querySelectorAll('[data-i]').forEach(b => b.onclick = async () => {
      show(await fetchPlan(history[+b.dataset.i].id)); $('planView').scrollIntoView({ behavior: 'smooth' });
    });
    $('history').querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
      const r = history[+b.dataset.del];
      if (!confirm(t('Delete this plan?'))) return;
      const { error } = await Auth.sb.from('plans').delete().eq('id', r.id);
      if (error) return setMsg('Could not delete the plan.', false);
      history = history.filter(x => x.id !== r.id);
      if (current && current.id === r.id) { current = null; $('planView').hidden = true; $('planView').innerHTML = ''; }
      paintHistory();
    });
  }

  // ---------- boot ----------
  const hello = () => { $('hello').textContent = Auth.user ? `${t('Hi')}, ${Auth.name()}` : t('Hi, I am Aisha'); };
  hooks.push(() => {
    hello(); paintProblems();
    if (genKey) $('genMsg').textContent = t(genKey);
    if (current) show(current); else paintHistory();
  });

  (async () => {
    if (!Auth.configured) { $('intake').querySelectorAll('button,textarea').forEach(e => e.disabled = true); return setMsg('Supabase is not configured yet. Fill in config.js (see SETUP.md).', false); }
    const user = await Auth.require();
    if (!user) return;
    hello();
    await loadHistory();
    const want = new URLSearchParams(location.search).get('plan');
    const id = want || (history[0] && history[0].id);
    if (id) { try { show(await fetchPlan(id)); } catch (e) {} }
    paintHistory();
  })();
})();
