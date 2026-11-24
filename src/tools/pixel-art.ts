import { access, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

export interface UpscalePixelArtInput {
  imagePath: string;
  scale: number;
  outputPath?: string;
  format?: "png" | "webp";
  overwrite?: boolean;
}

export interface UpscalePixelArtResult {
  inputPath: string;
  outputPath: string;
  scale: number;
  inputDimensions: { width: number; height: number };
  outputDimensions: { width: number; height: number };
  outputSizeBytes: number;
  format: "png" | "webp";
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

export async function upscalePixelArt(
  input: UpscalePixelArtInput
): Promise<UpscalePixelArtResult> {
  if (!Number.isInteger(input.scale) || input.scale < 2 || input.scale > 8) {
    throw new Error("scale must be an integer between 2 and 8.");
  }

  const startedAt = Date.now();
  const inputPath = path.resolve(input.imagePath);
  const meta = await sharp(inputPath).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (width <= 0 || height <= 0) {
    throw new Error(`Unable to read image dimensions from: ${inputPath}`);
  }

  const outWidth = width * input.scale;
  const outHeight = height * input.scale;
  if (outWidth > 16384 || outHeight > 16384) {
    throw new Error(
      `Output dimensions ${outWidth}×${outHeight} exceed safety limit (16384px per side).`
    );
  }

  const format = input.format ?? "png";
  const parsed = path.parse(inputPath);
  const outputPath = path.resolve(
    input.outputPath ?? path.join(parsed.dir, `${parsed.name}_${input.scale}x.${format}`)
  );

  if (outputPath === inputPath && !input.overwrite) {
    throw new Error("outputPath matches inputPath. Pass overwrite: true or choose a new outputPath.");
  }
  if (!input.overwrite && (await exists(outputPath))) {
    throw new Error(`Output file already exists: ${outputPath}. Pass overwrite: true to replace it.`);
  }

  await mkdir(path.dirname(outputPath), { recursive: true });

  const pipeline = sharp(inputPath).resize({
    width: outWidth,
    height: outHeight,
    kernel: sharp.kernel.nearest,
  });

  if (format === "webp") {
    await pipeline.webp({ lossless: true }).toFile(outputPath);
  } else {
    await pipeline.png({ compressionLevel: 9, palette: false }).toFile(outputPath);
  }

  const outStat = await stat(outputPath);

  return {
    inputPath,
    outputPath,
    scale: input.scale,
    inputDimensions: { width, height },
    outputDimensions: { width: outWidth, height: outHeight },
    outputSizeBytes: outStat.size,
    format,
    durationMs: Date.now() - startedAt,
  };
}
