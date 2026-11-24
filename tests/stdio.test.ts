import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let tmpDir: string;
let samplePng: string;
let client: Client;

beforeAll(async () => {
  tmpDir = await mkdtemp(path.join(os.tmpdir(), "enhancephoto-mcp-stdio-"));
  samplePng = path.join(tmpDir, "tiny.png");
  const buf = Buffer.alloc(32 * 32 * 3, 180);
  await sharp(buf, { raw: { width: 32, height: 32, channels: 3 } })
    .png()
    .toFile(samplePng);

  const cliPath = path.resolve(process.cwd(), "dist/cli.js");
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [cliPath],
  });
  client = new Client({ name: "test-client", version: "1.0.0" });
  await client.connect(transport);
});

afterAll(async () => {
  await client.close();
  await rm(tmpDir, { recursive: true, force: true });
});

describe("MCP stdio end-to-end", () => {
  it("lists all 5 tools and executes each over stdio", async () => {
    const listed = await client.listTools();
    const names = listed.tools.map((t) => t.name).sort();
    expect(names).toEqual([
      "calculate_print_size",
      "diagnose_image_quality",
      "inspect_image",
      "prepare_for_web",
      "upscale_pixel_art",
    ]);

    const inspectRes = await client.callTool({
      name: "inspect_image",
      arguments: { imagePath: samplePng },
    });
    const inspectJson = JSON.parse((inspectRes.content as Array<{ text: string }>)[0].text);
    expect(inspectJson.width).toBe(32);

    const printRes = await client.callTool({
      name: "calculate_print_size",
      arguments: { imagePath: samplePng, preset: "4x6", targetDpi: 300 },
    });
    const printJson = JSON.parse((printRes.content as Array<{ text: string }>)[0].text);
    expect(printJson.scaling.needsUpscaling).toBe(true);

    const diagRes = await client.callTool({
      name: "diagnose_image_quality",
      arguments: { imagePath: samplePng, targetUseCase: "web" },
    });
    const diagJson = JSON.parse((diagRes.content as Array<{ text: string }>)[0].text);
    expect(diagJson.metrics.likelyPixelArt).toBe(true);

    const upRes = await client.callTool({
      name: "upscale_pixel_art",
      arguments: { imagePath: samplePng, scale: 3 },
    });
    const upJson = JSON.parse((upRes.content as Array<{ text: string }>)[0].text);
    expect(upJson.outputDimensions).toEqual({ width: 96, height: 96 });

    const webRes = await client.callTool({
      name: "prepare_for_web",
      arguments: { imagePath: samplePng, format: "webp", quality: 80 },
    });
    const webJson = JSON.parse((webRes.content as Array<{ text: string }>)[0].text);
    expect(webJson.format).toBe("webp");
  });
});
