import type { Metadata } from "next";
import Link from "next/link";
import { AppErrorBoundary } from "@/components/AppErrorBoundary";
import "./globals.css";

export const metadata: Metadata = {
  title: "HE SEO Optimizer",
  description: "Internal SEO optimization tool for Hitachi Energy",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <nav className="border-b border-[#e9edf5] bg-white px-8 py-4">
          <div className="mx-auto flex max-w-6xl items-center justify-between">
            <Link href="/" className="text-[15px] font-semibold tracking-tight text-[#171b29]">
              openSEO AI
            </Link>
            <Link href="/dashboard" className="text-[13px] font-medium text-[#6e7690] transition-colors hover:text-[#1a1a1a]">
              Dashboard
            </Link>
          </div>
        </nav>
        <main className="mx-auto max-w-6xl px-8 py-10">
          <AppErrorBoundary>{children}</AppErrorBoundary>
        </main>
      </body>
    </html>
  );
}
