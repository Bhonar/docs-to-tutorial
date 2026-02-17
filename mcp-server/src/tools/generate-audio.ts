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

async function generateNarrationElevenLabs(
  script: string,
  apiKey: string,
  warnings: string[],
  remotionProjectPath?: string,
): Promise<AudioResult['narration'] | null> {
  // ElevenLabs premade voices (professional narration)
  const voiceId = process.env.ELEVENLABS_VOICE_ID || 'onwK4e9ZLuTAKqWW03F9'; // Daniel - professional male

  console.error(`Using ElevenLabs TTS (voice: ${voiceId})...`);

  // output_format is a query parameter, not a body parameter
  const response = await axios.post(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
    {
      text: script,
      model_id: 'eleven_multilingual_v2',
      voice_settings: {
        stability: 0.6,
        similarity_boost: 0.75,
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

  // ElevenLabs returns binary audio directly
  const buffer = Buffer.from(response.data);
  if (buffer.length < 1000) {
    // Likely an error response, not audio
    const text = buffer.toString('utf-8');
    console.error('⚠️  ElevenLabs returned non-audio response:', text.substring(0, 200));
    warnings.push(`ElevenLabs TTS returned non-audio response (${buffer.length} bytes): ${text.substring(0, 100)}`);
    return null;
  }

  const { localPath, staticPath } = await saveAudioBuffer(buffer, 'narration', remotionProjectPath);
  const timecodes = createNarrationTimecodes(script);

  console.error(`✓ ElevenLabs narration saved (${(buffer.length / 1024).toFixed(0)} KB)`);

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
    'lo-fi': 'lo-fi chill beats, mellow and relaxing, study music vibe',
    'ambient': 'ambient atmospheric background music, ethereal and calming',
    'cinematic': 'cinematic orchestral instrumental, dramatic and epic',
    'rock': 'rock instrumental background, electric guitar driven, energetic',
  };

  const basePrompt = stylePrompts[style.toLowerCase()] || stylePrompts['lo-fi'];

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
