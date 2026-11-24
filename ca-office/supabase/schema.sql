-- CA Office Manager — Supabase schema
-- Run this whole file once in Supabase -> SQL Editor.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Staff profiles & roles
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  role text not null default 'staff' check (role in ('admin', 'staff')),
  hourly_rate numeric(10,2) not null default 0,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- Auto-create a profile on signup. The very first user becomes admin.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.email,
    case when exists (select 1 from public.profiles) then 'staff' else 'admin' end
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Staff may edit their own name, but only admins may change roles / rates.
create or replace function public.protect_profile_fields()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() and (new.role is distinct from old.role or new.hourly_rate is distinct from old.hourly_rate) then
    raise exception 'Only admins can change role or hourly rate';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect on public.profiles;
create trigger profiles_protect before update on public.profiles
  for each row execute function public.protect_profile_fields();

-- ---------------------------------------------------------------------------
-- Firm settings (single row) — used on invoices
-- ---------------------------------------------------------------------------
create table if not exists public.firm_settings (
  id int primary key default 1 check (id = 1),
  name text not null default 'My CA Firm',
  address text,
  state text,
  gstin text,
  pan text,
  phone text,
  email text,
  bank_details text,
  invoice_prefix text not null default 'INV',
  next_invoice_no int not null default 1
);
insert into public.firm_settings (id) values (1) on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Clients
-- ---------------------------------------------------------------------------
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  client_type text not null default 'individual'
    check (client_type in ('individual', 'huf', 'proprietorship', 'partnership', 'llp', 'company', 'trust', 'other')),
  pan text,
  gstin text,
  tan text,
  cin text,
  contact_person text,
  email text,
  phone text,
  address text,
  state text,
  -- service codes: GST_MONTHLY, GST_QUARTERLY, TDS, ITR, AUDIT, ADVANCE_TAX, ROC, LLP, ACCOUNTING
  services text[] not null default '{}',
  assigned_to uuid references public.profiles(id) on delete set null,
  status text not null default 'active' check (status in ('active', 'inactive')),
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists clients_name_idx on public.clients (lower(name));

-- ---------------------------------------------------------------------------
-- Tasks / compliance work
-- ---------------------------------------------------------------------------
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  title text not null,
  category text not null default 'other',
  period text,
  due_date date,
  assigned_to uuid references public.profiles(id) on delete set null,
  status text not null default 'todo'
    check (status in ('todo', 'in_progress', 'waiting_client', 'review', 'done')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high')),
  fee numeric(12,2) not null default 0,
  billed boolean not null default false,
  compliance_key text,              -- set when generated from the compliance calendar
  acknowledgement_no text,          -- ARN / ack no. after filing
  notes text,
  completed_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  unique (client_id, compliance_key)
);
create index if not exists tasks_due_idx on public.tasks (due_date) where status <> 'done';

create or replace function public.tasks_completed_at()
returns trigger language plpgsql as $$
begin
  if new.status = 'done' then
    if tg_op = 'INSERT' or old.status <> 'done' then
      new.completed_at := now();
    end if;
  elsif new.status <> 'done' then
    new.completed_at := null;
  end if;
  return new;
end;
$$;
drop trigger if exists tasks_completed on public.tasks;
create trigger tasks_completed before insert or update on public.tasks
  for each row execute function public.tasks_completed_at();

-- ---------------------------------------------------------------------------
-- Document tracker
-- ---------------------------------------------------------------------------
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete set null,
  name text not null,
  status text not null default 'pending' check (status in ('pending', 'received', 'returned')),
  requested_on date not null default current_date,
  received_on date,
  returned_on date,
  notes text,
  created_at timestamptz not null default now()
);

create or replace function public.documents_dates()
returns trigger language plpgsql as $$
begin
  if new.status = 'received' and new.received_on is null then new.received_on := current_date; end if;
  if new.status = 'returned' and new.returned_on is null then new.returned_on := current_date; end if;
  if new.status = 'pending' then new.received_on := null; new.returned_on := null; end if;
  return new;
