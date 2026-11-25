'use client';
import { useState } from 'react';
import { api } from '@/lib/api';
import { useApp } from '@/components/AppContext';
import { Button, Card, ErrorNote, Field, Input, PageHeader } from '@/components/ui';

export default function AccountPage() {
  const { me, reloadLookups } = useApp();
  const [name, setName] = useState(me?.full_name ?? '');
  const [pw, setPw] = useState({ current: '', password: '', confirm: '' });
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const saveName = async (e: React.FormEvent) => {
    e.preventDefault(); setError(null); setMsg(null);
    const { error } = await api().from('profiles').update({ full_name: name.trim() }).eq('id', me!.id);
    if (error) return setError(error.message);
    await reloadLookups();
    setMsg('Name saved.');
  };
  const savePw = async (e: React.FormEvent) => {
    e.preventDefault(); setError(null); setMsg(null);
    if (pw.password !== pw.confirm) return setError('The new passwords do not match.');
    const { error } = await api().rpc('change_password', { current: pw.current, password: pw.password });
    if (error) return setError(error.message);
    setPw({ current: '', password: '', confirm: '' });
    setMsg('Password changed.');
  };

  return (
    <>
      <PageHeader title="My account" subtitle={me?.email ?? ''} />
      <ErrorNote error={error} />
      {msg && <p className="mb-3 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{msg}</p>}
      <div className="mt-3 grid gap-5 md:grid-cols-2">
        <Card title="Your name">
          <form onSubmit={saveName} className="space-y-3">
            <Field label="Full name"><Input required value={name} onChange={(e) => setName(e.target.value)} /></Field>
            <div className="flex justify-end"><Button>Save</Button></div>
          </form>
        </Card>
        <Card title="Change password">
          <form onSubmit={savePw} className="space-y-3">
            <Field label="Current password"><Input type="password" autoComplete="current-password" required value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} /></Field>
            <Field label="New password (at least 8 characters)"><Input type="password" autoComplete="new-password" minLength={8} required value={pw.password} onChange={(e) => setPw({ ...pw, password: e.target.value })} /></Field>
            <Field label="Repeat new password"><Input type="password" autoComplete="new-password" minLength={8} required value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} /></Field>
            <div className="flex justify-end"><Button>Change password</Button></div>
          </form>
        </Card>
      </div>
    </>
  );
}
