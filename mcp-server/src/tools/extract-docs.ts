import axios from 'axios';
import { chromium } from 'playwright';
import {
  extractLogoFromCloud,
  downloadLogoToPublic,
  detectTheme,
  darkenHex,
  rgbaToHex,
  BrandingResult,
} from '../utils/branding.js';
import { extractColorsFromScreenshot } from '../utils/color-extraction.js';

export interface DocsMetadata {
  title: string;
  technology: string;
  docType: 'quickstart' | 'tutorial' | 'api-reference' | 'guide' | 'conceptual' | 'how-to';
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  prerequisites: string[];
  estimatedReadTime: string;
  sections: Array<{ heading: string; type: string }>;
}

export interface DocsExtractedContent {
  markdown: string;
  metadata: DocsMetadata;
  branding: BrandingResult;
  domain: string;
  warnings: string[];
  extractionMethod: 'tabstack-markdown' | 'tabstack-json' | 'playwright-fallback';
}

export async function extractDocsContent(url: string, remotionProjectPath?: string): Promise<DocsExtractedContent> {
  console.error(`Extracting documentation from: ${url}`);

  const domain = new URL(url).hostname;
  const warnings: string[] = [];
  let extractionMethod: DocsExtractedContent['extractionMethod'] = 'tabstack-markdown';

  // Phase 1: Extract full markdown content
  let markdown = '';
  try {
    markdown = await extractMarkdownWithTabstack(url);
    console.error(`✓ Markdown extracted (${markdown.length} chars)`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('✗ Tabstack markdown failed:', msg);
    warnings.push(`Tabstack markdown extraction failed: ${msg}`);

    // Fallback: Playwright-based markdown extraction
    try {
      markdown = await extractMarkdownWithPlaywright(url, warnings);
      extractionMethod = 'playwright-fallback';
      console.error(`✓ Markdown extracted via Playwright (${markdown.length} chars)`);
    } catch (pwError) {
      const pwMsg = pwError instanceof Error ? pwError.message : String(pwError);
      warnings.push(`Playwright markdown fallback failed: ${pwMsg}`);
      markdown = `# ${domain}\n\nContent could not be extracted. Please provide the documentation content manually.`;
    }
  }

  // Phase 2: Extract structured metadata
  let metadata: DocsMetadata;
  try {
    metadata = await extractMetadataWithTabstack(url);
    console.error(`✓ Metadata extracted: ${metadata.title} (${metadata.docType}, ${metadata.difficulty})`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('✗ Tabstack metadata failed:', msg);
    warnings.push(`Tabstack metadata extraction failed: ${msg}. Using inferred metadata.`);

    // Fallback: Infer metadata from the markdown
    metadata = inferMetadataFromMarkdown(markdown, url);
  }

  // Phase 3: Extract branding in a SINGLE Playwright session (logo, screenshot colors, CSS vars)
  let branding: BrandingResult;
  try {
    branding = await extractBrandingWithCssColors(url, domain, warnings);
    console.error('✓ Branding extracted');
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    warnings.push(`Branding extraction failed: ${msg}`);
    branding = {
      logo: { url: `https://www.google.com/s2/favicons?domain=${domain}&sz=256`, quality: 'favicon' },
      colors: { primary: '#0066FF', secondary: '#003D99', accent: '#66B3FF', background: '#FFFFFF' },
      font: 'system-ui, sans-serif',
      theme: 'light',
    };
  }

  // Download logo to public/images/
  const logoStaticPath = await downloadLogoToPublic(branding.logo.url, domain, remotionProjectPath);
  if (logoStaticPath) {
    branding.logo.staticPath = logoStaticPath;
  } else {
    warnings.push('Logo download failed. Use branding.logo.url as fallback in Generated.tsx.');
  }

  return {
    markdown,
    metadata,
    branding,
    domain,
    warnings,
    extractionMethod,
  };
}

// --- Tabstack Markdown Extraction ---

async function extractMarkdownWithTabstack(url: string): Promise<string> {
  const apiKey = process.env.TABSTACK_API_KEY;
  if (!apiKey) {
    throw new Error('TABSTACK_API_KEY not set');
  }

  const response = await axios.post(
    'https://api.tabstack.ai/v1/extract/markdown',
    { url },
    {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    }
  );

  const markdown = response.data?.markdown || response.data?.content || response.data;
  if (typeof markdown === 'string' && markdown.length > 0) {
    return markdown;
  }

  throw new Error(`Unexpected response format: ${JSON.stringify(response.data).substring(0, 200)}`);
}

// --- Tabstack JSON Metadata Extraction ---

async function extractMetadataWithTabstack(url: string): Promise<DocsMetadata> {
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
          title: { type: 'string', description: 'Documentation page title' },
          technology: { type: 'string', description: 'Primary technology/framework being documented (e.g., React, Python, AWS, Stripe)' },
          docType: {
            type: 'string',
            enum: ['quickstart', 'tutorial', 'api-reference', 'guide', 'conceptual', 'how-to'],
            description: 'Type of documentation page',
          },
          difficulty: {
            type: 'string',
            enum: ['beginner', 'intermediate', 'advanced'],
            description: 'Target audience difficulty level',
          },
          prerequisites: {
            type: 'array',
            items: { type: 'string' },
            description: 'Required prerequisites or prior knowledge',
          },
          estimatedReadTime: { type: 'string', description: 'Estimated reading time (e.g., "5 min")' },
          sections: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                heading: { type: 'string' },
                type: {
                  type: 'string',
                  enum: ['intro', 'concept', 'steps', 'code', 'config', 'summary', 'reference'],
                },
              },
            },
            description: 'Main content sections of the documentation',
          },
        },
        required: ['title', 'technology', 'docType'],
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

  return {
    title: data.title || 'Untitled Documentation',
    technology: data.technology || 'Unknown',
    docType: data.docType || 'guide',
    difficulty: data.difficulty || 'intermediate',
    prerequisites: data.prerequisites || [],
    estimatedReadTime: data.estimatedReadTime || '',
    sections: data.sections || [],
  };
}

