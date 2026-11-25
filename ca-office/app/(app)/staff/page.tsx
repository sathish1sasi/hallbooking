'use client';
import { useEffect, useState } from 'react';
import { KeyRound, UserPlus } from 'lucide-react';
import { api } from '@/lib/api';
import type { Profile } from '@/lib/types';
import { useApp } from '@/components/AppContext';
import { Badge, Button, Card, Empty, ErrorNote, Field, Input, Modal, PageHeader, Select, Table, Td } from '@/components/ui';

export default function StaffPage() {
  const { me, reloadLookups } = useApp();
  const [all, setAll] = useState<Profile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [resetFor, setResetFor] = useState<Profile | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = () => api().from('profiles').select('*').order('full_name').then(({ data }) => setAll((data ?? []) as Profile[]));
  useEffect(() => { load(); }, []);

  if (me && me.role !== 'admin') return <Empty>Only admins can manage users.</Empty>;

  const update = async (p: Profile, patch: Partial<Profile>) => {
    setError(null); setNote(null);
    const { error } = await api().from('profiles').update(patch).eq('id', p.id);
    if (error) setError(error.message);
    await Promise.all([load(), reloadLookups()]);
  };

  return (
    <>
      <PageHeader title="Users" subtitle="Add staff accounts, set roles and hourly rates, reset passwords."
        actions={<Button onClick={() => setAdding(true)}><UserPlus size={16} /> Add staff member</Button>} />
      <ErrorNote error={error} />
      {note && <p className="mb-3 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{note}</p>}
      <Card className="mt-3">
        <Table head={['Name', 'Email', 'Role', 'Hourly rate (₹)', 'Status', '']}>
          {all.map((p) => (
            <tr key={p.id} className={p.active === false ? 'opacity-50' : ''}>
              <Td className="font-medium">{p.full_name}{p.id === me?.id && <span className="ml-1 text-xs text-slate-400">(you)</span>}</Td>
              <Td>{p.email}</Td>
              <Td>
                <Select className="w-28" value={p.role} onChange={(e) => update(p, { role: e.target.value as Profile['role'] })} aria-label={`Role for ${p.full_name}`}>
                  <option value="staff">Staff</option><option value="admin">Admin</option>
                </Select>
              </Td>
              <Td>
                <Input className="w-28" type="number" min="0" step="50" defaultValue={p.hourly_rate} aria-label={`Hourly rate for ${p.full_name}`}
                  onBlur={(e) => Number(e.target.value) !== Number(p.hourly_rate) && update(p, { hourly_rate: Number(e.target.value) })} />
              </Td>
              <Td>
                {p.active === false ? <Badge>Switched off</Badge> : <Badge className="bg-emerald-100 text-emerald-700">Active</Badge>}
              </Td>
              <Td className="whitespace-nowrap">
                <button className="mr-3 inline-flex items-center gap-1 text-xs text-brand-600 hover:underline" onClick={() => setResetFor(p)}><KeyRound size={13} /> Reset password</button>
                {p.id !== me?.id && (
                  <button className="text-xs text-slate-500 hover:underline" onClick={() => update(p, { active: p.active === false })}>
                    {p.active === false ? 'Switch on' : 'Switch off'}
                  </button>
                )}
              </Td>
            </tr>
          ))}
        </Table>
        <p className="mt-3 text-xs text-slate-500">Switching someone off stops them signing in but keeps their tasks and history.</p>
      </Card>

      {adding && (
        <Modal title="Add staff member" onClose={() => setAdding(false)}>
          <AddUser onDone={(email, pw) => { setAdding(false); setNote(`Account created. Share these sign-in details with them: ${email} / ${pw} (they can change the password under My account).`); load(); reloadLookups(); }} />
        </Modal>
      )}
      {resetFor && (
        <Modal title={`Reset password for ${resetFor.full_name}`} onClose={() => setResetFor(null)}>
          <ResetPassword user={resetFor} onDone={(pw) => { setResetFor(null); setNote(`New password for ${resetFor.email}: ${pw}`); }} />
        </Modal>
      )}
    </>
  );
}

const suggestPassword = () => {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => chars[b % chars.length]).join('');
};

function AddUser({ onDone }: { onDone: (email: string, pw: string) => void }) {
  const [f, setF] = useState({ full_name: '', email: '', role: 'staff', password: suggestPassword() });
  const [error, setError] = useState<string | null>(null);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await api().rpc('admin_create_user', f);
    if (error) return setError(error.message);
    onDone(f.email, f.password);
  };
  return (
    <form onSubmit={save} className="space-y-3">
      <Field label="Full name *"><Input required value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} /></Field>
      <Field label="Email (used to sign in) *"><Input type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Role"><Select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}><option value="staff">Staff</option><option value="admin">Admin</option></Select></Field>
        <Field label="Starting password"><Input required minLength={8} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
      </div>
      <ErrorNote error={error} />
      <div className="flex justify-end"><Button>Create account</Button></div>
    </form>
  );
}

function ResetPassword({ user, onDone }: { user: Profile; onDone: (pw: string) => void }) {
  const [pw, setPw] = useState(suggestPassword());
  const [error, setError] = useState<string | null>(null);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await api().rpc('admin_set_password', { user_id: user.id, password: pw });
    if (error) return setError(error.message);
    onDone(pw);
  };
  return (
    <form onSubmit={save} className="space-y-3">
      <Field label="New password (at least 8 characters)"><Input required minLength={8} value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
      <ErrorNote error={error} />
      <div className="flex justify-end"><Button>Set password</Button></div>
    </form>
  );
}
