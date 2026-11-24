export type PrintUnit = "in" | "cm" | "mm";

export interface PrintPresetSpec {
  label: string;
  widthInches: number;
  heightInches: number;
}

export const PRINT_PRESETS: Record<string, PrintPresetSpec> = {
  "4x6": { label: "4×6 in (Standard Photo)", widthInches: 4, heightInches: 6 },
  "5x7": { label: "5×7 in (Portrait Frame)", widthInches: 5, heightInches: 7 },
  "8x10": { label: "8×10 in (Wall Frame)", widthInches: 8, heightInches: 10 },
  "11x14": { label: "11×14 in (Large Frame)", widthInches: 11, heightInches: 14 },
  "16x20": { label: "16×20 in (Gallery Print)", widthInches: 16, heightInches: 20 },
  "poster-24x36": { label: "24×36 in (Poster)", widthInches: 24, heightInches: 36 },
  "A5": { label: "A5 (148×210 mm)", widthInches: 148 / 25.4, heightInches: 210 / 25.4 },
  "A4": { label: "A4 (210×297 mm)", widthInches: 210 / 25.4, heightInches: 297 / 25.4 },
  "A3": { label: "A3 (297×420 mm)", widthInches: 297 / 25.4, heightInches: 420 / 25.4 },
  "A2": { label: "A2 (420×594 mm)", widthInches: 420 / 25.4, heightInches: 594 / 25.4 },
};

export function toInches(value: number, unit: PrintUnit): number {
  if (unit === "in") return value;
  if (unit === "cm") return value / 2.54;
  return value / 25.4;
}

export function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function gcd(a: number, b: number): number {
  let x = Math.abs(Math.round(a));
  let y = Math.abs(Math.round(b));
  while (y !== 0) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x || 1;
}
