import axios from 'axios';
import { detectBeats } from '../utils/beat-detection.js';
import { getAudioDir } from '../utils/paths.js';
import fs from 'fs/promises';
import path from 'path';

interface AudioGenerationParams {
  musicStyle: string;
  narrationScript: string;
  duration: number;
  remotionProjectPath?: string;
}

interface AudioResult {
  music: {
    url: string;
    localPath: string;
    staticPath: string; // Path relative to remotion/public/ for staticFile()
    duration: number;
  };
  narration: {
    url: string;
    localPath: string;
    staticPath: string; // Path relative to remotion/public/ for staticFile()
    timecodes: Array<{ start: number; end: number; text: string }>;
  };
  beats: number[];
  warnings: string[]; // Diagnostic messages surfaced to agent
}

export async function generateAudio(params: AudioGenerationParams): Promise<AudioResult> {
  console.error(`Generating audio: ${params.musicStyle} style, ${params.duration}s`);

  const { musicStyle, narrationScript, duration, remotionProjectPath } = params;
  const warnings: string[] = [];

  // Generate background music (instrumental via ElevenLabs, requires paid plan)
  const music = await generateMusic(musicStyle, duration, warnings, remotionProjectPath);

  // Generate narration (text-to-speech via ElevenLabs, free tier works)
  const narration = await generateNarration(narrationScript, warnings, remotionProjectPath);

  // Detect beats from music for transition sync
  const beats = music.localPath
    ? await detectBeats(music.localPath, duration)
    : createPlaceholderBeats(duration);

  if (!music.localPath) {
    warnings.push('Using placeholder beats (no music file for beat detection)');
  }

  console.error(`✓ Generated audio: ${beats.length} beats detected, ${warnings.length} warnings`);

  return {
    music,
    narration,
    beats,
    warnings,
  };
}

function createPlaceholderBeats(duration: number): number[] {
  const beats: number[] = [];
  for (let i = 1.0; i < duration; i += 1.2) {
    beats.push(i);
  }
  return beats;
}

async function generateMusic(style: string, duration: number, warnings: string[], remotionProjectPath?: string): Promise<AudioResult['music']> {
  console.error('Generating background music...');

  const elevenLabsKey = process.env.ELEVENLABS_API_KEY;
  if (elevenLabsKey) {
    try {
      const result = await generateMusicElevenLabs(style, duration, elevenLabsKey, warnings, remotionProjectPath);
      if (result) return result;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('ElevenLabs music failed:', msg);
      warnings.push(`ElevenLabs music failed: ${msg}. Music generation requires a paid ElevenLabs plan.`);
    }
  }

  if (!elevenLabsKey) {
    warnings.push('No ELEVENLABS_API_KEY configured. Set it in .env to enable music and narration.');
  }

  warnings.push('Music generation skipped — video will have narration only (no background music)');
  return { url: '', localPath: '', staticPath: '', duration };
}

async function generateMusicElevenLabs(
  style: string,
  duration: number,
  apiKey: string,
  warnings: string[],
  remotionProjectPath?: string,
): Promise<AudioResult['music'] | null> {
  const prompt = createMusicPrompt(style, duration);
  const durationMs = duration * 1000;

  console.error(`Using ElevenLabs Music (${style}, ${duration}s)...`);

  // output_format is a query parameter, not a body parameter
  const response = await axios.post(
    'https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128',
    {
      prompt,
      model_id: 'music_v1',
      music_length_ms: durationMs,
      force_instrumental: true,
    },
    {
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      responseType: 'arraybuffer',
      timeout: 120000, // Music generation can take longer
    }
  );

  const buffer = Buffer.from(response.data);
  if (buffer.length < 1000) {
    const text = buffer.toString('utf-8');
    console.error('⚠️  ElevenLabs returned non-audio response:', text.substring(0, 200));
    warnings.push(`ElevenLabs music returned non-audio response (${buffer.length} bytes): ${text.substring(0, 100)}`);
    return null;
  }

  const { localPath, staticPath } = await saveAudioBuffer(buffer, 'music', remotionProjectPath);

  console.error(`✓ ElevenLabs music saved (${(buffer.length / 1024).toFixed(0)} KB)`);

  return {
    url: '',
    localPath,
    staticPath,
    duration,
  };
}