// --- Playwright Markdown Fallback ---

async function extractMarkdownWithPlaywright(url: string, warnings: string[]): Promise<string> {
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });

    const content = await page.evaluate(() => {
      const lines: string[] = [];

      // Process main content area
      const mainContent = document.querySelector('main, article, [role="main"], .content, .docs-content, .markdown-body')
        || document.body;

      const processNode = (node: Element) => {
        const tag = node.tagName?.toLowerCase();

        // Skip non-content elements
        if (['nav', 'footer', 'aside', 'header', 'script', 'style'].includes(tag)) return;

        if (tag === 'h1') lines.push(`# ${node.textContent?.trim()}`);
        else if (tag === 'h2') lines.push(`\n## ${node.textContent?.trim()}`);
        else if (tag === 'h3') lines.push(`\n### ${node.textContent?.trim()}`);
        else if (tag === 'h4') lines.push(`\n#### ${node.textContent?.trim()}`);
        else if (tag === 'p') lines.push(`\n${node.textContent?.trim()}`);
        else if (tag === 'pre' || tag === 'code') {
          const code = node.textContent?.trim();
          if (code && code.length > 10) {
            const lang = node.getAttribute('class')?.match(/language-(\w+)/)?.[1] || '';
            lines.push(`\n\`\`\`${lang}\n${code}\n\`\`\``);
          }
        }
        else if (tag === 'li') {
          const parent = node.parentElement?.tagName?.toLowerCase();
          const prefix = parent === 'ol' ? '1.' : '-';
          lines.push(`${prefix} ${node.textContent?.trim()}`);
        }
        else if (tag === 'blockquote') {
          lines.push(`\n> ${node.textContent?.trim()}`);
        }
        else {
          // Recurse into child elements
          for (const child of Array.from(node.children)) {
            processNode(child);
          }
        }
      };

      processNode(mainContent);
      return lines.join('\n');
    });

    warnings.push('Markdown extracted via Playwright DOM parsing. Code block language hints may be missing.');
    return content;
  } finally {
    await browser?.close();
  }
}

// --- Combined Branding + CSS Color Extraction (single Playwright session) ---

