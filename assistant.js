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
      history.unshift(data);
      show(data);
      problems = [];
      $('planView').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e) {
      setMsg(e.message === 'rate_limited' ? 'Daily limit reached. Please try again tomorrow.'
        : e.message === 'unauthorized' ? 'Your session expired. Please log in again.'
        : 'Could not create your plan. Please try again.', false);
    } finally {
      busy = false; paintProblems(); paintHistory();
    }
  };

  // ---------- plan view ----------
  const WHEN = { morning: 'Morning', afternoon: 'Afternoon', evening: 'Evening' };
  const doneCount = r => Object.values(r.progress || {}).filter(Boolean).length;
  const totalTasks = r => r.plan.days.reduce((n, d) => n + d.tasks.length, 0);

  const taskMore = k => (k.steps && k.steps.length) || k.why || k.example ? `
    <details class="more"><summary>${esc(t('How to do it'))}</summary>
      ${(k.steps || []).length ? `<ol>${k.steps.map(x => `<li>${esc(x)}</li>`).join('')}</ol>` : ''}
      ${k.why ? `<p><strong>${esc(t('Why it helps'))}:</strong> ${esc(k.why)}</p>` : ''}
      ${k.example ? `<p class="ex"><strong>${esc(t('Example'))}:</strong> ${esc(k.example)}</p>` : ''}
    </details>` : '';

  function show(r) {
    current = r;
    const p = r.plan;
    const pct = Math.round(doneCount(r) / Math.max(1, totalTasks(r)) * 100);
    $('planView').hidden = false;
    $('planView').innerHTML = `
      <div class="panel plan-head">
        <p class="eyebrow">${esc(t('Your 7-day plan'))}</p>
        <p>${esc(p.summary)}</p>
        ${p.professional_help_note ? `<div class="alert-box"><i>${icon('alert')}</i><p>${esc(p.professional_help_note)}</p></div>` : ''}
        <div class="focus">${(p.focus_areas || []).map(f => `<div><strong>${esc(f.problem)}</strong><span>${esc(f.approach)}</span></div>`).join('')}</div>
        <div class="progress" aria-label="${esc(t('Progress'))}"><div class="progress-bar"><i id="pBar" style="width:${pct}%"></i></div><span id="pTxt">${pct}%</span></div>
      </div>
      <div class="days">${p.days.map((d, di) => `
        <details class="day" ${di === 0 ? 'open' : ''}>
          <summary><b>${esc(t('Day'))} ${esc(d.day)}</b><span>${esc(d.theme)}</span></summary>
          <p class="goal"><strong>${esc(t('Goal'))}:</strong> ${esc(d.goal)}</p>
          ${d.intro ? `<p class="intro">${esc(d.intro)}</p>` : ''}
          <ul class="tasks">${d.tasks.map((k, ti) => {
            const key = di + '-' + ti;
            return `<li><label><input type="checkbox" data-k="${key}" ${r.progress && r.progress[key] ? 'checked' : ''}>
              <span><em class="when">${esc(t(WHEN[k.when] || 'Morning'))} · ${esc(k.minutes)} ${esc(t('min'))}</em><strong>${esc(k.title)}</strong><small>${esc(k.details)}</small></span></label>
              ${taskMore(k)}</li>`;
          }).join('')}</ul>
          ${(d.tips || []).length ? `<div class="tips"><strong>${esc(t('Tips for today'))}</strong><ul>${d.tips.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
          <p class="reflect">💭 ${esc(d.reflection_question)}</p>
        </details>`).join('')}</div>
      <div class="panel tip"><i>${icon('sparkles')}</i><p>${esc(p.closing_tip)}</p></div>`;
    $('planView').querySelectorAll('input[type=checkbox]').forEach(cb => cb.onchange = () => toggle(cb));
    paintHistory();
  }

  let saveTimer;
  function toggle(cb) {
    current.progress = { ...current.progress, [cb.dataset.k]: cb.checked };
    const pct = Math.round(doneCount(current) / Math.max(1, totalTasks(current)) * 100);
    $('pBar').style.width = pct + '%'; $('pTxt').textContent = pct + '%';
    const id = current.id, progress = current.progress;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => Auth.sb.from('plans').update({ progress }).eq('id', id), 500);
  }

  // ---------- history ----------
  function paintHistory() {
    $('historyWrap').hidden = !history.length;
    $('history').innerHTML = history.map((r, i) => {
      const date = new Date(r.created_at).toLocaleDateString(App.lang === 'az' ? 'az-Latn-AZ' : App.lang, { day: 'numeric', month: 'short', year: 'numeric' });
      return `<div class="hist ${current && current.id === r.id ? 'on' : ''}">
        <button type="button" class="hist-open" data-i="${i}"><strong>${esc((r.problems || []).join(' · ').slice(0, 90))}</strong><small>${esc(date)} · ${doneCount(r)}/${totalTasks(r)} ${esc(t('tasks done'))}</small></button>
        <button type="button" class="x" data-del="${i}" aria-label="${esc(t('Delete'))}">${icon('trash')}</button></div>`;
    }).join('');
    $('history').querySelectorAll('[data-i]').forEach(b => b.onclick = () => { show(history[+b.dataset.i]); $('planView').scrollIntoView({ behavior: 'smooth' }); });
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
    const { data } = await Auth.sb.from('plans').select('*').order('created_at', { ascending: false }).limit(20);
    history = data || [];
    if (history.length) show(history[0]);
    paintHistory();
  })();
})();
