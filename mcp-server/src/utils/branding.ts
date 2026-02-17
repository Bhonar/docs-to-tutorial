import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';
import { extractColorsFromScreenshot } from './color-extraction.js';
import { takeScreenshot } from './screenshot.js';
import { getImagesDir } from './paths.js';

export interface BrandColors {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
}

export interface BrandingResult {
  logo: { url: string; staticPath?: string; quality?: 'high' | 'medium' | 'favicon' };
  colors: BrandColors;
  font: string;
  theme: 'light' | 'dark';
}

/**
 * Extract branding (logo + colors) from a URL using cloud APIs + screenshot analysis
 */
export async function extractBranding(url: string, warnings: string[]): Promise<BrandingResult> {
  const domain = new URL(url).hostname.replace('www.', '');

  // Get logo from cloud services
  const logoResult = await extractLogoFromCloud(domain, url, warnings);

  // Extract colors from screenshot
  const screenshot = await takeScreenshot(url);
  const colors = await extractColorsFromScreenshot(screenshot);

  return {
    logo: {
      url: logoResult.url,
      quality: logoResult.quality,
    },
    colors,
    font: 'system-ui, -apple-system, sans-serif',
    theme: detectTheme(colors),
  };
}

/**
 * Try cloud logo APIs in priority order: Clearbit → common paths → Google Favicon
 */
export async function extractLogoFromCloud(
  domain: string,
  fullUrl: string,
  warnings: string[],
): Promise<{ url: string; quality: 'high' | 'medium' | 'favicon' }> {
  console.error(`Extracting logo for: ${domain}`);

  // Strategy 1: Clearbit Logo API (free, high quality)
  try {
    const clearbitUrl = `https://logo.clearbit.com/${domain}`;
    const response = await axios.head(clearbitUrl, { timeout: 5000 });
    if (response.status === 200) {
      console.error('✓ Logo found via Clearbit');
      return { url: clearbitUrl, quality: 'high' };
    }
  } catch {
    console.error('Clearbit failed, trying next method...');
  }

  // Strategy 2: Try common logo paths
  const origin = new URL(fullUrl).origin;
  const commonPaths = [
    `${origin}/logo.svg`,
    `${origin}/logo.png`,
    `${origin}/assets/logo.svg`,
    `${origin}/assets/logo.png`,
    `${origin}/images/logo.svg`,
    `${origin}/images/logo.png`,
  ];

  for (const logoPath of commonPaths) {
    try {
      const response = await axios.head(logoPath, { timeout: 3000 });
      if (response.status === 200) {
        console.error(`✓ Logo found at: ${logoPath}`);
        return { url: logoPath, quality: 'medium' };
      }
    } catch {}
  }

  // Strategy 3: Google Favicon Service (always works, fallback)
  const faviconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=256`;
  console.error('✓ Using Google Favicon as fallback');
  warnings.push(`No high-quality logo found for ${domain}. Using Google favicon (256px).`);
  return { url: faviconUrl, quality: 'favicon' };
}

/**
 * Download a logo to remotion/public/images/ for staticFile() access
 */
export async function downloadLogoToPublic(logoUrl: string, domain: string, remotionProjectPath?: string): Promise<string> {
  if (!logoUrl) return '';

  try {
    const response = await axios.get(logoUrl, { responseType: 'arraybuffer', timeout: 10000 });
    const buffer = Buffer.from(response.data);

    // Determine extension from content-type or URL
    const contentType = (response.headers['content-type'] as string) || '';
    let ext = 'png';
    if (contentType.includes('svg')) ext = 'svg';
    else if (contentType.includes('jpeg') || contentType.includes('jpg')) ext = 'jpg';
    else if (logoUrl.endsWith('.svg')) ext = 'svg';
    else if (logoUrl.endsWith('.jpg') || logoUrl.endsWith('.jpeg')) ext = 'jpg';

    const publicImagesDir = getImagesDir(remotionProjectPath);
    await fs.mkdir(publicImagesDir, { recursive: true });

    const cleanDomain = domain.replace('www.', '').replace(/[^a-z0-9.-]/g, '');
    const fileName = `logo-${cleanDomain}.${ext}`;
    const filePath = path.join(publicImagesDir, fileName);

    await fs.writeFile(filePath, buffer);
    console.error(`✓ Downloaded logo to: ${filePath} (staticPath: images/${fileName})`);

    return `images/${fileName}`;
  } catch (error) {
    console.error('Failed to download logo:', error instanceof Error ? error.message : String(error));
    return '';
  }
}

/**
 * Detect theme (light or dark) based on background color luminance.
 */
export function detectTheme(colors: BrandColors): 'light' | 'dark' {
  const bgColor = colors.background;
  if (!bgColor || !bgColor.startsWith('#') || bgColor.length < 7) {
    return 'light';
  }
  const rgb = parseInt(bgColor.slice(1), 16);
  if (isNaN(rgb)) return 'light';
  const r = (rgb >> 16) & 0xff;
  const g = (rgb >> 8) & 0xff;
  const b = (rgb >> 0) & 0xff;
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
  return luminance > 128 ? 'light' : 'dark';
}

/**
 * Convert any CSS color string to hex.
 * Handles: #hex, rgb(), rgba(), hsl(), hsla(), named colors, oklch(), etc.
 */
export function rgbaToHex(color: string): string {
  if (!color || typeof color !== 'string') return '#0066FF';

  const trimmed = color.trim();

  // Already hex
  if (trimmed.startsWith('#')) {
    // Normalize shorthand #RGB → #RRGGBB
    if (trimmed.length === 4) {
      const [, r, g, b] = trimmed;
      return `#${r}${r}${g}${g}${b}${b}`;
    }
    return trimmed.slice(0, 7); // Strip alpha if #RRGGBBAA
  }

  // rgb(r, g, b) or rgba(r, g, b, a)
  const rgbMatch = trimmed.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (rgbMatch) {
    const [, r, g, b] = rgbMatch;
    return '#' + [r, g, b].map(c => parseInt(c).toString(16).padStart(2, '0')).join('');
  }

  // hsl(h, s%, l%) or hsla(h, s%, l%, a)
  const hslMatch = trimmed.match(/hsla?\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%/);
  if (hslMatch) {
    const h = parseFloat(hslMatch[1]) / 360;
    const s = parseFloat(hslMatch[2]) / 100;
    const l = parseFloat(hslMatch[3]) / 100;
    return hslToHex(h, s, l);
  }

  // Named CSS colors (common ones used in design systems)
  const namedColors: Record<string, string> = {
    'white': '#FFFFFF', 'black': '#000000', 'red': '#FF0000', 'green': '#008000',
    'blue': '#0000FF', 'yellow': '#FFFF00', 'cyan': '#00FFFF', 'magenta': '#FF00FF',
    'orange': '#FFA500', 'purple': '#800080', 'pink': '#FFC0CB', 'gray': '#808080',
    'grey': '#808080', 'navy': '#000080', 'teal': '#008080', 'maroon': '#800000',
    'lime': '#00FF00', 'aqua': '#00FFFF', 'silver': '#C0C0C0', 'olive': '#808000',
    'coral': '#FF7F50', 'salmon': '#FA8072', 'tomato': '#FF6347', 'gold': '#FFD700',
    'indigo': '#4B0082', 'violet': '#EE82EE', 'rebeccapurple': '#663399',
    'crimson': '#DC143C', 'darkblue': '#00008B', 'darkgreen': '#006400',
    'steelblue': '#4682B4', 'slategray': '#708090', 'dodgerblue': '#1E90FF',
    'royalblue': '#4169E1', 'midnightblue': '#191970',
  };

  const lower = trimmed.toLowerCase();
  if (namedColors[lower]) return namedColors[lower];

  // Fallback for oklch(), lab(), lch(), color() and other modern formats
  // We can't convert these reliably without a full CSS engine, so return default
  return '#0066FF';
}

