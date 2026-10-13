import { Film, ImageOff } from "lucide-react";
import type { MediaDTO } from "../../lib/types";
import { formatDuration } from "../../lib/format";
import { cn } from "../../lib/format";

/** Square thumbnail for an image or video (first frame via preload=metadata). */
export function MediaThumb({ media, className, controls }: { media: MediaDTO | undefined; className?: string; controls?: boolean }) {
  if (!media)
    return (
      <div className={cn("flex items-center justify-center bg-zinc-100 text-zinc-400 dark:bg-zinc-800", className)}>
        <ImageOff className="size-5" />
      </div>
    );
  if (media.kind === "video")
    return (
      <div className={cn("relative overflow-hidden bg-black", className)}>
        <video src={`${media.url}#t=0.1`} preload="metadata" muted playsInline controls={controls} className="size-full object-cover" />
        {!controls && (
          <span className="pointer-events-none absolute bottom-1 left-1 inline-flex items-center gap-1 rounded bg-black/70 px-1 py-0.5 text-[10px] font-medium text-white">
            <Film className="size-3" />
            {media.duration ? formatDuration(media.duration) : "Video"}
          </span>
        )}
      </div>
    );
  return <img src={media.url} alt={media.alt ?? ""} loading="lazy" className={cn("bg-zinc-100 object-cover dark:bg-zinc-800", className)} />;
}
