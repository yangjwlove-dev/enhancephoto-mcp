import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  calculatePrintSize,
  diagnoseImageQuality,
  inspectImage,
  prepareForWeb,
  upscalePixelArt,
} from "../src/index.js";

let tmpDir: string;
let sharpPhotoPath: string;
let blurryPhotoPath: string;
let pixelArtPath: string;

beforeAll(async () => {
  tmpDir = await mkdtemp(path.join(os.tmpdir(), "enhancephoto-mcp-test-"));

  // 1. High-res sharp checkerboard image (2400x1600 JPEG, 300 DPI)
  const w = 2400;
  const h = 1600;
  const sharpBuf = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const cell = ((x >> 4) + (y >> 4)) & 1;
      const v = cell ? 230 : 25;
      const idx = (y * w + x) * 3;
      sharpBuf[idx] = v;
      sharpBuf[idx + 1] = v;
      sharpBuf[idx + 2] = v;
    }
  }
  sharpPhotoPath = path.join(tmpDir, "sharp_photo.jpg");
  await sharp(sharpBuf, { raw: { width: w, height: h, channels: 3 } })
    .withMetadata({ density: 300 })
    .jpeg({ quality: 92 })
    .toFile(sharpPhotoPath);

  // 2. Low-res blurry image (640x480 heavily blurred JPEG)
  const bw = 640;
  const bh = 480;
  const blurBuf = Buffer.alloc(bw * bh * 3);
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      const idx = (y * bw + x) * 3;
      const v = Math.round(120 + 15 * Math.sin(x / 40) * Math.cos(y / 40));
      blurBuf[idx] = v;
      blurBuf[idx + 1] = v;
      blurBuf[idx + 2] = v;
    }
  }
  blurryPhotoPath = path.join(tmpDir, "blurry_lowres.jpg");
  await sharp(blurBuf, { raw: { width: bw, height: bh, channels: 3 } })
    .blur(8)
    .jpeg({ quality: 55 })
    .toFile(blurryPhotoPath);

  // 3. 16x16 4-color pixel art sprite (PNG)
  const pw = 16;
  const ph = 16;
  const pxBuf = Buffer.alloc(pw * ph * 4);
  const palette: [number, number, number, number][] = [
    [0, 0, 0, 0],
    [32, 32, 48, 255],
    [240, 80, 60, 255],
    [255, 220, 90, 255],
  ];
  for (let y = 0; y < ph; y++) {
    for (let x = 0; x < pw; x++) {
      const idx = (y * pw + x) * 4;
      const color = palette[(x + y) % palette.length];
      pxBuf[idx] = color[0];
      pxBuf[idx + 1] = color[1];
      pxBuf[idx + 2] = color[2];
      pxBuf[idx + 3] = color[3];
    }
  }
  pixelArtPath = path.join(tmpDir, "sprite.png");
  await sharp(pxBuf, { raw: { width: pw, height: ph, channels: 4 } })
    .png()
    .toFile(pixelArtPath);
});

afterAll(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe("enhancephoto-mcp tools", () => {
  it("inspect_image returns accurate metadata", async () => {
    const info = await inspectImage(sharpPhotoPath);
    expect(info.width).toBe(2400);
    expect(info.height).toBe(1600);
    expect(info.format).toBe("jpeg");
    expect(info.dpi).toBe(300);
    expect(info.aspectRatio).toBe("3:2");
    expect(info.orientation).toBe("landscape");
  });

  it("calculate_print_size detects ready-to-print vs upscale-needed", async () => {
    const ok = await calculatePrintSize({
      imagePath: sharpPhotoPath,
      preset: "4x6",
      targetDpi: 300,
    });
    expect(ok.qualityTier).toBe("excellent");
    expect(ok.scaling.needsUpscaling).toBe(false);

    const needsUp = await calculatePrintSize({
      imagePath: blurryPhotoPath,
      preset: "8x10",
      targetDpi: 300,
    });
    expect(needsUp.scaling.needsUpscaling).toBe(true);
    expect(needsUp.targetPrint.requiredWidthPx).toBe(3000);
    expect(needsUp.targetPrint.requiredHeightPx).toBe(2400);
    expect(needsUp.scaling.requiredScaleFactor).toBeGreaterThan(4);
  });

  it("diagnose_image_quality flags blurry low-res and detects pixel art", async () => {
    const blurry = await diagnoseImageQuality({
      imagePath: blurryPhotoPath,
      targetUseCase: "hd",
    });
    expect(blurry.needsUpscaling).toBe(true);
    expect(blurry.needsDeblur).toBe(true);
    expect(blurry.suggestedWorkflow).toBe("ai_deblur_and_upscale");

    const sprite = await diagnoseImageQuality({
      imagePath: pixelArtPath,
      targetUseCase: "web",
    });
    expect(sprite.metrics.likelyPixelArt).toBe(true);
    expect(sprite.suggestedWorkflow).toBe("integer_nearest_upscale");
  });

  it("upscale_pixel_art scales cleanly with nearest-neighbor", async () => {
    const outPath = path.join(tmpDir, "sprite_4x.png");
    const res = await upscalePixelArt({
      imagePath: pixelArtPath,
      scale: 4,
      outputPath: outPath,
    });
    expect(res.outputDimensions).toEqual({ width: 64, height: 64 });
    const outMeta = await inspectImage(outPath);
    expect(outMeta.width).toBe(64);
    expect(outMeta.height).toBe(64);
    expect(outMeta.hasAlpha).toBe(true);
  });

  it("prepare_for_web resizes and converts PNG to smaller WebP", async () => {
    const bigPngPath = path.join(tmpDir, "source_photo.png");
    const pw = 1600;
    const ph = 1200;
    const buf = Buffer.alloc(pw * ph * 3);
    for (let y = 0; y < ph; y++) {
      for (let x = 0; x < pw; x++) {
        const idx = (y * pw + x) * 3;
        buf[idx] = (x * 7 + y * 3) & 255;
        buf[idx + 1] = (x * 5 + y * 11) & 255;
        buf[idx + 2] = (x * 13 + y * 2) & 255;
      }
    }
    await sharp(buf, { raw: { width: pw, height: ph, channels: 3 } })
      .png({ compressionLevel: 1 })
      .toFile(bigPngPath);

    const outPath = path.join(tmpDir, "web_out.webp");
    const res = await prepareForWeb({
      imagePath: bigPngPath,
      outputPath: outPath,
      format: "webp",
      maxWidth: 1200,
      quality: 80,
    });
    expect(res.outputDimensions).toEqual({ width: 1200, height: 900 });
    expect(res.outputSizeBytes).toBeGreaterThan(0);
    expect(res.outputSizeBytes).toBeLessThan(res.inputSizeBytes);
    expect(res.savingsPercent).toBeGreaterThan(50);
  });
});
