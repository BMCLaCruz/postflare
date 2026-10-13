import { useId } from "react";
import { cn } from "../lib/format";

export function Logo({ className }: { className?: string }) {
  // Unique gradient id: a hidden copy of the logo (e.g. desktop sidebar on mobile) would otherwise break the reference.
  const id = useId();
  return (
    <svg viewBox="0 0 64 64" className={cn("size-8", className)} aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fb923c" />
          <stop offset="1" stopColor="#e11d48" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill={`url(#${id})`} />
      {/* A geometric "P" whose bowl holds a four-point flare. */}
      <path fill="#fff" fillRule="evenodd" d="M17 18a5 5 0 0 1 5-5h11a14 14 0 0 1 0 28h-4v4a6 6 0 0 1-12 0ZM33 18.5Q34.6 25.4 41.5 27Q34.6 28.6 33 35.5Q31.4 28.6 24.5 27Q31.4 25.4 33 18.5Z" />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <Logo className="size-8" />
      <span className="text-[17px] font-semibold tracking-tight text-zinc-900 dark:text-white">Postflare</span>
    </span>
  );
}
