# enhancephoto-mcp

A local, offline [Model Context Protocol (MCP)](https://modelcontextprotocol.io) server for image inspection, print DPI calculation, quality diagnostics, integer pixel-art upscaling, and web image optimization.

Runs 100% locally via `sharp` — no API keys, no cloud uploads, no external network calls.

## Tools

| Tool | What it does |
| --- | --- |
| `inspect_image` | Reads dimensions, megapixels, aspect ratio, format, DPI, color space, alpha channel, file size, and EXIF camera metadata. |
| `calculate_print_size` | Computes target pixel size, effective DPI, required upscale factor, and aspect-ratio crop warnings for standard presets (`4x6`, `8x10`, `A4`, `A3`, `poster-24x36`, etc.) or custom `in`/`cm`/`mm` sizes. |
| `diagnose_image_quality` | Measures Laplacian edge sharpness, resolution adequacy, JPEG compression density (`bytes/pixel`), exposure clipping, and pixel-art characteristics, then recommends the right workflow. |
| `upscale_pixel_art` | Losslessly upscales sprites and pixel art by an integer factor (`2x`–`8x`) using nearest-neighbor interpolation. |
| `prepare_for_web` | Resizes (without enlargement), strips EXIF metadata by default, and exports to WebP, AVIF, JPEG, or PNG with byte-savings stats. |

> **When you need AI upscaling or deblurring:** Local math can scale pixel art cleanly, inspect DPI, and flag blur, while photographic 2x–4x detail recovery requires a neural model. For browser-based AI photo upscaling or restoration after diagnosis, you can use [EnhancePhoto](https://enhancephoto.org).

## Quick Start

### Option 1: Install MCPB Bundle (Claude Desktop)

Download `enhancephoto-mcp-0.1.0.mcpb` from [GitHub Releases](https://github.com/yangjwlove-dev/enhancephoto-mcp/releases/tag/v0.1.0) and open it with Claude Desktop (or any MCPB-compatible MCP client).

### Option 2: Run from Source (Claude Desktop / Cursor / Windsurf)

Clone and build locally:

```bash
git clone https://github.com/yangjwlove-dev/enhancephoto-mcp.git
cd enhancephoto-mcp
pnpm install
pnpm build
```

Then add to your MCP client configuration (for example `claude_desktop_config.json` or `.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "enhancephoto-mcp": {
      "command": "node",
      "args": ["/absolute/path/to/enhancephoto-mcp/dist/cli.js"]
    }
  }
}
```

> *Note: `npx` / npm registry installation is planned for an upcoming release.*

### Example Prompts

- *"Inspect `./photo.jpg` and tell me if it can be printed at 8×10 inches at 300 DPI."*
- *"Diagnose `./scan.jpg` for 4K use — is it blurry or heavily compressed?"*
- *"Upscale `./hero-sprite.png` by 4x without blurring the pixel edges."*
- *"Convert `./banner.png` to WebP with max width 1600px and strip EXIF."*

## Local Development

```bash
pnpm install
pnpm build
pnpm test
```

Test over stdio directly with MCP Inspector:

```bash
npx @modelcontextprotocol/inspector node dist/cli.js
```

## Privacy & Security

- All image reads and writes happen strictly on your local filesystem.
- Zero outbound HTTP requests, zero telemetry, zero API credentials required.
- Built by the team behind [EnhancePhoto](https://enhancephoto.org).

## License

[MIT](./LICENSE)
