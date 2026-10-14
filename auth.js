// Supabase auth wrapper + header account chip. Loaded after common.js, before pages.js.
const Auth = (() => {
  const cfg = window.SAKINA_CONFIG || {};
  const configured = !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && !/YOUR_/.test(cfg.SUPABASE_URL + cfg.SUPABASE_ANON_KEY));
  const sb = configured && window.supabase ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY) : null;
  let user = null, isAdmin = false;

  const next = () => {
    const n = new URLSearchParams(location.search).get('next');
    return n && /^[\w-]+\.html$/.test(n) ? n : 'assistant.html';
  };

  const errKey = e => {
    const m = (e && e.message || '').toLowerCase();
    if (m.includes('invalid login')) return 'Wrong email or password.';
    if (m.includes('already registered') || m.includes('already been registered')) return 'This email is already registered. Try logging in.';
    if (m.includes('password') && m.includes('characters')) return 'Password must be at least 6 characters.';
    if (m.includes('email not confirmed')) return 'Please confirm your email first (check your inbox).';
    if (m.includes('rate limit') || m.includes('too many')) return 'Too many attempts. Please wait a moment.';
    if (m.includes('fetch') || m.includes('network')) return 'Network error. Check your connection.';
    return 'Something went wrong. Please try again.';
  };

  let initP;
  const init = () => (initP = initP || load());
  async function load() {
    if (!sb) return null;
    const { data } = await sb.auth.getSession();
    user = data.session ? data.session.user : null;
    if (user) {
      const { data: p } = await sb.from('profiles').select('is_admin').eq('id', user.id).maybeSingle();
      isAdmin = !!(p && p.is_admin);
    }
    sb.auth.onAuthStateChange((_e, s) => { user = s ? s.user : null; paintChip(); });
    return user;
  }

  const name = () => (user && (user.user_metadata && user.user_metadata.full_name || (user.email || '').split('@')[0])) || '';

  function paintChip() {
    const bar = document.querySelector('.lang-float');
    if (!bar) return;
    let chip = bar.querySelector('.acct');
    if (!chip) { chip = document.createElement('span'); chip.className = 'acct'; bar.prepend(chip); }
    const t = App.t;
    if (user) {
      chip.innerHTML = `${isAdmin ? `<a class="acct-btn" href="admin.html">${App.esc(t('Admin'))}</a>` : ''}<a class="acct-link" href="assistant.html">${App.esc(name())}</a><button type="button" class="acct-btn" id="logoutBtn">${App.esc(t('Log out'))}</button>`;
      chip.querySelector('#logoutBtn').onclick = async () => { await sb.auth.signOut(); location.href = 'login.html'; };
    } else {
      chip.innerHTML = `<a class="acct-link" href="login.html">${App.esc(t('Log in'))}</a><a class="acct-btn" href="signup.html">${App.esc(t('Sign up'))}</a>`;
    }
  }
  App.hooks.push(paintChip);
  init().then(paintChip);

  // Route guard: everything except login/signup requires a session.
  const PUBLIC = ['login', 'signup'];
  if (!PUBLIC.includes(document.body.dataset.page)) {
    init().then(u => {
      if (u) document.documentElement.classList.remove('gate');
      else location.replace('login.html?next=' + encodeURIComponent(location.pathname.split('/').pop() || 'index.html'));
    }).catch(() => location.replace('login.html'));
  }

  return {
    sb, configured, init, next, errKey,
    get user() { return user; },
    get isAdmin() { return isAdmin; },
    name,
    signUp: (email, password, fullName) =>
      sb.auth.signUp({ email, password, options: { data: { full_name: fullName } } }),
    signIn: (email, password) => sb.auth.signInWithPassword({ email, password }),
    // Redirects to login when there is no session; resolves with the user otherwise.
    async require() {
      const u = await init();
      if (!u) { location.replace('login.html?next=' + encodeURIComponent(location.pathname.split('/').pop() || 'assistant.html')); return null; }
      return u;
    },
  };
})();
