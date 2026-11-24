import { stat } from "node:fs/promises";
import path from "node:path";
import exifReader from "exif-reader";
import sharp from "sharp";
import { gcd, round } from "../types.js";

export interface ExifSummary {
  make?: string;
  model?: string;
  software?: string;
  dateTimeOriginal?: string;
  iso?: number;
  fNumber?: number;
  exposureTimeSeconds?: number;
  focalLengthMm?: number;
  lensModel?: string;
}

export interface InspectImageResult {
  filePath: string;
  fileName: string;
  fileSizeBytes: number;
  fileSizeHuman: string;
  format: string;
  width: number;
  height: number;
  megapixels: number;
  aspectRatio: string;
  aspectRatioDecimal: number;
  orientation: "landscape" | "portrait" | "square";
  exifOrientation: number | null;
  dpi: number | null;
  colorSpace: string | null;
  channels: number | null;
  bitDepth: string | null;
  hasAlpha: boolean;
  isAnimated: boolean;
  pages: number;
  bytesPerPixel: number;
  exif: ExifSummary | null;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${round(bytes / 1024, 1)} KB`;
  return `${round(bytes / (1024 * 1024), 2)} MB`;
}

function parseExif(buffer?: Buffer): ExifSummary | null {
  if (!buffer || buffer.length === 0) return null;
  try {
    const parsed = exifReader(buffer);
    const summary: ExifSummary = {};
    if (parsed.Image?.Make) summary.make = String(parsed.Image.Make).trim();
    if (parsed.Image?.Model) summary.model = String(parsed.Image.Model).trim();
    if (parsed.Image?.Software) summary.software = String(parsed.Image.Software).trim();
    if (parsed.Photo?.DateTimeOriginal) {
      summary.dateTimeOriginal =
        parsed.Photo.DateTimeOriginal instanceof Date
          ? parsed.Photo.DateTimeOriginal.toISOString()
          : String(parsed.Photo.DateTimeOriginal);
    }
    const isoVal: unknown = parsed.Photo?.ISOSpeedRatings;
    if (typeof isoVal === "number") {
      summary.iso = isoVal;
    } else if (Array.isArray(isoVal) && isoVal.length > 0) {
      summary.iso = Number(isoVal[0]);
    }
    if (typeof parsed.Photo?.FNumber === "number") {
      summary.fNumber = round(parsed.Photo.FNumber, 2);
    }
    if (typeof parsed.Photo?.ExposureTime === "number") {
      summary.exposureTimeSeconds = round(parsed.Photo.ExposureTime, 6);
    }
    if (typeof parsed.Photo?.FocalLength === "number") {
      summary.focalLengthMm = round(parsed.Photo.FocalLength, 1);
    }
    if (parsed.Photo?.LensModel) {
      summary.lensModel = String(parsed.Photo.LensModel).trim();
    }
    return Object.keys(summary).length > 0 ? summary : null;
  } catch {
    return null;
  }
}

export async function inspectImage(imagePath: string): Promise<InspectImageResult> {
  const resolvedPath = path.resolve(imagePath);
  const fileStat = await stat(resolvedPath);
  const meta = await sharp(resolvedPath).metadata();

  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (width <= 0 || height <= 0) {
    throw new Error(`Unable to read valid image dimensions from: ${resolvedPath}`);
  }

  const divisor = gcd(width, height);
  const orientation =
    width > height ? "landscape" : width < height ? "portrait" : "square";
  const totalPixels = width * height;

  return {
    filePath: resolvedPath,
    fileName: path.basename(resolvedPath),
    fileSizeBytes: fileStat.size,
    fileSizeHuman: formatBytes(fileStat.size),
    format: meta.format ?? "unknown",
    width,
    height,
    megapixels: round(totalPixels / 1_000_000, 2),
    aspectRatio: `${width / divisor}:${height / divisor}`,
    aspectRatioDecimal: round(width / height, 3),
    orientation,
    exifOrientation: meta.orientation ?? null,
    dpi: meta.density ?? null,
    colorSpace: meta.space ?? null,
    channels: meta.channels ?? null,
    bitDepth: meta.depth ?? null,
    hasAlpha: Boolean(meta.hasAlpha),
    isAnimated: (meta.pages ?? 1) > 1,
    pages: meta.pages ?? 1,
    bytesPerPixel: round(fileStat.size / totalPixels, 3),
    exif: parseExif(meta.exif),
  };
}