end;
$$;
drop trigger if exists documents_dates on public.documents;
create trigger documents_dates before insert or update on public.documents
  for each row execute function public.documents_dates();

-- ---------------------------------------------------------------------------
-- Timesheets
-- ---------------------------------------------------------------------------
create table if not exists public.time_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete set null,
  work_date date not null default current_date,
  hours numeric(5,2) not null check (hours > 0 and hours <= 24),
  description text,
  billable boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Invoices & payments
-- ---------------------------------------------------------------------------
create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_no text not null unique,
  client_id uuid not null references public.clients(id) on delete restrict,
  issue_date date not null default current_date,
  due_date date,
  is_igst boolean not null default false,
  tax_rate numeric(5,2) not null default 18,
  subtotal numeric(12,2) not null default 0,
  tax_amount numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  status text not null default 'unpaid' check (status in ('unpaid', 'partial', 'paid', 'cancelled')),
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete set null,
  description text not null,
  sac text default '998222',
  qty numeric(10,2) not null default 1,
  rate numeric(12,2) not null default 0,
  amount numeric(12,2) generated always as (round(qty * rate, 2)) stored
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  paid_on date not null default current_date,
  mode text not null default 'bank' check (mode in ('bank', 'upi', 'cheque', 'cash', 'other')),
  reference text,
  created_at timestamptz not null default now()
);