async function generateNarration(script: string, warnings: string[], remotionProjectPath?: string): Promise<AudioResult['narration']> {
  console.error('Generating narration...');

  const elevenLabsKey = process.env.ELEVENLABS_API_KEY;
  if (elevenLabsKey) {
    try {
      const result = await generateNarrationElevenLabs(script, elevenLabsKey, warnings, remotionProjectPath);
      if (result) return result;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('ElevenLabs TTS failed:', msg);
      warnings.push(`ElevenLabs narration failed: ${msg}`);
    }
  }

  if (!elevenLabsKey) {
    warnings.push('No ELEVENLABS_API_KEY configured. Set it in .env to enable narration.');
  }

  warnings.push('Narration generation skipped — video will have no voiceover');
  return { url: '', localPath: '', staticPath: '', timecodes: [] };
}

/**
 * Derive sentence-level timecodes from character-level alignment data.
 * Splits on sentence boundaries (. ! ?) and finds the start/end times
 * from the actual audio alignment — no WPM estimation needed.
 */
function deriveTimcodesFromAlignment(
  alignment: { characters: string[]; character_start_times_seconds: number[]; character_end_times_seconds: number[] },
  script: string,
): Array<{ start: number; end: number; text: string }> {
  const timecodes: Array<{ start: number; end: number; text: string }> = [];
  const chars = alignment.characters;
  const starts = alignment.character_start_times_seconds;
  const ends = alignment.character_end_times_seconds;

  // Walk through the original script and find sentence boundaries
  const sentences = script.split(/([.!?]+)/).reduce<string[]>((acc, part, i, arr) => {
    // Recombine: text + punctuation pairs
    if (i % 2 === 0 && part.trim()) {
      const punct = arr[i + 1] || '';
      acc.push((part + punct).trim());
    }
    return acc;
  }, []);

  let charIdx = 0;

  for (const sentence of sentences) {
    if (!sentence.trim()) continue;

    // Find where this sentence starts in the alignment chars
    // Skip whitespace chars to find the first real character
    while (charIdx < chars.length && chars[charIdx].trim() === '') {
      charIdx++;
    }

    const sentenceStart = charIdx < starts.length ? starts[charIdx] : (timecodes.length > 0 ? timecodes[timecodes.length - 1].end + 0.3 : 0);

    // Advance charIdx through the sentence's characters
    let sentenceCharCount = 0;
    for (const ch of sentence) {
      if (charIdx + sentenceCharCount < chars.length) {
        sentenceCharCount++;
      }
    }

    const endCharIdx = Math.min(charIdx + sentenceCharCount - 1, ends.length - 1);
    const sentenceEnd = endCharIdx >= 0 ? ends[endCharIdx] : sentenceStart + 1;

    timecodes.push({
      start: sentenceStart,
      end: sentenceEnd,
      text: sentence.replace(/[.!?]+$/, '').trim(),
    });

    charIdx += sentenceCharCount;
  }

  return timecodes;
}

