import "./globals.css";

export const metadata = { title: "Chaos Engine" };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: 18 }}>
          {children}
        </div>
      </body>
    </html>
  );
}
