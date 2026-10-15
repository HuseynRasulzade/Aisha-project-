// AISA AI: decision-support chat. Reads own chats (RLS); messages are written by the `aisa-chat` Edge Function.
(() => {
  const { t, esc, hooks, $ } = App;
  if (!$('aiLog')) return;

  const SUGGEST = {
    az: ['Hansı ixtisas mənə daha uyğundur?', 'Bu işdə qalmalıyam, yoxsa yeni iş axtarmalıyam?', 'Münasibətimdə necə davranmalıyam?', 'Mənim üçün hansı seçim daha məntiqlidir?'],
    en: ['Which major suits me better?', 'Should I stay in this job or look for a new one?', 'How should I act in my relationship?', 'Which choice is more logical for me?'],
  };
  let chats = [], chatId = null, msgs = [], quick = [], busy = false, opts = ['', ''];

  const ERR = { chat_too_long: 'This conversation is full. Start a new one.', too_many_chats: 'You have too many conversations. Delete an old one first.',
    unauthorized: 'Your session expired. Please log in again.' };

  // ---------- starter ----------
  function paintStarter() {
    $('starter').hidden = msgs.length > 0;
    $('dOpts').innerHTML = opts.map((o, i) => `<div class="opt-row"><span class="opt-n">${String.fromCharCode(65 + i)}</span>
      <input class="inp" data-i="${i}" maxlength="150" value="${esc(o)}" placeholder="${esc(t('Option') + ' ' + String.fromCharCode(65 + i))}">
      ${opts.length > 2 ? `<button type="button" class="x" data-rm="${i}" aria-label="${esc(t('Remove'))}">×</button>` : ''}</div>`).join('');
    $('dOpts').querySelectorAll('input').forEach(el => el.oninput = () => { opts[+el.dataset.i] = el.value; });
    $('dOpts').querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { opts.splice(+b.dataset.rm, 1); paintStarter(); });
    $('dAdd').hidden = opts.length >= 5;
    const list = SUGGEST[App.lang] || SUGGEST.en;
    $('dSuggest').innerHTML = list.map(s => `<button type="button" class="chip-btn">${esc(s)}</button>`).join('');
    $('dSuggest').querySelectorAll('button').forEach((b, i) => b.onclick = () => send(list[i]));
  }
  $('dAdd').onclick = () => { if (opts.length < 5) { opts.push(''); paintStarter(); } };
  $('dGo').onclick = () => {
    const q = $('dQ').value.trim(), o = opts.map(x => x.trim()).filter(Boolean);
    if (!q && o.length < 2) return;
    send(`${t('My decision')}: ${q || '—'}\n${t('My options')}:\n` + o.map((x, i) => `${i + 1}) ${x}`).join('\n'));
  };

  // ---------- chat ----------
  const list = (arr, title) => arr && arr.length ? `<div class="s-list"><b>${esc(title)}</b><ul>${arr.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>` : '';
  function summaryHtml(s) {
    return `<div class="sum">
      <p class="sum-q">🧭 ${esc(s.question)}</p>
      <div class="sum-opts">${s.options.map(o => `<div class="sum-opt"><h4>${esc(o.name)}</h4>
        ${list(o.pros, t('Pros'))}${list(o.cons, t('Cons'))}${list(o.risks, t('Risks'))}
        ${o.best_case ? `<p><b>${esc(t('Best case'))}:</b> ${esc(o.best_case)}</p>` : ''}
        ${o.worst_case ? `<p><b>${esc(t('Worst case'))}:</b> ${esc(o.worst_case)}</p>` : ''}</div>`).join('')}</div>
      ${s.criteria.length ? `<div class="s-list"><b>${esc(t('Your priorities'))}</b><ul class="crit">${s.criteria.map(c =>
        `<li><span>${esc(c.name)}</span>${c.weight != null ? `<i class="bar"><u style="width:${Math.max(0, Math.min(10, c.weight)) * 10}%"></u></i><em>${esc(c.weight)}/10</em>` : ''}</li>`).join('')}</ul></div>` : ''}
      ${list(s.open_questions, t('Still open'))}
      ${s.next_step ? `<p class="sum-next"><b>${esc(t('A small next step'))}:</b> ${esc(s.next_step)}</p>` : ''}
      <p class="muted small">${esc(t('This is a map of your own thinking, not a verdict. The decision is yours.'))}</p></div>`;
  }

  function paintLog(typing) {
    $('aiLog').innerHTML = msgs.length || typing
      ? msgs.map(m => `<div class="msg ${m.role === 'user' ? 'me' : 'bot'}">${esc(m.content)}${m.summary ? summaryHtml(m.summary) : ''}</div>`).join('')
        + (typing ? `<div class="msg bot typing"><i></i><i></i><i></i></div>` : '')
      : `<div class="msg bot">${esc(t('Hi, I am AISA AI. Tell me about the decision on your mind. What are the options?'))}</div>`;
    $('aiLog').scrollTop = $('aiLog').scrollHeight;
    const q = quick.slice();
    if (msgs.length >= 4 && !busy && !typing) q.push(t('Summarize my options'));
    $('aiQuick').innerHTML = !typing && !busy ? q.map(x => `<button type="button" class="chip-btn">${esc(x)}</button>`).join('') : '';
    $('aiQuick').querySelectorAll('button').forEach((b, i) => b.onclick = () => send(q[i]));
  }

  async function send(text) {
    text = (text || '').trim();
    if (!text || busy) return;
    busy = true; $('aiSend').disabled = true; quick = [];
    $('aiIn').value = ''; $('aiIn').style.height = '';
    msgs.push({ role: 'user', content: text });
    paintStarter(); paintLog(true);
    try {
      const { data, error } = await Auth.sb.functions.invoke('aisa-chat', { body: { chat_id: chatId, message: text, lang: App.lang } });
      if (error) {
        let code = 'failed';
        try { code = (await error.context.json()).error || code; } catch (e) {}
        throw new Error(code);
      }
      if (!chatId) { chatId = data.chat_id; await loadList(); }
      msgs.push({ role: 'assistant', content: data.reply, summary: data.summary || null });
      quick = data.suggestions || [];
    } catch (e) {
      console.error('aisa-chat failed', e);
      msgs.push({ role: 'assistant', content: t(ERR[e.message] || 'Could not reach AISA AI. Please try again.') });
    } finally {
      busy = false; $('aiSend').disabled = false; paintLog(false); paintHist();
    }
  }
  $('aiForm').onsubmit = e => { e.preventDefault(); send($('aiIn').value); };
  $('aiIn').onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send($('aiIn').value); } };
  $('aiIn').oninput = () => { $('aiIn').style.height = 'auto'; $('aiIn').style.height = Math.min($('aiIn').scrollHeight, 140) + 'px'; };

  // ---------- conversations ----------
  async function loadList() {
    const { data } = await Auth.sb.from('ai_chats').select('id, title, updated_at').order('updated_at', { ascending: false }).limit(50);
    chats = data || [];
  }
  function paintHist() {
    $('aiHist').innerHTML = chats.length ? chats.map((c, i) => {
      const d = new Date(c.updated_at).toLocaleDateString(App.lang === 'az' ? 'az-Latn-AZ' : App.lang, { day: 'numeric', month: 'short' });
      return `<div class="hist ${c.id === chatId ? 'on' : ''}"><button type="button" class="hist-open" data-i="${i}"><strong>${esc(c.title || '…')}</strong><small>${esc(d)}</small></button>
        <button type="button" class="x" data-del="${i}" aria-label="${esc(t('Delete'))}">${icon('trash')}</button></div>`;
    }).join('') : `<p class="empty">${esc(t('No conversations yet.'))}</p>`;
    $('aiHist').querySelectorAll('[data-i]').forEach(b => b.onclick = () => open(chats[+b.dataset.i].id));
    $('aiHist').querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
      const c = chats[+b.dataset.del];
      if (!confirm(t('Delete this conversation?'))) return;
      const { error } = await Auth.sb.from('ai_chats').delete().eq('id', c.id);
      if (error) return;
      chats = chats.filter(x => x.id !== c.id);
      if (c.id === chatId) reset();
      paintHist();
    });
  }
  async function open(id) {
    const { data } = await Auth.sb.from('ai_chats').select('id, messages').eq('id', id).maybeSingle();
    if (!data) return;
    chatId = data.id; msgs = data.messages || []; quick = [];
    paintStarter(); paintLog(false); paintHist();
    $('aiLog').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  function reset() { chatId = null; msgs = []; quick = []; opts = ['', '']; $('dQ').value = ''; paintStarter(); paintLog(false); paintHist(); }
  $('newChat').onclick = () => { reset(); $('starter').scrollIntoView({ behavior: 'smooth' }); };

  hooks.push(() => {
    $('aiIn').placeholder = t('Write to AISA AI…'); $('dQ').placeholder = t('For example: Should I stay in my job or look for a new one?');
    paintStarter(); paintLog(busy); paintHist();
  });

  (async () => {
    if (!Auth.configured) return;
    const user = await Auth.require();
    if (!user) return;
    await loadList();
    paintHist();
    if (chats.length) open(chats[0].id);
  })();
})();
