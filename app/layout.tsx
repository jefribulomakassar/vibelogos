import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VibeLogo — Premium Logo Showcase",
  description: "Browse our curated collection of premium ready-made logos. Find the perfect identity for your brand.",
  openGraph: {
    title: "VibeLogo — Premium Logo Showcase",
    description: "Browse our curated collection of premium ready-made logos.",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body>{children}</body>
    </html>
  );
}
