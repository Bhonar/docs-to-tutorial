import { chromium } from 'playwright';

export async function takeScreenshot(url: string): Promise<Buffer> {
  console.error(`Taking screenshot of: ${url}`);

  const browser = await chromium.launch({
    headless: true,
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2, // Retina/high-DPI
  });

  const page = await context.newPage();

  try {
    // Use domcontentloaded instead of networkidle to avoid hanging on SPAs
    // that keep WebSocket connections or long-polling open
    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    });

    // Brief wait for images/fonts to load after DOM is ready
    await page.waitForTimeout(2000);

    // Capture viewport only (not fullPage) to avoid multi-MB images
    const screenshot = await page.screenshot({
      fullPage: false,
      type: 'png',
    });

    console.error('✓ Screenshot captured');

    return screenshot;
  } finally {
    await browser.close();
  }
}
