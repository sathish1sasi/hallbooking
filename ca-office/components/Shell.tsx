'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import {
  LayoutDashboard, Users, ListChecks, CalendarClock, FileStack, Clock, Receipt, UserCog, Settings, LogOut, Menu, Calculator,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useApp } from './AppContext';

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/clients', label: 'Clients', icon: Users },
  { href: '/tasks', label: 'Tasks', icon: ListChecks },
  { href: '/compliance', label: 'Compliance calendar', icon: CalendarClock },
  { href: '/documents', label: 'Documents', icon: FileStack },
  { href: '/timesheets', label: 'Timesheets', icon: Clock },
  { href: '/invoices', label: 'Billing', icon: Receipt },
];
const ADMIN_NAV = [
  { href: '/staff', label: 'Staff', icon: UserCog },
  { href: '/settings', label: 'Firm settings', icon: Settings },
];

export function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { me } = useApp();
  const [open, setOpen] = useState(false);
  const items = me?.role === 'admin' ? [...NAV, ...ADMIN_NAV] : NAV;

  const signOut = async () => {
    await supabase().auth.signOut();
    router.replace('/login');
    router.refresh();
  };

  const nav = (
    <nav className="flex flex-1 flex-col gap-0.5 p-3">
      {items.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(href + '/');
        return (
          <Link
            key={href}
            href={href}
            onClick={() => setOpen(false)}
            className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm ${
              active ? 'bg-brand-600 text-white' : 'text-slate-300 hover:bg-white/10 hover:text-white'
            }`}
          >
            <Icon size={17} /> {label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen bg-slate-50 lg:flex">
      <aside className={`${open ? 'flex' : 'hidden'} fixed inset-y-0 left-0 z-40 w-64 flex-col bg-brand-900 print:hidden lg:sticky lg:top-0 lg:flex lg:h-screen`}>
        <div className="flex items-center gap-2 px-5 py-5 text-white">
          <Calculator size={22} />
          <span className="font-semibold">CA Office</span>
        </div>
        {nav}
        <div className="border-t border-white/10 p-3 text-sm text-slate-300">
          <div className="px-3 pb-2">
            <div className="truncate font-medium text-white">{me?.full_name ?? '…'}</div>
            <div className="text-xs capitalize">{me?.role}</div>
          </div>
          <button onClick={signOut} className="flex w-full items-center gap-3 rounded-md px-3 py-2 hover:bg-white/10 hover:text-white">
            <LogOut size={17} /> Sign out
          </button>
        </div>
      </aside>
      {open && <div className="fixed inset-0 z-30 bg-black/30 lg:hidden" onClick={() => setOpen(false)} />}
      <div className="flex-1 min-w-0">
        <header className="flex items-center gap-3 border-b bg-white px-4 py-3 print:hidden lg:hidden">
          <button onClick={() => setOpen(true)} aria-label="Open menu"><Menu size={20} /></button>
          <span className="font-semibold">CA Office</span>
        </header>
        <main className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8 print:p-0">{children}</main>
      </div>
    </div>
  );
}
