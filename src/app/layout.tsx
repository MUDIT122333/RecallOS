import "./globals.css";

export const metadata = {
  title: "Personal Brain",
  description: "Ask questions across your Gmail and Drive.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
