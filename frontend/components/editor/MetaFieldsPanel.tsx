"use client";

interface MetaFieldsPanelProps {
  metaTitle: string;
  metaDescription: string;
  onMetaTitleChange: (value: string) => void;
  onMetaDescriptionChange: (value: string) => void;
}

export function MetaFieldsPanel({
  metaTitle,
  metaDescription,
  onMetaTitleChange,
  onMetaDescriptionChange,
}: MetaFieldsPanelProps) {
  return (
    <div className="border-b border-[#e8ebf3] bg-[linear-gradient(180deg,#ffffff_0%,#fbfcff_100%)] px-6 py-5">
      <div className="space-y-3.5">
        <div>
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <label className="text-[11px] uppercase tracking-wide text-[#7d8398]">Title</label>
            <span className={`text-[11px] ${metaTitle.length > 70 ? "text-amber-600" : "text-[#999aac]"}`}>
              {metaTitle.length}/70
            </span>
          </div>
          <input
            type="text"
            value={metaTitle}
            onChange={(event) => onMetaTitleChange(event.target.value)}
            placeholder="SEO title"
            className="h-11 w-full rounded-xl border border-[#dde2ef] bg-white px-3.5 text-[14px] text-[#202234] placeholder:text-[#a1a7ba] shadow-[0_1px_0_rgba(17,24,39,0.02)] transition-all duration-150 focus:border-[#b3bde1] focus:outline-none focus:ring-2 focus:ring-[#b8c1e6]/45"
          />
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <label className="text-[11px] uppercase tracking-wide text-[#7d8398]">Description</label>
            <span
              className={`text-[11px] ${metaDescription.length > 156 ? "text-amber-600" : "text-[#999aac]"}`}
            >
              {metaDescription.length}/156
            </span>
          </div>
          <textarea
            value={metaDescription}
            onChange={(event) => onMetaDescriptionChange(event.target.value)}
            placeholder="Meta description"
            rows={3}
            className="w-full resize-none rounded-xl border border-[#dde2ef] bg-white px-3.5 py-2.5 text-[13px] leading-[1.55] text-[#202234] placeholder:text-[#a1a7ba] shadow-[0_1px_0_rgba(17,24,39,0.02)] transition-all duration-150 focus:border-[#b3bde1] focus:outline-none focus:ring-2 focus:ring-[#b8c1e6]/45"
          />
        </div>
      </div>
    </div>
  );
}
