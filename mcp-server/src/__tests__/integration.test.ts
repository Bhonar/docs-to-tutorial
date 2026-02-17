/**
 * Integration tests — require API keys and network access.
 *
 * Run with:
 *   TABSTACK_API_KEY=xxx ELEVENLABS_API_KEY=xxx npx vitest run src/__tests__/integration.test.ts
 *
 * These tests are skipped by default (when API keys are missing).
 */
import { describe, it, expect } from 'vitest';
import { extractDocsContent } from '../tools/extract-docs.js';
import { extractUrlContent } from '../tools/extract-url.js';
import { generateAudio } from '../tools/generate-audio.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const hasTabstack = !!process.env.TABSTACK_API_KEY;
const hasElevenLabs = !!process.env.ELEVENLABS_API_KEY;

// Use a temp dir for remotion files during tests
const testRemotionPath = path.join(os.tmpdir(), 'docs-to-tutorial-test-remotion');

describe.skipIf(!hasTabstack)('extract_docs_content (integration)', () => {
  it('extracts markdown and metadata from a real docs page', async () => {
    // Create the public dirs that the tool writes to
    await fs.mkdir(path.join(testRemotionPath, 'public', 'images'), { recursive: true });

    const result = await extractDocsContent(
      'https://docs.stripe.com/payments/quickstart',
      testRemotionPath,
    );

    expect(result.markdown).toBeDefined();
    expect(result.markdown.length).toBeGreaterThan(100);
    expect(result.metadata.title).toBeDefined();
    expect(result.metadata.technology).toBeDefined();
    expect(result.branding).toBeDefined();
    expect(result.branding.colors.primary).toMatch(/^#/);
    expect(result.domain).toContain('stripe.com');
    expect(result.extractionMethod).toBe('tabstack-markdown');

    console.log('Docs extraction result:', {
      markdownLength: result.markdown.length,
      title: result.metadata.title,
      technology: result.metadata.technology,
      docType: result.metadata.docType,
      primary: result.branding.colors.primary,
      warnings: result.warnings,
    });
  }, 60000);
});

describe.skipIf(!hasTabstack)('extract_url_content (integration)', () => {
  it('extracts content and branding from a marketing page', async () => {
    await fs.mkdir(path.join(testRemotionPath, 'public', 'images'), { recursive: true });

    const result = await extractUrlContent(
      'https://remotion.dev',
      testRemotionPath,
    );

    expect(result.content).toBeDefined();
    expect(result.content.title).toBeDefined();
    expect(result.branding).toBeDefined();
    expect(result.branding.colors.primary).toMatch(/^#/);
    expect(result.screenshots.length).toBeGreaterThan(0);

    console.log('URL extraction result:', {
      title: result.content.title,
      features: result.content.features.length,
      primary: result.branding.colors.primary,
      screenshots: result.screenshots.length,
      method: result.extractionMethod,
      warnings: result.warnings,
    });
  }, 60000);
});

describe.skipIf(!hasElevenLabs)('generate_audio (integration)', () => {
  it('generates narration audio', async () => {
    await fs.mkdir(path.join(testRemotionPath, 'public', 'audio'), { recursive: true });

    const result = await generateAudio({
      musicStyle: 'ambient',
      narrationScript: 'Welcome to this quick tutorial. Today we will learn how to get started with Stripe payments.',
      duration: 15,
      remotionProjectPath: testRemotionPath,
    });

    // Narration should work on free tier
    expect(result.narration).toBeDefined();
    expect(result.narration.staticPath).toContain('audio/narration-');
    expect(result.narration.timecodes.length).toBeGreaterThan(0);

    // Music may or may not work (paid plan required)
    expect(result.warnings).toBeDefined();

    // Beats should exist (either from music or placeholder)
    expect(result.beats.length).toBeGreaterThan(0);

    console.log('Audio generation result:', {
      narrationPath: result.narration.staticPath,
      musicPath: result.music.staticPath || '(none)',
      beats: result.beats.length,
      warnings: result.warnings,
    });
  }, 120000);
});
