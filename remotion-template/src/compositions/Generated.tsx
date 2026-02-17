import React from 'react';
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  staticFile,
  interpolate,
  spring,
} from 'remotion';
import { Audio } from '@remotion/media';
import { loadFont } from '@remotion/google-fonts/Inter';
import { TutorialVideoProps } from '../Root';

const { fontFamily } = loadFont('normal', {
  weights: ['400', '700'],
  subsets: ['latin'],
});

/**
 * This file is overwritten by Claude for each video.
 * This placeholder renders a basic title screen.
 * The agent will import the user's own components and compose scenes here.
 */
export const Generated: React.FC<TutorialVideoProps> = ({
  content,
  branding,
  audio,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleOpacity = interpolate(frame, [0, 20], [0, 1], {
    extrapolateRight: 'clamp',
  });
  const titleScale = spring({ frame, fps, from: 0.8, to: 1, config: { damping: 12 } });

  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(135deg, ${branding.colors.primary}, ${branding.colors.secondary})`,
        fontFamily,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* Audio */}
      {audio.music?.staticPath && (
        <Audio src={staticFile(audio.music.staticPath)} volume={0.3} />
      )}
      {audio.narration?.staticPath && (
        <Audio src={staticFile(audio.narration.staticPath)} volume={1} />
      )}

      {/* Title */}
      <div
        style={{
          opacity: titleOpacity,
          transform: `scale(${titleScale})`,
          textAlign: 'center',
          color: '#FFFFFF',
          padding: 40,
        }}
      >
        <h1 style={{ fontSize: 72, fontWeight: 700, margin: 0 }}>
          {content.title}
        </h1>
        <p style={{ fontSize: 28, opacity: 0.8, marginTop: 20 }}>
          {content.technology} — {content.docType}
        </p>
      </div>
    </AbsoluteFill>
  );
};
