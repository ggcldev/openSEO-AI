"use client";

import { useState } from "react";
import type { HistoryItem } from "@/types";

interface TableResultsProps {
  items: HistoryItem[];
  onRefresh: () => void;
}

const statusColors: Record<string, string> = {
  pending: "text-yellow-400",
  running: "text-blue-400",
  done: "text-green-400",
  failed: "text-red-400",
};

export function TableResults({ items, onRefresh }: TableResultsProps) {
  const [expandedId, setExpandedId] = useState<number | null>(null);

  if (items.length === 0) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-8 text-center text-gray-500">
        No scrape jobs yet. Submit a URL above to get started.
      </div>
    );
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-800 text-gray-400">
            <th className="text-left px-4 py-3 font-medium">ID</th>
            <th className="text-left px-4 py-3 font-medium">URL</th>
            <th className="text-left px-4 py-3 font-medium">Agent</th>
            <th className="text-left px-4 py-3 font-medium">Status</th>
            <th className="text-left px-4 py-3 font-medium">Created</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <>
              <tr
                key={item.id}
                onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
                className="border-b border-gray-800/50 hover:bg-gray-800/50 cursor-pointer transition"
              >
                <td className="px-4 py-3 text-gray-300">#{item.id}</td>
                <td className="px-4 py-3 text-white truncate max-w-xs">{item.url}</td>
                <td className="px-4 py-3">
                  <span className="bg-gray-800 text-gray-300 px-2 py-0.5 rounded text-xs">
                    {item.agent}
                  </span>
                </td>
                <td className={`px-4 py-3 font-medium ${statusColors[item.status] || "text-gray-400"}`}>
                  {item.status}
                </td>
                <td className="px-4 py-3 text-gray-400">
                  {new Date(item.created_at).toLocaleString()}
                </td>
              </tr>
              {expandedId === item.id && item.result && (
                <tr key={`${item.id}-result`}>
                  <td colSpan={5} className="px-4 py-4 bg-gray-800/30">
                    <pre className="text-xs text-gray-300 whitespace-pre-wrap overflow-auto max-h-64">
                      {(() => {
                        try {
                          return JSON.stringify(JSON.parse(item.result), null, 2);
                        } catch {
                          return item.result;
                        }
                      })()}
                    </pre>
                  </td>
                </tr>
              )}
            </>
          ))}
        </tbody>
      </table>
    </div>
  );
}
