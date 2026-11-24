'use client';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Pencil, Plus } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { SERVICES } from '@/lib/compliance';
import { daysUntil, fmtDate, inr } from '@/lib/format';
import type { Client, DocumentRow, Task, TimeEntry } from '@/lib/types';
import { useApp } from '@/components/AppContext';
import { ClientForm, DocumentForm, TaskForm } from '@/components/forms';
import { DocStatusSelect } from '@/components/DocStatusSelect';
import { FileLink } from '@/components/FileLink';
import { UploadButton } from '@/components/FileButton';
import {
  Badge, Button, Card, DueBadge, Empty, InvoiceStatusBadge, Modal, PageHeader, StatusBadge, Table, Td,
} from '@/components/ui';

type Bal = { id: string; invoice_no: string; issue_date: string; total: number; paid: number; balance: number; status: string };
type Tab = 'tasks' | 'documents' | 'billing' | 'time';

export default function ClientDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { me, staffName, reloadLookups } = useApp();
  const [client, setClient] = useState<Client | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [docs, setDocs] = useState<DocumentRow[]>([]);
  const [invoices, setInvoices] = useState<Bal[]>([]);
  const [time, setTime] = useState<TimeEntry[]>([]);
  const [tab, setTab] = useState<Tab>('tasks');
  const [modal, setModal] = useState<null | 'edit' | 'task' | 'doc' | { task: Task }>(null);
  const [showDone, setShowDone] = useState(false);

  const load = useCallback(async () => {
    const sb = supabase();
    const [c, t, d, i, te] = await Promise.all([
      sb.from('clients').select('*').eq('id', id).single(),
      sb.from('tasks').select('*').eq('client_id', id).order('due_date', { ascending: false, nullsFirst: true }),
      sb.from('documents').select('*').eq('client_id', id).order('requested_on', { ascending: false }),
      sb.from('invoice_balances').select('*').eq('client_id', id).order('issue_date', { ascending: false }),
      sb.from('time_entries').select('*, profiles(full_name)').eq('client_id', id).order('work_date', { ascending: false }).limit(200),
    ]);
    setClient(c.data as Client);
    setTasks((t.data ?? []) as Task[]);
    setDocs((d.data ?? []) as DocumentRow[]);
    setInvoices((i.data ?? []) as Bal[]);
    setTime((te.data ?? []) as TimeEntry[]);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (!client) return <Empty>Loading…</Empty>;

  const outstanding = invoices.filter((i) => i.status !== 'cancelled').reduce((a, i) => a + Number(i.balance), 0);
  const openTasks = tasks.filter((t) => t.status !== 'done');
  const visibleTasks = showDone ? tasks : openTasks;
  const pendingDocs = docs.filter((d) => d.status === 'pending').length;
  const hours = time.reduce((a, t) => a + Number(t.hours), 0);

  const deleteClient = async () => {
    if (!confirm(`Delete ${client.name} and all their tasks, documents and time entries? Invoices must be removed first.`)) return;
    const { error } = await supabase().from('clients').delete().eq('id', client.id);
    if (error) return alert(error.message);
    await reloadLookups();
    router.replace('/clients');
  };

  return (
    <>
      <Link href="/clients" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"><ArrowLeft size={14} /> Clients</Link>
      <PageHeader
        title={client.name}
        subtitle={`${client.client_type.toUpperCase()} · Manager: ${staffName(client.assigned_to)}${client.status === 'inactive' ? ' · INACTIVE' : ''}`}
        actions={<>
          <Button variant="secondary" onClick={() => setModal('edit')}><Pencil size={15} /> Edit</Button>
          <Link href={`/invoices/new?client=${client.id}`}><Button variant="secondary">New invoice</Button></Link>
          <Button onClick={() => setModal('task')}><Plus size={16} /> Task</Button>
        </>}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Details" className="lg:col-span-1">
          <dl className="space-y-2 text-sm">
            {([
              ['PAN', client.pan], ['GSTIN', client.gstin], ['TAN', client.tan], ['CIN/LLPIN', client.cin],
              ['Contact', client.contact_person], ['Phone', client.phone], ['Email', client.email],
              ['State', client.state], ['Address', client.address],
            ] as const).map(([k, v]) => v ? (
              <div key={k} className="grid grid-cols-3 gap-2">
                <dt className="text-slate-500">{k}</dt>
                <dd className="col-span-2 break-words font-medium">{v}</dd>
              </div>
            ) : null)}
          </dl>
          <div className="mt-4 flex flex-wrap gap-1">
            {client.services.map((s) => <Badge key={s} className="bg-brand-50 text-brand-700">{SERVICES.find((x) => x.code === s)?.label ?? s}</Badge>)}
          </div>
          {client.notes && <p className="mt-4 whitespace-pre-wrap rounded bg-slate-50 p-3 text-sm text-slate-600">{client.notes}</p>}
          {me?.role === 'admin' && (
            <button onClick={deleteClient} className="mt-6 text-xs text-red-600 hover:underline">Delete client</button>
          )}
        </Card>

        <div className="space-y-4 lg:col-span-2">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Mini label="Open tasks" value={openTasks.length} />
            <Mini label="Docs pending" value={pendingDocs} />
            <Mini label="Outstanding" value={inr(outstanding)} />
            <Mini label="Hours logged" value={hours.toFixed(1)} />
          </div>

          <div className="flex gap-1 border-b">
            {(['tasks', 'documents', 'billing', 'time'] as Tab[]).map((t) => (
              <button key={t} onClick={() => setTab(t)}
                className={`-mb-px border-b-2 px-4 py-2 text-sm capitalize ${tab === t ? 'border-brand-600 font-medium text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
                {t}
              </button>
            ))}
          </div>

          {tab === 'tasks' && (
            <Card title="Tasks" action={<label className="flex items-center gap-2 text-xs text-slate-500"><input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} /> show completed</label>}>
              {!visibleTasks.length ? <Empty>No tasks.</Empty> : (
                <Table head={['Task', 'Period', 'Due', 'Assignee', 'Status', 'Fee']}>
                  {visibleTasks.map((t) => (
                    <tr key={t.id} className="cursor-pointer hover:bg-slate-50" onClick={() => router.push(`/tasks/${t.id}`)}>
                      <Td><span className="font-medium">{t.title}</span><div className="text-xs text-slate-500">{t.category}{t.acknowledgement_no ? ` · ARN ${t.acknowledgement_no}` : ''}</div></Td>
                      <Td>{t.period}</Td>
                      <Td><div className="whitespace-nowrap">{fmtDate(t.due_date)}</div><DueBadge days={daysUntil(t.due_date)} done={t.status === 'done'} /></Td>
                      <Td>{staffName(t.assigned_to)}</Td>
                      <Td><StatusBadge status={t.status} /></Td>
                      <Td className="whitespace-nowrap">{inr(t.fee)}{t.billed && <div className="text-xs text-emerald-600">billed</div>}</Td>
                    </tr>
                  ))}
                </Table>
              )}
            </Card>
          )}

          {tab === 'documents' && (
            <Card title="Documents & files" action={<div className="flex gap-2"><UploadButton clientId={client.id} onDone={load} /><Button variant="secondary" onClick={() => setModal('doc')}><Plus size={14} /> Request</Button></div>}>
              {!docs.length ? <Empty>No documents tracked.</Empty> : (
                <Table head={['Document', 'Requested', 'Received', 'Status']}>
                  {docs.map((d) => (
                    <tr key={d.id}>
                      <Td>
                        <span className="font-medium">{d.name}</span>{d.notes && <div className="text-xs text-slate-500">{d.notes}</div>}
                        <div className="mt-1">{d.file_path ? <FileLink doc={d} onRemoved={load} /> : d.status === 'pending' ? <UploadButton compact clientId={client.id} documentId={d.id} label="Attach file" onDone={load} /> : null}</div>
                      </Td>
                      <Td>{fmtDate(d.requested_on)}</Td>
                      <Td>{fmtDate(d.received_on)}</Td>
                      <Td><DocStatusSelect doc={d} onChanged={load} /></Td>
                    </tr>
                  ))}
                </Table>
              )}
            </Card>
          )}

          {tab === 'billing' && (
            <Card title="Invoices">
              {!invoices.length ? <Empty>No invoices yet.</Empty> : (
                <Table head={['Invoice', 'Date', 'Total', 'Paid', 'Balance', 'Status']}>
                  {invoices.map((i) => (
                    <tr key={i.id} className="hover:bg-slate-50">
                      <Td><Link className="font-medium text-brand-700" href={`/invoices/${i.id}`}>{i.invoice_no}</Link></Td>
                      <Td>{fmtDate(i.issue_date)}</Td>
                      <Td>{inr(i.total)}</Td>
                      <Td>{inr(i.paid)}</Td>
                      <Td className="font-medium">{inr(i.balance)}</Td>
                      <Td><InvoiceStatusBadge status={i.status} /></Td>
                    </tr>
                  ))}
                </Table>
              )}
            </Card>
          )}

          {tab === 'time' && (
            <Card title="Time logged">
              {!time.length ? <Empty>No time logged.</Empty> : (
                <Table head={['Date', 'Staff', 'Hours', 'Description']}>
                  {time.map((t) => (
                    <tr key={t.id}>
                      <Td className="whitespace-nowrap">{fmtDate(t.work_date)}</Td>
                      <Td>{t.profiles?.full_name}</Td>
                      <Td>{Number(t.hours).toFixed(2)}{!t.billable && <div className="text-xs text-slate-400">non-billable</div>}</Td>
                      <Td>{t.description}</Td>
                    </tr>
                  ))}
                </Table>
              )}
            </Card>
          )}
        </div>
      </div>

      {modal === 'edit' && (
        <Modal title="Edit client" wide onClose={() => setModal(null)}>
          <ClientForm client={client} onSaved={() => { setModal(null); load(); }} />
        </Modal>
      )}
      {modal === 'task' && (
        <Modal title="New task" wide onClose={() => setModal(null)}>
          <TaskForm clientId={client.id} onSaved={() => { setModal(null); load(); }} />
        </Modal>
      )}
      {modal === 'doc' && (
        <Modal title="Request documents" onClose={() => setModal(null)}>
          <DocumentForm clientId={client.id} onSaved={() => { setModal(null); setTab('documents'); load(); }} />
        </Modal>
      )}
      {modal && typeof modal === 'object' && (
        <Modal title="Edit task" wide onClose={() => setModal(null)}>
          <TaskForm task={modal.task} clientId={client.id} onSaved={() => { setModal(null); load(); }} onDeleted={() => { setModal(null); load(); }} />
        </Modal>
      )}
    </>
  );
}

function Mini({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
    </div>
  );
}
