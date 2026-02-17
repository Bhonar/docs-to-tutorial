import axios from 'axios';
import { chromium } from 'playwright';
import { extractColorsFromScreenshot } from '../utils/color-extraction.js';
import { takeScreenshot } from '../utils/screenshot.js';
import {
  extractLogoFromCloud,
  downloadLogoToPublic,
  detectTheme,
  inferIndustry,
  rgbaToHex,
  darkenHex,
  BrandColors,
} from '../utils/branding.js';
import { getImagesDir } from '../utils/paths.js';
import fs from 'fs/promises';
import path from 'path';

interface ScreenshotInfo {
  viewport: 'hero' | 'mid-page' | 'mobile';
  staticPath: string;
  width: number;
  height: number;
}

interface ExtractedContent {
  content: {
    title: string;
    description: string;
    features: string[];
    heroImage: string;
    sections: Array<{ heading: string; text: string }>;
  };
  branding: {
    logo: { url: string; staticPath?: string; base64?: string; quality?: 'high' | 'medium' | 'favicon' };
    colors: BrandColors;
    font: string;
    theme: 'light' | 'dark';
  };
  metadata: {
    industry: string;
    domain: string;
  };
  screenshots: ScreenshotInfo[];
  warnings: string[];
  extractionMethod: 'tabstack' | 'playwright-fallback' | 'placeholder-fallback';
}

export async function extractUrlContent(url: string, remotionProjectPath?: string): Promise<ExtractedContent> {
  console.error(`Extracting content from: ${url}`);

  const domain = new URL(url).hostname;
  const warnings: string[] = [];
  let extractionMethod: ExtractedContent['extractionMethod'] = 'tabstack';

  // Strategy 1: Try Tabstack API for content
  let content: ExtractedContent['content'] | null = null;
  try {
    content = await extractWithTabstack(url);
    console.error('✓ Content extracted with Tabstack');
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('✗ Tabstack failed:', msg);
    warnings.push(`Tabstack content extraction failed: ${msg}`);
  }

  // Strategy 2: Try cloud logo APIs + color extraction for branding
  let branding: ExtractedContent['branding'] | null = null;
  try {
    branding = await extractBrandingSimple(url, warnings);
    console.error('✓ Branding extracted with cloud APIs');
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('✗ Cloud branding extraction failed:', msg);
    warnings.push(`Cloud branding extraction failed: ${msg}`);
  }

  // Use a SINGLE Playwright session for everything we still need:
  // content fallback, CSS color improvement, and screenshots
  let screenshots: ScreenshotInfo[] = [];

  const needContent = !content;
  const needBranding = !branding;
  const alwaysWantScreenshots = true;
  const alwaysWantCssColors = !!branding; // Improve existing branding colors

  if (needContent || needBranding || alwaysWantScreenshots || alwaysWantCssColors) {
    const playwrightResult = await extractWithPlaywright(url, warnings, remotionProjectPath);
    screenshots = playwrightResult.screenshots;

    if (needContent) {
      if (playwrightResult.content) {
        content = playwrightResult.content;
        extractionMethod = 'playwright-fallback';
        warnings.push('Content extracted via Playwright (title, meta tags, headings). May be less detailed than Tabstack.');
      } else {
        content = createPlaceholderContent(url);
        extractionMethod = 'placeholder-fallback';
        warnings.push('PLACEHOLDER CONTENT: Title, description, and features are generic text. Agent MUST rewrite these.');
      }
    }

    if (needBranding) {
      const screenshot = await takeScreenshot(url);
      const colors = await extractColorsFromScreenshot(screenshot);

      if (playwrightResult.cssColors) {
        if (playwrightResult.cssColors.primary) {
          colors.primary = playwrightResult.cssColors.primary;
          colors.secondary = darkenHex(playwrightResult.cssColors.primary, 0.6);
        }
        if (playwrightResult.cssColors.accent) {
          colors.accent = playwrightResult.cssColors.accent;
        }
      }

      branding = {
        logo: { url: `https://www.google.com/s2/favicons?domain=${domain}&sz=256`, quality: 'favicon' },
        colors,
        font: 'system-ui, sans-serif',
        theme: detectTheme(colors),
      };
      warnings.push('Colors extracted from screenshot/CSS analysis. Logo is a low-res favicon fallback.');
    } else if (branding && playwrightResult.cssColors) {
      // Improve existing branding with CSS-extracted colors
      const oldPrimary = branding.colors.primary;
      if (playwrightResult.cssColors.primary) {
        branding.colors.primary = playwrightResult.cssColors.primary;
        branding.colors.secondary = darkenHex(playwrightResult.cssColors.primary, 0.6);
      }
      if (playwrightResult.cssColors.accent) {
        branding.colors.accent = playwrightResult.cssColors.accent;
      }
      if (oldPrimary !== branding.colors.primary) {
        console.error(`✓ Colors improved via CSS: ${oldPrimary} → ${branding.colors.primary}`);
      }
    }
  }

  // Infer industry from content
  const industry = inferIndustry(content!.title, content!.description);

  // Download logo
  const logoStaticPath = await downloadLogoToPublic(branding!.logo.url, domain, remotionProjectPath);
  if (logoStaticPath) {
    branding!.logo.staticPath = logoStaticPath;
  } else {
    warnings.push('Logo download failed. Use branding.logo.url as fallback in Generated.tsx.');
  }

  return {
    content: content!,
    branding: branding!,
    metadata: { industry, domain },
    screenshots,
    warnings,
    extractionMethod,
  };
}

