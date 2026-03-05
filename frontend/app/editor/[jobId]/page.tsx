"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { HtmlEditorPanel } from "@/components/HtmlEditorPanel";
import { getHistoryItem } from "@/lib/apiClient";
import type { HistoryItem } from "@/types";

export default function EditorPage() {
  const params = useParams<{ jobId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [contextItem, setContextItem] = useState<HistoryItem | null>(null);

  const jobId = useMemo(() => {
    const value = Number(params?.jobId || "");
    return Number.isFinite(value) && value > 0 ? value : null;
  }, [params?.jobId]);

  const version = searchParams.get("version") === "optimized" ? "optimized" : "source";

  useEffect(() => {
    if (!jobId) return;

    let mounted = true;
    (async () => {
      try {
        const item = await getHistoryItem(jobId);
        if (mounted) setContextItem(item);
      } catch {
        if (mounted) setContextItem(null);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [jobId]);

  if (!jobId) {
    return (
      <div className="min-h-[50vh] grid place-items-center">
        <p className="text-[13px] text-[#7a7a7a]">Invalid editor job id.</p>
      </div>
    );
  }

  return (
    <HtmlEditorPanel
      jobId={jobId}
      initialVersion={version}
      contextItem={contextItem}
      mode="page"
      onClose={() => {
        if (window.history.length > 1) {
          router.back();
          return;
        }
        router.push("/dashboard");
      }}
    />
  );
}
