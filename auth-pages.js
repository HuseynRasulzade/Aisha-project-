// Login + sign-up form behaviour (body[data-page] = login | signup).
(() => {
  const { t, $ } = App;
  const form = $('authForm');
  if (!form) return;
  const mode = document.body.dataset.page;
  const msg = $('authMsg');
  const show = (key, ok) => { msg.className = 'form-msg ' + (ok ? 'ok' : 'err'); msg.textContent = t(key); msg.dataset.k = key; };
  App.hooks.push(() => { if (msg.dataset.k) msg.textContent = t(msg.dataset.k); });

  if (!Auth.configured) show('Supabase is not configured yet. Fill in config.js (see SETUP.md).', false);

  const pw = $('password'), tg = $('pwToggle');
  const paintTg = () => { tg.textContent = t(pw.type === 'password' ? 'Show' : 'Hide'); };
  tg.onclick = () => { pw.type = pw.type === 'password' ? 'text' : 'password'; paintTg(); };
  App.hooks.push(paintTg);

  Auth.init().then(u => { if (u) location.replace(Auth.next()); });

  form.onsubmit = async e => {
    e.preventDefault();
    if (!Auth.configured) return show('Supabase is not configured yet. Fill in config.js (see SETUP.md).', false);
    const email = $('email').value.trim();
    const password = $('password').value;
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true; msg.textContent = '';
    try {
      if (mode === 'signup') {
        const fullName = $('fullName').value.trim();
        if (password.length < 6) return show('Password must be at least 6 characters.', false);
        const { data, error } = await Auth.signUp(email, password, fullName);
        if (error) throw error;
        if (data.session) return location.replace(Auth.next());
        show('Account created. Check your email to confirm, then log in.', true);
        form.reset();
      } else {
        const { error } = await Auth.signIn(email, password);
        if (error) throw error;
        location.replace(Auth.next());
      }
    } catch (err) {
      show(Auth.errKey(err), false);
    } finally {
      btn.disabled = false;
    }
  };
})();
