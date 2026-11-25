'use client';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import type { Profile } from '@/lib/types';

interface Lookups {
  me: Profile | null;
  staff: Profile[];
  clients: { id: string; name: string; state: string | null }[];
  reloadLookups: () => Promise<void>;
  staffName: (id: string | null) => string;
}

const Ctx = createContext<Lookups | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [me, setMe] = useState<Profile | null>(null);
  const [staff, setStaff] = useState<Profile[]>([]);
  const [clients, setClients] = useState<Lookups['clients']>([]);

  const reloadLookups = useCallback(async () => {
    const sb = api();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) { router.replace('/login/'); return; }
    const [p, c] = await Promise.all([
      sb.from('profiles').select('*').order('full_name'),
      sb.from('clients').select('id, name, state').eq('status', 'active').order('name'),
    ]);
    const profiles = (p.data ?? []) as Profile[];
    setStaff(profiles.filter((x) => x.active !== false));
    setMe(profiles.find((x) => x.id === user.id) ?? null);
    setClients((c.data ?? []) as Lookups['clients']);
    setReady(true);
  }, [router]);

  useEffect(() => { reloadLookups(); }, [reloadLookups]);

  const staffName = useCallback(
    (id: string | null) => (id ? staff.find((s) => s.id === id)?.full_name ?? '—' : 'Unassigned'),
    [staff],
  );

  // Pages only render once we know who is signed in (the static site has no server-side check).
  if (!ready) return <div className="grid min-h-screen place-items-center text-sm text-slate-400">Loading…</div>;
  return <Ctx.Provider value={{ me, staff, clients, reloadLookups, staffName }}>{children}</Ctx.Provider>;
}

export function useApp() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp outside AppProvider');
  return v;
}
