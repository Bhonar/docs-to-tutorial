import React from 'react';
import { Composition, staticFile, CalculateMetadataFunction } from 'remotion';
import { getAudioDurationInSeconds } from '@remotion/media-utils';
import { Generated } from './compositions/Generated';

export type TutorialVideoProps = {
  content: {
    title: string;
    technology: string;
    docType: string;
    difficulty: string;
    markdown: string;
    prerequisites: string[];
    domain: string;
    sections: Array<{ heading: string; type: string }>;
  };
  branding: {
    logo: { url: string; staticPath?: string };
    colors: {
      primary: string;
      secondary: string;
      accent: string;
      background: string;
    };
    font: string;
    theme: 'light' | 'dark';
  };
  audio: {
    music: { staticPath: string };
    narration: { staticPath: string; timecodes: any[] };
    beats: number[];
  };
  metadata: {
    domain: string;
    industry: string;
  };
  duration: number;
};

const FPS = 30;
const DEFAULT_DURATION_FRAMES = 900; // 30s fallback

const calculateVideoMetadata: CalculateMetadataFunction<TutorialVideoProps> = async ({
  props,
}) => {
  let durationInFrames = DEFAULT_DURATION_FRAMES;

  // Priority: narration duration > music duration > props.duration > 30s fallback
  // Narration drives the video since it IS the content
  if (props.audio?.narration?.staticPath) {
    try {
      const narrationDuration = await getAudioDurationInSeconds(
        staticFile(props.audio.narration.staticPath),
      );
      durationInFrames = Math.ceil(narrationDuration * FPS);
    } catch {
      // Fall through to music
    }
  }

  if (durationInFrames === DEFAULT_DURATION_FRAMES && props.audio?.music?.staticPath) {
    try {
      const musicDuration = await getAudioDurationInSeconds(
        staticFile(props.audio.music.staticPath),
      );
      durationInFrames = Math.ceil(musicDuration * FPS);
    } catch {
      // Fall through to props.duration
    }
  }

  if (durationInFrames === DEFAULT_DURATION_FRAMES && props.duration) {
    durationInFrames = Math.ceil(props.duration * FPS);
  }

  return { durationInFrames, props };
};

export const Root: React.FC = () => {
  return (
    <>
      <Composition
        id="Generated"
        component={Generated}
        durationInFrames={DEFAULT_DURATION_FRAMES}
        fps={FPS}
        width={1920}
        height={1080}
        defaultProps={{
          content: {
            title: 'Tutorial Video',
            technology: 'React',
            docType: 'tutorial',
            difficulty: 'beginner',
            markdown: '',
            prerequisites: [],
            domain: 'example.com',
            sections: [],
          },
          branding: {
            logo: { url: '' },
            colors: {
              primary: '#0066FF',
              secondary: '#003D99',
              accent: '#66B3FF',
              background: '#FFFFFF',
            },
            font: 'system-ui',
            theme: 'light' as const,
          },
          audio: {
            music: { staticPath: '' },
            narration: { staticPath: '', timecodes: [] },
            beats: [],
          },
          metadata: {
            domain: 'example.com',
            industry: 'tech',
          },
          duration: 30,
        }}
        calculateMetadata={calculateVideoMetadata}
      />
    </>
  );
};
