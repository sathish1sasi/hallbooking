# CA Office Manager

Practice management for a Chartered Accountant firm: clients, statutory compliance calendar, task tracking, document collection, timesheets and GST invoicing — with admin/staff roles.

**Stack:** Next.js 14 (App Router) + Supabase (Postgres, auth, row-level security). Deploy on Vercel + Supabase free tiers.

## Features

| Module | What it does |
|---|---|
| **Dashboard** | Due today / tomorrow / in 7 days and overdue (up to 7 days, more than 7 days) tiles; tasks by service with Pending / Hold / In progress / Completed tabs; task summary donut; your to-dos; *Need to make invoice* (packages and tasks); best performer this month; quarterly performance chart. |
| **Clients** | PAN / GSTIN / TAN / CIN with format validation, client type, state (GST place of supply), relationship manager, engaged services. Search, filter by service, CSV export. Client page shows tasks, documents, invoices & time in one place. |
| **Compliance calendar** | Month-by-month statutory due dates (GSTR-1/3B monthly & QRMP, PMT-06, GSTR-9, TDS deposit & returns, advance tax, ITR, tax audit, AOC-4, MGT-7, LLP Form 8/11, bookkeeping). Shows how many clients each applies to and how many are filed; **one click creates the tasks** for every client with that service, assigned to their manager. Never creates duplicates. |
| **Tasks** | List or drag-and-drop board (To do → In progress → Waiting on client → Review → Done). Period, due date, assignee, priority, fee, ARN/acknowledgement no. Filter by overdue/assignee/category. |
| **Documents** | Track what's been requested vs received per client, flag items waiting > 7 days, and copy a ready-to-send WhatsApp/email reminder listing everything still pending. Add several documents at once. |
| **Timesheets** | Log hours against client/task, billable flag, weekly/monthly view, per-client summary and billable value from staff hourly rates. |
| **Billing** | GST tax invoices with automatic FY-wise numbering (`INV/2026-27/0001`), auto CGST+SGST vs IGST based on firm vs client state, SAC codes, pull in unbilled completed tasks, amount in words, bank details, print/save as PDF. Record part/full payments (bank/UPI/cheque/cash); status updates automatically. Outstanding & overdue totals. |
| **To-Do** | Personal list (calls, visits, errands) with Today / Upcoming / Completed, private to each person. |
| **Packages** | Recurring fee arrangements per client (monthly, quarterly, yearly…). When one falls due it shows under *Need to make invoice*; one click creates the invoice and rolls the next billing date forward. |
| **DSC register** | Digital signature certificates: holder, class, expiry, and whether the token is in the office or with the client. Expiring/expired badges and a bell alert 30 days ahead. |
| **Attendance** | Check in / check out, plus a monthly register (Present, Half day, Leave, WFH) with day totals. |
| **Reports** | Staff productivity (completed, on-time %, overdue, hours), revenue by client (billed, received, outstanding, billed per hour), compliance status by category. CSV export. |
| **Send notifications** | Pending-document, payment, upcoming-deadline and DSC-renewal reminders written from live data. Opens WhatsApp or email with the message filled in. |
| **Task page** | Each task has its own page: a checklist (one click adds the standard steps for GST, TDS, ITR, audit, ROC…), a discussion thread for review points and client queries, attached files, and time logged. Ticking the first step moves the task to *In progress*; finishing all steps offers *Mark task done*. |
| **Recurring tasks** | Templates for non-statutory work that repeats (monthly bookkeeping, weekly MIS, half-yearly review). Each task is created 7 days before it is due, with its checklist, assigned to the chosen person or the client's manager. Handles month-end dates (31st → 28th/30th) and catches up missed periods. |
| **File uploads** | Upload PDFs, spreadsheets and scans against a client, a requested document or a task. Files live in a private Supabase Storage bucket and open through short-lived links. 25 MB per file. |
| **Automatic reminders** (admin) | Every morning at 8:00 IST: emails (and optionally WhatsApp messages) to clients about filings due in N days, documents pending for N days, and invoices overdue by N days. One message per client per type, repeated at most every N days, with a log of everything sent. Preview before switching on; clients can be excluded individually. |
| **Quick add** | *+ New* in the top bar (or press **N**) to add a task, client, to-do, document request, file or invoice from any page. |
| **Staff / Settings** (admin) | Promote staff to admin, set hourly rates; firm name, address, GSTIN, PAN, bank details and invoice numbering. |

## Setup

1. **Supabase:** create a project → **SQL Editor** → paste all of `supabase/schema.sql` → Run. (Safe to re-run; if you set up an earlier version, run it again to add the new tables.)
2. **Env:** copy `.env.local.example` to `.env.local` and fill in the Project URL and anon key from *Project Settings → API*.
3. **Run:**
   ```bash
   cd ca-office
   npm install
   npm run dev      # http://localhost:3000
   npm test         # compliance dates, reminder rules and formatting tests
   ```
4. **First login:** create an account on the sign-in page. **The first account becomes admin automatically**; everyone after that joins as staff. Then fill in **Firm settings** (the state matters for GST).
5. **Deploy:** import the repo on Vercel, set *Root Directory* to `ca-office`, add the two env vars.

## Setting up automatic reminders

Reminders and recurring tasks run from one daily job at `/api/cron/daily`. `vercel.json` schedules it for 02:30 UTC (8:00 IST).

1. In Vercel → Project → Settings → Environment Variables, add:
   - `SUPABASE_SERVICE_ROLE_KEY`: Supabase → Project Settings → API → `service_role` key. Server-only; never give it a `NEXT_PUBLIC_` prefix.
   - `CRON_SECRET`: any long random string. Vercel sends it to the job automatically.
2. **Email** (recommended): create a free account at resend.com, verify your firm's domain, then add `RESEND_API_KEY` and `REMINDER_FROM_EMAIL` (e.g. `Venkatesh & Associates <reminders@yourfirm.in>`). Replies go to the email in Firm settings.
3. **WhatsApp** (optional): needs a WhatsApp Business account on Meta's Cloud API. Create a *Utility* template named `client_reminder` with two variables, for example:
   > Dear {{1}}, a reminder from our office: {{2}} Reply to this message if you have any questions.

   Once Meta approves it, add `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` (and `WHATSAPP_TEMPLATE` if you named it differently).
4. Redeploy, open **Auto reminders**, press **Preview today**, then switch reminders on.

If the job isn't configured, recurring tasks can still be created with *Create due tasks now* on the Recurring tasks page.

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
- WhatsApp reminders only go out through an approved Meta template; until one is approved, use email or the manual *Send notifications* page.
- Vercel's free plan runs cron jobs once a day, which is all this needs.
