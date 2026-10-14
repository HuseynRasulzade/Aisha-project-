// Admin panel: AI moderation notifications with exact timestamps, live via Supabase Realtime.
(() => {
  const { t, esc, hooks, $ } = App;
  if (!$('modList')) return;

  let rows = [], filter = 'new';
  const pad = n => String(n).padStart(2, '0');
  // Exact date and time, to the second, in the admin's local timezone.
  const stamp = iso => {
    const d = new Date(iso);
    return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} · ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  };
  const CAT = { insult: 'Insult', harassment: 'Harassment', hate: 'Hate', sexual: 'Sexual content', violence: 'Violence',
    self_harm_risk: 'Self-harm risk', self_harm_encouragement: 'Encourages self-harm', dangerous_advice: 'Dangerous advice',
    personal_info: 'Personal info', spam: 'Spam', other: 'Other' };

  function paint() {
    const unread = rows.filter(r => !r.reviewed).length;
    document.title = (unread ? `(${unread}) ` : '') + t('Moderation — Sakina');
    $('adminStats').innerHTML = [
      [unread, 'Need review'], [rows.filter(r => r.action === 'removed').length, 'Removed by AI'],
      [rows.filter(r => r.action === 'flagged').length, 'Flagged for care'], [rows.length, 'Total'],
    ].map(([n, l]) => `<div class="stat"><strong>${n}</strong><span>${esc(t(l))}</span></div>`).join('');
    $('adminFilter').innerHTML = [['new', 'Need review'], ['all', 'All']].map(([k, l]) =>
      `<button class="${filter === k ? 'on' : ''}" data-f="${k}">${esc(t(l))}</button>`).join('');
    $('adminFilter').querySelectorAll('button').forEach(b => b.onclick = () => { filter = b.dataset.f; paint(); });
    const list = rows.filter(r => filter === 'all' || !r.reviewed);
    $('modList').innerHTML = list.length ? list.map(r => `
      <article class="mod ${r.action} ${r.reviewed ? 'done' : ''}">
        <header>
          <span class="badge ${r.action}">${esc(t(r.action === 'removed' ? 'Removed' : 'Flagged'))}</span>
          <span class="badge sev-${esc(r.severity)}">${esc(t(r.severity))}</span>
          <time datetime="${esc(r.created_at)}">${esc(stamp(r.created_at))}</time>
        </header>
        <p class="meta">${esc(t(r.content_type === 'post' ? 'Post' : 'Comment'))} · ${esc(r.alias || '—')}${r.topic ? ' · ' + esc(r.topic) : ''}</p>
        <blockquote>${esc(r.content)}</blockquote>
        <p class="chips">${(r.categories || []).map(c => `<span>${esc(t(CAT[c] || c))}</span>`).join('')}</p>
        <p class="reason"><strong>${esc(t('AI analysis'))}:</strong> ${esc(r.reason || '')}</p>
        ${r.reviewed ? `<small class="muted">${esc(t('Reviewed'))} ${esc(stamp(r.reviewed_at))}</small>`
          : `<button class="btn btn-soft" data-ok="${r.id}">${esc(t('Mark as reviewed'))}</button>`}
      </article>`).join('') : `<p class="empty">${esc(t('No notifications.'))}</p>`;
    $('modList').querySelectorAll('[data-ok]').forEach(b => b.onclick = async () => {
      const at = new Date().toISOString();
      const { error } = await Auth.sb.from('moderation_log').update({ reviewed: true, reviewed_at: at }).eq('id', b.dataset.ok);
      if (!error) { const r = rows.find(x => x.id === b.dataset.ok); r.reviewed = true; r.reviewed_at = at; paint(); }
    });
  }

  function toast(r) {
    const el = $('toast');
    el.textContent = `🔔 ${t(r.action === 'removed' ? 'Removed' : 'Flagged')} · ${stamp(r.created_at)}`;
    el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => { el.hidden = true; }, 6000);
  }

  hooks.push(paint);

  (async () => {
    if (!Auth.configured) return;
    const user = await Auth.require();
    if (!user) return;
    if (!Auth.isAdmin) { $('denied').hidden = false; return; }
    $('adminBody').hidden = false;
    const { data } = await Auth.sb.from('moderation_log').select('*').order('created_at', { ascending: false }).limit(200);
    rows = data || []; paint();
    Auth.sb.channel('modlog').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'moderation_log' }, p => {
      rows.unshift(p.new); paint(); toast(p.new);
    }).subscribe();
  })();
})();
