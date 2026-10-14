// "You are not alone": anonymous community feed. Reads go through alias-only views;
// writes go through the `community` Edge Function, which runs AI moderation first.
(() => {
  const { t, esc, hooks, $ } = App;
  if (!$('feed')) return;

  const TOPICS = [['family', 'Family'], ['selfesteem', 'Self-esteem'], ['anxiety', 'Anxiety & stress'],
    ['motivation', 'Motivation'], ['relationships', 'Relationships'], ['work', 'Work & study'], ['other', 'Other']];
  const PAGE = 15;
  let topic = 'other', filter = 'all', posts = [], more = false, alias = '';
  let openThreads = {};     // post id -> comments[]
  let postKey = '', crisisMsg = '';

  const hue = s => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
  const avatar = a => `<span class="av" style="background:hsl(${hue(a)} 45% 42%)">${esc((a || '?')[0])}</span>`;
  const topicName = k => t((TOPICS.find(x => x[0] === k) || TOPICS[6])[1]);
  const when = iso => {
    const d = new Date(iso), s = (Date.now() - d) / 1000;
    if (s < 60) return t('just now');
    if (s < 3600) return Math.floor(s / 60) + ' ' + t('min ago');
    if (s < 86400) return Math.floor(s / 3600) + ' ' + t('h ago');
    return d.toLocaleDateString(App.lang === 'az' ? 'az-Latn-AZ' : App.lang, { day: 'numeric', month: 'short' });
  };

  async function call(body) {
    const { data, error } = await Auth.sb.functions.invoke('community', { body: { ...body, lang: App.lang } });
    if (error) {
      let code = 'failed';
      try { code = (await error.context.json()).error || code; } catch (e) {}
      return { ok: false, code };
    }
    return data;
  }
  const errText = r => r.code === 'removed' && r.message ? null
    : ({ personal_info: 'Please remove names, phone numbers, e-mails or links. Your privacy matters.',
         rate_limited: 'You are posting too fast. Please wait a little.',
         paused: 'Posting is paused for now because several messages were removed. Try again later.',
         moderation_unavailable: 'The safety check is unavailable right now. Please try again in a minute.',
         unauthorized: 'Your session expired. Please log in again.' }[r.code] || 'Something went wrong. Please try again.');

  // ---------- composer ----------
  function paintTopics() {
    $('topicPick').innerHTML = TOPICS.map(([k, n]) => `<button type="button" class="chip-btn ${k === topic ? 'on' : ''}" data-k="${k}">${esc(t(n))}</button>`).join('');
    $('topicPick').querySelectorAll('button').forEach(b => b.onclick = () => { topic = b.dataset.k; paintTopics(); });
    $('topicFilter').innerHTML = [['all', 'All']].concat(TOPICS.map(([k, n]) => [k, n])).map(([k, n]) =>
      `<button class="${k === filter ? 'on' : ''}" data-f="${k}">${esc(t(n))}</button>`).join('');
    $('topicFilter').querySelectorAll('button').forEach(b => b.onclick = () => { filter = b.dataset.f; load(true); paintTopics(); });
  }
  const setPostMsg = (key, ok, raw) => {
    postKey = raw ? '' : key || '';
    $('postMsg').className = 'form-msg ' + (ok ? 'ok' : 'err');
    $('postMsg').textContent = raw || (key ? t(key) : '');
  };
  const showCrisis = msg => {
    crisisMsg = msg || '';
    $('crisisBox').hidden = !crisisMsg;
    $('crisisTxt').textContent = crisisMsg ? crisisMsg + ' ' + t('If you are in immediate danger, contact your local emergency number right now.') : '';
  };

  $('postBody').oninput = () => { $('postCount').textContent = $('postBody').value.length + ' / 1000'; };
  $('postForm').onsubmit = async e => {
    e.preventDefault();
    const body = $('postBody').value.trim();
    if (body.length < 10) return setPostMsg('Please write at least 10 characters.', false);
    $('postBtn').disabled = true; $('postBtn').textContent = t('Checking…'); setPostMsg(''); showCrisis('');
    const r = await call({ action: 'post', topic, body });
    $('postBtn').disabled = false; $('postBtn').textContent = t('Share anonymously');
    if (r.ok) {
      $('postBody').value = ''; $('postCount').textContent = '0 / 1000';
      setPostMsg('Shared. Thank you for trusting the community.', true);
      if (r.crisis) showCrisis(r.message);
      load(true);
    } else if (r.code === 'removed') {
      setPostMsg('', false, t('Your message was not published.') + ' ' + r.message);
    } else setPostMsg(errText(r), false);
  };

  // ---------- feed ----------
  async function load(reset) {
    if (reset) { posts = []; openThreads = {}; }
    let q = Auth.sb.from('community_posts').select('*').order('created_at', { ascending: false }).range(posts.length, posts.length + PAGE);
    if (filter !== 'all') q = q.eq('topic', filter);
    const { data, error } = await q;
    if (error) { $('feed').innerHTML = `<p class="empty">${esc(t('Could not load the feed.'))}</p>`; return; }
    more = data.length > PAGE;
    posts = posts.concat(data.slice(0, PAGE));
    paintFeed();
  }
  $('moreBtn').onclick = () => load(false);

  function paintFeed() {
    $('moreBtn').hidden = !more; $('moreBtn').textContent = t('Load more');
    if (!posts.length) { $('feed').innerHTML = `<p class="empty">${esc(t('No posts yet. Be the first to share.'))}</p>`; return; }
    $('feed').innerHTML = posts.map(p => `
      <article class="post" data-id="${p.id}">
        <header>${avatar(p.alias)}<div><strong>${esc(p.alias)}</strong><small>${esc(when(p.created_at))} · ${esc(topicName(p.topic))}</small></div>
          ${p.mine ? `<button type="button" class="x" data-del="${p.id}" aria-label="${esc(t('Delete'))}">${icon('trash')}</button>` : ''}</header>
        <p class="body">${esc(p.body)}</p>
        <footer>
          <button type="button" class="act relate ${p.i_relate ? 'on' : ''}" data-rel="${p.id}">🤝 ${esc(t('Me too'))} <b>${p.relate_count}</b></button>
          <button type="button" class="act" data-thr="${p.id}">💬 ${esc(t('Replies'))} <b>${p.comment_count}</b></button>
        </footer>
        <div class="thread" id="thr-${p.id}" ${openThreads[p.id] ? '' : 'hidden'}>${openThreads[p.id] ? threadHtml(p, openThreads[p.id]) : ''}</div>
      </article>`).join('');
    bind();
  }

  const threadHtml = (p, cs) => `
    <ul class="comments">${cs.map(c => `<li>${avatar(c.alias)}<div><strong>${esc(c.alias)}</strong> <small>${esc(when(c.created_at))}</small>
      <p>${esc(c.body)}</p></div>${c.mine ? `<button type="button" class="x" data-delc="${c.id}" data-p="${p.id}" aria-label="${esc(t('Delete'))}">${icon('trash')}</button>` : ''}</li>`).join('')}</ul>
    <form class="reply" data-p="${p.id}"><input class="inp" maxlength="600" placeholder="${esc(t('Write a kind reply…'))}" required>
      <button class="btn btn-dark icon-btn" aria-label="${esc(t('Send'))}">${icon('send')}</button></form>
    <p class="form-msg" id="rm-${p.id}" aria-live="polite"></p>`;

  function bind() {
    document.querySelectorAll('[data-rel]').forEach(b => b.onclick = () => relate(b.dataset.rel));
    document.querySelectorAll('[data-thr]').forEach(b => b.onclick = () => toggleThread(b.dataset.thr));
    document.querySelectorAll('[data-del]').forEach(b => b.onclick = () => del('post', b.dataset.del));
    document.querySelectorAll('[data-delc]').forEach(b => b.onclick = () => del('comment', b.dataset.delc, b.dataset.p));
    document.querySelectorAll('form.reply').forEach(f => f.onsubmit = e => reply(e, f));
  }

  async function relate(id) {
    const p = posts.find(x => x.id === id);
    p.i_relate = !p.i_relate; p.relate_count += p.i_relate ? 1 : -1; paintFeed();
    const { error } = p.i_relate
      ? await Auth.sb.from('reactions').insert({ post_id: id, user_id: Auth.user.id })
      : await Auth.sb.from('reactions').delete().eq('post_id', id).eq('user_id', Auth.user.id);
    if (error) { p.i_relate = !p.i_relate; p.relate_count += p.i_relate ? 1 : -1; paintFeed(); }
  }

  async function loadThread(id) {
    const { data } = await Auth.sb.from('community_comments').select('*').eq('post_id', id).order('created_at');
    openThreads[id] = data || [];
  }
  async function toggleThread(id) {
    if (openThreads[id]) delete openThreads[id]; else await loadThread(id);
    paintFeed();
  }
  async function reply(e, f) {
    e.preventDefault();
    const id = f.dataset.p, inp = f.querySelector('input'), btn = f.querySelector('button');
    const out = $('rm-' + id), body = inp.value.trim();
    if (body.length < 2) return;
    btn.disabled = true; out.className = 'form-msg'; out.textContent = t('Checking…');
    const r = await call({ action: 'comment', post_id: id, body });
    if (r.ok) {
      await loadThread(id);
      const p = posts.find(x => x.id === id); p.comment_count = openThreads[id].length;
      paintFeed();
      if (r.crisis) { const o = $('rm-' + id); o.className = 'form-msg ok'; o.textContent = r.message; }
    } else {
      btn.disabled = false; out.className = 'form-msg err';
      out.textContent = r.code === 'removed' ? t('Your message was not published.') + ' ' + r.message : t(errText(r));
    }
  }
  async function del(kind, id, postId) {
    if (!confirm(t('Delete this message?'))) return;
    await call({ action: 'delete', kind, id });
    if (kind === 'post') posts = posts.filter(p => p.id !== id);
    else { await loadThread(postId); posts.find(p => p.id === postId).comment_count = openThreads[postId].length; }
    paintFeed();
  }

  // ---------- boot ----------
  hooks.push(() => {
    paintTopics();
    if ($('meAlias')) $('meAlias').textContent = alias;
    $('postBtn').textContent = t('Share anonymously');
    if (postKey) $('postMsg').textContent = t(postKey);
    if (crisisMsg) showCrisis(crisisMsg);
    if (posts.length || $('feed').innerHTML) paintFeed();
  });

  (async () => {
    if (!Auth.configured) return;
    const user = await Auth.require();
    if (!user) return;
    const { data } = await Auth.sb.from('profiles').select('alias').eq('id', user.id).maybeSingle();
    alias = data ? data.alias : '';
    $('meAlias').textContent = alias; $('meAv').outerHTML = avatar(alias).replace('class="av"', 'class="av" id="meAv"');
    load(true);
  })();
})();