function hslToHex(h: number, s: number, l: number): string {
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1/6) return p + (q - p) * 6 * t;
    if (t < 1/2) return q;
    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
    return p;
  };

  let r: number, g: number, b: number;
  if (s === 0) {
    r = g = b = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }

  return '#' + [r, g, b]
    .map(c => Math.round(c * 255).toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Darken a hex color by a factor (0-1)
 */
export function darkenHex(hex: string, factor: number): string {
  if (!hex.startsWith('#') || hex.length < 7) return '#003D99';
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return '#003D99';
  return '#' + [r, g, b].map(c => Math.round(c * factor).toString(16).padStart(2, '0')).join('');
}

/**
 * Infer industry from content text
 */
export function inferIndustry(title: string, description: string): string {
  const text = (title + ' ' + description).toLowerCase();

  const industries: Record<string, string[]> = {
    tech: ['software', 'app', 'platform', 'cloud', 'saas', 'api', 'developer', 'documentation', 'framework', 'library', 'tutorial'],
    finance: ['bank', 'payment', 'finance', 'invest', 'trading', 'crypto'],
    healthcare: ['health', 'medical', 'doctor', 'patient', 'clinic', 'hospital'],
    ecommerce: ['shop', 'store', 'buy', 'product', 'marketplace', 'retail'],
    education: ['learn', 'course', 'education', 'student', 'training', 'teach'],
    marketing: ['marketing', 'advertising', 'campaign', 'brand', 'social media'],
    gaming: ['game', 'play', 'gaming', 'esports', 'player'],
  };

  for (const [industry, keywords] of Object.entries(industries)) {
    if (keywords.some(keyword => text.includes(keyword))) {
      return industry;
    }
  }

  return 'general';
}
