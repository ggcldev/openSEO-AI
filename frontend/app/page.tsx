import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh]">
      <h1 className="text-[28px] font-semibold tracking-tight mb-3 text-[#1a1a1a]">
        HE SEO Optimizer
      </h1>
      <p className="text-[14px] text-[#888] mb-8 max-w-md text-center leading-relaxed">
        Submit a URL. Get an Optimization Pack. Export HTML for your dev team.
      </p>
      <Link
        href="/dashboard"
        className="bg-[#1a1a1a] text-[#fcfcfc] text-[13px] font-medium px-5 py-2.5 rounded-lg hover:bg-[#333] transition-colors"
      >
        Open Dashboard
      </Link>
    </div>
  );
}
