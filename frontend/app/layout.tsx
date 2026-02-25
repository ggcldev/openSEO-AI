import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "openSEO AI",
  description: "AI-powered SEO optimization",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <nav className="border-b border-[#222] px-8 py-5">
          <div className="max-w-5xl mx-auto flex items-center justify-between">
            <a href="/" className="text-[15px] font-medium tracking-tight text-[#fafafa]">
              openSEO AI
            </a>
            <div className="flex gap-6 text-[13px]">
              <a href="/" className="text-[#888] hover:text-[#fafafa] transition-colors duration-200">
                Home
              </a>
              <a href="/dashboard" className="text-[#888] hover:text-[#fafafa] transition-colors duration-200">
                Dashboard
              </a>
            </div>
          </div>
        </nav>
        <main className="max-w-5xl mx-auto px-8 py-12">{children}</main>
      </body>
    </html>
  );
}
