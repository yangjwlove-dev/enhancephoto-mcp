import { PRINT_PRESETS, PrintUnit, round, toInches } from "../types.js";
import { inspectImage } from "./inspect.js";

export interface CalculatePrintSizeInput {
  imagePath?: string;
  pixelWidth?: number;
  pixelHeight?: number;
  preset?: keyof typeof PRINT_PRESETS | string;
  targetWidth?: number;
  targetHeight?: number;
  unit?: PrintUnit;
  targetDpi?: number;
  autoOrient?: boolean;
}

export interface CalculatePrintSizeResult {
  source: {
    widthPx: number;
    heightPx: number;
    aspectRatio: number;
  };
  targetPrint: {
    label: string;
    widthInches: number;
    heightInches: number;
    widthCm: number;
    heightCm: number;
    targetDpi: number;
    requiredWidthPx: number;
    requiredHeightPx: number;
  };
  effectiveDpi: {
    horizontal: number;
    vertical: number;
    limiting: number;
  };
  scaling: {
    requiredScaleFactor: number;
    recommendedIntegerScale: number;
    needsUpscaling: boolean;
    aspectRatioMismatchPercent: number;
    cropWarning: string | null;
  };
  qualityTier: "excellent" | "acceptable" | "upscale_recommended" | "too_small";
  recommendation: string;
}

export async function calculatePrintSize(
  input: CalculatePrintSizeInput
): Promise<CalculatePrintSizeResult> {
  let widthPx = input.pixelWidth;
  let heightPx = input.pixelHeight;

  if (input.imagePath) {
    const info = await inspectImage(input.imagePath);
    widthPx = info.width;
    heightPx = info.height;
  }

  if (!widthPx || !heightPx || widthPx <= 0 || heightPx <= 0) {
    throw new Error("Provide either a valid imagePath or positive pixelWidth and pixelHeight.");
  }

  const targetDpi = input.targetDpi ?? 300;
  if (targetDpi < 72 || targetDpi > 1200) {
    throw new Error("targetDpi must be between 72 and 1200.");
  }

  let printW: number;
  let printH: number;
  let label: string;

  if (input.preset) {
    const spec = PRINT_PRESETS[input.preset];
    if (!spec) {
      throw new Error(
        `Unknown preset "${input.preset}". Supported presets: ${Object.keys(PRINT_PRESETS).join(", ")}`
      );
    }
    printW = spec.widthInches;
    printH = spec.heightInches;
    label = spec.label;
  } else if (input.targetWidth && input.targetHeight) {
    const unit = input.unit ?? "in";
    printW = toInches(input.targetWidth, unit);
    printH = toInches(input.targetHeight, unit);
    label = `${input.targetWidth}×${input.targetHeight} ${unit}`;
  } else {
    throw new Error("Provide either a print preset or both targetWidth and targetHeight.");
  }

  // Match landscape/portrait orientation automatically unless disabled.
  const autoOrient = input.autoOrient ?? true;
  if (autoOrient) {
    const imageIsLandscape = widthPx > heightPx;
    const printIsLandscape = printW > printH;
    if (widthPx !== heightPx && imageIsLandscape !== printIsLandscape) {
      [printW, printH] = [printH, printW];
    }
  }

  const requiredWidthPx = Math.ceil(printW * targetDpi);
  const requiredHeightPx = Math.ceil(printH * targetDpi);

  const dpiH = widthPx / printW;
  const dpiV = heightPx / printH;
  const limitingDpi = Math.min(dpiH, dpiV);

  const scaleX = requiredWidthPx / widthPx;
  const scaleY = requiredHeightPx / heightPx;
  const requiredScaleFactor = Math.max(1, Math.max(scaleX, scaleY));
  const recommendedIntegerScale =
    requiredScaleFactor <= 1 ? 1 : requiredScaleFactor <= 2 ? 2 : requiredScaleFactor <= 4 ? 4 : Math.ceil(requiredScaleFactor);

  const srcRatio = widthPx / heightPx;
  const dstRatio = printW / printH;
  const aspectRatioMismatchPercent = round(
    (Math.abs(srcRatio - dstRatio) / Math.max(srcRatio, dstRatio)) * 100,
    1
  );

  const cropWarning =
    aspectRatioMismatchPercent > 3
      ? `Source aspect ratio (${round(srcRatio, 2)}) differs from print aspect ratio (${round(dstRatio, 2)}) by ${aspectRatioMismatchPercent}%. Expect edge cropping or borders.`
      : null;

  let qualityTier: CalculatePrintSizeResult["qualityTier"];
  let recommendation: string;

  if (limitingDpi >= targetDpi * 0.95) {
    qualityTier = "excellent";
    recommendation = `Ready to print at ${targetDpi} DPI without upscaling (effective ${round(limitingDpi, 0)} DPI).`;
  } else if (limitingDpi >= targetDpi * 0.65) {
    qualityTier = "acceptable";
    recommendation = `Usable for normal viewing distance (${round(limitingDpi, 0)} DPI). A 2x upscale to ${requiredWidthPx}×${requiredHeightPx} px will maximize sharpness.`;
  } else if (requiredScaleFactor <= 4) {
    qualityTier = "upscale_recommended";
    recommendation = `Effective DPI is ${round(limitingDpi, 0)} (below ${targetDpi} DPI). Upscale by ~${round(requiredScaleFactor, 2)}x (target ${requiredWidthPx}×${requiredHeightPx} px) using an AI photo upscaler (or integer nearest-neighbor scaling for pixel art).`;
  } else {
    qualityTier = "too_small";
    recommendation = `Effective DPI is very low (${round(limitingDpi, 0)} DPI; needs ${round(requiredScaleFactor, 2)}x). Consider a smaller print size or a 4x AI upscaler followed by print-distance viewing.`;
  }

  return {
    source: {
      widthPx,
      heightPx,
      aspectRatio: round(srcRatio, 3),
    },
    targetPrint: {
      label,
      widthInches: round(printW, 2),
      heightInches: round(printH, 2),
      widthCm: round(printW * 2.54, 2),
      heightCm: round(printH * 2.54, 2),
      targetDpi,
      requiredWidthPx,
      requiredHeightPx,
    },
    effectiveDpi: {
      horizontal: round(dpiH, 1),
      vertical: round(dpiV, 1),
      limiting: round(limitingDpi, 1),
    },
    scaling: {
      requiredScaleFactor: round(requiredScaleFactor, 2),
      recommendedIntegerScale,
      needsUpscaling: limitingDpi < targetDpi * 0.95,
      aspectRatioMismatchPercent,
      cropWarning,
    },
    qualityTier,
    recommendation,
  };
}
