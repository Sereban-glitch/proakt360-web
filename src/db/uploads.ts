import { mkdir, writeFile, readFile, unlink } from "fs/promises";
import path from "path";
import sharp from "sharp";
import { randomBytes } from "crypto";
import { uploadsDirPath } from "./paths";

// ---------------------------------------------------------------------------
// Хранилище фото: реальные файлы в <каталог базы>/uploads (по умолчанию db/uploads,
// ВНЕ public — доступ только через API с проверкой). sharp создаёт сжатую копию
// и миниатюру. Расположение резолвится рядом с фактическим файлом SQLite —
// база и фото всегда в одной папке (см. src/db/paths.ts).
// ---------------------------------------------------------------------------

function UPLOAD_DIR(): string {
  return uploadsDirPath();
}
const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15 МБ на файл
const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

export type StoredFile = {
  path: string; // имя файла внутри db/uploads/
  thumbPath: string;
  mime: string;
  size: number;
  width: number;
  height: number;
};

export async function ensureUploadDir(): Promise<void> {
  await mkdir(UPLOAD_DIR(), { recursive: true });
}

function safeName(ext: string): string {
  return `${Date.now().toString(36)}-${randomBytes(6).toString("hex")}${ext}`;
}

/** Валидация + сохранение загруженного файла: оригинал (сжатый до 2000px), миниатюра 480px. */
export async function storeUpload(file: File): Promise<StoredFile> {
  if (file.size > MAX_FILE_BYTES) throw new Error("Файл больше 15 МБ");
  if (file.type && !ALLOWED_MIME.has(file.type)) {
    throw new Error(`Тип файла не поддерживается: ${file.type}`);
  }
  await ensureUploadDir();
  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.length === 0) throw new Error("Пустой файл");

  let image = sharp(buf, { failOn: "none" });
  const meta = await image.metadata();
  if (!meta.width || !meta.height) throw new Error("Не удалось прочитать изображение");

  // Оригинал: JPEG до 2000px по длинной стороне, качество 82 (фото стройки)
  const name = safeName(".jpg");
  const full = await image
    .clone()
    .rotate()
    .resize({ width: 2000, height: 2000, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer({ resolveWithObject: true });
  await writeFile(path.join(UPLOAD_DIR(), name), full.data);

  // Миниатюра: 480px, качество 70 — имя = имя оригинала с суффиксом -t
  const thumbName = thumbFileName(name);
  const thumb = await image
    .clone()
    .rotate()
    .resize({ width: 480, height: 480, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 70 })
    .toBuffer();
  await writeFile(path.join(UPLOAD_DIR(), thumbName), thumb);

  return {
    path: name,
    thumbPath: thumbName,
    mime: "image/jpeg",
    size: full.data.length,
    width: full.info.width,
    height: full.info.height,
  };
}

/** Сгенерировать синтетическое фото (для демо-сида): цветной градиент + рамка. */
export async function makeSyntheticPhoto(
  seed: number,
  label: string,
): Promise<{ buffer: Buffer; thumb: Buffer; width: number; height: number }> {
  const hues = [
    [34, 78], [18, 62], [45, 48], [160, 30], [200, 22], [275, 26],
  ];
  const [h, s] = hues[seed % hues.length];
  const w = 1280;
  const hgt = 960;
  const svg = Buffer.from(
    `<svg width="${w}" height="${hgt}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="hsl(${h} ${s}% 58%)"/>
          <stop offset="1" stop-color="hsl(${(h + 40) % 360} ${s}% 34%)"/>
        </linearGradient>
      </defs>
      <rect width="${w}" height="${hgt}" fill="url(#g)"/>
      <g opacity="0.16" stroke="#000" stroke-width="3">
        ${Array.from({ length: 9 }, (_, i) => `<line x1="0" y1="${i * (hgt / 8)}" x2="${w}" y2="${i * (hgt / 8) - 120}"/>`).join("")}
        ${Array.from({ length: 9 }, (_, i) => `<line x1="${i * (w / 8)}" y1="0" x2="${i * (w / 8) + 160}" y2="${hgt}"/>`).join("")}
      </g>
      <rect x="60" y="60" width="${w - 120}" height="${hgt - 120}" fill="none" stroke="rgba(255,255,255,.5)" stroke-width="6" rx="18"/>
      <circle cx="${w - 150}" cy="150" r="56" fill="rgba(255,255,255,.28)"/>
      <text x="80" y="${hgt - 110}" font-family="Arial, sans-serif" font-size="54" font-weight="700" fill="rgba(255,255,255,.92)">${escapeXml(label)}</text>
      <text x="80" y="${hgt - 52}" font-family="Arial, sans-serif" font-size="30" fill="rgba(255,255,255,.72)">демо-фото · сгенерировано автоматически</text>
    </svg>`,
  );
  const buffer = await sharp(svg).jpeg({ quality: 80 }).toBuffer();
  const thumb = await sharp(svg).resize({ width: 480 }).jpeg({ quality: 70 }).toBuffer();
  return { buffer, thumb, width: w, height: hgt };
}

function escapeXml(s: string): string {
  return s.replace(/[<>&"']/g, (c) =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c] as string,
  );
}

export async function saveBuffers(fullName: string, full: Buffer, thumb: Buffer): Promise<void> {
  await ensureUploadDir();
  await writeFile(path.join(UPLOAD_DIR(), fullName), full);
  await writeFile(path.join(UPLOAD_DIR(), fullName.replace(/\.jpg$/, "-t.jpg")), thumb);
}

export function thumbFileName(name: string): string {
  return name.replace(/\.jpg$/, "-t.jpg");
}

export async function readStoredFile(name: string, _thumb = false): Promise<Buffer> {
  // HOTFIX (Task 10-b, cross-zone): читать нужно ровно тот файл, который передан.
  // Единственный вызывающий — роут /api/photo/[id]/file — уже подставляет точное
  // имя (photo.thumbPath для миниатюры, photo.path для оригинала). Прежняя
  // достройка суффикса "-t" ломала ВСЕ миниатюры (404): у демо-файлов получался
  // двойной "-t", а у реальных загрузок (storeUpload/safeName) имена оригинала
  // и миниатюры независимы. Параметр оставлен для совместимости вызова.
  const safe = path.basename(name); // защита от path traversal
  return readFile(path.join(UPLOAD_DIR(), safe));
}

export async function removeStoredFiles(names: string[]): Promise<void> {
  for (const n of names) {
    const safe = path.basename(n);
    await unlink(path.join(UPLOAD_DIR(), safe)).catch(() => undefined);
    await unlink(path.join(UPLOAD_DIR(), thumbFileName(safe))).catch(() => undefined);
  }
}
