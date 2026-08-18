export const metadata = {
  title: 'Villa Saline',
  description: 'Villa Saline — Gestionale',
};

export default function RootLayout({ children }) {
  return (
    <html lang="it">
      <body style={{ margin: 0, padding: 0, background: '#0C1525' }}>{children}</body>
    </html>
  );
}