async function generateNarrationElevenLabs(
  script: string,
  apiKey: string,
  warnings: string[],
  remotionProjectPath?: string,
): Promise<AudioResult['narration'] | null> {
  // ElevenLabs premade voices (professional narration)
  const voiceId = process.env.ELEVENLABS_VOICE_ID || 'jsCqWAovK2LkecY7zXl4'; // Freya - expressive young woman

  console.error(`Using ElevenLabs TTS with timestamps (voice: ${voiceId})...`);

  // Normalize paragraph breaks — double newlines create ~300ms natural pauses in ElevenLabs TTS
  const processedScript = script
    .split(/\n+/)
    .filter(p => p.trim())
    .join('\n\n');

  // Use /with-timestamps endpoint for real audio-aligned timecodes
  let timecodes: Array<{ start: number; end: number; text: string }>;
  let audioBuffer: Buffer;

  try {
    const response = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps?output_format=mp3_44100_128`,
      {
        text: processedScript,
        model_id: 'eleven_multilingual_v2',
        voice_settings: {
          stability: 0.75,
          similarity_boost: 0.75,
          speed: 0.85,
        },
      },
      {
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
        },
        responseType: 'json',
        timeout: 60000,
      }
    );

    // /with-timestamps returns JSON with audio_base64 and alignment
    const data = response.data;
    if (!data.audio_base64) {
      console.error('⚠️  No audio_base64 in response');
      warnings.push('ElevenLabs /with-timestamps returned no audio data');
      return null;
    }

    audioBuffer = Buffer.from(data.audio_base64, 'base64');

    if (data.alignment) {
      timecodes = deriveTimcodesFromAlignment(data.alignment, processedScript);
      console.error(`✓ Real timecodes derived from alignment (${timecodes.length} sentences)`);
    } else {
      // Fallback: alignment missing, estimate
      console.error('⚠️  No alignment data in response, falling back to estimated timecodes');
      warnings.push('ElevenLabs returned audio but no alignment data — timecodes are estimated');
      timecodes = createNarrationTimecodes(processedScript);
    }

  } catch (timestampError) {
    // Fallback: /with-timestamps failed, try regular endpoint
    const msg = timestampError instanceof Error ? timestampError.message : String(timestampError);
    console.error(`⚠️  /with-timestamps failed (${msg}), falling back to regular TTS...`);
    warnings.push(`ElevenLabs /with-timestamps failed: ${msg}. Using estimated timecodes.`);

    const response = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
      {
        text: processedScript,
        model_id: 'eleven_multilingual_v2',
        voice_settings: {
          stability: 0.75,
          similarity_boost: 0.75,
          speed: 0.85,
        },
      },
      {
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
        },
        responseType: 'arraybuffer',
        timeout: 60000,
      }
    );

    audioBuffer = Buffer.from(response.data);
    if (audioBuffer.length < 1000) {
      const text = audioBuffer.toString('utf-8');
      console.error('⚠️  ElevenLabs returned non-audio response:', text.substring(0, 200));
      warnings.push(`ElevenLabs TTS returned non-audio response (${audioBuffer.length} bytes): ${text.substring(0, 100)}`);
      return null;
    }

    timecodes = createNarrationTimecodes(processedScript);
  }

  const { localPath, staticPath } = await saveAudioBuffer(audioBuffer, 'narration', remotionProjectPath);

  console.error(`✓ ElevenLabs narration saved (${(audioBuffer.length / 1024).toFixed(0)} KB, ${timecodes.length} timecodes)`);

  return {
    url: '',
    localPath,
    staticPath,
    timecodes,
  };
}

function createMusicPrompt(style: string, duration: number): string {
  const stylePrompts: Record<string, string> = {
    'pop': 'upbeat pop instrumental background music, catchy melody, energetic',
    'hip-hop': 'hip-hop instrumental beat, rhythmic drums, bass-heavy, modern',
    'rap': 'rap instrumental beat, strong drums, urban vibe, no vocals',
    'jazz': 'smooth jazz instrumental, piano and saxophone, sophisticated',
    'rock': 'rock instrumental background, electric guitar driven, energetic',
  };

  const basePrompt = stylePrompts[style.toLowerCase()] || stylePrompts['pop'];

  return `${basePrompt}, instrumental only, no singing, no vocals, no lyrics, ${duration} seconds`;
}

function createNarrationTimecodes(script: string): Array<{ start: number; end: number; text: string }> {
  // Simple word-based timing (approximately 150 words per minute)
  const wordsPerSecond = 150 / 60; // 2.5 words per second
  const timecodes: Array<{ start: number; end: number; text: string }> = [];

  let currentTime = 0;
  const sentences = script.split(/[.!?]+/).filter(s => s.trim());

  for (const sentence of sentences) {
    const sentenceWords = sentence.trim().split(/\s+/);
    const durationSeconds = sentenceWords.length / wordsPerSecond;

    timecodes.push({
      start: currentTime,
      end: currentTime + durationSeconds,
      text: sentence.trim(),
    });

    currentTime += durationSeconds + 0.5; // Add pause between sentences
  }

  return timecodes;
}

async function saveAudioBuffer(buffer: Buffer, prefix: string, remotionProjectPath?: string): Promise<{ localPath: string; staticPath: string }> {
  // Save to remotion/public/audio/ so Remotion can access via staticFile()
  const publicAudioDir = getAudioDir(remotionProjectPath);
  await fs.mkdir(publicAudioDir, { recursive: true });

  const fileName = `${prefix}-${Date.now()}.mp3`;
  const localPath = path.join(publicAudioDir, fileName);

  await fs.writeFile(localPath, buffer);

  const staticPath = `audio/${fileName}`; // Relative to public/ for staticFile()

  console.error(`✓ Saved ${prefix} to: ${localPath} (staticPath: ${staticPath})`);

  return { localPath, staticPath };
}
