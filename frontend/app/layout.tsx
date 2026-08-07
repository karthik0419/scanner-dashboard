import type { Metadata } from 'next';
import { AuthProvider } from '@/lib/auth';
import { Toaster } from 'sonner';
import './globals.css';

export const metadata: Metadata = {
  title: 'Scanner Dashboard — NSE Swing Setups',
  description: 'NSE swing trading pattern screener with entry, stop-loss, and targets.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          {children}
          <Toaster theme="dark" position="top-right" richColors />
        </AuthProvider>
      </body>
    </html>
  );
}
