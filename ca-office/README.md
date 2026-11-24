# CA Office Manager

Practice management for a Chartered Accountant firm: clients, statutory compliance calendar, task tracking, document collection, timesheets and GST invoicing — with admin/staff roles.

**Stack:** Next.js 14 (App Router) + Supabase (Postgres, auth, row-level security). Deploy on Vercel + Supabase free tiers.

## Features

| Module | What it does |
|---|---|
| **Dashboard** | Overdue tasks, deadlines in the next 14 days, pending documents, receivables, pipeline by status, this month's billing/collections, your hours this week. "Only my tasks" toggle. |
| **Clients** | PAN / GSTIN / TAN / CIN with format validation, client type, state (GST place of supply), relationship manager, engaged services. Search, filter by service, CSV export. Client page shows tasks, documents, invoices & time in one place. |
| **Compliance calendar** | Month-by-month statutory due dates (GSTR-1/3B monthly & QRMP, PMT-06, GSTR-9, TDS deposit & returns, advance tax, ITR, tax audit, AOC-4, MGT-7, LLP Form 8/11, bookkeeping). Shows how many clients each applies to and how many are filed; **one click creates the tasks** for every client with that service, assigned to their manager. Never creates duplicates. |
| **Tasks** | List or drag-and-drop board (To do → In progress → Waiting on client → Review → Done). Period, due date, assignee, priority, fee, ARN/acknowledgement no. Filter by overdue/assignee/category. |
| **Documents** | Track what's been requested vs received per client, flag items waiting > 7 days, and copy a ready-to-send WhatsApp/email reminder listing everything still pending. Add several documents at once. |
| **Timesheets** | Log hours against client/task, billable flag, weekly/monthly view, per-client summary and billable value from staff hourly rates. |
| **Billing** | GST tax invoices with automatic FY-wise numbering (`INV/2026-27/0001`), auto CGST+SGST vs IGST based on firm vs client state, SAC codes, pull in unbilled completed tasks, amount in words, bank details, print/save as PDF. Record part/full payments (bank/UPI/cheque/cash); status updates automatically. Outstanding & overdue totals. |
| **Staff / Settings** (admin) | Promote staff to admin, set hourly rates; firm name, address, GSTIN, PAN, bank details and invoice numbering. |

## Setup

1. **Supabase:** create a project → **SQL Editor** → paste all of `supabase/schema.sql` → Run. (Safe to re-run.)
2. **Env:** copy `.env.local.example` to `.env.local` and fill in the Project URL and anon key from *Project Settings → API*.
3. **Run:**
   ```bash
   cd ca-office
   npm install
   npm run dev      # http://localhost:3000
   npm test         # compliance-date and formatting tests
   ```
4. **First login:** create an account on the sign-in page. **The first account becomes admin automatically**; everyone after that joins as staff. Then fill in **Firm settings** (the state matters for GST).
5. **Deploy:** import the repo on Vercel, set *Root Directory* to `ca-office`, add the two env vars.

## Daily workflow

1. Add clients and tick the services you handle for each.
2. At the start of each month open **Compliance calendar** → **Generate all**.
3. Staff work their tasks on the **Tasks** board, request documents, and log time.
4. When work is done, **Billing → New invoice** pulls in unbilled task fees; record payments as they arrive.

## Security model

Enforced in Postgres row-level security, not just the UI:
- Any signed-in staff member can read and work on clients, tasks, documents and invoices.
- Only admins can delete clients/invoices/payments, change firm settings, or change roles and hourly rates.
- Staff can only edit or delete their own timesheet entries.

## Notes & limitations

- Due dates are the **standard statutory dates**. Extensions notified by CBDT/CBIC/MCA and state-wise QRMP variations (22nd/24th) aren't applied automatically — edit the task date when an extension comes out. The rules live in `lib/compliance.ts` and are easy to change.
- Document tracking is a checklist; actual files aren't uploaded (Supabase Storage could be added).
- No automatic email/SMS reminders yet (a Supabase Edge Function on a cron would fit well).
