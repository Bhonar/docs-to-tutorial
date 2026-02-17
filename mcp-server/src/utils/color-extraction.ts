import sharp from 'sharp';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

interface ColorPalette {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
}

export async function extractColorsFromScreenshot(screenshot: Buffer): Promise<ColorPalette> {
  console.error('Extracting colors from screenshot...');

  // Save screenshot to temp file
  const tempPath = path.join(os.tmpdir(), `screenshot-${Date.now()}.png`);
  await fs.writeFile(tempPath, screenshot);

  try {
    // Use sharp to get dominant colors
    const { dominant } = await sharp(tempPath).stats();

    // Generate a basic color palette from dominant color
    const colors = generatePaletteFromDominant(dominant);

    console.error(`✓ Colors extracted: ${JSON.stringify(colors)}`);

    return colors;
  } finally {
    // Clean up temp file
    await fs.unlink(tempPath).catch(() => {});
  }
}

function generatePaletteFromDominant(dominant: { r: number; g: number; b: number }): ColorPalette {
  const toHex = (r: number, g: number, b: number) =>
    '#' + [r, g, b].map(x => {
      const hex = Math.round(x).toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    }).join('');

  const primary = toHex(dominant.r, dominant.g, dominant.b);

  // Generate darker version for secondary
  const secondary = toHex(
    dominant.r * 0.6,
    dominant.g * 0.6,
    dominant.b * 0.6
  );

  // Generate lighter version for accent
  const accent = toHex(
    Math.min(255, dominant.r * 1.4),
    Math.min(255, dominant.g * 1.4),
    Math.min(255, dominant.b * 1.4)
  );

  // Determine background based on luminance
  const luminance = 0.299 * dominant.r + 0.587 * dominant.g + 0.114 * dominant.b;
  const background = luminance > 128 ? '#FFFFFF' : '#000000';

  return { primary, secondary, accent, background };
}
