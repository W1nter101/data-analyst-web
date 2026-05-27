import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Toaster } from "sonner";
import { runMigrations } from '@/lib/runMigrations';
import "./globals.css";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";

runMigrations();

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "CSV Data Analyst",
  description: "Upload CSV files, explore data, create charts, and chat with AI",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${inter.variable} ${jetbrainsMono.variable} antialiased`}
        style={{ fontFamily: "var(--font-body)" }}
      >
        <Toaster richColors />
        {children}
      </body>
    </html>
  );
}
