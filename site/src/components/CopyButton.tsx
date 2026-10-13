import { useState } from "react";

export function CopyButton({ text, label = "Copy", className }: { text: string | (() => string); label?: string; className?: string }) {
  const [status, setStatus] = useState("");
  async function copy() {
    const t = typeof text === "function" ? text() : text;
    try {
      await navigator.clipboard.writeText(t);
      setStatus("Copied");
    } catch {
      setStatus("Copy failed");
    }
    window.setTimeout(() => setStatus(""), 2000);
  }
  return (
    <span className={className}>
      <button type="button" className="btn" onClick={copy}>
        {label}
      </button>
      <span className="copy-status" aria-live="polite">
        {status}
      </span>
    </span>
  );
}

export function downloadJson(name: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 1)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
