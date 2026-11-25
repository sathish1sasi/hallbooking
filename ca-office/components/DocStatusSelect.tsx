'use client';
import { api } from '@/lib/api';
import type { DocumentRow } from '@/lib/types';

const COLORS = { pending: 'bg-amber-50 text-amber-800', received: 'bg-emerald-50 text-emerald-700', returned: 'bg-slate-100 text-slate-600' };

export function DocStatusSelect({ doc, onChanged }: { doc: DocumentRow; onChanged: () => void }) {
  const change = async (status: string) => {
    const { error } = await api().from('documents').update({ status }).eq('id', doc.id);
    if (error) alert(error.message);
    onChanged();
  };
  return (
    <select
      value={doc.status}
      onChange={(e) => change(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      className={`rounded-full border-0 px-2 py-1 text-xs font-medium ${COLORS[doc.status]}`}
    >
      <option value="pending">Pending</option>
      <option value="received">Received</option>
      <option value="returned">Returned</option>
    </select>
  );
}
