---
name: docs-to-tutorial
description: Create tutorial/how-to videos from documentation URLs using the user's own React components and Remotion
---

# Docs to Tutorial Video

Generate tutorial and how-to videos from documentation URLs. The video uses the user's **own React components** (buttons, cards, layouts) so the tutorial looks like their actual product. Produces an MP4 with AI narration, background music, and animated scenes.

**Prerequisite skill:** Install `remotion-best-practices` for Remotion animation rules.

**Target file:** `remotion/src/compositions/Generated.tsx` (inside user's project, overwritten each run)

---

## 7-Step Workflow

### Step 1: Scan User's Codebase

Before anything else, understand the user's project:

1. **Find components** — scan `src/components/`, `src/ui/`, `components/`, `app/components/` or wherever components live
2. **Identify the design system** — look for:
   - UI primitives: Button, Card, Input, Badge, Alert, Modal
   - Layout components: Container, Grid, Stack, Flex, Sidebar
   - Typography: Heading, Text, Label, Code
   - Navigation: Tabs, Breadcrumb, Menu
3. **Read the styling approach** — Tailwind? CSS Modules? Styled Components? Inline styles?
4. **Note import paths** — e.g., `@/components/ui/button` or `../../components/Button`
5. **Check for a tailwind.config** or theme file — extract their color palette, fonts, spacing scale
6. **Record the project root** — the absolute path to the user's project root (where `package.json` is). This is needed for `remotionProjectPath` in all tool calls.

**What to save from this step:**
- List of reusable components with their import paths and key props
- The project's color palette / design tokens
- Font family names
- The absolute path to the project root
- The relative path from `remotion/src/compositions/Generated.tsx` to the user's components

---

### Step 2: Scaffold Remotion (if needed)

**IMPORTANT: This step MUST happen before Steps 3-4.** The extraction and audio tools save files to `remotion/public/`. If `remotion/` doesn't exist yet, those files would be lost.

Check if `remotion/` directory exists in the user's project root. If not:

1. Copy the template files from the MCP server's `remotion-template/` directory:
   ```
   remotion/
   ├── src/
   │   ├── Root.tsx
   │   ├── index.ts
   │   ├── style.css          (Tailwind entry — required)
   │   └── compositions/
   │       └── Generated.tsx
   ├── public/
   │   ├── audio/    (generated audio goes here)
   │   └── images/   (downloaded logos go here)
   ├── package.json
   ├── tsconfig.json
   └── tailwind.config.js
   ```

2. **Update Tailwind content paths** if the user's components aren't in `../src/`:
   - Default: `'../src/**/*.{ts,tsx}'`
   - If user has `app/` structure: add `'../app/**/*.{ts,tsx}'`
   - If monorepo with `packages/`: add `'../packages/ui/**/*.{ts,tsx}'`
   - Check where the user's components live and ensure `remotion/tailwind.config.js` includes them

3. Run `cd remotion && npm install`

4. Verify: `remotion/src/index.ts` exists and imports Root and `style.css`

**If remotion/ already exists**, just verify the structure is intact and that `tailwind.config.js` content paths include the user's component directories.

---

### Step 3: Extract Documentation

**Call `extract_docs_content`** with:
- `url` — the documentation URL
- `remotionProjectPath` — absolute path to the `remotion/` directory (e.g., `/Users/me/my-app/remotion`)

Returns:
- `markdown` — full page content as clean markdown (code blocks, headings, lists preserved)
- `metadata` — title, technology, docType, difficulty, prerequisites, sections
- `branding` — logo (url + staticPath), colors, font, theme
- `domain` — documentation domain
- `warnings` — any extraction issues

**Then analyze the documentation:**

1. **Content Type** — from `metadata.docType`:
   - `quickstart` → fast-paced, 3-5 steps, ~30s video
   - `tutorial` → step-by-step learning, 5-8 scenes, ~60s video
   - `api-reference` → endpoint showcases, request/response examples, ~45s
   - `guide` → concept explanations + code, ~60s
   - `how-to` → problem/solution format, ~45s

2. **Parse the markdown** to identify:
   - Code blocks (language from fence markers)
   - Numbered lists (step sequences)
   - Headings hierarchy (scene structure)
   - Blockquotes (tips, warnings)

3. **Music Style** — tutorials need calming, non-distracting music:
   - All doc types: `ambient` or `lo-fi`

---

### Step 4: Write Narration Script & Generate Audio

Write a narration script following the **tutorial arc**:
- **Intro** (3-5s) — "Let's learn how to [topic] with [technology]"
- **Overview** (5-8s) — What this covers, prerequisites
- **Step-by-Step** (15-40s) — Walk through each step, narrating code
- **Key Takeaways** (5-8s) — Recap the important points
- **Next Steps** (3-5s) — What to explore next, reference to docs

Guidelines:
- Instructional tone, use "we" and "let's" (collaborative, not lecturing)
- ~150 words/min, match content complexity
- Mention specific function/class names from the code
- Pause between major sections

**Call `generate_audio`** with:
- `musicStyle` — `ambient` or `lo-fi`
- `narrationScript` — your script
- `duration` — estimated total video length in seconds
- `remotionProjectPath` — absolute path to the `remotion/` directory

**Note:** Music generation requires a paid ElevenLabs plan. If music fails, the video will have narration only — this is fine. TTS narration works on the free tier.

**Save returned values:**
- `audio.music.staticPath`
- `audio.narration.staticPath`
- `audio.beats`

---

### Step 5: Design Tutorial Scenes

Plan 5-8 scenes using the user's components discovered in Step 1.

**Required scenes:**
- **Intro** — Topic title + what you'll learn (use user's Heading, Text, Card components)
- **2+ Content scenes** — Code walkthroughs or step-by-step instructions
- **Summary** — Recap + next steps

