import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'CA Office Manager',
  description: 'Client, compliance, timesheet and billing management for chartered accountant firms',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
