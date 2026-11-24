'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  LayoutDashboard, ListChecks, CheckSquare, Users, Package, CalendarClock, IndianRupee, Clock, CalendarCheck,
  FileKey2, BarChart3, BellRing, UserCog, Settings, LogOut, Menu, Bell, Search, Calculator,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { addDays, todayISO } from '@/lib/format';
import { useApp } from './AppContext';

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/tasks', label: 'Tasks', icon: ListChecks },
  { href: '/todos', label: 'To-Do', icon: CheckSquare },
  { href: '/clients', label: 'Clients', icon: Users },
  { href: '/packages', label: 'Packages', icon: Package },
  { href: '/compliance', label: 'Compliance', icon: CalendarClock },
  { href: '/invoices', label: 'Finance', icon: IndianRupee },
  { href: '/timesheets', label: 'Timesheets', icon: Clock },
  { href: '/attendance', label: 'Attendance', icon: CalendarCheck },
  { href: '/documents', label: 'Documents & DSC', icon: FileKey2, also: ['/dsc'] },
  { href: '/reports', label: 'Reports', icon: BarChart3 },
  { href: '/notify', label: 'Send notifications', icon: BellRing },
];
const ADMIN_NAV = [
  { href: '/staff', label: 'Users', icon: UserCog },
  { href: '/settings', label: 'Settings', icon: Settings },
];

type Alert = { label: string; href: string; count: number };

export function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { me, clients } = useApp();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [showAlerts, setShowAlerts] = useState(false);
  const bellRef = useRef<HTMLDivElement>(null);
  const items = me?.role === 'admin' ? [...NAV, ...ADMIN_NAV] : NAV;

  // Bell: overdue tasks, today's to-dos, DSCs expiring within 30 days, packages due to bill.
  useEffect(() => {
    if (!me) return;
    const sb = supabase();
    const t = todayISO();
    Promise.all([
      sb.from('tasks').select('id', { count: 'exact', head: true }).neq('status', 'done').lt('due_date', t),
      sb.from('todos').select('id', { count: 'exact', head: true }).eq('done', false).lte('due_date', t),
      sb.from('dsc').select('id', { count: 'exact', head: true }).lte('valid_to', addDays(t, 30)),
      sb.from('packages').select('id', { count: 'exact', head: true }).eq('active', true).lte('next_bill_date', t),
    ]).then(([a, b, c, d]) => setAlerts([
      { label: 'Overdue tasks', href: '/tasks?view=overdue', count: a.count ?? 0 },
      { label: 'To-dos for today', href: '/todos', count: b.count ?? 0 },
      { label: 'DSCs expiring in 30 days', href: '/dsc', count: c.count ?? 0 },
      { label: 'Packages due to invoice', href: '/packages', count: d.count ?? 0 },
    ]));
  }, [me, pathname]);

  useEffect(() => {
    const close = (e: MouseEvent) => { if (!bellRef.current?.contains(e.target as Node)) setShowAlerts(false); };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, []);

  const matches = useMemo(() => {
    const n = q.trim().toLowerCase();
    return n ? clients.filter((c) => c.name.toLowerCase().includes(n)).slice(0, 8) : [];
  }, [q, clients]);
  const alertTotal = alerts.reduce((a, x) => a + x.count, 0);

  const signOut = async () => {
    await supabase().auth.signOut();
    router.replace('/login');
    router.refresh();
  };

  const initials = (me?.full_name ?? '?').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();

  return (
    <div className="min-h-screen bg-slate-100 lg:flex">
      <aside className={`${open ? 'flex' : 'hidden'} fixed inset-y-0 left-0 z-40 w-60 flex-col border-r border-slate-200 bg-white print:hidden lg:sticky lg:top-0 lg:flex lg:h-screen`}>
        <Link href="/dashboard" className="flex items-center gap-2 px-5 py-4">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-white"><Calculator size={18} /></span>
          <span className="text-lg font-bold text-slate-900">CA Office</span>
        </Link>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-3">
          {items.map(({ href, label, icon: Icon, ...rest }) => {
            const also = 'also' in rest ? (rest.also as string[]) : [];
            const active = [href, ...also].some((h) => pathname === h || pathname.startsWith(h + '/'));
            return (
              <Link key={href} href={href} onClick={() => setOpen(false)}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${active ? 'bg-brand-50 font-medium text-brand-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}>
                <Icon size={17} className={active ? 'text-brand-600' : 'text-slate-400'} /> {label}
              </Link>
            );
          })}
        </nav>
        <button onClick={signOut} className="m-3 flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-500 hover:bg-slate-50 hover:text-slate-900">
          <LogOut size={17} /> Sign out
        </button>
      </aside>
      {open && <div className="fixed inset-0 z-30 bg-black/30 lg:hidden" onClick={() => setOpen(false)} />}

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-2.5 print:hidden sm:px-6">
          <button className="lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu"><Menu size={20} /></button>
          <div className="relative w-full max-w-sm">
            <Search size={16} className="absolute left-3 top-2.5 text-slate-400" />
            <input
              value={q}
              onChange={(e) => { setQ(e.target.value); setShowSearch(true); }}
              onFocus={() => setShowSearch(true)}
              onBlur={() => setTimeout(() => setShowSearch(false), 150)}
              onKeyDown={(e) => { if (e.key === 'Enter' && matches[0]) { router.push(`/clients/${matches[0].id}`); setQ(''); } }}
              placeholder="Search clients"
              aria-label="Search clients"
              className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm focus:border-brand-500 focus:bg-white focus:outline-none"
            />
            {showSearch && matches.length > 0 && (
              <ul className="absolute mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
                {matches.map((c) => (
                  <li key={c.id}>
                    <button onMouseDown={() => { router.push(`/clients/${c.id}`); setQ(''); }} className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50">{c.name}</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="ml-auto flex items-center gap-3">
            <div ref={bellRef} className="relative">
              <button onClick={() => setShowAlerts(!showAlerts)} className="relative rounded-full p-2 text-slate-500 hover:bg-slate-100" aria-label="Notifications">
                <Bell size={19} />
                {alertTotal > 0 && <span className="absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">{alertTotal > 99 ? '99+' : alertTotal}</span>}
              </button>
              {showAlerts && (
                <div className="absolute right-0 mt-2 w-72 rounded-lg border border-slate-200 bg-white p-2 shadow-lg">
                  {alerts.map((a) => (
                    <Link key={a.label} href={a.href} onClick={() => setShowAlerts(false)} className="flex items-center justify-between rounded-md px-3 py-2 text-sm hover:bg-slate-50">
                      <span>{a.label}</span>
                      <span className={`rounded-full px-2 text-xs font-semibold ${a.count ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-500'}`}>{a.count}</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">{initials}</span>
              <div className="hidden text-sm leading-tight sm:block">
                <div className="font-medium text-slate-800">{me?.full_name}</div>
                <div className="text-xs capitalize text-slate-500">{me?.role}</div>
              </div>
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-[1400px] p-4 sm:p-6 print:p-0">{children}</main>
      </div>
    </div>
  );
}
