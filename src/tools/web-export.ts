import { access, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { round } from "../types.js";

export interface PrepareForWebInput {
  imagePath: string;
  outputPath?: string;
  format?: "webp" | "avif" | "jpeg" | "png";
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  keepMetadata?: boolean;
  overwrite?: boolean;
}

export interface PrepareForWebResult {
  inputPath: string;
  outputPath: string;
  format: "webp" | "avif" | "jpeg" | "png";
  inputDimensions: { width: number; height: number };
  outputDimensions: { width: number; height: number };
  inputSizeBytes: number;
  outputSizeBytes: number;
  savingsPercent: number;
  durationMs: number;
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function prepareForWeb(
  input: PrepareForWebInput
): Promise<PrepareForWebResult> {
  const startedAt = Date.now();
  const inputPath = path.resolve(input.imagePath);
  const inStat = await stat(inputPath);
  const meta = await sharp(inputPath).metadata();
  const inWidth = meta.width ?? 0;
  const inHeight = meta.height ?? 0;
  if (inWidth <= 0 || inHeight <= 0) {
    throw new Error(`Unable to read image dimensions from: ${inputPath}`);
  }

  const format = input.format ?? "webp";
  const quality = input.quality ?? 82;
  if (quality < 1 || quality > 100) {
    throw new Error("quality must be between 1 and 100.");
  }

  const parsed = path.parse(inputPath);
  const ext = format === "jpeg" ? "jpg" : format;
  const outputPath = path.resolve(
    input.outputPath ?? path.join(parsed.dir, `${parsed.name}_web.${ext}`)
  );

  if (outputPath === inputPath && !input.overwrite) {
    throw new Error("outputPath matches inputPath. Pass overwrite: true or choose a new outputPath.");
  }
  if (!input.overwrite && (await exists(outputPath))) {
    throw new Error(`Output file already exists: ${outputPath}. Pass overwrite: true to replace it.`);
  }

  await mkdir(path.dirname(outputPath), { recursive: true });

  let pipeline = sharp(inputPath).rotate();
  if (input.maxWidth || input.maxHeight) {
    pipeline = pipeline.resize({
      width: input.maxWidth,
      height: input.maxHeight,
      fit: "inside",
      withoutEnlargement: true,
    });
  }
  if (input.keepMetadata) {
    pipeline = pipeline.keepMetadata();
  }

  if (format === "webp") {
    pipeline = pipeline.webp({ quality });
  } else if (format === "avif") {
    pipeline = pipeline.avif({ quality });
  } else if (format === "jpeg") {
    pipeline = pipeline.jpeg({ quality, mozjpeg: true });
  } else {
    pipeline = pipeline.png({ compressionLevel: 9 });
  }

  const outInfo = await pipeline.toFile(outputPath);
  const savingsPercent =
    inStat.size > 0 ? round(((inStat.size - outInfo.size) / inStat.size) * 100, 1) : 0;

  return {
    inputPath,
    outputPath,
    format,
    inputDimensions: { width: inWidth, height: inHeight },
    outputDimensions: { width: outInfo.width, height: outInfo.height },
    inputSizeBytes: inStat.size,
    outputSizeBytes: outInfo.size,
    savingsPercent,
    durationMs: Date.now() - startedAt,
  };
}