-- Recalculate invoice totals from line items.
create or replace function public.recalc_invoice(p_invoice uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_sub numeric; v_rate numeric;
begin
  select coalesce(sum(amount), 0) into v_sub from invoice_items where invoice_id = p_invoice;
  select tax_rate into v_rate from invoices where id = p_invoice;
  update invoices
     set subtotal = v_sub,
         tax_amount = round(v_sub * v_rate / 100, 2),
         total = v_sub + round(v_sub * v_rate / 100, 2)
   where id = p_invoice;
  perform public.refresh_invoice_status(p_invoice);
end;
$$;

-- Derive paid / partial / unpaid from payments (cancelled stays cancelled).
create or replace function public.refresh_invoice_status(p_invoice uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_paid numeric; v_total numeric; v_status text;
begin
  select total, status into v_total, v_status from invoices where id = p_invoice;
  if v_status = 'cancelled' then return; end if;
  select coalesce(sum(amount), 0) into v_paid from payments where invoice_id = p_invoice;
  update invoices set status = case
      when v_paid <= 0 then 'unpaid'
      when v_paid >= v_total then 'paid'
      else 'partial' end
   where id = p_invoice;
end;
$$;

create or replace function public.trg_invoice_items_changed()
returns trigger language plpgsql as $$
begin
  perform public.recalc_invoice(coalesce(new.invoice_id, old.invoice_id));
  return null;
end;
$$;
drop trigger if exists invoice_items_changed on public.invoice_items;
create trigger invoice_items_changed after insert or update or delete on public.invoice_items
  for each row execute function public.trg_invoice_items_changed();

create or replace function public.trg_payments_changed()
returns trigger language plpgsql as $$
begin
  perform public.refresh_invoice_status(coalesce(new.invoice_id, old.invoice_id));
  return null;
end;
$$;
drop trigger if exists payments_changed on public.payments;
create trigger payments_changed after insert or update or delete on public.payments
  for each row execute function public.trg_payments_changed();

-- Atomically allocate the next invoice number, e.g. INV/2026-27/0007
create or replace function public.next_invoice_number(p_date date default current_date)
returns text language plpgsql security definer set search_path = public as $$
declare v_no int; v_prefix text; v_fy text; v_y int;
begin
  update firm_settings set next_invoice_no = next_invoice_no + 1 where id = 1
    returning next_invoice_no - 1, invoice_prefix into v_no, v_prefix;
  v_y := extract(year from p_date)::int;
  if extract(month from p_date) < 4 then v_y := v_y - 1; end if;
  v_fy := v_y || '-' || lpad(((v_y + 1) % 100)::text, 2, '0');
  return v_prefix || '/' || v_fy || '/' || lpad(v_no::text, 4, '0');
end;
$$;

-- Outstanding per invoice (total minus payments)
create or replace view public.invoice_balances with (security_invoker = true) as
  select i.id, i.invoice_no, i.client_id, i.issue_date, i.due_date, i.total, i.status,
         coalesce((select sum(p.amount) from public.payments p where p.invoice_id = i.id), 0) as paid,
         i.total - coalesce((select sum(p.amount) from public.payments p where p.invoice_id = i.id), 0) as balance
    from public.invoices i;

-- ---------------------------------------------------------------------------
-- Row level security
-- Any signed-in staff member can read & work on office data; only admins can
-- delete clients/invoices, change firm settings or manage roles.
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.firm_settings enable row level security;
alter table public.clients enable row level security;
alter table public.tasks enable row level security;
alter table public.documents enable row level security;
alter table public.time_entries enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;
alter table public.payments enable row level security;

drop policy if exists "profiles read" on public.profiles;
create policy "profiles read" on public.profiles for select to authenticated using (true);
drop policy if exists "profiles update self or admin" on public.profiles;
create policy "profiles update self or admin" on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_admin()) with check (id = auth.uid() or public.is_admin());

drop policy if exists "firm read" on public.firm_settings;
create policy "firm read" on public.firm_settings for select to authenticated using (true);
drop policy if exists "firm admin update" on public.firm_settings;
create policy "firm admin update" on public.firm_settings for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

do $$
declare t text;
begin
  foreach t in array array['clients', 'tasks', 'documents', 'invoices', 'invoice_items', 'payments'] loop
    execute format('drop policy if exists "%1$s read" on public.%1$s', t);
    execute format('create policy "%1$s read" on public.%1$s for select to authenticated using (true)', t);
    execute format('drop policy if exists "%1$s insert" on public.%1$s', t);
    execute format('create policy "%1$s insert" on public.%1$s for insert to authenticated with check (true)', t);
    execute format('drop policy if exists "%1$s update" on public.%1$s', t);
    execute format('create policy "%1$s update" on public.%1$s for update to authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- Deletes: admins for clients & invoices; anyone for tasks/docs/items/payments.
drop policy if exists "clients delete" on public.clients;
create policy "clients delete" on public.clients for delete to authenticated using (public.is_admin());
drop policy if exists "invoices delete" on public.invoices;
create policy "invoices delete" on public.invoices for delete to authenticated using (public.is_admin());
drop policy if exists "tasks delete" on public.tasks;
create policy "tasks delete" on public.tasks for delete to authenticated using (true);
drop policy if exists "documents delete" on public.documents;
create policy "documents delete" on public.documents for delete to authenticated using (true);
drop policy if exists "invoice_items delete" on public.invoice_items;
create policy "invoice_items delete" on public.invoice_items for delete to authenticated using (true);
drop policy if exists "payments delete" on public.payments;
create policy "payments delete" on public.payments for delete to authenticated using (public.is_admin());

-- Timesheets: everyone can read (for billing), but you only edit your own unless admin.
drop policy if exists "time read" on public.time_entries;
create policy "time read" on public.time_entries for select to authenticated using (true);
drop policy if exists "time insert" on public.time_entries;
create policy "time insert" on public.time_entries for insert to authenticated
  with check (user_id = auth.uid() or public.is_admin());
drop policy if exists "time update" on public.time_entries;
create policy "time update" on public.time_entries for update to authenticated
  using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid() or public.is_admin());
drop policy if exists "time delete" on public.time_entries;
create policy "time delete" on public.time_entries for delete to authenticated
  using (user_id = auth.uid() or public.is_admin());
