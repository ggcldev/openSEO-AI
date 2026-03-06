"use client";

import type { RefObject } from "react";

interface EditorCanvasProps {
  editorRef: RefObject<HTMLDivElement | null>;
  autoOptimizing: boolean;
  onSyncFromEditor: () => void;
}

export function EditorCanvas({
  editorRef,
  autoOptimizing,
  onSyncFromEditor,
}: EditorCanvasProps) {
  return (
    <div className="relative min-h-0 flex-1 overflow-auto bg-[#f4f6fc]">
      {autoOptimizing && (
        <div className="absolute inset-0 z-20 grid place-items-center bg-white/70 backdrop-blur-[2px] transition-opacity duration-200">
          <div className="inline-flex items-center gap-2 rounded-xl border border-[#d8deed] bg-white px-4 py-2 text-[13px] text-[#2a2d43] shadow-[0_8px_24px_rgba(23,28,49,0.12)]">
            <svg className="h-4 w-4 animate-spin text-[#3f48bb]" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-20" cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" />
              <path
                className="opacity-90"
                d="M21 12a9 9 0 0 0-9-9"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
            </svg>
            <span>Auto-Optimizing content...</span>
          </div>
        </div>
      )}

      <div
        ref={editorRef}
        contentEditable={!autoOptimizing}
        suppressContentEditableWarning
        onInput={onSyncFromEditor}
        onBlur={onSyncFromEditor}
        className="min-h-full mx-auto my-5 max-w-[920px] rounded-2xl border border-[#e2e6f1] bg-white px-6 py-8 text-[16px] leading-[1.8] text-[#1f2133] shadow-[0_16px_38px_rgba(18,24,42,0.06)] outline-none transition-all duration-150 sm:px-8 sm:py-10 lg:px-12
          [&_h1]:mt-9 [&_h1]:mb-5 [&_h1]:text-[40px] [&_h1]:font-semibold [&_h1]:tracking-[-0.02em] [&_h1]:leading-[1.12]
          [&_h2]:mt-9 [&_h2]:mb-4 [&_h2]:text-[31px] [&_h2]:font-semibold [&_h2]:tracking-[-0.012em] [&_h2]:leading-[1.2]
          [&_h3]:mt-8 [&_h3]:mb-3 [&_h3]:text-[25px] [&_h3]:font-semibold [&_h3]:leading-[1.28]
          [&_p]:my-4 [&_p]:text-[16px] [&_p]:leading-[1.82]
          [&_ul]:my-4 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:my-4 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:my-1.5
          [&_blockquote]:my-6 [&_blockquote]:rounded-r-xl [&_blockquote]:border-l-4 [&_blockquote]:border-[#cbd5f5] [&_blockquote]:bg-[#f8faff] [&_blockquote]:px-4 [&_blockquote]:py-3
          [&_hr]:my-8 [&_hr]:border-[#e8ebf6] [&_img]:my-6 [&_img]:rounded-xl [&_img]:border [&_img]:border-[#dfe4f2]
          [&_a]:font-medium [&_a]:text-[#3447c6] [&_a]:underline [&_a]:underline-offset-4
          [&_strong]:font-semibold [&_section.faq-item]:my-7 [&_section.faq-item>h3]:text-[26px] [&_section.faq-item>h3]:font-semibold"
      />
    </div>
  );
}