**Scene design approach:**
For each scene, decide which of the user's components to use:

| Scene Type | User Components to Use |
|-----------|----------------------|
| Intro | Heading, Badge, Card, Container |
| Code walkthrough | Code/CodeBlock (if user has one), Card, Text |
| Step-by-step | numbered list with user's Text, Badge/Label, Alert |
| Concept explanation | Card, Heading, Text, any diagram components |
| Terminal/CLI | Code component or custom styled div |
| Summary | Heading, list with checkmarks, Badge, Button (for CTA) |

**If the user doesn't have a component you need** (e.g., no CodeBlock), build it inline in Generated.tsx using their styling patterns (same font, colors, border-radius, shadows).

**Layout rules:**
- Use at least 3 different layouts across scenes
- Layouts: centered, split (60/40), stacked, grid, full-bleed
- Use the user's Container/Layout components for consistent spacing

---

### Step 6: Write Generated.tsx

Write the full composition at `remotion/src/compositions/Generated.tsx`.

**Critical: Import the user's components using relative paths from Generated.tsx:**
```typescript
// Example: if user's components are at src/components/ui/
import { Button } from '../../../src/components/ui/button';
import { Card } from '../../../src/components/ui/card';
import { Badge } from '../../../src/components/ui/badge';
```

**Required file structure:**

```typescript
import React from 'react';
import {
  AbsoluteFill, useCurrentFrame, useVideoConfig,
  staticFile, Sequence, interpolate, spring,
} from 'remotion';
import { Audio } from '@remotion/media';
import { TransitionSeries, linearTiming } from '@remotion/transitions';
import { fade } from '@remotion/transitions/fade';
import { slide } from '@remotion/transitions/slide';
import { loadFont } from '@remotion/google-fonts/Inter';
import { TutorialVideoProps } from '../Root';

// Import USER's components
import { Button } from '../../../src/components/ui/button';
import { Card } from '../../../src/components/ui/card';
// ... more user components

const { fontFamily } = loadFont('normal', {
  weights: ['400', '700'],
  subsets: ['latin'],
});

export const Generated: React.FC<TutorialVideoProps> = ({
  content, branding, audio, duration,
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  return (
    <AbsoluteFill style={{
      background: `linear-gradient(135deg, ${branding.colors.primary}, ${branding.colors.secondary})`,
      fontFamily,
    }}>
      {/* Audio */}
      {audio.music?.staticPath && (
        <Audio src={staticFile(audio.music.staticPath)} volume={0.3} />
      )}
      {audio.narration?.staticPath && (
        <Audio src={staticFile(audio.narration.staticPath)} volume={1} />
      )}

      {/* Scenes using TransitionSeries */}
      <TransitionSeries>
        {/* Scenes here, using the user's components */}
      </TransitionSeries>
    </AbsoluteFill>
  );
};
```