async function extractBrandingWithCssColors(
  url: string,
  domain: string,
  warnings: string[],
): Promise<BrandingResult> {
  // Get logo from cloud APIs (no browser needed)
  const cleanDomain = domain.replace('www.', '');
  const logoResult = await extractLogoFromCloud(cleanDomain, url, warnings);

  // Single Playwright session for: screenshot (color analysis) + CSS variable extraction
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(1500);

    // Take screenshot for color analysis
    const screenshotBuffer = await page.screenshot({ fullPage: false, type: 'png' });
    const colors = await extractColorsFromScreenshot(screenshotBuffer);

    // Extract CSS custom properties in the same session
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
        '--theme-primary', '--main-color', '--docs-color-primary',
      ]);
      const accent = tryProps([
        '--accent', '--accent-color', '--color-accent', '--secondary',
        '--secondary-color', '--theme-accent', '--docs-color-secondary',
      ]);

      let buttonBg: string | null = null;
      const buttons = document.querySelectorAll('button, a.btn, [class*="button"], [class*="btn"]');
      for (const btn of Array.from(buttons).slice(0, 10)) {
        const bg = getComputedStyle(btn).backgroundColor;
        if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent' && bg !== 'rgb(255, 255, 255)') {
          buttonBg = bg;
          break;
        }
      }

      return { primary: primary || buttonBg, accent };
    }).catch(() => ({ primary: null, accent: null }));

    // Override screenshot colors with CSS-extracted colors (more accurate)
    if (cssColors.primary) {
      colors.primary = rgbaToHex(cssColors.primary);
      colors.secondary = darkenHex(colors.primary, 0.6);
    }
    if (cssColors.accent) {
      colors.accent = rgbaToHex(cssColors.accent);
    }

    return {
      logo: { url: logoResult.url, quality: logoResult.quality },
      colors,
      font: 'system-ui, -apple-system, sans-serif',
      theme: detectTheme(colors),
    };
  } finally {
    await browser?.close();
  }
}

// --- Infer Metadata from Markdown ---

function inferMetadataFromMarkdown(markdown: string, url: string): DocsMetadata {
  const lines = markdown.split('\n');

  const titleLine = lines.find(l => l.startsWith('# '));
  const title = titleLine ? titleLine.replace(/^#\s+/, '').trim() : new URL(url).hostname;

  const domain = new URL(url).hostname.toLowerCase();
  const text = markdown.toLowerCase();
  let technology = 'Unknown';

  const techMap: Record<string, string[]> = {
    'React': ['react', 'jsx', 'usestate', 'useeffect', 'react.dev'],
    'Next.js': ['next.js', 'nextjs', 'next/'],
    'Vue': ['vue', 'vuejs', 'vue.js'],
    'Python': ['python', 'pip install', 'def ', 'import '],
    'Node.js': ['node.js', 'nodejs', 'npm install', 'require('],
    'TypeScript': ['typescript', 'tsc', '.ts '],
    'Stripe': ['stripe', 'stripe.com'],
    'AWS': ['aws', 'amazon web services', 'ec2', 's3'],
    'Docker': ['docker', 'dockerfile', 'docker-compose'],
    'Terraform': ['terraform', 'hcl', 'tf '],
  };

  for (const [tech, keywords] of Object.entries(techMap)) {
    if (keywords.some(kw => text.includes(kw) || domain.includes(kw))) {
      technology = tech;
      break;
    }
  }

  let docType: DocsMetadata['docType'] = 'guide';
  if (text.includes('quickstart') || text.includes('getting started') || text.includes('quick start')) {
    docType = 'quickstart';
  } else if (text.includes('tutorial') || text.includes('step by step') || text.includes('walkthrough')) {
    docType = 'tutorial';
  } else if (text.includes('api reference') || text.includes('endpoints') || text.includes('api/')) {
    docType = 'api-reference';
  } else if (text.includes('how to') || text.includes('how-to')) {
    docType = 'how-to';
  }

  let difficulty: DocsMetadata['difficulty'] = 'intermediate';
  if (text.includes('beginner') || text.includes('introduction') || text.includes('getting started')) {
    difficulty = 'beginner';
  } else if (text.includes('advanced') || text.includes('optimization') || text.includes('best practices')) {
    difficulty = 'advanced';
  }

  const sections = lines
    .filter(l => l.startsWith('## '))
    .map(l => ({
      heading: l.replace(/^##\s+/, '').trim(),
      type: 'concept' as string,
    }));

  const wordCount = markdown.split(/\s+/).length;
  const readTimeMin = Math.ceil(wordCount / 200);

  return {
    title,
    technology,
    docType,
    difficulty,
    prerequisites: [],
    estimatedReadTime: `${readTimeMin} min`,
    sections,
  };
}
