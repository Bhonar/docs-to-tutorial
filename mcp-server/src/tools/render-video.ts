import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import { enableTailwind } from '@remotion/tailwind';
import path from 'path';
import fs from 'fs/promises';
import { getRemotionProjectPath, getOutputDir } from '../utils/paths.js';

interface RenderParams {
  inputProps: Record<string, any>;
  outputFileName: string;
  remotionProjectPath?: string; // Explicit override for remotion/ directory
}

interface RenderResult {
  videoPath: string;
  duration: number;
  fileSize: number;
}

export async function renderVideo(params: RenderParams): Promise<RenderResult> {
  // Always use the Generated composition (dynamically created by Claude)
  const compositionId = 'Generated';
  console.error(`Rendering video: ${compositionId}`);

  const { inputProps, outputFileName } = params;

  // Resolve remotion project path using shared utility
  const remotionProjectPath = getRemotionProjectPath(params.remotionProjectPath);
  const outputDir = getOutputDir();

  // Ensure output directory exists
  await fs.mkdir(outputDir, { recursive: true });

  // Output path
  const outputPath = path.join(outputDir, `${outputFileName}.mp4`);

  console.error(`Project: ${remotionProjectPath}`);
  console.error(`Output: ${outputPath}`);

  // Verify the Remotion project exists
  const entryPoint = path.join(remotionProjectPath, 'src/index.ts');
  try {
    await fs.access(entryPoint);
  } catch {
    throw new Error(
      `Remotion project not found at ${remotionProjectPath}. ` +
      `Run the scaffold step first to create the remotion/ directory.`
    );
  }

  // Step 1: Bundle Remotion project
  console.error('Bundling Remotion project...');
  const bundleLocation = await bundle({
    entryPoint,
    // CRITICAL: Apply Tailwind webpack override for CSS processing
    webpackOverride: (config) => enableTailwind(config),
  });

  console.error(`✓ Bundled to: ${bundleLocation}`);

  // Step 2: Select composition
  const composition = await selectComposition({
    serveUrl: bundleLocation,
    id: compositionId,
    inputProps,
  });

  console.error(`✓ Composition: ${composition.id} (${composition.width}x${composition.height}, ${composition.durationInFrames} frames = ${(composition.durationInFrames / composition.fps).toFixed(1)}s)`);

  // Step 3: Render video
  console.error('Rendering video...');
  await renderMedia({
    composition,
    serveUrl: bundleLocation,
    codec: 'h264',
    outputLocation: outputPath,
    inputProps,
    onProgress: ({ progress }) => {
      console.error(`Rendering: ${(progress * 100).toFixed(1)}%`);
    },
  });

  console.error(`✓ Video rendered: ${outputPath}`);

  // Get file size
  const stats = await fs.stat(outputPath);
  const fileSize = stats.size;

  // Calculate duration
  const duration = composition.durationInFrames / composition.fps;

  return {
    videoPath: outputPath,
    duration,
    fileSize,
  };
}
