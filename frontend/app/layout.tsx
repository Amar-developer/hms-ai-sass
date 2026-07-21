import './globals.css';

export const metadata = {
  title: 'MedizinHub HMS',
  description: 'Plug and play healthcare SaaS workspace',
  icons: {
    icon: '/favicon.ico',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en-GB">
      <body className="font-sans">
        <div id="app-shell">{children}</div>
        <div id="prescription-print-root" />
      </body>
    </html>
  );
}
