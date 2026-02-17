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
   - `quickstart` → 3-5 steps = 5-7 scenes (intro + steps + summary), ~45-60s video
   - `tutorial` → 5-8 steps = 7-10 scenes, ~60-90s video
   - `api-reference` → endpoint showcases, 4-6 scenes, ~45-60s
   - `guide` → concept explanations + code, 6-10 scenes, ~60-90s
   - `how-to` → problem/solution format, 5-8 scenes, ~45-60s

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

- **Intro** (4-6s) — "Let's learn how to [topic] with [technology]"
- **Overview** (5-8s) — What this covers, prerequisites
- **Step 1** — First step only. "First, let's install..."
- **Step 2** — Second step only. "Next, we'll configure..."
- **Step 3** — Third step only. "Now let's create..."
- ... (one paragraph per step, as many as the docs require)
- **Key Takeaways** (5-8s) — Recap the important points
- **Next Steps** (3-5s) — What to explore next, reference to docs

**⚠️ CRITICAL:** Do NOT combine multiple steps into a single paragraph. Each step gets its own narration paragraph and its own visual scene. If the docs have 5 steps, the narration must have 5 separate step paragraphs.

**Pacing — match narration length to complexity:**

| Step complexity | Narration length | Result | Example |
|----------------|-----------------|--------|---------|
| Simple command | 1-2 sentences (~15 words) | 4-5s scene | `npm install stripe` |
| Config/setup | 2-3 sentences (~30 words) | 6-8s scene | Setting env variables |
| Code with explanation | 3-5 sentences (~50 words) | 8-12s scene | Writing an API route |
| Multi-part concept | 4-6 sentences (~60 words) | 10-14s scene | Explaining auth flow |

Write shorter paragraphs for "do this" steps, longer paragraphs for "understand this" steps. Simple steps: be concise. Complex steps: explain WHY, not just WHAT.

Guidelines:
- Instructional tone, use "we" and "let's" (collaborative, not lecturing)
- Mention specific function/class names from the code
- Every step paragraph should describe exactly what the viewer will see on screen

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

### Step 5: Design & Write Generated.tsx

Write the full composition at `remotion/src/compositions/Generated.tsx`.

#### Quick Reference — Every Step Scene Must Have:

1. **`<StepIndicator>`** — progress dots showing "Step N of M" (top-right)
2. **Staged reveals** — elements appear one by one (title → badge → code → highlight), 10-15 frames apart
3. **Typing effect** — all code/commands type character-by-character with blinking cursor
4. **Code highlighting** — for multi-line code, spotlight the key line, dim the rest
5. **Result scene after commands** — show `✓ Success` output after install/build commands
6. **Callout scenes** — warnings/tips from docs get their own styled card scene

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

---

#### Scene Design Rules

> **⚠️ THE #1 RULE: ONE step, ONE idea, ONE scene.**
> If a scene has more than ONE command, ONE code block, or ONE concept — you MUST split it into separate scenes.
> A scene with a numbered list (Step 1, Step 2, Step 3…) is ALWAYS wrong. Each of those steps must be its own scene.

**Maximum content per scene:**
- ONE title/heading
- ONE code block OR ONE command OR ONE short explanation (1-2 sentences)
- ONE supporting visual (mock UI, terminal output, or diagram)
- If you have more content, it belongs in the NEXT scene

**Whitespace and spacing.** Every scene should feel spacious, not cramped:
- Use generous padding (40-60px on all sides)
- Leave at least 30% of the scene area as empty space
- Text should never touch the edges of containers
- If content feels tight, you have too much — split into two scenes

**Staged reveals in every scene.** Elements appear one by one, 10-15 frames apart:
1. Frame 0-15: Background + container fade in
2. Frame 10-25: Title/heading appears
3. Frame 20-40: Badge or label slides in
4. Frame 30+: Main content appears (with typing effect if code)
5. Frame 50+: Highlight kicks in on key line

**Show the result after commands.** After typing `npm install`, show a result scene with `✓ Successfully installed`. After writing code, show mock output. Use result scenes for install/build/run commands. Skip them for config-only steps.

