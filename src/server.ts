import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { PRINT_PRESETS } from "./types.js";
import { inspectImage } from "./tools/inspect.js";
import { calculatePrintSize } from "./tools/print-size.js";
import { diagnoseImageQuality } from "./tools/diagnose.js";
import { upscalePixelArt } from "./tools/pixel-art.js";
import { prepareForWeb } from "./tools/web-export.js";

export const SERVER_NAME = "enhancephoto-mcp";
export const SERVER_VERSION = "0.1.0";

function toToolResponse(data: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

function toErrorResponse(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return {
    isError: true,
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({ error: message }, null, 2),
      },
    ],
  };
}

export function createServer(): McpServer {
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

  server.tool(
    "inspect_image",
    "Read local image dimensions, format, aspect ratio, DPI, color space, alpha channel, file size, and EXIF camera metadata.",
    {
      imagePath: z.string().min(1).describe("Absolute or relative path to the local image file."),
    },
    async ({ imagePath }) => {
      try {
        const result = await inspectImage(imagePath);
        return toToolResponse(result);
      } catch (err) {
        return toErrorResponse(err);
      }
    }
  );

  server.tool(
    "calculate_print_size",
    `Calculate target pixel dimensions, effective DPI, required upscale factor, and aspect-ratio crop warnings for a target print size. Supported presets: ${Object.keys(PRINT_PRESETS).join(", ")}.`,
    {
      imagePath: z.string().optional().describe("Path to a local image (auto-reads width & height)."),
      pixelWidth: z.number().int().positive().optional().describe("Image width in pixels (if imagePath is omitted)."),
      pixelHeight: z.number().int().positive().optional().describe("Image height in pixels (if imagePath is omitted)."),
      preset: z
        .enum(["4x6", "5x7", "8x10", "11x14", "16x20", "poster-24x36", "A5", "A4", "A3", "A2"])
        .optional()
        .describe("Standard print size preset."),
      targetWidth: z.number().positive().optional().describe("Custom print width (used when preset is omitted)."),
      targetHeight: z.number().positive().optional().describe("Custom print height (used when preset is omitted)."),
      unit: z.enum(["in", "cm", "mm"]).optional().default("in").describe("Unit for custom print dimensions."),
      targetDpi: z.number().min(72).max(1200).optional().default(300).describe("Target print DPI (default 300)."),
      autoOrient: z.boolean().optional().default(true).describe("Match print orientation to image orientation."),
    },
    async (args) => {
      try {
        const result = await calculatePrintSize(args);
        return toToolResponse(result);
      } catch (err) {
        return toErrorResponse(err);
      }
    }
  );

  server.tool(
    "diagnose_image_quality",
    "Run local sharpness (Laplacian variance), resolution, JPEG compression density, exposure, and pixel-art detection to decide whether upscaling, deblurring, or nearest-neighbor scaling is needed.",
    {
      imagePath: z.string().min(1).describe("Path to the local image file."),
      targetUseCase: z
        .enum(["web", "hd", "4k", "print_8x10"])
        .optional()
        .default("hd")
        .describe("Intended target use case for resolution threshold checks."),
    },
    async (args) => {
      try {
        const result = await diagnoseImageQuality(args);
        return toToolResponse(result);
      } catch (err) {
        return toErrorResponse(err);
      }
    }
  );

  server.tool(
    "upscale_pixel_art",
    "Losslessly upscale pixel art or retro sprites locally by an integer factor (2x-8x) using nearest-neighbor interpolation via sharp.",
    {
      imagePath: z.string().min(1).describe("Path to the local pixel-art image."),
      scale: z.number().int().min(2).max(8).describe("Integer upscale factor (2 to 8)."),
      outputPath: z.string().optional().describe("Optional destination path (defaults to <name>_<scale>x.<format>)."),
      format: z.enum(["png", "webp"]).optional().default("png").describe("Lossless output format."),
      overwrite: z.boolean().optional().default(false).describe("Allow overwriting an existing output file."),
    },
    async (args) => {
      try {
        const result = await upscalePixelArt(args);
        return toToolResponse(result);
      } catch (err) {
        return toErrorResponse(err);
      }
    }
  );

  server.tool(
    "prepare_for_web",
    "Resize (without enlargement), strip EXIF metadata, and convert a local image to WebP, AVIF, JPEG, or PNG with file size savings metrics.",
    {
      imagePath: z.string().min(1).describe("Path to the local source image."),
      outputPath: z.string().optional().describe("Optional output path (defaults to <name>_web.<ext>)."),
      format: z.enum(["webp", "avif", "jpeg", "png"]).optional().default("webp").describe("Target web format."),
      maxWidth: z.number().int().positive().optional().describe("Maximum output width in pixels."),
      maxHeight: z.number().int().positive().optional().describe("Maximum output height in pixels."),
      quality: z.number().int().min(1).max(100).optional().default(82).describe("Encoder quality (1-100)."),
      keepMetadata: z.boolean().optional().default(false).describe("Keep EXIF/ICC metadata instead of stripping."),
      overwrite: z.boolean().optional().default(false).describe("Allow overwriting an existing output file."),
    },
    async (args) => {
      try {
        const result = await prepareForWeb(args);
        return toToolResponse(result);
      } catch (err) {
        return toErrorResponse(err);
      }
    }
  );

  return server;
}
