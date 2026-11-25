'use client';
/*
 * Small client for the PHP/MySQL API (php-api/). It offers the same chainable
 * calls the pages already use, e.g.
 *   api().from('tasks').select('*, clients(name)').eq('status', 'todo').order('due_date')
 * Every call becomes one POST to api/index.php, which checks permissions and
 * runs parameterised SQL.
 */

export const API_URL = process.env.NEXT_PUBLIC_API_URL || '/api/index.php';

type Filter = [string, string, unknown];
export interface ApiError { message: string }
export interface ApiResult<T = any> { data: T; error: ApiError | null; count: number | null }

async function call<T = any>(body: Record<string, unknown>): Promise<ApiResult<T>> {
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-CA-Office': '1' },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => null);
    if (res.status === 401 && typeof window !== 'undefined' && !location.pathname.startsWith('/login')) {
      location.href = '/login/';
    }
    if (!json) return { data: null as T, error: { message: `The server did not answer properly (${res.status}). Check that the api folder is uploaded.` }, count: null };
    return { data: json.data ?? null, error: json.error ?? (res.ok ? null : { message: `Request failed (${res.status}).` }), count: json.count ?? null };
  } catch {
    return { data: null as T, error: { message: 'Could not reach the server. Check your internet connection.' }, count: null };
  }
}

type Op = 'select' | 'insert' | 'update' | 'delete';

class Query<T = any> implements PromiseLike<ApiResult<T>> {
  private op: Op = 'select';
  private columns = '*';
  private returningCols: string | null = null;
  private filters: Filter[] = [];
  private orders: [string, boolean, boolean | null][] = [];
  private limitN: number | null = null;
  private singleMode: 'one' | 'maybe' | null = null;
  private countMode = false;
  private head = false;
  private rows: unknown[] = [];
  private data: Record<string, unknown> | null = null;
  private upsertOpts: { onConflict: string[]; ignoreDuplicates: boolean } | null = null;

  constructor(private table: string) {}

  select(columns = '*', opts?: { count?: 'exact'; head?: boolean }) {
    if (this.op === 'select') {
      this.columns = columns;
      this.countMode = !!opts?.count;
      this.head = !!opts?.head;
    } else {
      this.returningCols = columns;
    }
    return this;
  }
  insert(rows: object | object[]) { this.op = 'insert'; this.rows = Array.isArray(rows) ? rows : [rows]; return this; }
  upsert(rows: object | object[], opts: { onConflict: string; ignoreDuplicates?: boolean }) {
    this.insert(rows);
    this.upsertOpts = { onConflict: opts.onConflict.split(',').map((s) => s.trim()), ignoreDuplicates: !!opts.ignoreDuplicates };
    return this;
  }
  update(data: object) { this.op = 'update'; this.data = data as Record<string, unknown>; return this; }
  delete() { this.op = 'delete'; return this; }

  private f(col: string, op: string, val: unknown) { this.filters.push([col, op, val]); return this; }
  eq(col: string, val: unknown) { return this.f(col, 'eq', val); }
  neq(col: string, val: unknown) { return this.f(col, 'neq', val); }
  gt(col: string, val: unknown) { return this.f(col, 'gt', val); }
  gte(col: string, val: unknown) { return this.f(col, 'gte', val); }
  lt(col: string, val: unknown) { return this.f(col, 'lt', val); }
  lte(col: string, val: unknown) { return this.f(col, 'lte', val); }
  in(col: string, vals: unknown[]) { return this.f(col, 'in', vals); }
  is(col: string, val: null | boolean) { return this.f(col, 'is', val); }
  not(col: string, op: 'is', val: null | boolean) {
    if (op !== 'is') throw new Error('Only not(col, "is", …) is supported');
    return this.f(col, 'not_is', val);
  }
  order(col: string, opts?: { ascending?: boolean; nullsFirst?: boolean }) {
    this.orders.push([col, opts?.ascending ?? true, opts?.nullsFirst ?? null]);
    return this;
  }
  limit(n: number) { this.limitN = n; return this; }
  single() { this.singleMode = 'one'; return this as unknown as Query<any>; }
  maybeSingle() { this.singleMode = 'maybe'; return this as unknown as Query<any>; }

  private run(): Promise<ApiResult<T>> {
    const base = { table: this.table, filters: this.filters, single: this.singleMode };
    switch (this.op) {
      case 'select':
        return call({ op: 'select', ...base, columns: this.columns, order: this.orders, limit: this.limitN, count: this.countMode, head: this.head });
      case 'insert':
        return call({ op: 'insert', table: this.table, rows: this.rows, upsert: this.upsertOpts, returning: this.returningCols, single: this.singleMode });
      case 'update':
        return call({ op: 'update', ...base, data: this.data, returning: this.returningCols });
      case 'delete':
        return call({ op: 'delete', ...base });
    }
  }

  then<R1 = ApiResult<T>, R2 = never>(ok?: ((v: ApiResult<T>) => R1 | PromiseLike<R1>) | null, bad?: ((e: unknown) => R2 | PromiseLike<R2>) | null) {
    return this.run().then(ok, bad);
  }
}

const auth = {
  async status() { return call<{ hasUsers: boolean; user: { id: string; email: string } | null }>({ op: 'auth.status' }); },
  async getUser() {
    const r = await auth.status();
    return { data: { user: r.data?.user ?? null }, error: r.error };
  },
  async signInWithPassword(p: { email: string; password: string }) { return call({ op: 'auth.signin', ...p }); },
  /** Only works for the very first account (it becomes admin). Others are created by an admin. */
  async signUp(p: { email: string; password: string; options?: { data?: { full_name?: string } } }) {
    const r = await call({ op: 'auth.signup', email: p.email, password: p.password, full_name: p.options?.data?.full_name ?? '' });
    return { data: { session: r.error ? null : {} }, error: r.error };
  },
  async signOut() { return call({ op: 'auth.signout' }); },
};

const storage = {
  from(_bucket: string) {
    return {
      async upload(path: string, file: File, _opts?: unknown): Promise<ApiResult<{ path: string } | null>> {
        const fd = new FormData();
        fd.append('path', path);
        fd.append('file', file);
        try {
          const res = await fetch(`${API_URL}?op=upload`, { method: 'POST', body: fd, credentials: 'same-origin', headers: { 'X-CA-Office': '1' } });
          const json = await res.json().catch(() => null);
          if (res.status === 413) return { data: null, error: { message: 'This file is larger than your hosting allows.' }, count: null };
          return { data: json?.data ?? null, error: json?.error ?? (res.ok ? null : { message: `Upload failed (${res.status}).` }), count: null };
        } catch {
          return { data: null, error: { message: 'Upload failed. Check your connection.' }, count: null };
        }
      },
      async remove(paths: string[]) { return call({ op: 'storage.remove', paths }); },
      async createSignedUrl(path: string, _seconds: number) {
        // Downloads go through the API, which checks you are signed in.
        return { data: { signedUrl: `${API_URL}?op=file&path=${encodeURIComponent(path)}` }, error: null as ApiError | null };
      },
    };
  },
};

const client = {
  from: <T = any>(table: string) => new Query<T>(table),
  rpc: <T = any>(name: string, args: Record<string, unknown> = {}) => call<T>({ op: 'rpc', name, args }),
  auth,
  storage,
};

export function api() { return client; }

/** UUID that also works on plain-HTTP sites, where crypto.randomUUID is unavailable. */
export function newId(): string {
  if (typeof crypto.randomUUID === 'function' && window.isSecureContext) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
