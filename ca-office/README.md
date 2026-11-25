# CA Office Manager

Practice management for a Chartered Accountant firm: clients, GST/TDS compliance with automatic monthly tasks, task tracking with checklists, document collection, timesheets, GST invoicing, reminders, with admin/staff roles.

**Runs on ordinary cPanel hosting**: the app is plain HTML/JavaScript, the server side is PHP, and data lives in your cPanel **MySQL** database. No Node.js, Supabase or other outside service is needed.

## Features

| Module | What it does |
|---|---|
| **Dashboard** | Due today / tomorrow / in 7 days and overdue (up to 7 days, more than 7 days) tiles; tasks by service with Pending / Hold / In progress / Completed tabs; task summary donut; your to-dos; *Need to make invoice* (packages and tasks); best performer this month; quarterly performance chart. |
| **Clients** | PAN / GSTIN / TAN / CIN with format validation, client type, state (GST place of supply), relationship manager, engaged services. Search, filter by service, CSV export. Client page shows tasks, documents, invoices & time in one place. |
| **GST filing tracker** | One row per GST client, one column per month of the financial year. Each cell shows GSTR-1 and GSTR-3B (or QRMP returns and PMT-06) as filed, in progress, overdue, or due to be created. Shows how many of this month's returns are filed; click a cell to open the task. |
| **Compliance calendar** | Month-by-month statutory due dates (GSTR-1/3B monthly & QRMP, PMT-06, GSTR-9, TDS deposit & returns, advance tax, ITR, tax audit, AOC-4, MGT-7, LLP Form 8/11, bookkeeping). Shows how many clients each applies to and how many are filed; **one click creates the tasks** for every client with that service, assigned to their manager. The daily job also **creates them automatically every month** (10 days before the due date by default, adjustable or off), with the standard checklist. Never creates duplicates. |
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
| **File uploads** | Upload PDFs, spreadsheets and scans against a client, a requested document or a task. Files are stored on your hosting outside `public_html` and only open for signed-in staff. 25 MB per file. |
| **Automatic reminders** (admin) | Every morning (cPanel cron job): emails (and optionally WhatsApp messages) to clients about filings due in N days, documents pending for N days, and invoices overdue by N days. One message per client per type, repeated at most every N days, with a log of everything sent. Preview before switching on; clients can be excluded individually. |
| **Quick add** | *+ New* in the top bar (or press **N**) to add a task, client, to-do, document request, file or invoice from any page. |
| **Users / Settings** (admin) | Add staff accounts, reset passwords, switch accounts off, set roles and hourly rates; firm name, address, GSTIN, PAN, bank details and invoice numbering. Everyone can change their own password under *My account*. |

## Install on cPanel

You need: a domain or subdomain on cPanel hosting with PHP 8.1+ (almost all hosts) and MySQL/MariaDB.

**1. Create the database** (cPanel → *MySQL Databases*)
- Create a database, e.g. `caoffice` (cPanel names it `youruser_caoffice`).
- Create a user with a strong password.
- *Add User To Database* → tick **ALL PRIVILEGES**.

**2. Upload the app** (cPanel → *File Manager*)
- Open `public_html` (or the folder of the subdomain you want, e.g. `office.yourfirm.in`).
- Upload `ca-office-cpanel.zip` and choose **Extract**. You should now see `index.html`, `.htaccess` and an `api` folder there.
  (To see `.htaccess`, click *Settings* → *Show Hidden Files*.)

**3. Run the installer**
- Visit `https://yourdomain/api/install.php`.
- Enter the database name, user and password from step 1, your firm name, and your own name, email and password. Click **Install**.
- It creates the tables, writes `api/config.php`, makes your admin account and a private folder for client files next to `public_html`. After that it switches itself off.

**4. Add the daily job** (cPanel → *Cron Jobs*)
- Common setting: **Once Per Day**. Command (the installer shows your exact path):
  ```
  php /home/YOUR_CPANEL_USER/public_html/api/cron.php
  ```
- Every morning this creates recurring tasks and the month's GST/TDS/ROC tasks (10 days before they are due) and sends reminders.

