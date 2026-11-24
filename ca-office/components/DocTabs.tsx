'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function DocTabs() {
  const p = usePathname();
  return (
    <div className="mb-5 flex gap-1 border-b border-slate-200">
      {[['/documents', 'Document tracker'], ['/dsc', 'DSC register']].map(([href, label]) => (
        <Link key={href} href={href} className={`-mb-px border-b-2 px-4 py-2 text-sm ${p === href ? 'border-brand-600 font-medium text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>{label}</Link>
      ))}
    </div>
  );
}
