export const metadata = {
  title: 'Villa Saline',
  description: 'Villa Saline — Gestionale',
};

export default function RootLayout({ children }) {
  return (
    <html lang="it">
      <body style={{ margin: 0, padding: 0 }}>{children}</body>
    </html>
  );
}
