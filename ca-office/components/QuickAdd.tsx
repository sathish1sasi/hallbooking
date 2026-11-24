'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { CheckSquare, FileUp, FileQuestion, ListChecks, Plus, Receipt, UserPlus } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { todayISO } from '@/lib/format';
import { useApp } from './AppContext';
import { ClientForm, DocumentForm, TaskForm } from './forms';
import { UploadButton } from './FileButton';
import { Button, ErrorNote, Field, Input, Modal, Select } from './ui';

type Kind = 'task' | 'client' | 'todo' | 'docs' | 'upload';
const ITEMS: { kind: Kind | 'invoice'; label: string; icon: typeof Plus; key: string }[] = [
  { kind: 'task', label: 'Task', icon: ListChecks, key: 't' },
  { kind: 'client', label: 'Client', icon: UserPlus, key: 'c' },
  { kind: 'todo', label: 'To-do', icon: CheckSquare, key: 'd' },
  { kind: 'docs', label: 'Request documents', icon: FileQuestion, key: 'r' },
  { kind: 'upload', label: 'Upload a file', icon: FileUp, key: 'u' },
  { kind: 'invoice', label: 'Invoice', icon: Receipt, key: 'i' },
];

/** "+ New" menu in the top bar. Press N anywhere (outside a text box) to open it. */
export function QuickAdd({ onCreated }: { onCreated: () => void }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<Kind | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const typing = (el: EventTarget | null) => el instanceof HTMLElement && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || typing(e.target) || kind) return;
      if (e.key === 'n' || e.key === 'N') { e.preventDefault(); setOpen(true); return; }
      if (e.key === 'Escape') setOpen(false);
      if (open) {
        const item = ITEMS.find((i) => i.key === e.key.toLowerCase());
        if (item) { e.preventDefault(); choose(item.kind); }
      }
    };
    const onClick = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('keydown', onKey);
    document.addEventListener('click', onClick);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('click', onClick); };
  });

  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(null), 3500); return () => clearTimeout(t); } }, [toast]);

  const choose = (k: Kind | 'invoice') => {
    setOpen(false);
    if (k === 'invoice') router.push('/invoices/new');
    else setKind(k);
  };
  const done = (message: string) => { setKind(null); setToast(message); onCreated(); };

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(!open)} className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700" aria-haspopup="menu" aria-expanded={open}>
        <Plus size={16} /> <span className="hidden sm:inline">New</span>
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-30 mt-2 w-56 rounded-lg border border-slate-200 bg-white p-1.5 shadow-lg">
          {ITEMS.map(({ kind: k, label, icon: Icon, key }) => (
            <button key={k} role="menuitem" onClick={() => choose(k)} className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm hover:bg-slate-50">
              <Icon size={16} className="text-slate-400" /> <span className="flex-1">{label}</span>
              <kbd className="rounded border border-slate-200 px-1.5 text-[10px] text-slate-400">{key.toUpperCase()}</kbd>
            </button>
          ))}
          <p className="border-t border-slate-100 px-3 pb-1 pt-2 text-[11px] text-slate-400">Tip: press N anywhere to open this menu</p>
        </div>
      )}

      {kind === 'task' && <Modal title="New task" wide onClose={() => setKind(null)}><TaskForm onSaved={() => done('Task created')} /></Modal>}
      {kind === 'client' && (
        <Modal title="New client" wide onClose={() => setKind(null)}>
          <ClientForm onSaved={(c) => { setKind(null); router.push(`/clients/${c.id}`); }} />
        </Modal>
      )}
      {kind === 'todo' && <Modal title="New to-do" onClose={() => setKind(null)}><TodoQuick onSaved={() => done('To-do added')} /></Modal>}
      {kind === 'docs' && <Modal title="Request documents" onClose={() => setKind(null)}><DocumentForm onSaved={() => done('Documents requested')} /></Modal>}
      {kind === 'upload' && <Modal title="Upload a file" onClose={() => setKind(null)}><UploadQuick onDone={() => done('File uploaded')} /></Modal>}

      {toast && (
        <div role="status" className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm text-white shadow-lg">
          {toast}{toast === 'Task created' && <Link href="/tasks" className="ml-3 text-brand-100 underline">View tasks</Link>}
        </div>
      )}
    </div>
  );
}

function TodoQuick({ onSaved }: { onSaved: () => void }) {
  const { clients } = useApp();
  const [f, setF] = useState({ title: '', due_date: todayISO(), client_id: '' });
  const [error, setError] = useState<string | null>(null);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase().from('todos').insert({ ...f, title: f.title.trim(), client_id: f.client_id || null });
    if (error) return setError(error.message);
    onSaved();
  };
  return (
    <form onSubmit={save} className="space-y-3">
      <Field label="To-do *"><Input autoFocus required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Call Mr Reddy about Form 16" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date"><Input type="date" value={f.due_date} onChange={(e) => setF({ ...f, due_date: e.target.value })} /></Field>
        <Field label="Client (optional)">
          <Select value={f.client_id} onChange={(e) => setF({ ...f, client_id: e.target.value })}><option value="">—</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
        </Field>
      </div>
      <ErrorNote error={error} />
      <div className="flex justify-end"><Button>Add</Button></div>
    </form>
  );
}

function UploadQuick({ onDone }: { onDone: () => void }) {
  const { clients } = useApp();
  const [clientId, setClientId] = useState('');
  return (
    <div className="space-y-4">
      <Field label="Client *">
        <Select value={clientId} onChange={(e) => setClientId(e.target.value)}><option value="">Select client…</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
      </Field>
      {clientId ? <UploadButton clientId={clientId} label="Choose files" onDone={onDone} /> : <p className="text-sm text-slate-500">Pick a client first. Files are stored privately and listed under the client’s Documents tab.</p>}
    </div>
  );
}
