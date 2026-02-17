/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/**/*.{ts,tsx}',
    // Include parent project components so Tailwind processes their classes
    '../src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      // CSS keyframes/animations are FORBIDDEN in Remotion.
      // All animations must use useCurrentFrame() + spring/interpolate.
    },
  },
  plugins: [],
};
