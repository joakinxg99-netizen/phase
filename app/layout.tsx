import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PHASE",
  description: "A premium hybrid generative techno instrument powered by Next.js, React, TypeScript, Tone, and Strudel.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
