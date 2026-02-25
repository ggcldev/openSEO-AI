import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[65vh]">
      <div className="text-center max-w-lg">
        <h1 className="text-[32px] font-semibold tracking-tight mb-3 text-[#fafafa]">
          openSEO AI
        </h1>
        <p className="text-[15px] leading-relaxed text-[#888] mb-10">
          Analyze your page against top SERP competitors. Get actionable
          on-page optimizations and export-ready HTML.
        </p>
        <div className="flex gap-3 justify-center">
          <Link
            href="/dashboard"
            className="bg-[#fafafa] text-[#0a0a0a] text-[13px] font-medium px-5 py-2.5 rounded-lg hover:bg-[#e0e0e0] transition-colors duration-200"
          >
            Get started
          </Link>
          <a
            href="https://github.com/ggcldev/openSEO-AI"
            target="_blank"
            rel="noopener noreferrer"
            className="border border-[#333] text-[#888] text-[13px] font-medium px-5 py-2.5 rounded-lg hover:text-[#fafafa] hover:border-[#555] transition-colors duration-200"
          >
            GitHub
          </a>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-px mt-20 w-full bg-[#222] rounded-xl overflow-hidden">
        <div className="bg-[#0a0a0a] p-6">
          <p className="text-[13px] font-medium text-[#fafafa] mb-1.5">SERP Analysis</p>
          <p className="text-[12px] leading-relaxed text-[#666]">
            Fetches top 10 Google results and benchmarks your page against the competition.
          </p>
        </div>
        <div className="bg-[#0a0a0a] p-6">
          <p className="text-[13px] font-medium text-[#fafafa] mb-1.5">AI Audit</p>
          <p className="text-[12px] leading-relaxed text-[#666]">
            Full on-page analysis — title, meta, headings, keywords, content gaps, and fixes.
          </p>
        </div>
        <div className="bg-[#0a0a0a] p-6">
          <p className="text-[13px] font-medium text-[#fafafa] mb-1.5">HTML Export</p>
          <p className="text-[12px] leading-relaxed text-[#666]">
            Download optimized content as clean HTML, ready for your dev team.
          </p>
        </div>
      </div>
    </div>
  );
}
