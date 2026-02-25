import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "HE SEO Optimizer",
  description: "Internal SEO optimization tool for Hitachi Energy",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <nav className="border-b border-[#282828] px-8 py-4">
          <div className="max-w-4xl mx-auto flex items-center justify-between">
            <a href="/" className="text-[14px] font-semibold text-white tracking-tight">
              HE SEO Optimizer
            </a>
            <a href="/dashboard" className="text-[13px] text-[#999] hover:text-white transition-colors">
              Dashboard
            </a>
          </div>
        </nav>
        <main className="max-w-4xl mx-auto px-8 py-10">{children}</main>
      </body>
    </html>
  );
}