// --- Tabstack extraction ---

async function extractWithTabstack(url: string): Promise<ExtractedContent['content']> {
  const apiKey = process.env.TABSTACK_API_KEY;
  if (!apiKey) {
    throw new Error('TABSTACK_API_KEY not set');
  }

  const response = await axios.post(
    'https://api.tabstack.ai/v1/extract/json',
    {
      url,
      json_schema: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'The main title or product name' },
          description: { type: 'string', description: 'A brief description or value proposition' },
          features: {
            type: 'array',
            description: '3-5 key features or benefits',
            items: { type: 'string' },
          },
          heroImage: { type: 'string', description: 'URL of the main hero or banner image' },
          sections: {
            type: 'array',
            description: 'Main content sections',
            items: {
              type: 'object',
              properties: {
                heading: { type: 'string' },
                text: { type: 'string' },
              },
            },
          },
        },
        required: ['title', 'description', 'features'],
      },
    },
    {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    }
  );

  const data = response.data;

  // Validate Tabstack response structure
  if (!data || typeof data !== 'object') {
    throw new Error(`Unexpected Tabstack response: expected object, got ${typeof data}`);
  }

  return {
    title: data.title || 'Untitled',
    description: data.description || '',
    features: Array.isArray(data.features) ? data.features : [],
    heroImage: data.heroImage || '',
    sections: Array.isArray(data.sections) ? data.sections : [],
  };
}

// --- Playwright-based extraction (content + CSS colors + screenshots in ONE session) ---

interface PlaywrightResult {
  content: ExtractedContent['content'] | null;
  cssColors: { primary: string | null; accent: string | null } | null;
  screenshots: ScreenshotInfo[];
}