**Using user's components in Remotion:**

The user's components are regular React components. Wrap them in Remotion animation logic:

```typescript
// Animate a user's Card component
const IntroScene: React.FC<{ colors: any; width: number; height: number }> = ({ colors, width, height }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const cardScale = spring({ frame, fps, from: 0.8, to: 1, config: { damping: 12 } });
  const cardOpacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: `linear-gradient(135deg, ${colors.primary}, ${colors.secondary})`,
    }}>
      <div style={{ transform: `scale(${cardScale})`, opacity: cardOpacity }}>
        <Card className="p-8 max-w-2xl">
          <h1 style={{ fontSize: height * 0.08, fontWeight: 700 }}>
            {content.title}
          </h1>
          <div className="flex gap-2 mt-4">
            <Badge>Tutorial</Badge>
            <Badge variant="outline">{content.technology}</Badge>
          </div>
        </Card>
      </div>
    </AbsoluteFill>
  );
};
```

**Remotion rules (see `remotion-best-practices` skill for full details):**
- Audio: `import { Audio } from '@remotion/media'` — NOT from `remotion`
- Audio src: `staticFile(audio.music.staticPath)` — NEVER raw paths
- Conditional audio: `{audio.music?.staticPath && <Audio ... />}`
- Animations: ONLY `useCurrentFrame()` + `spring()` / `interpolate()` — NO CSS animations
- Images: `<Img>` from `remotion` — NOT `<img>`
- Fonts: Load via `@remotion/google-fonts` before use
- Duration: `seconds * fps` — never hardcode frame numbers
- Clamp: Always use `extrapolateRight: 'clamp'` on interpolate

---

### Step 7: Validate & Render

**Validation checklist (must pass all):**

1. Audio imported from `@remotion/media` (not `remotion`)
2. Audio uses `staticFile()` with `staticPath`
3. Conditional audio rendering
4. Font loaded via `@remotion/google-fonts`
5. No CSS animations or Tailwind `animate-*` classes
6. All animations use `useCurrentFrame()` + `spring`/`interpolate`
7. User's components are imported with correct relative paths
8. User's components render without errors in Remotion context
9. Scene durations calculated from fps
10. Has intro scene and summary scene
11. At least 2 content/code scenes
12. Narration content matches visual progression

**Call `render_video`** with:
- `inputProps` — full props (content, branding, audio, metadata, duration)
- `outputFileName` — descriptive name like `react-hooks-tutorial`
- `remotionProjectPath` — absolute path to the `remotion/` directory in the user's project

Duration is automatically calculated from narration length via `calculateMetadata` (narration drives video length, since it IS the content).

---

## Component Compatibility Notes

Not all React components work in Remotion's rendering context. Watch for:

- **Event handlers** (onClick, onHover) — harmless, just won't fire in video
- **CSS animations** — FORBIDDEN. If a user component uses `@keyframes` or `transition`, you must override those styles inline: `style={{ animation: 'none', transition: 'none' }}`
- **Portals** — won't work in Remotion. Skip components that use `createPortal` (modals, tooltips)
- **Client-side state** — `useState`/`useEffect` for animation won't work. Replace with Remotion's `useCurrentFrame()`
- **Dynamic imports** — avoid. Use static imports only
- **Browser APIs** — `window`, `document` queries won't work during render

**When a user's component won't work in Remotion**, build a visual replica inline using:
- The same CSS classes (if Tailwind)
- The same color tokens
- The same border-radius, shadow, and spacing values
- Read their component source to match the visual output
