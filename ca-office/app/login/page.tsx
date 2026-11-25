'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Calculator } from 'lucide-react';
import { api } from '@/lib/api';
import { Button, ErrorNote, Field, Input } from '@/components/ui';

export default function LoginPage() {
  const router = useRouter();
  const [firstRun, setFirstRun] = useState<boolean | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api().auth.status().then(({ data, error }) => {
      if (error) { setError(error.message); setFirstRun(false); return; }
      if (data?.user) router.replace('/dashboard/');
      else setFirstRun(!data?.hasUsers);
    });
  }, [router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    const { error } = firstRun
      ? await api().auth.signUp({ email, password, options: { data: { full_name: fullName } } })
      : await api().auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) setError(error.message);
    else router.replace('/dashboard/');
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-900 to-brand-700 p-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-xl bg-white p-8 shadow-2xl">
        <div className="flex items-center gap-2 text-brand-700">
          <Calculator size={26} />
          <h1 className="text-xl font-semibold text-slate-900">CA Office Manager</h1>
        </div>
        {firstRun === null ? <p className="text-sm text-slate-500">Loading…</p> : (
          <>
            <p className="text-sm text-slate-500">{firstRun ? 'Create the admin account for your firm.' : 'Sign in to your office workspace.'}</p>
            {firstRun && <Field label="Full name"><Input required value={fullName} onChange={(e) => setFullName(e.target.value)} /></Field>}
            <Field label="Email"><Input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
            <Field label="Password"><Input type="password" autoComplete={firstRun ? 'new-password' : 'current-password'} required minLength={firstRun ? 8 : 1} value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
            <ErrorNote error={error} />
            <Button className="w-full" disabled={busy}>{busy ? 'Please wait…' : firstRun ? 'Create admin account' : 'Sign in'}</Button>
            {!firstRun && <p className="text-center text-xs text-slate-500">New staff accounts are created by your admin under Users. Forgot your password? Ask your admin to reset it.</p>}
          </>
        )}
      </form>
    </div>
  );
}
