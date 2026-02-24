import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "openSEO AI",
  description: "Open-source web scraping + AI agent dashboard",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-gray-950 text-gray-100 min-h-screen antialiased">
        <nav className="border-b border-gray-800 px-6 py-4">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <a href="/" className="text-xl font-bold text-white">
              openSEO <span className="text-blue-400">AI</span>
            </a>
            <div className="flex gap-4 text-sm">
              <a href="/" className="text-gray-400 hover:text-white transition">
                Home
              </a>
              <a href="/dashboard" className="text-gray-400 hover:text-white transition">
                Dashboard
              </a>
            </div>
          </div>
        </nav>
        <main className="max-w-7xl mx-auto px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
