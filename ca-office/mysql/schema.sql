-- CA Office Manager: MySQL / MariaDB schema
-- Works on MySQL 5.7+, MySQL 8 and MariaDB 10.3+ (the usual cPanel versions).
-- No triggers, stored procedures or views, so it imports on shared hosting
-- where those need extra privileges. Business rules live in the PHP API.
-- The web installer (api/install.php) runs this file for you; you can also
-- import it in phpMyAdmin.

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS profiles (
  id CHAR(36) NOT NULL PRIMARY KEY,
  email VARCHAR(190) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(190) NULL,
  role VARCHAR(10) NOT NULL DEFAULT 'staff',
  hourly_rate DECIMAL(10,2) NOT NULL DEFAULT 0,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY profiles_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS login_attempts (
  ip VARCHAR(64) NOT NULL PRIMARY KEY,
  failures INT NOT NULL DEFAULT 0,
  last_failure DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS firm_settings (
  id INT NOT NULL PRIMARY KEY DEFAULT 1,
  name VARCHAR(190) NOT NULL DEFAULT 'My CA Firm',
  address TEXT NULL,
  state VARCHAR(80) NULL,
  gstin VARCHAR(15) NULL,
  pan VARCHAR(10) NULL,
  phone VARCHAR(40) NULL,
  email VARCHAR(190) NULL,
  bank_details TEXT NULL,
  invoice_prefix VARCHAR(20) NOT NULL DEFAULT 'INV',
  next_invoice_no INT NOT NULL DEFAULT 1,
  reminders_enabled TINYINT(1) NOT NULL DEFAULT 0,
  reminder_deadline_days INT NOT NULL DEFAULT 3,
  reminder_doc_after_days INT NOT NULL DEFAULT 7,
  reminder_repeat_days INT NOT NULL DEFAULT 7,
  reminder_payment_grace_days INT NOT NULL DEFAULT 3,
  reminder_kinds TEXT NULL,
  reminder_channels TEXT NULL,
  auto_compliance_days INT NOT NULL DEFAULT 10
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO firm_settings (id, reminder_kinds, reminder_channels)
VALUES (1, '["deadline","documents","payment"]', '["email"]');

CREATE TABLE IF NOT EXISTS clients (
  id CHAR(36) NOT NULL PRIMARY KEY,
  name VARCHAR(190) NOT NULL,
  client_type VARCHAR(20) NOT NULL DEFAULT 'individual',
  pan VARCHAR(10) NULL,
  gstin VARCHAR(15) NULL,
  tan VARCHAR(10) NULL,
  cin VARCHAR(30) NULL,
  contact_person VARCHAR(190) NULL,
  email VARCHAR(190) NULL,
  phone VARCHAR(40) NULL,
  address TEXT NULL,
  state VARCHAR(80) NULL,
  services TEXT NULL,
  assigned_to CHAR(36) NULL,
  status VARCHAR(10) NOT NULL DEFAULT 'active',
  notes TEXT NULL,
  reminders_opt_out TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY clients_name (name),
  KEY clients_assigned (assigned_to)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS tasks (
  id CHAR(36) NOT NULL PRIMARY KEY,
  client_id CHAR(36) NOT NULL,
  title VARCHAR(255) NOT NULL,
  category VARCHAR(40) NOT NULL DEFAULT 'other',
  period VARCHAR(60) NULL,
  due_date DATE NULL,
  assigned_to CHAR(36) NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'todo',
  priority VARCHAR(10) NOT NULL DEFAULT 'normal',
  fee DECIMAL(12,2) NOT NULL DEFAULT 0,
  billed TINYINT(1) NOT NULL DEFAULT 0,
  compliance_key VARCHAR(120) NULL,
  acknowledgement_no VARCHAR(120) NULL,
  notes TEXT NULL,
  completed_at DATETIME NULL,
  created_by CHAR(36) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY tasks_compliance (client_id, compliance_key),
  KEY tasks_due (due_date),
  KEY tasks_status (status),
  CONSTRAINT tasks_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS documents (
  id CHAR(36) NOT NULL PRIMARY KEY,
  client_id CHAR(36) NOT NULL,
  task_id CHAR(36) NULL,
  name VARCHAR(255) NOT NULL,
  status VARCHAR(10) NOT NULL DEFAULT 'pending',
  requested_on DATE NOT NULL,
  received_on DATE NULL,
  returned_on DATE NULL,
  notes TEXT NULL,
  file_path VARCHAR(255) NULL,
  file_name VARCHAR(255) NULL,
  file_size BIGINT NULL,
  uploaded_by CHAR(36) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY documents_client (client_id),
  KEY documents_task (task_id),
  CONSTRAINT documents_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS time_entries (
  id CHAR(36) NOT NULL PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  client_id CHAR(36) NOT NULL,
  task_id CHAR(36) NULL,
  work_date DATE NOT NULL,
  hours DECIMAL(5,2) NOT NULL,
  description TEXT NULL,
  billable TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY time_user_date (user_id, work_date),
  KEY time_client (client_id),
  CONSTRAINT time_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS invoices (
  id CHAR(36) NOT NULL PRIMARY KEY,
  invoice_no VARCHAR(60) NOT NULL,
  client_id CHAR(36) NOT NULL,
  issue_date DATE NOT NULL,
  due_date DATE NULL,
  is_igst TINYINT(1) NOT NULL DEFAULT 0,
  tax_rate DECIMAL(5,2) NOT NULL DEFAULT 18,
  subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
  tax_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  total DECIMAL(12,2) NOT NULL DEFAULT 0,
  status VARCHAR(10) NOT NULL DEFAULT 'unpaid',
  notes TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY invoices_no (invoice_no),
  KEY invoices_client (client_id),
  CONSTRAINT invoices_client FOREIGN KEY (client_id) REFERENCES clients(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS invoice_items (
  id CHAR(36) NOT NULL PRIMARY KEY,
  invoice_id CHAR(36) NOT NULL,
  task_id CHAR(36) NULL,
  description VARCHAR(500) NOT NULL,
  sac VARCHAR(20) NULL,
  qty DECIMAL(10,2) NOT NULL DEFAULT 1,
  rate DECIMAL(12,2) NOT NULL DEFAULT 0,
  amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  KEY items_invoice (invoice_id),
  CONSTRAINT items_invoice FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS payments (
  id CHAR(36) NOT NULL PRIMARY KEY,
  invoice_id CHAR(36) NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  paid_on DATE NOT NULL,
  mode VARCHAR(10) NOT NULL DEFAULT 'bank',
  reference VARCHAR(120) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY payments_invoice (invoice_id),
  CONSTRAINT payments_invoice FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS todos (
  id CHAR(36) NOT NULL PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  title VARCHAR(255) NOT NULL,
  due_date DATE NOT NULL,
  done TINYINT(1) NOT NULL DEFAULT 0,
  client_id CHAR(36) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY todos_user (user_id, due_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS packages (
  id CHAR(36) NOT NULL PRIMARY KEY,
  client_id CHAR(36) NOT NULL,
  name VARCHAR(190) NOT NULL,
  fee DECIMAL(12,2) NOT NULL DEFAULT 0,
  frequency VARCHAR(15) NOT NULL DEFAULT 'monthly',
  next_bill_date DATE NOT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY packages_client (client_id),
  CONSTRAINT packages_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS dsc (
  id CHAR(36) NOT NULL PRIMARY KEY,
  client_id CHAR(36) NOT NULL,
  holder_name VARCHAR(190) NOT NULL,
  dsc_class VARCHAR(60) NOT NULL DEFAULT 'Class 3',
  issued_by VARCHAR(120) NULL,
  valid_from DATE NULL,
  valid_to DATE NOT NULL,
  location VARCHAR(10) NOT NULL DEFAULT 'office',
  token_password_hint VARCHAR(255) NULL,
  notes TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY dsc_client (client_id),
  CONSTRAINT dsc_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS attendance (
  id CHAR(36) NOT NULL PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  work_date DATE NOT NULL,
  check_in DATETIME NULL,
  check_out DATETIME NULL,
  status VARCHAR(10) NOT NULL DEFAULT 'present',
  note VARCHAR(255) NULL,
  UNIQUE KEY attendance_day (user_id, work_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS task_checklist (
  id CHAR(36) NOT NULL PRIMARY KEY,
  task_id CHAR(36) NOT NULL,
  label VARCHAR(255) NOT NULL,
  done TINYINT(1) NOT NULL DEFAULT 0,
  position INT NOT NULL DEFAULT 0,
  done_by CHAR(36) NULL,
  done_at DATETIME NULL,
  KEY checklist_task (task_id, position),
  CONSTRAINT checklist_task FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS task_comments (
  id CHAR(36) NOT NULL PRIMARY KEY,
  task_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  body TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY comments_task (task_id, created_at),
  CONSTRAINT comments_task FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS recurring_tasks (
  id CHAR(36) NOT NULL PRIMARY KEY,
  client_id CHAR(36) NOT NULL,
  title VARCHAR(255) NOT NULL,
  category VARCHAR(40) NOT NULL DEFAULT 'other',
  frequency VARCHAR(15) NOT NULL DEFAULT 'monthly',
  anchor_day INT NOT NULL DEFAULT 10,
  next_due DATE NOT NULL,
  period_mode VARCHAR(10) NOT NULL DEFAULT 'previous',
  assigned_to CHAR(36) NULL,
  fee DECIMAL(12,2) NOT NULL DEFAULT 0,
  checklist TEXT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY recurring_next (active, next_due),
  CONSTRAINT recurring_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS reminder_log (
  id CHAR(36) NOT NULL PRIMARY KEY,
  client_id CHAR(36) NOT NULL,
  kind VARCHAR(12) NOT NULL,
  channel VARCHAR(10) NOT NULL,
  sent_on DATE NOT NULL,
  status VARCHAR(10) NOT NULL,
  detail VARCHAR(500) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY reminder_lookup (client_id, kind, sent_on),
  CONSTRAINT reminder_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
