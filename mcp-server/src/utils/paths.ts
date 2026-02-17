import path from 'path';
import os from 'os';

/**
 * Get the path to the remotion/ directory inside the user's project.
 *
 * Priority:
 * 1. Explicit path passed as argument (from tool parameters)
 * 2. REMOTION_PROJECT_PATH environment variable
 * 3. Default: {cwd}/remotion (Claude Code always runs from project root)
 */
export function getRemotionProjectPath(explicit?: string): string {
  return explicit
    || process.env.REMOTION_PROJECT_PATH
    || path.join(process.cwd(), 'remotion');
}

/**
 * Get the path to remotion/public/ for saving static assets.
 */
export function getPublicDir(explicit?: string): string {
  return path.join(getRemotionProjectPath(explicit), 'public');
}

/**
 * Get the path to remotion/public/audio/ for saving audio files.
 */
export function getAudioDir(explicit?: string): string {
  return path.join(getPublicDir(explicit), 'audio');
}

/**
 * Get the path to remotion/public/images/ for saving images/logos.
 */
export function getImagesDir(explicit?: string): string {
  return path.join(getPublicDir(explicit), 'images');
}

/**
 * Get the output directory for rendered videos.
 */
export function getOutputDir(): string {
  return process.env.REMOTION_OUTPUT_PATH
    || path.join(os.homedir(), 'Videos', 'docs-to-tutorial');
}