**Callouts get their own scene.** Warnings, tips, and notes from the docs become separate 3-4s scenes using `CalloutCard`. Don't embed them inside code scenes.

**Layouts.** Use at least 3 different layouts across scenes: centered, split (60/40), stacked, grid, full-bleed.

---

#### Complete Generated.tsx Example

This shows how ALL the pieces compose together. Adapt the scene components, props, and content for each video — but follow this structure:

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

// === Reusable helpers (StepIndicator, TypingText, HighlightedCode, CalloutCard) ===
// ... paste the helper components from above here ...

// === Scene Components ===

const IntroScene: React.FC<{ content: any; branding: any; height: number }> = ({ content, branding, height }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  // Stage 1: card
  const cardScale = spring({ frame, fps, from: 0.8, to: 1, config: { damping: 12 } });
  const cardOpacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: 'clamp' });
  // Stage 2: title (frame 12)
  const titleOpacity = interpolate(frame, [12, 25], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const titleSlide = interpolate(frame, [12, 25], [20, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  // Stage 3: badges (frame 25)
  const badgeOpacity = interpolate(frame, [25, 38], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: `linear-gradient(135deg, ${branding.colors.primary}, ${branding.colors.secondary})` }}>
      <div style={{ transform: `scale(${cardScale})`, opacity: cardOpacity }}>
        <Card className="p-8 max-w-2xl">
          <div style={{ opacity: titleOpacity, transform: `translateY(${titleSlide}px)` }}>
            <h1 style={{ fontSize: height * 0.07, fontWeight: 700 }}>{content.title}</h1>
          </div>
          <div className="flex gap-2 mt-4" style={{ opacity: badgeOpacity }}>
            <Badge>Tutorial</Badge>
            <Badge variant="outline">{content.technology}</Badge>
          </div>
        </Card>
      </div>
    </AbsoluteFill>
  );
};

const CommandScene: React.FC<{
  title: string; command: string;
  stepNumber: number; totalSteps: number;
  branding: any;
}> = ({ title, command, stepNumber, totalSteps, branding }) => {
  const frame = useCurrentFrame();
  const colors = branding.colors;
  // Stage 1: card (frame 0-10)
  const cardOpacity = interpolate(frame, [0, 10], [0, 1], { extrapolateRight: 'clamp' });
  // Stage 2: title (frame 8-20)
  const titleOpacity = interpolate(frame, [8, 20], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const titleSlide = interpolate(frame, [8, 20], [15, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  // Stage 3: terminal (frame 22-32)
  const termOpacity = interpolate(frame, [22, 32], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: `linear-gradient(135deg, ${colors.primary}11, ${colors.secondary}11)` }}>
      <StepIndicator current={stepNumber} total={totalSteps} colors={colors} />
      <div style={{ opacity: cardOpacity, width: '80%' }}>
        <Card className="p-8">
          <div style={{ opacity: titleOpacity, transform: `translateY(${titleSlide}px)` }}>
            <Badge className="mb-4">Step {stepNumber}</Badge>
            <h2 style={{ fontSize: 32, fontWeight: 700, marginBottom: 16 }}>{title}</h2>
          </div>
          <div style={{ opacity: termOpacity, background: '#1a1a2e', borderRadius: 8, padding: 24,
            fontFamily: 'monospace', fontSize: 20, color: '#00ff88' }}>
            <span style={{ color: '#888' }}>$ </span>
            <TypingText text={command} startFrame={35} charsPerFrame={0.5} />
          </div>
        </Card>
      </div>
    </AbsoluteFill>
  );
};

const ResultScene: React.FC<{ command: string; output: string }> = ({ command, output }) => {
  const frame = useCurrentFrame();
  const outputOpacity = interpolate(frame, [15, 30], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0d1117' }}>
      <div style={{ width: '75%', background: '#161b22', borderRadius: 8, padding: 24, fontFamily: 'monospace', fontSize: 18 }}>
        <div style={{ color: '#8b949e' }}>$ {command}</div>
        <div style={{ color: '#3fb950', marginTop: 12, opacity: outputOpacity }}>{output}</div>
      </div>
    </AbsoluteFill>
  );
};

const CodeScene: React.FC<{
  title: string; lines: string[]; highlightLine: number;
  stepNumber: number; totalSteps: number;
  branding: any;
}> = ({ title, lines, highlightLine, stepNumber, totalSteps, branding }) => {
  const frame = useCurrentFrame();
  const colors = branding.colors;
  const cardOpacity = interpolate(frame, [0, 10], [0, 1], { extrapolateRight: 'clamp' });
  const titleOpacity = interpolate(frame, [8, 20], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const codeOpacity = interpolate(frame, [22, 35], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: `linear-gradient(135deg, ${colors.primary}11, ${colors.secondary}11)` }}>
      <StepIndicator current={stepNumber} total={totalSteps} colors={colors} />
      <div style={{ opacity: cardOpacity, width: '85%' }}>
        <div style={{ opacity: titleOpacity }}>
          <Badge className="mb-4">Step {stepNumber}</Badge>
          <h2 style={{ fontSize: 28, fontWeight: 700, marginBottom: 16, color: '#fff' }}>{title}</h2>
        </div>
        <div style={{ opacity: codeOpacity }}>
          <HighlightedCode lines={lines} highlightLine={highlightLine} startFrame={35} colors={colors} />
        </div>
      </div>
    </AbsoluteFill>
  );
};

