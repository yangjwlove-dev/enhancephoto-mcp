import sharp from "sharp";
import { round } from "../types.js";
import { inspectImage } from "./inspect.js";

export type TargetUseCase = "web" | "hd" | "4k" | "print_8x10";

export interface DiagnoseImageQualityInput {
  imagePath: string;
  targetUseCase?: TargetUseCase;
}

export interface QualityIssue {
  code:
    | "low_resolution"
    | "soft_or_blurry"
    | "heavy_compression"
    | "underexposed"
    | "overexposed"
    | "low_contrast"
    | "pixel_art_detected";
  severity: "info" | "warning" | "high";
  message: string;
}

export interface DiagnoseImageQualityResult {
  filePath: string;
  dimensions: { width: number; height: number; megapixels: number };
  format: string;
  metrics: {
    laplacianVariance: number;
    sharpnessGrade: "very_blurry" | "soft" | "moderate" | "sharp";
    bytesPerPixel: number;
    meanLuminance: number;
    contrastStdDev: number;
    darkClippedRatio: number;
    brightClippedRatio: number;
    sampledUniqueColors: number;
    likelyPixelArt: boolean;
  };
  needsUpscaling: boolean;
  needsDeblur: boolean;
  suggestedWorkflow:
    | "ready_as_is"
    | "integer_nearest_upscale"
    | "ai_upscale"
    | "ai_deblur_and_upscale"
    | "tone_and_compression_cleanup";
  issues: QualityIssue[];
  recommendations: string[];
}

function computeLaplacianVariance(gray: Uint8Array, width: number, height: number): number {
  if (width < 3 || height < 3) return 0;
  let sum = 0;
  let sumSq = 0;
  let count = 0;

  for (let y = 1; y < height - 1; y++) {
    const row = y * width;
    for (let x = 1; x < width - 1; x++) {
      const idx = row + x;
      const lap =
        gray[idx - width] +
        gray[idx + width] +
        gray[idx - 1] +
        gray[idx + 1] -
        4 * gray[idx];
      sum += lap;
      sumSq += lap * lap;
      count++;
    }
  }

  if (count === 0) return 0;
  const mean = sum / count;
  return sumSq / count - mean * mean;
}

function getTargetMinLongEdge(useCase: TargetUseCase): number {
  switch (useCase) {
    case "web":
      return 1200;
    case "hd":
      return 1920;
    case "4k":
      return 3840;
    case "print_8x10":
      return 3000;
  }
}

