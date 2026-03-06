"use client";

import type { ReactNode } from "react";

interface ToolbarButtonProps {
  label: ReactNode;
  title: string;
  onClick: () => void;
  disabled?: boolean;
}

interface EditorToolbarProps {
  autoOptimizing: boolean;
  hasDocument: boolean;
  onApplyBlockFormat: (tag: "p" | "h1" | "h2" | "h3") => void;
  onRunEditorCommand: (command: string) => void;
  onInsertLink: () => void;
  onInsertFaqTemplate: () => void;
  onInsertCtaTemplate: () => void;
  onAutoOptimize: () => void;
}

function ToolbarButton({ label, title, onClick, disabled }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center justify-center min-w-[36px] h-9 px-2.5 rounded-lg border border-[#dde1ee] bg-white text-[11px] font-semibold text-[#3b4156] hover:border-[#c4ccdf] hover:bg-[#f7f9ff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9da8d7]/60 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-150"
    >
      {label}
    </button>
  );
}

export function EditorToolbar({
  autoOptimizing,
  hasDocument,
  onApplyBlockFormat,
  onRunEditorCommand,
  onInsertLink,
  onInsertFaqTemplate,
  onInsertCtaTemplate,
  onAutoOptimize,
}: EditorToolbarProps) {
  return (
    <div className="border-t border-[#e7eaf2] bg-[#f8faff] px-5 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex flex-wrap items-center gap-1 rounded-xl border border-[#e5e8f2] bg-white px-1.5 py-1 shadow-[0_1px_0_rgba(18,24,40,0.02)]">
          <ToolbarButton label="P" title="Paragraph" onClick={() => onApplyBlockFormat("p")} />
          <ToolbarButton label="H1" title="Heading 1" onClick={() => onApplyBlockFormat("h1")} />
          <ToolbarButton label="H2" title="Heading 2" onClick={() => onApplyBlockFormat("h2")} />
          <ToolbarButton label="H3" title="Heading 3" onClick={() => onApplyBlockFormat("h3")} />
        </div>

        <div className="inline-flex flex-wrap items-center gap-1 rounded-xl border border-[#e5e8f2] bg-white px-1.5 py-1 shadow-[0_1px_0_rgba(18,24,40,0.02)]">
          <ToolbarButton label="B" title="Bold" onClick={() => onRunEditorCommand("bold")} />
          <ToolbarButton label="I" title="Italic" onClick={() => onRunEditorCommand("italic")} />
          <ToolbarButton label="U" title="Underline" onClick={() => onRunEditorCommand("underline")} />
          <ToolbarButton label="UL" title="Bullet List" onClick={() => onRunEditorCommand("insertUnorderedList")} />
          <ToolbarButton label="OL" title="Numbered List" onClick={() => onRunEditorCommand("insertOrderedList")} />
          <ToolbarButton label="Link" title="Insert Link" onClick={onInsertLink} />
          <ToolbarButton label="Clear" title="Clear Formatting" onClick={() => onRunEditorCommand("removeFormat")} />
        </div>

        <div className="inline-flex flex-wrap items-center gap-1 rounded-xl border border-[#e5e8f2] bg-white px-1.5 py-1 shadow-[0_1px_0_rgba(18,24,40,0.02)]">
          <ToolbarButton label="FAQ" title="Insert FAQ Template" onClick={onInsertFaqTemplate} />
          <ToolbarButton label="CTA" title="Insert CTA Template" onClick={onInsertCtaTemplate} />
          <ToolbarButton
            label={autoOptimizing ? "Optimizing..." : "Auto-Optimize"}
            title="Run AI Auto-Optimize"
            onClick={onAutoOptimize}
            disabled={autoOptimizing || !hasDocument}
          />
        </div>
      </div>
    </div>
  );
}
