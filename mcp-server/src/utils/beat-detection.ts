import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Detect beats from audio file using aubio or FFmpeg.
 * Returns array of beat timecodes in seconds.
 *
 * @param audioPath - Path to the audio file
 * @param duration - Actual audio duration in seconds (used for heuristic fallback)
 */
export async function detectBeats(audioPath: string, duration: number = 60): Promise<number[]> {
  console.error(`Detecting beats in: ${audioPath}`);

  try {
    // Method 1: Try using Python aubio (if available)
    const beats = await detectBeatsWithAubio(audioPath);
    if (beats.length > 0) {
      console.error(`✓ Detected ${beats.length} beats using aubio`);
      return beats;
    }
  } catch {
    console.error('Aubio not available, trying alternative method...');
  }

  try {
    // Method 2: Try using FFmpeg analysis
    const beats = await detectBeatsWithFFmpeg(audioPath);
    if (beats.length > 0) {
      console.error(`✓ Detected ${beats.length} beats using FFmpeg`);
      return beats;
    }
  } catch {
    console.error('FFmpeg analysis failed, using heuristic method...');
  }

  // Method 3: Fallback to tempo-based heuristic using actual duration
  console.error(`Using heuristic beat detection (120 BPM, ${duration}s)`);
  return generateHeuristicBeats(120, duration);
}

/**
 * Use aubio beat detection (Python library)
 */
async function detectBeatsWithAubio(audioPath: string): Promise<number[]> {
  // Check if aubio is installed
  try {
    await execAsync('which aubio');
  } catch {
    throw new Error('aubio not installed');
  }

  // Run aubio beat detection
  const { stdout } = await execAsync(`aubio beat "${audioPath}"`);

  // Parse output (format: timestamp in seconds, one per line)
  const beats = stdout
    .trim()
    .split('\n')
    .map(line => parseFloat(line))
    .filter(beat => !isNaN(beat) && beat > 0);

  return beats;
}

/**
 * Use FFmpeg to analyze audio and detect beats via silence detection.
 * FFmpeg writes silencedetect output to stderr.
 */
async function detectBeatsWithFFmpeg(audioPath: string): Promise<number[]> {
  // Check if ffmpeg is installed
  try {
    await execAsync('which ffmpeg');
  } catch {
    throw new Error('ffmpeg not installed');
  }

  // FFmpeg writes silencedetect output to stderr — do NOT redirect with 2>&1
  const { stderr } = await execAsync(
    `ffmpeg -i "${audioPath}" -af silencedetect=noise=-30dB:d=0.1 -f null -`
  );

  // Parse silence detection output from stderr
  const silenceRegex = /silence_end: ([\d.]+)/g;
  const beats: number[] = [];
  let match;

  while ((match = silenceRegex.exec(stderr)) !== null) {
    beats.push(parseFloat(match[1]));
  }

  return beats;
}

/**
 * Generate beats based on BPM (fallback method)
 */
function generateHeuristicBeats(bpm: number, durationSeconds: number): number[] {
  const beats: number[] = [];
  const interval = 60 / bpm; // seconds per beat

  for (let time = 0; time < durationSeconds; time += interval) {
    beats.push(parseFloat(time.toFixed(2)));
  }

  return beats;
}
