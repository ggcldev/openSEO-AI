import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] text-center">
      <h1 className="text-5xl font-bold mb-4">
        openSEO <span className="text-blue-400">AI</span>
      </h1>
      <p className="text-gray-400 text-lg max-w-xl mb-8">
        Open-source web scraping tool with AI-powered agents. Scrape any page,
        extract structured data, and get AI summaries — all from a clean
        dashboard.
      </p>
      <div className="flex gap-4">
        <Link
          href="/dashboard"
          className="bg-blue-500 hover:bg-blue-600 text-white font-medium px-6 py-3 rounded-lg transition"
        >
          Open Dashboard
        </Link>
        <a
          href="https://github.com/ggcldev/openSEO-AI"
          target="_blank"
          rel="noopener noreferrer"
          className="border border-gray-700 hover:border-gray-500 text-gray-300 font-medium px-6 py-3 rounded-lg transition"
        >
          GitHub
        </a>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-16 w-full max-w-3xl">
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
          <h3 className="text-white font-semibold mb-2">Stealth Scraping</h3>
          <p className="text-gray-400 text-sm">
            Scrapling + Playwright for adaptive, bot-resistant page fetching.
          </p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
          <h3 className="text-white font-semibold mb-2">AI Agents</h3>
          <p className="text-gray-400 text-sm">
            Summarize, extract, or process scraped content with pluggable AI
            agents.
          </p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
          <h3 className="text-white font-semibold mb-2">Job History</h3>
          <p className="text-gray-400 text-sm">
            SQLite-backed history with filters by status, agent, URL, and date.
          </p>
        </div>
      </div>
    </div>
  );
}
