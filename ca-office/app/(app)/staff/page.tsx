'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/lib/types';
import { useApp } from '@/components/AppContext';
import { Card, Empty, ErrorNote, Input, PageHeader, Select, Table, Td } from '@/components/ui';

export default function StaffPage() {
  const { me, staff, reloadLookups } = useApp();
  const [error, setError] = useState<string | null>(null);

  if (me && me.role !== 'admin') return <Empty>Only admins can manage staff.</Empty>;

  const update = async (p: Profile, patch: Partial<Profile>) => {
    setError(null);
    if (p.id === me?.id && patch.role === 'staff' && staff.filter((s) => s.role === 'admin').length === 1) {
      return setError('You are the only admin — promote someone else first.');
    }
    const { error } = await supabase().from('profiles').update(patch).eq('id', p.id);
    if (error) setError(error.message);
    await reloadLookups();
  };

  return (
    <>
      <PageHeader title="Staff" subtitle="New staff join by creating an account on the sign-in page; they start with the staff role." />
      <ErrorNote error={error} />
      <Card className="mt-4">
        <Table head={['Name', 'Email', 'Role', 'Hourly rate (₹)']}>
          {staff.map((p) => (
            <tr key={p.id}>
              <Td className="font-medium">{p.full_name}{p.id === me?.id && <span className="ml-1 text-xs text-slate-400">(you)</span>}</Td>
              <Td>{p.email}</Td>
              <Td>
                <Select className="w-32" value={p.role} onChange={(e) => update(p, { role: e.target.value as Profile['role'] })}>
                  <option value="staff">Staff</option><option value="admin">Admin</option>
                </Select>
              </Td>
              <Td>
                <Input className="w-32" type="number" min="0" step="50" defaultValue={p.hourly_rate}
                  onBlur={(e) => Number(e.target.value) !== Number(p.hourly_rate) && update(p, { hourly_rate: Number(e.target.value) })} />
              </Td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}