**5. Sign in** at `https://yourdomain/` → *Firm settings* (your state decides CGST+SGST vs IGST) → *Users* to add staff → *Clients* and tick their services.

### Email reminders
They go out through your hosting's own mail server, from the address saved in `api/config.php` (`mail.from`). Use an address on your own domain (create it in cPanel → *Email Accounts*) so messages don't land in spam. To use resend.com instead, set `'driver' => 'resend'` and add the API key. Switch reminders on under **Auto reminders**, after checking **Preview today**.

### WhatsApp (optional)
Needs a WhatsApp Business account on Meta's Cloud API and an approved *Utility* template named `client_reminder` with two variables, e.g. *“Dear {{1}}, a reminder from our office: {{2}}”*. Put the token and phone number ID in `api/config.php`.

### If something goes wrong
| Problem | Fix |
|---|---|
| Site shows “too many redirects” or won't load | Your domain has no SSL certificate yet. cPanel → *SSL/TLS Status* → *Run AutoSSL*. Or put `#` before the four `Rewrite` lines in `public_html/.htaccess`. |
| “The app is not installed yet” | Open `/api/install.php` first. |
| Installer can't connect to the database | Check the full database and user names (with the `youruser_` prefix) and that the user was added to the database with ALL PRIVILEGES. |
| “PHP 8.1 or newer is needed” | cPanel → *MultiPHP Manager* → choose PHP 8.1, 8.2 or 8.3 for the domain. |
| Uploads over a few MB fail | cPanel → *MultiPHP INI Editor* → set `upload_max_filesize` 26M and `post_max_size` 28M. |
| Tasks aren't created automatically | Check the cron job command path; run it once by hand from cPanel *Terminal* to see the output. |
| Server error messages | cPanel → *Errors* or the `error_log` file inside `public_html/api`. |

### Backups
Use cPanel → *Backup* (or JetBackup) for both the **MySQL database** and the **`ca-office-files`** folder next to `public_html`. Those two hold everything.

### Updating to a new version
Upload and extract the new zip over the old files. Your `api/config.php`, database and files are kept (the zip has no `config.php`).

## How it is built

| Part | Where | Notes |
|---|---|---|
| Web app | `app/`, `components/`, `lib/` | Next.js 14, exported as static files (`npm run build` → `out/`). |
| API | `php-api/` → uploaded as `api/` | One endpoint (`api/index.php`). Tables, columns and who may do what are listed in `php-api/lib/tables.php`; every value is a bound parameter. |
| Database | `mysql/schema.sql` | MySQL 5.7+/8, MariaDB 10.3+. No triggers or stored procedures (shared hosts often block them); the rules run in PHP. |
| Daily job | `php-api/cron.php` | Recurring tasks, automatic statutory tasks, reminders. |

**Security:** passwords are hashed with PHP's `password_hash`; sessions use HttpOnly, SameSite cookies; every API call needs a custom header (blocks cross-site requests); repeated failed sign-ins are locked for 15 minutes; only an admin can create accounts (open sign-up is only possible while there are no users); client files are stored outside `public_html` and served only to signed-in users; `config.php`, `cron.php` and `lib/` cannot be opened from the web.

## Development

```bash
cd ca-office
npm install
npm test                 # compliance rules, reminders, and PHP-vs-TypeScript parity
npm run package:cpanel   # builds deploy/ca-office-cpanel.zip
```
For local development run the PHP API with a MySQL database (copy `php-api/config.sample.php` to `php-api/config.php`) and point the web app at it with `NEXT_PUBLIC_API_URL`.

The compliance rules exist in TypeScript (`lib/compliance.ts`, used by the screens) and PHP (`php-api/lib/compliance.php`, used by the daily job). `lib/parity.test.ts` checks every month from 2024 to 2031 gives identical results in both, so change both together.

## Notes & limitations

- Due dates are the **standard statutory dates**. Government extensions and state-wise QRMP variations (22nd/24th) are not applied automatically; edit the task date when an extension is announced.
- Reminder emails sent through shared-hosting mail may be throttled by your host (often a few hundred per hour), which is plenty for a CA office.
