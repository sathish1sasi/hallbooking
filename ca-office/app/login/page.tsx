'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Calculator } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Button, ErrorNote, Field, Input } from '@/components/ui';

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null); setInfo(null);
    const sb = supabase();
    if (mode === 'signin') {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) setError(error.message);
      else { router.replace('/dashboard'); router.refresh(); }
    } else {
      const { data, error } = await sb.auth.signUp({ email, password, options: { data: { full_name: fullName } } });
      if (error) setError(error.message);
      else if (!data.session) setInfo('Account created. Check your email to confirm, then sign in.');
      else { router.replace('/dashboard'); router.refresh(); }
    }
    setBusy(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-900 to-brand-700 p-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-xl bg-white p-8 shadow-2xl">
        <div className="flex items-center gap-2 text-brand-700">
          <Calculator size={26} />
          <h1 className="text-xl font-semibold text-slate-900">CA Office Manager</h1>
        </div>
        <p className="text-sm text-slate-500">{mode === 'signin' ? 'Sign in to your office workspace.' : 'Create a staff account. The first account becomes the admin.'}</p>
        {mode === 'signup' && (
          <Field label="Full name"><Input required value={fullName} onChange={(e) => setFullName(e.target.value)} /></Field>
        )}
        <Field label="Email"><Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label="Password"><Input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
        <ErrorNote error={error} />
        {info && <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{info}</p>}
        <Button className="w-full" disabled={busy}>{busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}</Button>
        <button type="button" className="w-full text-sm text-brand-600 hover:underline" onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}>
          {mode === 'signin' ? 'New here? Create an account' : 'Already have an account? Sign in'}
        </button>
      </form>
    </div>
  );
}
