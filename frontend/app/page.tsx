import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[65vh]">
      <div className="text-center max-w-lg">
        <h1 className="text-[32px] font-semibold tracking-tight mb-3 text-white">
          HE SEO Optimizer
        </h1>
        <p className="text-[15px] leading-relaxed text-[#aaa] mb-10">
          Internal SEO optimization tool for Hitachi Energy.
          Submit a URL, get a complete Optimization Pack, and export
          ready-to-implement HTML for your dev team.
        </p>
        <Link
          href="/dashboard"
          className="bg-white text-[#111] text-[13px] font-medium px-6 py-2.5 rounded-lg hover:bg-[#ddd] transition-colors duration-200"
        >
          Open Dashboard
        </Link>
      </div>

      <div className="grid grid-cols-3 gap-px mt-20 w-full bg-[#2a2a2a] rounded-xl overflow-hidden">
        <div className="bg-[#111] p-6">
          <p className="text-[13px] font-medium text-white mb-1.5">Optimization Pack</p>
          <p className="text-[12px] leading-relaxed text-[#999]">
            Keywords, headings plan, FAQ pack, meta options, and a prioritized checklist.
          </p>
        </div>
        <div className="bg-[#111] p-6">
          <p className="text-[13px] font-medium text-white mb-1.5">Intent-Aware</p>
          <p className="text-[12px] leading-relaxed text-[#999]">
            Tailored to page type (service, product, landing) with region and language context.
          </p>
        </div>
        <div className="bg-[#111] p-6">
          <p className="text-[13px] font-medium text-white mb-1.5">Export to Dev</p>
          <p className="text-[12px] leading-relaxed text-[#999]">
            Download optimized HTML content ready for implementation.
          </p>
        </div>
      </div>
    </div>
  );
}
