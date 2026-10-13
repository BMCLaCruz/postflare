import type { MediaDTO } from "../../shared/types";
import type { MediaAccess, MediaItem } from "../providers/types";
import { fixedLength } from "../providers/multipart";
import { sign } from "./crypto";

export interface MediaRow {
  id: string;
  r2_key: string;
  filename: string;
  mime: string;
  size: number;
  kind: "image" | "video";
  width: number | null;
  height: number | null;
  duration: number | null;
  alt: string | null;
  status: string;
  upload_id: string | null;
  created_at: number;
  workspace_id: string | null;
  created_by: string | null;
}

export async function publicMediaUrl(env: Env, base: string, row: Pick<MediaRow, "id" | "filename">): Promise<string> {
  const sig = await sign(env, `media:${row.id}`);
  return `${base}/m/${row.id}/${sig}/${encodeURIComponent(safeFilename(row.filename))}`;
}

export function safeFilename(name: string): string {
  return name.replace(/[^\w.\-]+/g, "_").slice(-120) || "file";
}

export async function mediaDto(env: Env, base: string, row: MediaRow): Promise<MediaDTO> {
  return {
    id: row.id,
    filename: row.filename,
    mime: row.mime,
    size: row.size,
    kind: row.kind,
    width: row.width,
    height: row.height,
    duration: row.duration,
    alt: row.alt,
    url: await publicMediaUrl(env, base, row),
    createdAt: row.created_at,
  };
}

export async function loadMediaItems(env: Env, base: string, ids: string[]): Promise<MediaItem[]> {
  if (!ids.length) return [];
  const placeholders = ids.map(() => "?").join(",");
  const { results } = await env.DB.prepare(`SELECT * FROM media WHERE id IN (${placeholders})`)
    .bind(...ids)
    .all<MediaRow>();
  const byId = new Map(results.map((r) => [r.id, r]));
  const items: MediaItem[] = [];
  for (const id of ids) {
    const row = byId.get(id);
    if (!row) throw new Error(`Media ${id} not found`);
    if (row.status !== "ready") throw new Error(`Media ${row.filename} has not finished uploading`);
    items.push({
      id: row.id,
      kind: row.kind,
      mime: row.mime,
      filename: row.filename,
      size: row.size,
      width: row.width,
      height: row.height,
      duration: row.duration,
      alt: row.alt,
      url: await publicMediaUrl(env, base, row),
    });
  }
  return items;
}

export function mediaAccess(env: Env): MediaAccess {
  const keyFor = async (item: MediaItem) => {
    const row = await env.DB.prepare("SELECT r2_key FROM media WHERE id = ?").bind(item.id).first<{ r2_key: string }>();
    if (!row) throw new Error(`Media ${item.id} not found`);
    return row.r2_key;
  };
  const get = async (item: MediaItem, range?: R2Range) => {
    const obj = await env.MEDIA.get(await keyFor(item), range ? { range } : undefined);
    if (!obj) throw new Error(`Media file ${item.filename} is missing from storage`);
    return obj;
  };
  return {
    stream: async (item) => (await get(item)).body,
    bytes: async (item) => (await get(item)).arrayBuffer(),
    rangeStream: async (item, offset, length) => {
      const len = Math.max(0, Math.min(length, item.size - offset));
      return fixedLength((await get(item, { offset, length: len })).body, len);
    },
    range: async (item, offset, length) => (await get(item, { offset, length })).arrayBuffer(),
    blob: async (item) => new Blob([await (await get(item)).arrayBuffer()], { type: item.mime }),
    image: async (item, opts) => {
      const format = opts.format ?? "image/jpeg";
      const result = await env.IMAGES.input((await get(item)).body)
        .transform({ width: opts.maxWidth, height: opts.maxHeight, fit: "scale-down" })
        .output({ format, quality: opts.quality ?? 85 });
      return new Blob([await result.response().arrayBuffer()], { type: format });
    },
  };
}
