import './globals.css';

export const metadata = {
  title: 'MedizinHub HMS',
  description: 'Plug and play healthcare SaaS workspace',
};

export default function RootLayout({children}:{children:React.ReactNode}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
