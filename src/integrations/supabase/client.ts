// Camada de compatibilidade: substitui o cliente Supabase por um adaptador que
// fala com o backend novo (Railway). Mantém a interface usada pelo backoffice
// (supabase.from().select().eq()..., supabase.auth.*, channel/functions) intacta,
// para as telas continuarem idênticas. Gerado no cutover "eliminar Supabase".
/* eslint-disable @typescript-eslint/no-explicit-any */

export const API_URL = ((import.meta as any).env?.VITE_API_URL as string)
  || 'https://pixbingo-gamification-backend-production.up.railway.app';
const TOKEN_KEY = 'gami_admin_token';

const getToken = () => localStorage.getItem(TOKEN_KEY) || '';
const setToken = (t: string) => localStorage.setItem(TOKEN_KEY, t);
const clearToken = () => localStorage.removeItem(TOKEN_KEY);

function authHeaders(): Record<string, string> {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

function decodeJwt(token: string): any | null {
  try {
    const p = token.split('.')[1];
    return JSON.parse(atob(p.replace(/-/g, '+').replace(/_/g, '/')));
  } catch { return null; }
}

function sessionFromToken() {
  const token = getToken();
  if (!token) return null;
  const p = decodeJwt(token);
  if (!p || (p.exp && p.exp * 1000 < Date.now())) return null;
  return { access_token: token, token_type: 'bearer', user: { id: p.sub, email: p.email, role: p.role } };
}

// --- Query builder (thenable, imita PostgrestFilterBuilder) ---
class Query<T = any> implements PromiseLike<{ data: any; error: any; count: number | null }> {
  private filters: string[] = [];
  private method: 'select' | 'insert' | 'upsert' | 'update' | 'delete' = 'select';
  private selectStr = '*';
  private orderStr?: string;
  private limitN?: number;
  private offsetN?: number;
  private singleMode = false;
  private maybeMode = false;
  private headMode = false;
  private countMode?: string;
  private body?: any;

  constructor(private table: string) {}

  select(cols?: string, opts?: { count?: string; head?: boolean }) {
    if (this.method === 'select') this.selectStr = cols || '*';
    if (opts?.count) this.countMode = opts.count;
    if (opts?.head) this.headMode = true;
    return this;
  }
  insert(body: any) { this.method = 'insert'; this.body = body; return this; }
  upsert(body: any, _opts?: { onConflict?: string }) { this.method = 'upsert'; this.body = body; return this; }
  update(body: any) { this.method = 'update'; this.body = body; return this; }
  delete() { this.method = 'delete'; return this; }

  eq(c: string, v: any) { this.filters.push(`${c}=eq.${encodeURIComponent(v)}`); return this; }
  neq(c: string, v: any) { this.filters.push(`${c}=neq.${encodeURIComponent(v)}`); return this; }
  gt(c: string, v: any) { this.filters.push(`${c}=gt.${encodeURIComponent(v)}`); return this; }
  gte(c: string, v: any) { this.filters.push(`${c}=gte.${encodeURIComponent(v)}`); return this; }
  lt(c: string, v: any) { this.filters.push(`${c}=lt.${encodeURIComponent(v)}`); return this; }
  lte(c: string, v: any) { this.filters.push(`${c}=lte.${encodeURIComponent(v)}`); return this; }
  is(c: string, v: any) { this.filters.push(`${c}=is.${v === null ? 'null' : v}`); return this; }
  in(c: string, arr: any[]) { this.filters.push(`${c}=in.(${arr.map(encodeURIComponent).join(',')})`); return this; }
  order(c: string, opts?: { ascending?: boolean }) { this.orderStr = `${c}.${opts?.ascending === false ? 'desc' : 'asc'}`; return this; }
  limit(n: number) { this.limitN = n; return this; }
  range(from: number, to: number) { this.offsetN = from; this.limitN = to - from + 1; return this; }
  single() { this.singleMode = true; return this; }
  maybeSingle() { this.maybeMode = true; return this; }

  private qs(): string {
    const parts = [...this.filters];
    if (this.method === 'select') {
      if (this.selectStr && this.selectStr !== '*') parts.push(`select=${encodeURIComponent(this.selectStr)}`);
      if (this.orderStr) parts.push(`order=${this.orderStr}`);
      if (this.limitN != null) parts.push(`limit=${this.limitN}`);
      if (this.offsetN != null) parts.push(`offset=${this.offsetN}`);
      if (this.countMode) parts.push(`count=${this.countMode}`);
      if (this.headMode) parts.push('head=true');
    }
    return parts.length ? `?${parts.join('&')}` : '';
  }

  async run(): Promise<{ data: any; error: any; count: number | null }> {
    const method = this.method === 'select' ? 'GET'
      : (this.method === 'insert' || this.method === 'upsert') ? 'POST'
        : this.method === 'update' ? 'PATCH' : 'DELETE';
    let url = `${API_URL}/data/${this.table}${this.qs()}`;
    if (this.method === 'upsert') url += `${url.includes('?') ? '&' : '?'}upsert=1`;
    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: (method === 'POST' || method === 'PATCH') ? JSON.stringify(this.body ?? {}) : undefined,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) return { data: null, error: json.error || { message: `HTTP ${res.status}` }, count: null };
      let data = json.data;
      if (this.singleMode || this.maybeMode) {
        const arr = Array.isArray(data) ? data : (data ? [data] : []);
        if (this.singleMode && arr.length === 0) return { data: null, error: { message: 'No rows found', code: 'PGRST116' }, count: null };
        data = arr[0] ?? null;
      }
      return { data, error: null, count: json.count ?? null };
    } catch (e) {
      return { data: null, error: { message: e instanceof Error ? e.message : 'network_error' }, count: null };
    }
  }

  then<R1 = any, R2 = never>(
    onfulfilled?: ((v: { data: any; error: any; count: number | null }) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: any) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    return this.run().then(onfulfilled, onrejected);
  }
}

