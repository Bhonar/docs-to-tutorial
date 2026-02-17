import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'path';
import os from 'os';
import { getRemotionProjectPath, getPublicDir, getAudioDir, getImagesDir, getOutputDir } from '../paths.js';

describe('getRemotionProjectPath', () => {
  const originalEnv = process.env.REMOTION_PROJECT_PATH;

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.REMOTION_PROJECT_PATH = originalEnv;
    } else {
      delete process.env.REMOTION_PROJECT_PATH;
    }
  });

  it('uses explicit path when provided', () => {
    expect(getRemotionProjectPath('/custom/path/remotion')).toBe('/custom/path/remotion');
  });

  it('uses env var when no explicit path', () => {
    process.env.REMOTION_PROJECT_PATH = '/env/path/remotion';
    expect(getRemotionProjectPath()).toBe('/env/path/remotion');
  });

  it('falls back to cwd/remotion', () => {
    delete process.env.REMOTION_PROJECT_PATH;
    expect(getRemotionProjectPath()).toBe(path.join(process.cwd(), 'remotion'));
  });

  it('explicit overrides env var', () => {
    process.env.REMOTION_PROJECT_PATH = '/env/path/remotion';
    expect(getRemotionProjectPath('/explicit/path')).toBe('/explicit/path');
  });
});

describe('getPublicDir', () => {
  it('appends public/ to remotion path', () => {
    expect(getPublicDir('/my/project/remotion')).toBe('/my/project/remotion/public');
  });
});

describe('getAudioDir', () => {
  it('appends public/audio/ to remotion path', () => {
    expect(getAudioDir('/my/project/remotion')).toBe('/my/project/remotion/public/audio');
  });
});

describe('getImagesDir', () => {
  it('appends public/images/ to remotion path', () => {
    expect(getImagesDir('/my/project/remotion')).toBe('/my/project/remotion/public/images');
  });
});

describe('getOutputDir', () => {
  const originalEnv = process.env.REMOTION_OUTPUT_PATH;

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.REMOTION_OUTPUT_PATH = originalEnv;
    } else {
      delete process.env.REMOTION_OUTPUT_PATH;
    }
  });

  it('uses env var when set', () => {
    process.env.REMOTION_OUTPUT_PATH = '/custom/output';
    expect(getOutputDir()).toBe('/custom/output');
  });

  it('falls back to ~/Videos/docs-to-tutorial', () => {
    delete process.env.REMOTION_OUTPUT_PATH;
    expect(getOutputDir()).toBe(path.join(os.homedir(), 'Videos', 'docs-to-tutorial'));
  });
});
