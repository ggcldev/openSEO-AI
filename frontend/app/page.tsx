import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh]">
      <h1 className="text-[28px] font-semibold tracking-tight mb-3 text-white">
        HE SEO Optimizer
      </h1>
      <p className="text-[14px] text-[#999] mb-8 max-w-md text-center leading-relaxed">
        Submit a URL. Get an Optimization Pack. Export HTML for your dev team.
      </p>
      <Link
        href="/dashboard"
        className="bg-white text-[#161616] text-[13px] font-medium px-5 py-2.5 rounded-lg hover:bg-[#e0e0e0] transition-colors"
      >
        Open Dashboard
      </Link>
    </div>
  );
}