// --- Auth (imita supabase.auth) ---
type AuthCb = (event: string, session: any) => void;
const authCbs: AuthCb[] = [];
const notify = (event: string) => { const s = sessionFromToken(); authCbs.forEach((cb) => { try { cb(event, s); } catch { /* */ } }); };

const auth = {
  async signInWithPassword({ email, password }: { email: string; password: string }) {
    try {
      const res = await fetch(`${API_URL}/admin/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.token) return { data: { session: null, user: null }, error: { message: json.error === 'invalid_credentials' ? 'Invalid login credentials' : (json.error || 'login_failed') } };
      setToken(json.token);
      const s = sessionFromToken();
      notify('SIGNED_IN');
      return { data: { session: s, user: s?.user ?? null }, error: null };
    } catch (e) {
      return { data: { session: null, user: null }, error: { message: e instanceof Error ? e.message : 'network_error' } };
    }
  },
  async getSession() { return { data: { session: sessionFromToken() }, error: null }; },
  async getUser() { const s = sessionFromToken(); return { data: { user: s?.user ?? null }, error: s ? null : { message: 'not_authenticated' } }; },
  async refreshSession() { return { data: { session: sessionFromToken() }, error: null }; },
  async updateUser(_attrs: { password?: string }) { return { data: { user: sessionFromToken()?.user ?? null }, error: { message: 'Alteração de senha indisponível neste painel' } }; },
  async signOut() { clearToken(); notify('SIGNED_OUT'); return { error: null }; },
  onAuthStateChange(cb: AuthCb) {
    authCbs.push(cb);
    setTimeout(() => cb('INITIAL_SESSION', sessionFromToken()), 0);
    return { data: { subscription: { unsubscribe() { const i = authCbs.indexOf(cb); if (i >= 0) authCbs.splice(i, 1); } } } };
  },
};

// --- Realtime via polling (sem WebSocket do Supabase): dispara os callbacks a cada 6s,
//     fazendo as telas refazerem o fetch — equivale ao "tempo real" para o uso atual. ---
function channel(_name: string) {
  const cbs: ((payload: any) => void)[] = [];
  let timer: any;
  const ch: any = {
    on(_event: string, _cfg: any, cb: (payload: any) => void) { cbs.push(cb); return ch; },
    subscribe(statusCb?: (status: string) => void) {
      timer = setInterval(() => cbs.forEach((cb) => { try { cb({}); } catch { /* */ } }), 6000);
      statusCb?.('SUBSCRIBED');
      return ch;
    },
    unsubscribe() { if (timer) clearInterval(timer); return Promise.resolve('ok'); },
  };
  return ch;
}

// --- Edge functions (proxy p/ o backend; as não migradas retornam erro amigável) ---
const functions = {
  async invoke(name: string, opts?: { body?: any }) {
    try {
      const res = await fetch(`${API_URL}/functions/${name}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(opts?.body ?? {}),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) return { data: null, error: { message: json.error?.message || json.error || `função indisponível: ${name}` } };
      return { data: json, error: null };
    } catch (e) {
      return { data: null, error: { message: e instanceof Error ? e.message : 'network_error' } };
    }
  },
};

export const supabase: any = {
  from: (table: string) => new Query(table),
  auth,
  channel,
  removeChannel(_ch: any) { return Promise.resolve('ok'); },
  functions,
};
