export type Role = 'admin' | 'staff';

export interface Profile {
  id: string;
  full_name: string | null;
  email: string | null;
  role: Role;
  hourly_rate: number;
}

export interface Client {
  id: string;
  name: string;
  client_type: string;
  pan: string | null;
  gstin: string | null;
  tan: string | null;
  cin: string | null;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  state: string | null;
  services: string[];
  assigned_to: string | null;
  status: 'active' | 'inactive';
  notes: string | null;
  reminders_opt_out: boolean;
  created_at: string;
}

export type TaskStatus = 'todo' | 'in_progress' | 'hold' | 'waiting_client' | 'review' | 'done';

export interface Task {
  id: string;
  client_id: string;
  title: string;
  category: string;
  period: string | null;
  due_date: string | null;
  assigned_to: string | null;
  status: TaskStatus;
  priority: 'low' | 'normal' | 'high';
  fee: number;
  billed: boolean;
  compliance_key: string | null;
  acknowledgement_no: string | null;
  notes: string | null;
  completed_at: string | null;
  created_at: string;
  clients?: { name: string } | null;
}

export interface DocumentRow {
  id: string;
  client_id: string;
  task_id: string | null;
  name: string;
  status: 'pending' | 'received' | 'returned';
  requested_on: string;
  received_on: string | null;
  returned_on: string | null;
  notes: string | null;
  file_path: string | null;
  file_name: string | null;
  file_size: number | null;
  clients?: { name: string } | null;
}

export interface TimeEntry {
  id: string;
  user_id: string;
  client_id: string;
  task_id: string | null;
  work_date: string;
  hours: number;
  description: string | null;
  billable: boolean;
  clients?: { name: string } | null;
  profiles?: { full_name: string | null } | null;
}

export interface Invoice {
  id: string;
  invoice_no: string;
  client_id: string;
  issue_date: string;
  due_date: string | null;
  is_igst: boolean;
  tax_rate: number;
  subtotal: number;
  tax_amount: number;
  total: number;
  status: 'unpaid' | 'partial' | 'paid' | 'cancelled';
  notes: string | null;
  clients?: Pick<Client, 'name' | 'gstin' | 'pan' | 'address' | 'state' | 'email'> | null;
}

export interface InvoiceItem {
  id: string;
  invoice_id: string;
  task_id: string | null;
  description: string;
  sac: string | null;
  qty: number;
  rate: number;
  amount: number;
}

export interface Payment {
  id: string;
  invoice_id: string;
  amount: number;
  paid_on: string;
  mode: string;
  reference: string | null;
}

export interface FirmSettings {
  id: number;
  name: string;
  address: string | null;
  state: string | null;
  gstin: string | null;
  pan: string | null;
  phone: string | null;
  email: string | null;
  bank_details: string | null;
  invoice_prefix: string;
  next_invoice_no: number;
  reminders_enabled: boolean;
  reminder_deadline_days: number;
  reminder_doc_after_days: number;
  reminder_repeat_days: number;
  reminder_payment_grace_days: number;
  reminder_kinds: string[];
  reminder_channels: string[];
}

export const TASK_STATUSES: { value: TaskStatus; label: string; color: string }[] = [
  { value: 'todo', label: 'To do', color: 'bg-slate-100 text-slate-700' },
  { value: 'in_progress', label: 'In progress', color: 'bg-blue-100 text-blue-700' },
  { value: 'hold', label: 'On hold', color: 'bg-rose-100 text-rose-700' },
  { value: 'waiting_client', label: 'Waiting on client', color: 'bg-amber-100 text-amber-800' },
  { value: 'review', label: 'Review', color: 'bg-violet-100 text-violet-700' },
  { value: 'done', label: 'Done', color: 'bg-emerald-100 text-emerald-700' },
];

export const CLIENT_TYPES = ['individual', 'huf', 'proprietorship', 'partnership', 'llp', 'company', 'trust', 'other'];

export const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat', 'Haryana',
  'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur',
  'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana',
  'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal', 'Andaman and Nicobar Islands', 'Chandigarh',
  'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Jammu and Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry',
];

export interface Todo { id: string; user_id: string; title: string; due_date: string; done: boolean; client_id: string | null; }

export interface Package {
  id: string; client_id: string; name: string; fee: number;
  frequency: 'monthly' | 'quarterly' | 'half_yearly' | 'yearly' | 'one_time';
  next_bill_date: string; active: boolean; clients?: { name: string } | null;
}

export interface Dsc {
  id: string; client_id: string; holder_name: string; dsc_class: string; issued_by: string | null;
  valid_from: string | null; valid_to: string; location: 'office' | 'client';
  token_password_hint: string | null; notes: string | null; clients?: { name: string; phone: string | null } | null;
}

export interface Attendance {
  id: string; user_id: string; work_date: string; check_in: string | null; check_out: string | null;
  status: 'present' | 'half_day' | 'leave' | 'wfh'; note: string | null;
}

export interface ChecklistItem { id: string; task_id: string; label: string; done: boolean; position: number; done_by: string | null; done_at: string | null }
export interface TaskComment { id: string; task_id: string; user_id: string; body: string; created_at: string }
export interface RecurringTask {
  id: string; client_id: string; title: string; category: string;
  frequency: 'weekly' | 'monthly' | 'quarterly' | 'half_yearly' | 'yearly';
  anchor_day: number; next_due: string; period_mode: 'previous' | 'current' | 'none';
  assigned_to: string | null; fee: number; checklist: string[]; active: boolean; clients?: { name: string } | null;
}