const CalloutScene: React.FC<{ type: 'warning' | 'tip' | 'note'; message: string; colors: any }> = ({ type, message, colors }) => {
  return (
    <AbsoluteFill style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${colors.primary}0a` }}>
      <CalloutCard type={type} message={message} />
    </AbsoluteFill>
  );
};

const SummaryScene: React.FC<{ steps: string[]; branding: any }> = ({ steps, branding }) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: `linear-gradient(135deg, ${branding.colors.primary}, ${branding.colors.secondary})` }}>
      <Card className="p-8 max-w-2xl">
        <h2 style={{ fontSize: 36, fontWeight: 700, marginBottom: 20 }}>What We Covered</h2>
        {steps.map((step, i) => {
          const itemOpacity = interpolate(frame, [10 + i * 12, 22 + i * 12], [0, 1],
            { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
          return (
            <div key={i} style={{ opacity: itemOpacity, display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <span style={{ color: '#3fb950', fontSize: 20 }}>✓</span>
              <span style={{ fontSize: 20 }}>{step}</span>
            </div>
          );
        })}
      </Card>
    </AbsoluteFill>
  );
};

// === Main Composition ===

export const Generated: React.FC<TutorialVideoProps> = ({ content, branding, audio, duration }) => {
  const { fps, height } = useVideoConfig();
  const totalSteps = 3; // Adjust per video

  return (
    <AbsoluteFill style={{ background: '#000', fontFamily }}>
      {audio.music?.staticPath && <Audio src={staticFile(audio.music.staticPath)} volume={0.3} />}
      {audio.narration?.staticPath && <Audio src={staticFile(audio.narration.staticPath)} volume={1} />}

      <TransitionSeries>
        {/* Scene 1: Intro (4-6s) */}
        <TransitionSeries.Sequence durationInFrames={5 * fps}>
          <IntroScene content={content} branding={branding} height={height} />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition timing={linearTiming({ durationInFrames: 10 })} presentation={fade()} />

        {/* Scene 2: Install command (4-5s) */}
        <TransitionSeries.Sequence durationInFrames={5 * fps}>
          <CommandScene title="Install the SDK" command="npm install @stripe/stripe-js"
            stepNumber={1} totalSteps={totalSteps} branding={branding} />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition timing={linearTiming({ durationInFrames: 8 })} presentation={slide()} />

        {/* Scene 3: Install result (3s) */}
        <TransitionSeries.Sequence durationInFrames={3 * fps}>
          <ResultScene command="npm install @stripe/stripe-js" output="✓ Added 3 packages in 2.1s" />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition timing={linearTiming({ durationInFrames: 10 })} presentation={fade()} />

        {/* Scene 4: Code walkthrough (8-12s) */}
        <TransitionSeries.Sequence durationInFrames={10 * fps}>
          <CodeScene title="Create the checkout session"
            lines={[
              "import Stripe from 'stripe';",
              "",
              "const stripe = new Stripe(process.env.STRIPE_KEY);",
              "",
              "const session = await stripe.checkout.sessions.create({",
              "  line_items: [{ price: 'price_xxx', quantity: 1 }],",
              "  mode: 'payment',",
              "  success_url: 'https://example.com/success',",
              "});",
            ]}
            highlightLine={5}
            stepNumber={2} totalSteps={totalSteps} branding={branding} />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition timing={linearTiming({ durationInFrames: 10 })} presentation={fade()} />

        {/* Scene 5: Warning callout (3-4s) */}
        <TransitionSeries.Sequence durationInFrames={4 * fps}>
          <CalloutScene type="warning" message="Never expose your secret key in client-side code."
            colors={branding.colors} />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition timing={linearTiming({ durationInFrames: 10 })} presentation={fade()} />

        {/* Scene 6: Config step (6-8s) */}
        <TransitionSeries.Sequence durationInFrames={7 * fps}>
          <CommandScene title="Add your API key" command="echo STRIPE_KEY=sk_test_... >> .env"
            stepNumber={3} totalSteps={totalSteps} branding={branding} />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition timing={linearTiming({ durationInFrames: 10 })} presentation={fade()} />

        {/* Scene 7: Summary (5-8s) */}
        <TransitionSeries.Sequence durationInFrames={6 * fps}>
          <SummaryScene steps={['Installed the Stripe SDK', 'Created a checkout session', 'Configured the API key']}
            branding={branding} />
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </AbsoluteFill>
  );
};
```

**Adapt this for each video:**
- Change the scene components and props to match the documentation content
- Add or remove scenes to match the number of steps (one per scene)
- Adjust `durationInFrames` based on narration pacing (simple = 4-5s, complex = 8-12s)
- Import different user components as needed
- Use `CodeScene` + `HighlightedCode` for multi-line code, `CommandScene` + `TypingText` for terminal commands

**Remotion rules:**
- Audio: `import { Audio } from '@remotion/media'` — NOT from `remotion`
- Audio src: `staticFile(audio.music.staticPath)` — NEVER raw paths
- Conditional audio: `{audio.music?.staticPath && <Audio ... />}`
- Animations: ONLY `useCurrentFrame()` + `spring()` / `interpolate()` — NO CSS animations
- Images: `<Img>` from `remotion` — NOT `<img>`
- Fonts: Load via `@remotion/google-fonts` before use
- Duration: `seconds * fps` — never hardcode frame numbers
- Clamp: Always use `extrapolateRight: 'clamp'` on interpolate

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
9. Scene durations calculated from fps

**Scene structure:**
10. Has intro scene and summary scene
11. **Each scene explains exactly ONE step** — no scene combines two steps
12. **No scene has a numbered list of steps** — if you see "1. … 2. … 3. …" in a scene, it must be split
13. **Every scene has at least 30% empty space** — if it looks crowded, remove content or split
14. **Every narration paragraph has a matching visual scene** — no explanation without a visual
15. Narration content matches visual progression 1:1

**Tutorial quality:**
16. **All code/commands use TypingText** — characters appear one by one with blinking cursor
17. **Multi-line code uses HighlightedCode** — important line spotlighted, rest dimmed
18. **Step scenes have StepIndicator** — progress dots showing "Step N of M" (skip on intro/summary)
19. **Elements appear in stages** — title first, then badge, then code, then highlight (never all at once)
20. **Command scenes are followed by ResultScene** — show what happens after running a command
19. **Warnings/tips from docs are CalloutScene** — distinct styled cards, not embedded in code scenes
20. **Pacing varies by complexity** — simple steps are 4-5s, complex code walkthroughs are 8-12s

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
