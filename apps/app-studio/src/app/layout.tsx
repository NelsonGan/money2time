import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Money2Time Studio',
  description: 'App store screenshot creator',
  icons: {
    icon: '/favicon.png',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