export async function diagnoseImageQuality(
  input: DiagnoseImageQualityInput
): Promise<DiagnoseImageQualityResult> {
  const info = await inspectImage(input.imagePath);
  const useCase: TargetUseCase = input.targetUseCase ?? "hd";
  const minLongEdge = getTargetMinLongEdge(useCase);
  const longEdge = Math.max(info.width, info.height);

  // Downsample to <= 512px long edge for fast, scale-consistent sharpness and luminance metrics.
  const { data: grayData, info: grayInfo } = await sharp(info.filePath)
    .rotate()
    .resize({ width: 512, height: 512, fit: "inside", withoutEnlargement: true })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const laplacianVariance = round(
    computeLaplacianVariance(grayData, grayInfo.width, grayInfo.height),
    1
  );

  let lumSum = 0;
  let lumSqSum = 0;
  let darkCount = 0;
  let brightCount = 0;
  const pixelCount = grayData.length || 1;
  for (let i = 0; i < grayData.length; i++) {
    const v = grayData[i];
    lumSum += v;
    lumSqSum += v * v;
    if (v <= 10) darkCount++;
    if (v >= 245) brightCount++;
  }
  const meanLuminance = lumSum / pixelCount;
  const contrastStdDev = Math.sqrt(Math.max(0, lumSqSum / pixelCount - meanLuminance * meanLuminance));
  const darkClippedRatio = darkCount / pixelCount;
  const brightClippedRatio = brightCount / pixelCount;

  // Estimate palette size on small/medium images to detect pixel art.
  const { data: rgbData } = await sharp(info.filePath)
    .rotate()
    .resize({ width: 128, height: 128, fit: "inside", withoutEnlargement: true, kernel: sharp.kernel.nearest })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const uniqueColors = new Set<number>();
  for (let i = 0; i + 2 < rgbData.length; i += 3) {
    uniqueColors.add((rgbData[i] << 16) | (rgbData[i + 1] << 8) | rgbData[i + 2]);
    if (uniqueColors.size > 512) break;
  }

  const likelyPixelArt =
    longEdge <= 512 &&
    (info.format === "png" || info.format === "gif" || info.format === "webp") &&
    uniqueColors.size <= 64;

  let sharpnessGrade: DiagnoseImageQualityResult["metrics"]["sharpnessGrade"];
  if (laplacianVariance < 45) sharpnessGrade = "very_blurry";
  else if (laplacianVariance < 130) sharpnessGrade = "soft";
  else if (laplacianVariance < 400) sharpnessGrade = "moderate";
  else sharpnessGrade = "sharp";

  const issues: QualityIssue[] = [];
  const recommendations: string[] = [];

  const needsUpscaling = longEdge < minLongEdge;
  const needsDeblur = !likelyPixelArt && (sharpnessGrade === "very_blurry" || sharpnessGrade === "soft");

  if (likelyPixelArt) {
    issues.push({
      code: "pixel_art_detected",
      severity: "info",
      message: `Image looks like pixel art (${info.width}×${info.height}, ≤${uniqueColors.size} sampled colors). Avoid smooth AI/bicubic upscaling to prevent blurry sprites.`,
    });
    recommendations.push(
      "Use the local `upscale_pixel_art` tool with an integer nearest-neighbor factor (2x–4x) to preserve crisp pixel edges."
    );
  }

  if (needsUpscaling) {
    const neededScale = round(minLongEdge / longEdge, 2);
    issues.push({
      code: "low_resolution",
      severity: neededScale >= 2 ? "high" : "warning",
      message: `Long edge is ${longEdge}px, below the ${minLongEdge}px target for "${useCase}" (~${neededScale}x needed).`,
    });
    if (!likelyPixelArt) {
      recommendations.push(
        `Upscale by ~${neededScale}x using an AI image upscaler (for example, https://enhancephoto.org) rather than simple bicubic resizing.`
      );
    }
  }

  if (needsDeblur) {
    issues.push({
      code: "soft_or_blurry",
      severity: sharpnessGrade === "very_blurry" ? "high" : "warning",
      message: `Low edge sharpness detected (Laplacian variance ${laplacianVariance}, grade: ${sharpnessGrade}).`,
    });
    recommendations.push(
      "Run deblurring / detail recovery before printing or sharing at large sizes."
    );
  }

  if (info.format === "jpeg" && info.bytesPerPixel < 0.22) {
    issues.push({
      code: "heavy_compression",
      severity: "warning",
      message: `Very low JPEG data density (${info.bytesPerPixel} bytes/pixel), which often introduces blocking or ringing artifacts.`,
    });
    recommendations.push("Apply JPEG artifact reduction before upscaling so compression blocks are not amplified.");
  }

  if (meanLuminance < 45 && darkClippedRatio > 0.25) {
    issues.push({
      code: "underexposed",
      severity: "warning",
      message: `Image is dark (mean luminance ${round(meanLuminance, 1)}/255, ${round(darkClippedRatio * 100, 1)}% shadow clipping).`,
    });
    recommendations.push("Lift shadows/exposure gently before final export.");
  }

  if (meanLuminance > 215 && brightClippedRatio > 0.25) {
    issues.push({
      code: "overexposed",
      severity: "warning",
      message: `Image has heavy highlights (mean luminance ${round(meanLuminance, 1)}/255, ${round(brightClippedRatio * 100, 1)}% clipped whites).`,
    });
    recommendations.push("Recover highlights or reduce exposure if a RAW/higher-bit-depth source is available.");
  }

  if (!likelyPixelArt && contrastStdDev < 22) {
    issues.push({
      code: "low_contrast",
      severity: "info",
      message: `Flat tonal contrast detected (luminance std dev ${round(contrastStdDev, 1)}).`,
    });
    recommendations.push("Add subtle local contrast or levels adjustment.");
  }

  let suggestedWorkflow: DiagnoseImageQualityResult["suggestedWorkflow"] = "ready_as_is";
  if (likelyPixelArt && needsUpscaling) {
    suggestedWorkflow = "integer_nearest_upscale";
  } else if (needsDeblur && needsUpscaling) {
    suggestedWorkflow = "ai_deblur_and_upscale";
  } else if (needsUpscaling) {
    suggestedWorkflow = "ai_upscale";
  } else if (issues.length > 0) {
    suggestedWorkflow = "tone_and_compression_cleanup";
  }

  if (recommendations.length === 0) {
    recommendations.push(`Image meets "${useCase}" resolution and sharpness targets; no enhancement needed.`);
  }

  return {
    filePath: info.filePath,
    dimensions: {
      width: info.width,
      height: info.height,
      megapixels: info.megapixels,
    },
    format: info.format,
    metrics: {
      laplacianVariance,
      sharpnessGrade,
      bytesPerPixel: info.bytesPerPixel,
      meanLuminance: round(meanLuminance, 1),
      contrastStdDev: round(contrastStdDev, 1),
      darkClippedRatio: round(darkClippedRatio, 3),
      brightClippedRatio: round(brightClippedRatio, 3),
      sampledUniqueColors: uniqueColors.size,
      likelyPixelArt,
    },
    needsUpscaling,
    needsDeblur,
    suggestedWorkflow,
    issues,
    recommendations,
  };
}
