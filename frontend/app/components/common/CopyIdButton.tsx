"use client";

import { Check, Copy } from "lucide-react";
import React, { useEffect, useState } from "react";

export async function copyTextToClipboard(value: string) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return;
    } catch {
      // Some browsers block the async clipboard API outside secure contexts.
    }
  }

  const input = document.createElement("textarea");
  input.value = value;
  input.style.position = "fixed";
  input.style.opacity = "0";
  document.body.appendChild(input);
  input.focus();
  input.select();
  document.execCommand("copy");
  input.remove();
}

export function canCopyDatabaseIds(user: any) {
  const roles = Array.isArray(user?.roles) ? user.roles : [];
  return Boolean(
    user?.is_super_admin ||
      user?.user_type === "tenant_admin" ||
      user?.user_type === "super_admin" ||
      roles.includes("tenant_admin") ||
      roles.includes("super_admin"),
  );
}

export function CopyIdButton({
  value,
  label = "ID",
  className = "",
  allowed = false,
}: {
  value?: string | null;
  label?: string;
  className?: string;
  allowed?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timeout = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(timeout);
  }, [copied]);

  if (!allowed || !value) return null;

  async function copy(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    await copyTextToClipboard(String(value));
    setCopied(true);
  }

  return (
    <button
      type="button"
      onClick={copy}
      className={`inline-flex items-center rounded-md bg-transparent p-1 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 ${className}`}
      title={copied ? `${label} copied` : `Copy ${label}`}
      aria-label={copied ? `${label} copied` : `Copy ${label}`}
    >
      {copied ? (
        <Check size={12} className="shrink-0 text-emerald-600" />
      ) : (
        <Copy size={12} className="shrink-0" />
      )}
    </button>
  );
}
