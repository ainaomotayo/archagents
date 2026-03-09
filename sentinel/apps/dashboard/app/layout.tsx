import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SENTINEL | AI Code Governance",
  description: "Enterprise compliance and security governance for AI-generated code",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="noise-bg min-h-screen">
        {children}
      </body>
    </html>
  );
}
