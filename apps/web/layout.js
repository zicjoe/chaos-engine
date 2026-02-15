export const metadata = { title: "Chaos Engine Dashboard" };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui", margin: 0, padding: 0 }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: 20 }}>
          {children}
        </div>
      </body>
    </html>
  );
}
