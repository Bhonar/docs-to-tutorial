---
name: docs-to-tutorial
description: Create tutorial/how-to videos from documentation URLs using the user's own React components and Remotion
---

# Docs to Tutorial Video

Generate tutorial and how-to videos from documentation URLs. The video uses the user's **own React components** (buttons, cards, layouts) so the tutorial looks like their actual product. Produces an MP4 with AI narration, background music, and animated scenes.

**Target file:** `remotion/src/compositions/Generated.tsx` (inside user's project, overwritten each run)

---

## 6-Step Workflow

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

1. **Content Type** — from `metadata.docType` (one scene per step = more scenes):
   - `quickstart` → 3-5 steps = 5-7 scenes (intro + steps + summary)
   - `tutorial` → 5-8 steps = 7-10 scenes
   - `api-reference` → endpoint showcases, 4-6 scenes
   - `guide` → concept explanations + code, 6-10 scenes
   - `how-to` → problem/solution format, 5-8 scenes

2. **Parse the markdown** to identify:
   - Code blocks (language from fence markers)
   - Numbered lists (step sequences)
   - Headings hierarchy (scene structure)
   - Blockquotes (tips, warnings — these become callout scenes)

3. **Music Style** — tutorials need calming, non-distracting music:
   - All doc types: `ambient` or `lo-fi`

---

### Step 4: Write Narration Script & Generate Audio

Write a narration script following the **tutorial arc**. Each paragraph becomes one scene — **one step per paragraph, one paragraph per scene**:

- **Intro** — 1-2 sentences. "Let's learn how to [topic] with [technology]"
- **Step 1** — First step only. "First, let's install..."
- **Step 2** — Second step only. "Next, we'll configure..."
- **Step 3** — Third step only. "Now let's create..."
- ... (one paragraph per step, as many as the docs require)
- **Summary** — Recap what was covered, what to explore next

**⚠️ CRITICAL:** Do NOT combine multiple steps into a single paragraph. Each step gets its own narration paragraph and its own visual scene. If the docs have 5 substeps (like "visit the site, click settings, create key, name it, copy it"), write 5 separate paragraphs — the agent creates one scene per paragraph, so combining them forces multiple steps into one scene, which is the #1 quality failure.

**Pacing — how much narration to write per step** (scene duration is derived from timecodes, not from this table):

| Step complexity | Narration to write | Example |
|----------------|-------------------|---------|
| Simple command | 1-2 sentences (~15 words) | `npm install stripe` |
| Config/setup | 2-3 sentences (~30 words) | Setting env variables |
| Code with explanation | 3-5 sentences (~50 words) | Writing an API route |
| Multi-part concept | 4-6 sentences (~60 words) | Explaining auth flow |

Write shorter paragraphs for "do this" steps, longer for "understand this" steps. The timecodes will automatically make simple scenes shorter and complex scenes longer.

Guidelines:
- Instructional tone, use "we" and "let's" (collaborative, not lecturing)
- Mention specific function/class names from the code
- Every step paragraph should describe exactly what the viewer will see on screen
- **Avoid abbreviations with periods** (e.g., "Dr.", "vs.", "e.g.") — the timecode system splits on `.!?` and abbreviations cause misaligned sentence counts

**Call `generate_audio`** with:
- `musicStyle` — `ambient` or `lo-fi`
- `narrationScript` — your script
- `duration` — estimated total video length in seconds
- `remotionProjectPath` — absolute path to the `remotion/` directory

**Note:** Music generation requires a paid ElevenLabs plan. If music fails, the video will have narration only — this is fine. TTS narration works on the free tier.

**Save returned values:**
- `audio.music.staticPath`
- `audio.narration.staticPath`
- `audio.narration.timecodes` — array of `{start: number, end: number, text: string}` per sentence. **You MUST use these to time scene durations and visual reveals in Step 5.** Do NOT guess frame numbers.
- `audio.beats`

**Also save your narration paragraphs** as a list — you'll need them in Step 5 to map timecodes to scenes.

---

### Step 5: Design & Write Generated.tsx

Write the full composition at `remotion/src/compositions/Generated.tsx`.

#### Quick Reference — Every Step Scene Must Have:

1. **`<SafeZone>`** — every scene wraps content in SafeZone (centered 1200px column, consistent padding)
2. **`<StepIndicator>`** — progress dots showing "Step N of M" (top-right)
3. **Staged reveals synced to timecodes** — each visual element appears at a `getRevealFrame()` value matching the narrator's sentence
4. **Typing effect** — all code/commands type character-by-character with blinking cursor
5. **Code highlighting** — for multi-line code, spotlight the key line, dim the rest
6. **Result scene after commands** — show `✓ Success` output after install/build commands
7. **Callout scenes** — warnings/tips from docs get their own styled card scene
8. **ONE step per scene** — never combine multiple steps, numbered lists, or actions into one scene

---

> **⚠️ SCENE SPLITTING — THE MOST COMMON MISTAKE (read this before writing ANY scene)**
>
> **If a scene contains a numbered list or multiple steps, it is WRONG. Stop and split it.**
>
> The #1 failure mode is cramming multiple steps into one scene. A scene titled "Create Your API Key"
> that shows 5 substeps (visit site, navigate, click button, name it, copy key) is WRONG — those are 5 separate scenes.
>
> **Rules (violations = broken video):**
> - ONE step, ONE idea, ONE scene. No exceptions.
> - A numbered/bulleted list inside a scene is ALWAYS wrong.
> - Maximum per scene: ONE title + ONE code block or ONE command + ONE supporting visual.
> - If you catch yourself writing `1.`, `2.`, `3.` inside a single scene's JSX — STOP. Split into separate scenes.
> - If a narration paragraph covers more than one action, split the paragraph AND the scene.
> - A scene with a mock UI dashboard showing multiple actions is ALWAYS wrong — show one action per scene.
>
> **BAD — one scene with 5 steps (NEVER do this):**
> ```jsx
> // WRONG: All 5 steps crammed into one scene
> <SafeZone>
>   <h2>Create Your API Key</h2>
>   <ol>
>     <li>Visit console.tabstack.ai and sign in</li>
>     <li>Navigate to API Keys</li>
>     <li>Click "Create New API Key"</li>
>     <li>Name it and click Create</li>
>     <li>Copy the generated key</li>
>   </ol>
>   <MockDashboard />
> </SafeZone>
> ```
>
> **GOOD — 5 separate scenes, one step each:**
> ```jsx
> // Scene 3: Navigate to console
> <SafeZone><Card><h2>Sign In to the Console</h2>
>   <MockBrowserBar url="console.tabstack.ai" /></Card></SafeZone>
>
> // Scene 4: Find API Keys section
> <SafeZone><Card><h2>Navigate to API Keys</h2>
>   <MockSidebar activeItem="API Keys" /></Card></SafeZone>
>
> // Scene 5: Create the key
> <SafeZone><Card><h2>Create a New API Key</h2>
>   <MockButton label="+ Create New API Key" /></Card></SafeZone>
>
> // Scene 6: Name the key
> <SafeZone><Card><h2>Name Your Key</h2>
>   <MockInput value="Development" /></Card></SafeZone>
>
> // Scene 7: Copy the key
> <SafeZone><Card><h2>Copy Your API Key</h2>
>   <MockKeyDisplay value="ts_live_xxxx..." /></Card></SafeZone>
> ```
>
> **Count your scenes.** If the documentation has N steps, you need at least N+2 scenes (intro + N steps + summary).

---

#### Reusable Components

Define these helper components at the top of Generated.tsx. They are used by the scene components below.

**StepIndicator — progress dots (required on every step scene):**
```typescript
const StepIndicator: React.FC<{
  current: number;
  total: number;
  colors: { primary: string; accent: string };
}> = ({ current, total, colors }) => {
  const frame = useCurrentFrame();
  const slideIn = interpolate(frame, [0, 12], [-40, 0], { extrapolateRight: 'clamp' });
  const opacity = interpolate(frame, [0, 10], [0, 1], { extrapolateRight: 'clamp' });

  return (
    <div style={{
      position: 'absolute', top: 32, right: 40,
      display: 'flex', alignItems: 'center', gap: 12,
      opacity, transform: `translateY(${slideIn}px)`,
    }}>
      {Array.from({ length: total }, (_, i) => (
        <div key={i} style={{
          width: i + 1 === current ? 32 : 10, height: 10, borderRadius: 5,
          background: i + 1 <= current ? colors.primary : `${colors.primary}33`,
        }} />
      ))}
      <span style={{ fontSize: 14, fontWeight: 600, color: colors.primary, opacity: 0.8 }}>
        {current}/{total}
      </span>
    </div>
  );
};
```

**TypingText — typewriter effect (required for all code/commands):**
```typescript
const TypingText: React.FC<{
  text: string;
  startFrame: number;
  charsPerFrame?: number;
}> = ({ text, startFrame, charsPerFrame = 0.5 }) => {
  const frame = useCurrentFrame();
  const elapsed = Math.max(0, frame - startFrame);
  const charsToShow = Math.min(Math.floor(elapsed * charsPerFrame), text.length);
  const showCursor = charsToShow < text.length;

  return (
    <span style={{ fontFamily: 'monospace' }}>
      {text.slice(0, charsToShow)}
      {showCursor && (
        <span style={{ opacity: Math.floor(frame / 15) % 2 === 0 ? 1 : 0 }}>▌</span>
      )}
    </span>
  );
};
```

**HighlightedCode — spotlight one line in a multi-line block:**
```typescript
const HighlightedCode: React.FC<{
  lines: string[];
  highlightLine: number;
  startFrame: number;
  colors: { primary: string };
}> = ({ lines, highlightLine, startFrame, colors }) => {
  const frame = useCurrentFrame();
  const elapsed = Math.max(0, frame - startFrame);
  const highlightProgress = interpolate(elapsed, [20, 35], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });

  return (
    <div style={{ background: '#1a1a2e', borderRadius: 8, padding: 20, fontFamily: 'monospace', fontSize: 16, lineHeight: 1.7 }}>
      {lines.map((line, i) => {
        const isHL = i === highlightLine;
        return (
          <div key={i} style={{
            padding: '2px 8px',
            opacity: isHL ? 1 : 1 - highlightProgress * 0.6,
            background: isHL ? `${colors.primary}22` : 'transparent',
            borderLeft: isHL ? `3px solid ${colors.primary}` : '3px solid transparent',
          }}>
            <span style={{ color: '#666', marginRight: 16 }}>{i + 1}</span>
            <span style={{ color: isHL ? '#fff' : '#aaa' }}>{line}</span>
          </div>
        );
      })}
    </div>
  );
};
```

**CalloutCard — for warnings, tips, notes from docs:**
```typescript
const CalloutCard: React.FC<{
  type: 'warning' | 'tip' | 'note';
  message: string;
}> = ({ type, message }) => {
  const frame = useCurrentFrame();
  const config = {
    warning: { bg: '#fef3cd', border: '#f59e0b', icon: '⚠️', label: 'Warning' },
    tip:     { bg: '#d1fae5', border: '#10b981', icon: '💡', label: 'Pro Tip' },
    note:    { bg: '#dbeafe', border: '#3b82f6', icon: '📝', label: 'Note' },
  }[type];

  const slideX = interpolate(frame, [0, 18], [80, 0], { extrapolateRight: 'clamp' });
  const opacity = interpolate(frame, [0, 12], [0, 1], { extrapolateRight: 'clamp' });

  return (
    <div style={{
      opacity, transform: `translateX(${slideX}px)`,
      background: config.bg, borderLeft: `4px solid ${config.border}`,
      borderRadius: 8, padding: '24px 32px', maxWidth: '70%',
    }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: config.border, marginBottom: 8 }}>
        {config.icon} {config.label}
      </div>
      <div style={{ fontSize: 22, color: '#1a1a1a', lineHeight: 1.5 }}>{message}</div>
    </div>
  );
};
```

**SafeZone — content container (REQUIRED on every scene):**

Every scene component MUST wrap its content in `<SafeZone>`. This constrains all content to a centered 1200px column with consistent padding. NEVER place content directly in `<AbsoluteFill>` without SafeZone. Pass the scene background via the `background` prop.

```typescript
const SafeZone: React.FC<{
  children: React.ReactNode;
  background?: string;
}> = ({ children, background }) => (
  <AbsoluteFill style={{
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: background ?? 'transparent',
  }}>
    <div style={{
      width: '100%', maxWidth: 1200,
      padding: '60px 80px',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      height: '100%',
    }}>
      {children}
    </div>
  </AbsoluteFill>
);
```

---

#### Scene Design Rules

> **⚠️ THE #1 RULE: Every sentence the narrator says must have a matching visual change on screen.**
> The viewer should NEVER hear the narrator explain something while the screen stays static.
> If the narration says "install the package", the screen must show the install command typing out at that moment.
> If the narration says "create a file", the screen must show that file appearing at that moment.

**Narration-to-visual sync using timecodes:**

`audio.narration.timecodes` gives you `{start, end, text}` for every sentence. **Use it to drive ALL timing:**

1. **Group timecodes by scene** — each narration paragraph = one scene. Gather the timecodes whose `.text` matches that paragraph's sentences.
2. **Compute scene duration from timecodes:**
   ```typescript
   const sceneStart = sceneTimecodes[0].start;
   const sceneEnd = sceneTimecodes[sceneTimecodes.length - 1].end;
   const durationInFrames = Math.round((sceneEnd - sceneStart + 0.5) * fps);
   ```
3. **Time visual reveals to sentence boundaries:**
   ```typescript
   // Inside a scene, frame 0 = scene start. Convert each sentence to a frame offset:
   const revealFrame = Math.round((timecode.start - sceneStart) * fps);
   ```
4. Each sentence = a visual change. 3 sentences in a scene = 3 visual moments at 3 different `revealFrame` values.
5. **Account for transitions** — `TransitionSeries.Transition` overlaps adjacent scenes. Use short transitions (8-10 frames) and make sure the first reveal in each scene starts at least 10 frames in (after the transition finishes).
- **NEVER hardcode** `durationInFrames={5 * fps}` — always derive from timecodes
- NEVER have a scene where the narrator talks while the screen stays static

> **⚠️ SCENE SPLITTING (see full rules + BAD/GOOD example at top of Step 5):**
> - ONE step, ONE idea, ONE scene. If a scene has more than ONE command, ONE code block, or ONE concept — SPLIT it.
> - A scene with a numbered list is ALWAYS wrong — each item becomes its own scene.
> - A scene with a mock UI dashboard showing multiple actions is ALWAYS wrong — show one action per scene.
> - If narration for a step is longer than 3 sentences, split it into two scenes.
> - Maximum per scene: ONE title + ONE code block OR ONE command + ONE supporting visual.
> - If you have more content, it belongs in the NEXT scene.

**Whitespace, spacing, and safe zones.** Every scene must feel spacious, not cramped:
- **Every scene MUST use `<SafeZone>`** to contain its content — never place content directly in `<AbsoluteFill>`
- SafeZone constrains content to a centered 1200px column with 60px vertical / 80px horizontal padding
- Leave at least 30% of the scene area as empty space
- Text should never touch the edges of containers
- No element should extend beyond the SafeZone boundary — no mock UIs pushed to screen edges
- If content feels tight, you have too much — split into two scenes

**Staged reveals in every scene.** Time each reveal to a sentence's `revealFrame`:
1. Scene start (frame 0): Background + container fade in
2. Sentence 1 `revealFrame`: Title/heading appears
3. Sentence 2 `revealFrame`: Main content appears (typing effect for code)
4. Sentence 3 `revealFrame`: Highlight or result appears
- If only 1-2 sentences, space reveals evenly across the scene duration
- Fallback if no timecodes: space reveals 10-15 frames apart

**Show the result after commands.** After typing `npm install`, show a result scene with `✓ Successfully installed`. After writing code, show mock output. Use result scenes for install/build/run commands. Skip them for config-only steps.

**Callouts get their own scene.** Warnings, tips, and notes from the docs become separate 3-4s scenes using `CalloutCard`. Don't embed them inside code scenes.

**Layouts.** Use at least 3 different layouts across scenes: centered, split (60/40), stacked, grid, full-bleed.

---

#### Complete Generated.tsx Example

This shows how ALL the pieces compose together. **Key pattern: timecodes drive all timing.**

```typescript
import React from 'react';
import {
  AbsoluteFill, useCurrentFrame, useVideoConfig,
  staticFile, interpolate, spring,
} from 'remotion';
import { Audio } from '@remotion/media';
import { TransitionSeries, linearTiming } from '@remotion/transitions';
import { fade } from '@remotion/transitions/fade';
import { slide } from '@remotion/transitions/slide';
import { loadFont } from '@remotion/google-fonts/Inter';
import { TutorialVideoProps } from '../Root';

// === Import USER's components (adjust paths per project) ===
import { Button } from '../../../src/components/ui/button';
import { Card } from '../../../src/components/ui/card';
import { Badge } from '../../../src/components/ui/badge';

const { fontFamily } = loadFont('normal', { weights: ['400', '700'], subsets: ['latin'] });

// === Timecode helpers (REQUIRED — copy these into every Generated.tsx) ===

type Timecode = { start: number; end: number; text: string };

/** Group the flat timecodes array into per-scene groups using narration paragraphs.
 *  IMPORTANT: This splits on [.!?] — avoid abbreviations with periods ("Dr.", "vs.")
 *  in narration as they create extra sentence boundaries. Write clean sentences
 *  with no mid-sentence periods. */
function groupTimecodesByScene(timecodes: Timecode[], paragraphs: string[]): Timecode[][] {
  const groups: Timecode[][] = [];
  let idx = 0;
  for (const para of paragraphs) {
    const sentenceCount = para.split(/[.!?]+/).filter(s => s.trim()).length;
    const group: Timecode[] = [];
    for (let i = 0; i < sentenceCount && idx < timecodes.length; i++) {
      group.push(timecodes[idx]);
      idx++;
    }
    groups.push(group);
  }
  return groups;
}

/** Compute scene duration in frames from its timecodes */
function getSceneDuration(group: Timecode[], fps: number): number {
  if (group.length === 0) return 4 * fps;
  return Math.round((group[group.length - 1].end - group[0].start + 0.5) * fps);
}

/** Get the frame offset for a sentence relative to its scene start */
function getRevealFrame(tc: Timecode, sceneStart: number, fps: number): number {
  return Math.round((tc.start - sceneStart) * fps);
}

// === Reusable helpers (SafeZone, StepIndicator, TypingText, HighlightedCode, CalloutCard) ===
// ... paste the helper components from above here ...

// === Scene Components (accept sceneTimecodes for timing) ===

const IntroScene: React.FC<{
  content: any; branding: any; height: number; sceneTimecodes: Timecode[];
}> = ({ content, branding, height, sceneTimecodes }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s0 = sceneTimecodes[0]?.start ?? 0;

  // Reveal 1: card fades in at scene start
  const cardScale = spring({ frame, fps, from: 0.8, to: 1, config: { damping: 12 } });
  const cardOpacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: 'clamp' });
  // Reveal 2: title appears when sentence 1 starts (offset by 12 frames so it doesn't collide with card fade-in)
  const titleFrame = Math.max(12, sceneTimecodes[0] ? getRevealFrame(sceneTimecodes[0], s0, fps) : 12);
  const titleOpacity = interpolate(frame, [titleFrame, titleFrame + 13], [0, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  // Reveal 3: badges appear when sentence 2 starts (or after title)
  const badgeFrame = sceneTimecodes[1] ? getRevealFrame(sceneTimecodes[1], s0, fps) : 25;
  const badgeOpacity = interpolate(frame, [badgeFrame, badgeFrame + 13], [0, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <SafeZone background={`linear-gradient(135deg, ${branding.colors.primary}, ${branding.colors.secondary})`}>
      <div style={{ transform: `scale(${cardScale})`, opacity: cardOpacity, width: '100%' }}>
        <Card className="p-8">
          <div style={{ opacity: titleOpacity }}>
            <h1 style={{ fontSize: height * 0.07, fontWeight: 700 }}>{content.title}</h1>
          </div>
          <div className="flex gap-2 mt-4" style={{ opacity: badgeOpacity }}>
            <Badge>Tutorial</Badge>
            <Badge variant="outline">{content.technology}</Badge>
          </div>
        </Card>
      </div>
    </SafeZone>
  );
};

const CommandScene: React.FC<{
  title: string; command: string;
  stepNumber: number; totalSteps: number;
  branding: any; sceneTimecodes: Timecode[];
}> = ({ title, command, stepNumber, totalSteps, branding, sceneTimecodes }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const colors = branding.colors;
  const s0 = sceneTimecodes[0]?.start ?? 0;

  // Reveal 1: card at scene start
  const cardOpacity = interpolate(frame, [0, 10], [0, 1], { extrapolateRight: 'clamp' });
  // Reveal 2: title synced to sentence 1
  const titleFrame = sceneTimecodes[0] ? getRevealFrame(sceneTimecodes[0], s0, fps) : 8;
  const titleOpacity = interpolate(frame, [titleFrame, titleFrame + 12], [0, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  // Reveal 3: terminal synced to sentence 2 (when narrator says the command)
  const termFrame = sceneTimecodes[1] ? getRevealFrame(sceneTimecodes[1], s0, fps) : 22;
  const termOpacity = interpolate(frame, [termFrame, termFrame + 10], [0, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <>
      <SafeZone background={`linear-gradient(135deg, ${colors.primary}11, ${colors.secondary}11)`}>
        <div style={{ opacity: cardOpacity, width: '100%' }}>
          <Card className="p-8">
            <div style={{ opacity: titleOpacity }}>
              <Badge className="mb-4">Step {stepNumber}</Badge>
              <h2 style={{ fontSize: 32, fontWeight: 700, marginBottom: 16 }}>{title}</h2>
            </div>
            <div style={{ opacity: termOpacity, background: '#1a1a2e', borderRadius: 8, padding: 24,
              fontFamily: 'monospace', fontSize: 20, color: '#00ff88' }}>
              <span style={{ color: '#888' }}>$ </span>
              <TypingText text={command} startFrame={termFrame + 5} charsPerFrame={0.5} />
            </div>
          </Card>
        </div>
      </SafeZone>
      <StepIndicator current={stepNumber} total={totalSteps} colors={colors} />
    </>
  );
};

const CodeScene: React.FC<{
  title: string; lines: string[]; highlightLine: number;
  stepNumber: number; totalSteps: number;
  branding: any; sceneTimecodes: Timecode[];
}> = ({ title, lines, highlightLine, stepNumber, totalSteps, branding, sceneTimecodes }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const colors = branding.colors;
  const s0 = sceneTimecodes[0]?.start ?? 0;

  const cardOpacity = interpolate(frame, [0, 10], [0, 1], { extrapolateRight: 'clamp' });
  // Title synced to sentence 1
  const titleFrame = sceneTimecodes[0] ? getRevealFrame(sceneTimecodes[0], s0, fps) : 8;
  const titleOpacity = interpolate(frame, [titleFrame, titleFrame + 12], [0, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  // Code synced to sentence 2
  const codeFrame = sceneTimecodes[1] ? getRevealFrame(sceneTimecodes[1], s0, fps) : 22;
  const codeOpacity = interpolate(frame, [codeFrame, codeFrame + 13], [0, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <>
      <SafeZone background={`linear-gradient(135deg, ${colors.primary}11, ${colors.secondary}11)`}>
        <div style={{ opacity: cardOpacity, width: '100%' }}>
          <div style={{ opacity: titleOpacity }}>
            <Badge className="mb-4">Step {stepNumber}</Badge>
            <h2 style={{ fontSize: 28, fontWeight: 700, marginBottom: 16, color: '#fff' }}>{title}</h2>
          </div>
          <div style={{ opacity: codeOpacity }}>
            <HighlightedCode lines={lines} highlightLine={highlightLine} startFrame={codeFrame + 15} colors={colors} />
          </div>
        </div>
      </SafeZone>
      <StepIndicator current={stepNumber} total={totalSteps} colors={colors} />
    </>
  );
};

const ResultScene: React.FC<{ command: string; output: string; sceneTimecodes: Timecode[] }> = ({ command, output, sceneTimecodes }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s0 = sceneTimecodes[0]?.start ?? 0;
  const outputFrame = sceneTimecodes[1] ? getRevealFrame(sceneTimecodes[1], s0, fps) : 15;
  const outputOpacity = interpolate(frame, [outputFrame, outputFrame + 15], [0, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <SafeZone background="#0d1117">
      <div style={{ width: '100%', background: '#161b22', borderRadius: 8, padding: 24, fontFamily: 'monospace', fontSize: 18 }}>
        <div style={{ color: '#8b949e' }}>$ {command}</div>
        <div style={{ color: '#3fb950', marginTop: 12, opacity: outputOpacity }}>{output}</div>
      </div>
    </SafeZone>
  );
};

const CalloutScene: React.FC<{ type: 'warning' | 'tip' | 'note'; message: string; colors: any }> = ({ type, message, colors }) => {
  return (
    <SafeZone background={`${colors.primary}0a`}>
      <CalloutCard type={type} message={message} />
    </SafeZone>
  );
};

const SummaryScene: React.FC<{ steps: string[]; branding: any; sceneTimecodes: Timecode[] }> = ({ steps, branding, sceneTimecodes }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s0 = sceneTimecodes[0]?.start ?? 0;

  return (
    <SafeZone background={`linear-gradient(135deg, ${branding.colors.primary}, ${branding.colors.secondary})`}>
      <Card className="p-8" style={{ width: '100%' }}>
        <h2 style={{ fontSize: 36, fontWeight: 700, marginBottom: 20 }}>What We Covered</h2>
        {steps.map((step, i) => {
          // Each recap item synced to a sentence timecode
          const revealAt = sceneTimecodes[i] ? getRevealFrame(sceneTimecodes[i], s0, fps) : 10 + i * 12;
          const itemOpacity = interpolate(frame, [revealAt, revealAt + 12], [0, 1],
            { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
          return (
            <div key={i} style={{ opacity: itemOpacity, display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <span style={{ color: '#3fb950', fontSize: 20 }}>✓</span>
              <span style={{ fontSize: 20 }}>{step}</span>
            </div>
          );
        })}
      </Card>
    </SafeZone>
  );
};

// === Main Composition ===

export const Generated: React.FC<TutorialVideoProps> = ({ content, branding, audio, duration }) => {
  const { fps, height } = useVideoConfig();
  const totalSteps = 3;

  // --- Timecode-driven timing ---
  const timecodes: Timecode[] = audio.narration?.timecodes ?? [];
  const narrationParagraphs = [
    "Let's learn how to integrate Stripe payments into your app.",
    "First, install the Stripe SDK. Run npm install stripe in your terminal.",
    "The package installed successfully. Three packages added in two seconds.",
    "Now create a checkout session. Import Stripe and configure it with your API key. The key line is line_items where we define what the customer is buying.",
    "Important: never expose your secret key in client-side code.",
    "Finally, add your API key to the environment. Create a dot env file with your Stripe key.",
    "That's everything we covered. You installed Stripe, created a checkout session, and configured your API key.",
  ];
  const scenes = groupTimecodesByScene(timecodes, narrationParagraphs);

  return (
    <AbsoluteFill style={{ background: '#000', fontFamily }}>
      {audio.music?.staticPath && <Audio src={staticFile(audio.music.staticPath)} volume={0.3} />}
      {audio.narration?.staticPath && <Audio src={staticFile(audio.narration.staticPath)} volume={1} />}

      <TransitionSeries>
        {/* Scene 1: Intro — duration from timecodes */}
        <TransitionSeries.Sequence durationInFrames={getSceneDuration(scenes[0], fps)}>
          <IntroScene content={content} branding={branding} height={height} sceneTimecodes={scenes[0]} />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition timing={linearTiming({ durationInFrames: 10 })} presentation={fade()} />

        {/* Scene 2: Install command — reveals synced to sentences */}
        <TransitionSeries.Sequence durationInFrames={getSceneDuration(scenes[1], fps)}>
          <CommandScene title="Install the SDK" command="npm install @stripe/stripe-js"
            stepNumber={1} totalSteps={totalSteps} branding={branding} sceneTimecodes={scenes[1]} />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition timing={linearTiming({ durationInFrames: 8 })} presentation={slide()} />

        {/* Scene 3: Install result — output synced to sentence */}
        <TransitionSeries.Sequence durationInFrames={getSceneDuration(scenes[2], fps)}>
          <ResultScene command="npm install @stripe/stripe-js" output="✓ Added 3 packages in 2.1s"
            sceneTimecodes={scenes[2]} />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition timing={linearTiming({ durationInFrames: 10 })} presentation={fade()} />

        {/* Scene 4: Code walkthrough — highlight synced to sentence 3 */}
        <TransitionSeries.Sequence durationInFrames={getSceneDuration(scenes[3], fps)}>
          <CodeScene title="Create the checkout session"
            lines={[
              "import Stripe from 'stripe';",
              "const stripe = new Stripe(process.env.STRIPE_KEY);",
              "const session = await stripe.checkout.sessions.create({",
              "  line_items: [{ price: 'price_xxx', quantity: 1 }],",
              "  mode: 'payment',",
              "  success_url: 'https://example.com/success',",
              "});",
            ]}
            highlightLine={3}
            stepNumber={2} totalSteps={totalSteps} branding={branding} sceneTimecodes={scenes[3]} />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition timing={linearTiming({ durationInFrames: 10 })} presentation={fade()} />

        {/* Scene 5: Warning callout */}
        <TransitionSeries.Sequence durationInFrames={getSceneDuration(scenes[4], fps)}>
          <CalloutScene type="warning" message="Never expose your secret key in client-side code."
            colors={branding.colors} />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition timing={linearTiming({ durationInFrames: 10 })} presentation={fade()} />

        {/* Scene 6: Config step */}
        <TransitionSeries.Sequence durationInFrames={getSceneDuration(scenes[5], fps)}>
          <CommandScene title="Add your API key" command="echo STRIPE_KEY=sk_test_... >> .env"
            stepNumber={3} totalSteps={totalSteps} branding={branding} sceneTimecodes={scenes[5]} />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition timing={linearTiming({ durationInFrames: 10 })} presentation={fade()} />

        {/* Scene 7: Summary — each recap item synced to a sentence */}
        <TransitionSeries.Sequence durationInFrames={getSceneDuration(scenes[6], fps)}>
          <SummaryScene steps={['Installed the Stripe SDK', 'Created a checkout session', 'Configured the API key']}
            branding={branding} sceneTimecodes={scenes[6]} />
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </AbsoluteFill>
  );
};
```

**Adapt this for each video:**
- Write `narrationParagraphs` to match your exact narration script from Step 4
- **Always use `getSceneDuration(scenes[i], fps)`** for `durationInFrames` — never hardcode `N * fps`
- **Always pass `sceneTimecodes={scenes[i]}` to scene components** — use `getRevealFrame()` for visual timing
- Add or remove scenes to match the number of narration paragraphs (one paragraph = one scene)
- Import different user components as needed

**Remotion rules:**
- Audio: `import { Audio } from '@remotion/media'` — NOT from `remotion`
- Audio src: `staticFile(audio.music.staticPath)` — NEVER raw paths
- Conditional audio: `{audio.music?.staticPath && <Audio ... />}`
- Animations: ONLY `useCurrentFrame()` + `spring()` / `interpolate()` — NO CSS animations
- Images: `<Img>` from `remotion` — NOT `<img>`
- Fonts: Load via `@remotion/google-fonts` before use
- Duration: always from `getSceneDuration(timecodes, fps)` — NEVER hardcode `N * fps`
- Clamp: Always use `extrapolateRight: 'clamp'` on interpolate
- SafeZone: every scene wraps content in `<SafeZone>` — NEVER use bare `<AbsoluteFill>` with ad-hoc padding/width

---

### Step 6: Validate & Render

**Validation checklist (must pass all):**

**Remotion basics:**
1. Audio imported from `@remotion/media` (not `remotion`)
2. Audio uses `staticFile()` with `staticPath`
3. Conditional audio rendering
4. Font loaded via `@remotion/google-fonts`
5. No CSS animations or Tailwind `animate-*` classes
6. All animations use `useCurrentFrame()` + `spring`/`interpolate`
7. User's components are imported with correct relative paths
8. User's components render without errors in Remotion context
9. **Scene durations use `getSceneDuration()` from timecodes** — no hardcoded `N * fps`
10. **Scene components receive `sceneTimecodes` prop** — reveals use `getRevealFrame()` not fixed frame offsets
11. **Every scene uses `<SafeZone>`** — no content placed directly in `<AbsoluteFill>` without the SafeZone wrapper

**Scene structure:**
12. Has intro scene and summary scene
13. **Each scene explains exactly ONE step** — no scene combines two steps. If you see a numbered list (`1. ... 2. ... 3. ...`) in any scene's JSX, the video is BROKEN — split immediately
14. **No numbered or bulleted lists in scenes** — if a scene renders `<ol>`, `<ul>`, or manual numbering, it MUST be split into separate scenes. This is the #1 most common mistake.
15. **Every scene has at least 30% empty space** — if it looks crowded, remove content or split
16. **SafeZone constrains all content** — no element extends beyond the 1200px centered column. No mock UIs pushed to screen edges. No content touching the 1920px frame boundary.
17. **Every narration paragraph has a matching visual scene** — no explanation without a visual
18. **Every sentence in the narration has a matching visual change** — the screen NEVER stays static while the narrator keeps talking
19. **No scene has more than 3 sentences of narration** — if it does, split into two scenes
20. Narration content matches visual progression 1:1

**Tutorial quality:**
21. **All code/commands use TypingText** — characters appear one by one with blinking cursor
22. **Multi-line code uses HighlightedCode** — important line spotlighted, rest dimmed
23. **Step scenes have StepIndicator** — progress dots showing "Step N of M" (skip on intro/summary)
24. **Elements appear in stages synced to timecodes** — each reveal at a `getRevealFrame()` value, never all at once
25. **Command scenes are followed by ResultScene** — show `✓ Success` output after running a command
26. **Warnings/tips from docs are CalloutScene** — distinct styled cards, not embedded in code scenes
27. **Pacing driven by timecodes** — scene durations match narration length, not arbitrary guesses

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