async function extractWithPlaywright(url: string, warnings: string[], remotionProjectPath?: string): Promise<PlaywrightResult> {
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });

    // --- Extract content ---
    const title = await page.title();
    const h1Text = await page.$eval('h1', (el) => el.textContent?.trim() || '').catch(() => '');
    const metaDesc = await page.$eval('meta[name="description"]', (el) => el.getAttribute('content') || '').catch(() => '');
    const ogDesc = await page.$eval('meta[property="og:description"]', (el) => el.getAttribute('content') || '').catch(() => '');

    const listItems = await page.$$eval('ul li, ol li', (items) =>
      items.slice(0, 8).map((item) => item.textContent?.trim() || '').filter(t => t.length > 5 && t.length < 120)
    ).catch(() => [] as string[]);

    const headings = await page.$$eval('h2, h3', (els) =>
      els.slice(0, 6).map((el) => ({
        heading: el.textContent?.trim() || '',
        text: '',
      })).filter(s => s.heading.length > 2 && s.heading.length < 100)
    ).catch(() => [] as Array<{ heading: string; text: string }>);

    let content: ExtractedContent['content'] | null = null;
    const finalTitle = h1Text || title;
    const finalDesc = metaDesc || ogDesc || '';

    if (finalTitle && finalTitle.length > 1) {
      content = {
        title: finalTitle,
        description: finalDesc || `${finalTitle} — visit ${new URL(url).hostname} for more details`,
        features: listItems.length >= 2 ? listItems.slice(0, 5) : [],
        heroImage: '',
        sections: headings,
      };

      if (!finalDesc) warnings.push('No meta description found on page.');
      if (listItems.length < 2) warnings.push('No feature list found on page. Agent should write features.');
    }

    // --- Extract CSS colors ---
    const cssColors = await page.evaluate(() => {
      const root = document.documentElement;
      const styles = getComputedStyle(root);

      const tryProps = (names: string[]) => {
        for (const name of names) {
          const val = styles.getPropertyValue(name).trim();
          if (val && val !== '') return val;
        }
        return null;
      };

      const primary = tryProps([
        '--primary', '--primary-color', '--brand-color', '--color-primary',
        '--theme-primary', '--main-color',
      ]);
      const accent = tryProps([
        '--accent', '--accent-color', '--color-accent', '--secondary',
        '--secondary-color', '--theme-accent',
      ]);

      let buttonBg: string | null = null;
      const buttons = document.querySelectorAll('button, a.btn, [class*="button"], [class*="btn"], [class*="cta"]');
      for (const btn of Array.from(buttons).slice(0, 10)) {
        const bg = getComputedStyle(btn).backgroundColor;
        if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent' && bg !== 'rgb(255, 255, 255)') {
          buttonBg = bg;
          break;
        }
      }

      let linkColor: string | null = null;
      const links = document.querySelectorAll('a');
      for (const link of Array.from(links).slice(0, 10)) {
        const color = getComputedStyle(link).color;
        if (color && color !== 'rgb(0, 0, 0)' && color !== 'rgb(255, 255, 255)') {
          linkColor = color;
          break;
        }
      }

      return { primary, accent, buttonBg, linkColor };
    }).catch(() => ({ primary: null, accent: null, buttonBg: null, linkColor: null }));

    let resolvedPrimary: string | null = null;
    let resolvedAccent: string | null = null;

    if (cssColors.primary) resolvedPrimary = rgbaToHex(cssColors.primary);
    else if (cssColors.buttonBg) resolvedPrimary = rgbaToHex(cssColors.buttonBg);
    else if (cssColors.linkColor) resolvedPrimary = rgbaToHex(cssColors.linkColor);

    if (cssColors.accent) resolvedAccent = rgbaToHex(cssColors.accent);

    const colorResult = (resolvedPrimary || resolvedAccent)
      ? { primary: resolvedPrimary, accent: resolvedAccent }
      : null;

    // --- Capture multi-viewport screenshots ---
    const screenshots: ScreenshotInfo[] = [];
    const domainClean = new URL(url).hostname.replace('www.', '').replace(/[^a-z0-9.-]/g, '');
    const publicImagesDir = getImagesDir(remotionProjectPath);
    await fs.mkdir(publicImagesDir, { recursive: true });

    try {
      // Hero screenshot (above the fold, 1920x1080)
      const heroBuffer = await page.screenshot({ type: 'png' });
      const heroFile = `screenshot-${domainClean}-hero.png`;
      await fs.writeFile(path.join(publicImagesDir, heroFile), heroBuffer);
      screenshots.push({ viewport: 'hero', staticPath: `images/${heroFile}`, width: 1920, height: 1080 });

      // Mid-page screenshot (scroll down)
      await page.evaluate(() => window.scrollTo(0, 1000));
      await page.waitForTimeout(500);
      const midBuffer = await page.screenshot({ type: 'png' });
      const midFile = `screenshot-${domainClean}-mid.png`;
      await fs.writeFile(path.join(publicImagesDir, midFile), midBuffer);
      screenshots.push({ viewport: 'mid-page', staticPath: `images/${midFile}`, width: 1920, height: 1080 });

      // Mobile screenshot (resize viewport)
      await page.setViewportSize({ width: 390, height: 844 });
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(500);
      const mobileBuffer = await page.screenshot({ type: 'png' });
      const mobileFile = `screenshot-${domainClean}-mobile.png`;
      await fs.writeFile(path.join(publicImagesDir, mobileFile), mobileBuffer);
      screenshots.push({ viewport: 'mobile', staticPath: `images/${mobileFile}`, width: 390, height: 844 });
    } catch (screenshotError) {
      const msg = screenshotError instanceof Error ? screenshotError.message : String(screenshotError);
      warnings.push(`Screenshot capture partially failed: ${msg}`);
    }

    return { content, cssColors: colorResult, screenshots };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    warnings.push(`Playwright extraction failed: ${msg}`);
    return { content: null, cssColors: null, screenshots: [] };
  } finally {
    await browser?.close();
  }
}

// --- Branding extraction (cloud APIs + screenshot) ---

async function extractBrandingSimple(url: string, warnings: string[]): Promise<ExtractedContent['branding']> {
  const domain = new URL(url).hostname.replace('www.', '');

  const logoResult = await extractLogoFromCloud(domain, url, warnings);
  const screenshot = await takeScreenshot(url);
  const colors = await extractColorsFromScreenshot(screenshot);

  return {
    logo: { url: logoResult.url, quality: logoResult.quality },
    colors,
    font: 'system-ui, -apple-system, sans-serif',
    theme: detectTheme(colors),
  };
}

// --- Placeholder content (last resort) ---

function createPlaceholderContent(url: string): ExtractedContent['content'] {
  const domain = new URL(url).hostname.replace('www.', '').split('.')[0];

  return {
    title: domain.charAt(0).toUpperCase() + domain.slice(1),
    description: `Discover ${domain} - Your solution for better productivity`,
    features: ['Easy to use', 'Fast performance', 'Reliable support'],
    heroImage: '',
    sections: [],
  };
}
