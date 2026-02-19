---
name: docs-to-video
description: Turn documentation URLs into tutorial videos using the user's own React components and Remotion
---

# Docs to Video

Generate tutorial and how-to videos from documentation URLs. The video uses the user's **own React components** (buttons, cards, layouts) so the tutorial looks like their actual product. Produces an MP4 with AI narration, background music, and animated scenes.

**Target file:** `remotion/src/compositions/Generated.tsx` (inside user's project, overwritten each run)

---

## Step 0: Setup Validation (run this FIRST)

Before starting the workflow, check if the MCP tools are available. Try calling any tool (e.g., `extract_docs_content`). If it works, skip to Step 1.

**If tools are NOT available** (you get "unknown tool" or similar error), run the setup:

```bash
npx docs-to-video setup
```

This copies the MCP server, remotion template, and dependencies into the user's project. It also registers the MCP server and skill automatically.

If the user doesn't have API keys yet, tell them:
> You need to add your API keys to `~/.docs-to-video/.env`:
> - **TABSTACK_API_KEY** — get it at https://tabstack.ai/dashboard
> - **ELEVENLABS_API_KEY** — get it at https://elevenlabs.io

Then **tell the user to restart Claude Code:**
> Setup complete! Please restart Claude Code (quit and re-open) for the MCP tools to load, then run `/docs-to-video <url>` again.

**STOP here if you had to run setup.** The MCP tools only load at Claude Code startup, so the user must restart before proceeding to Step 1.

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

Check if `remotion/` directory exists in the user's project root. If not, create it and copy the template contents:

```bash
mkdir -p remotion
cp -r remotion-template/* remotion/
```

> ⚠️ **DO NOT** use `cp -r remotion-template remotion` — if `remotion/` already exists, this creates `remotion/remotion-template/` (nested and broken). Always use `cp -r remotion-template/* remotion/` to copy the **contents**.

**After copying, verify the structure is flat** — `remotion/package.json` must exist at the top level:

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

If you see `remotion/remotion-template/` (nested), fix it immediately:
```bash
mv remotion/remotion-template/* remotion/ && rm -rf remotion/remotion-template
```

Next:

1. **Update Tailwind content paths** if the user's components aren't in `../src/`:
   - Default: `'../src/**/*.{ts,tsx}'`
   - If user has `app/` structure: add `'../app/**/*.{ts,tsx}'`
   - If monorepo with `packages/`: add `'../packages/ui/**/*.{ts,tsx}'`
   - Check where the user's components live and ensure `remotion/tailwind.config.js` includes them

2. Run `cd remotion && npm install`

3. Verify: `remotion/src/index.ts` exists and imports Root and `style.css`

**If remotion/ already exists**, verify the structure is flat (no nested `remotion-template/` folder) and that `tailwind.config.js` content paths include the user's component directories.

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

3. **Music Style** — pick a style that matches the tutorial energy:
   - `pop` — upbeat, energetic (good default for most tutorials)
   - `hip-hop` — modern, rhythmic (developer tools, CLI tutorials)
   - `rock` — high energy (gaming, performance topics)
   - `jazz` — smooth, sophisticated (enterprise, fintech)

---

### Step 4: Write Narration Script & Generate Audio

Write a **short, punchy** narration script. Each paragraph becomes one scene — **one step per paragraph, one paragraph per scene**:

- **Intro** — 1 sentence. "Let's set up [topic] with [technology]."
- **Step 1** — 1-2 sentences. "Step 1. Run the install command to grab the Stripe SDK."
- **Step 2** — 1-2 sentences. "Step 2. Add your secret key to the environment — Stripe uses it to authenticate."
- **Step 3** — 1-2 sentences. "Step 3. Create a checkout session — this is where the magic happens."
- ... (one paragraph per step, as many as the docs require)
- **Summary** — 1-2 sentences. "That's it! You've got Stripe installed, a checkout ready, and your key secured."

> **⚠️ KEEP IT SHORT.** The narration is a voiceover for a visual tutorial, not a lecture.
> The visuals do the heavy lifting — the narration just guides attention.
> - **Most steps need only 1 sentence.** Say what to do, not how it works.
> - **Maximum 2 sentences per step.** If you need 3+, split into two scenes.
> - **Cut filler words.** No "Now let's go ahead and..." — just "Install the SDK."
> - **Total video: 30-60 seconds.** Aim for the shortest video that covers all steps.

**⚠️ CRITICAL:** Do NOT combine multiple steps into a single paragraph. Each step gets its own narration paragraph and its own visual scene. If the docs have 5 substeps (like "visit the site, click settings, create key, name it, copy it"), write 5 separate paragraphs — the agent creates one scene per paragraph, so combining them forces multiple steps into one scene, which is the #1 quality failure.

**Pacing — how much narration to write per step** (scene duration is derived from timecodes, not from this table):

| Step complexity | Narration to write | Example |
|----------------|-------------------|---------|
| Simple command | 1 sentence (~10 words) | "Step 1. Run the install to grab the Stripe SDK." |
| Config/setup | 1-2 sentences (~18 words) | "Step 2. Add your secret key to the env file — Stripe needs this to authenticate." |
| Code with explanation | 2 sentences (~22 words) | "Step 3. Create the checkout session. The key part here is the line_items array — that's what the customer is buying." |
| Multi-part concept | 2 sentences (~25 words) | "Step 4. Set up the webhook endpoint. This listens for payment events so your app knows when a charge goes through." |

**Guidelines:**
- **Always say "Step N" at the start of each step's narration.** The viewer should hear "Step 1", "Step 2", etc. for clear audible navigation and pacing. The intro and summary scenes do NOT get step numbers.
- **Narration should be conversational and add value beyond the visuals.** It's fine to reference what's on screen ("run the install command", "add this to your config"), but don't literally read code or commands verbatim. Describe actions naturally and add *why* it matters. BAD: "Type npm install at sign stripe slash stripe dash js." GOOD: "Step 1. Run the install command to pull in the Stripe library." The voice should feel like a knowledgeable friend guiding you, not a screen reader.
- Short and direct — say what to do, let the visuals show how
- Use "we" and "let's" sparingly — prefer imperative: "Install the SDK" over "Let's go ahead and install the SDK"
- Mention specific function/class names only when the viewer needs to see them
- **Avoid abbreviations with periods** ("Dr.", "vs.") — the timecode system splits on `.!?` and abbreviations cause misaligned sentence counts
- **No filler phrases:** "Now let's go ahead and", "What we're going to do next is", "As you can see" — cut all of these

**Script structure for natural speech flow:**
- Write as if you're a knowledgeable friend walking someone through the setup — warm, clear, and helpful
- Each step paragraph MUST start with "Step N." followed by a natural description of the action
- It's fine to reference what's on screen ("run the install", "add this config"), but describe it naturally — never read code character by character
- Add a brief *why* or *what it does* after the action — "Step 2. Add your key to the env file — Stripe needs it to verify your account." This makes the narration valuable beyond just watching the screen
- Write each paragraph as one or two flowing sentences — NOT bullet points or fragments
- Avoid choppy fragments like "Now. The key." — write "Now add the API key to your environment."
- Connect ideas within a paragraph: "Install the SDK, then import it in your app."
- Separate paragraphs with blank lines — these create natural pauses in the narration audio
- Do NOT use SSML tags — ElevenLabs handles pacing from plain text and paragraph breaks

**Call `generate_audio`** with:
- `musicStyle` — `pop`, `hip-hop`, `rock`, or `jazz` (default to `pop` for most tutorials)
- `narrationScript` — your script
- `duration` — estimated total video length in seconds
- `remotionProjectPath` — absolute path to the `remotion/` directory

**IMPORTANT: Always attempt music generation.** Do NOT skip it. Call the tool with `musicStyle` and let the API respond. Only fall back to narration-only if the API returns an actual error. Never preemptively skip music.

**Save returned values:**
- `audio.music.staticPath`
- `audio.narration.staticPath`
- `audio.narration.timecodes` — array of `{start: number, end: number, text: string}` per sentence, derived from **real audio alignment** (not estimated). **You MUST use these to time scene durations and visual reveals in Step 5.** Do NOT guess frame numbers.
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

**ClickIndicator — cursor + click ripple (use when narration says "click", "select", "tap", "press"):**
```typescript
const ClickIndicator: React.FC<{
  x: number;
  y: number;
  startFrame: number;
  label?: string;
}> = ({ x, y, startFrame, label }) => {
  const frame = useCurrentFrame();
  const rel = frame - startFrame;
  if (rel < 0 || rel > 36) return null;

  // Cursor SVG tip offset — the pointer tip in the SVG path is at (5,3) in a 24×24 viewBox,
  // rendered at 28×28px. Subtract this offset so the tip lands exactly at (x, y).
  const tipOffsetX = 6;
  const tipOffsetY = 4;

  // Phase 1: cursor slides in from top-left offset, tip lands exactly at (x, y)
  const cursorX = interpolate(rel, [0, 12], [x - 50 - tipOffsetX, x - tipOffsetX], { extrapolateRight: 'clamp' });
  const cursorY = interpolate(rel, [0, 12], [y - 40 - tipOffsetY, y - tipOffsetY], { extrapolateRight: 'clamp' });
  const cursorOpacity = interpolate(rel, [0, 6, 28, 36], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });

  // Phase 2: click ripple expands from click point
  const rippleScale = rel >= 14
    ? interpolate(rel, [14, 26], [0, 2.5], { extrapolateRight: 'clamp' }) : 0;
  const rippleOpacity = rel >= 14
    ? interpolate(rel, [14, 26], [0.5, 0], { extrapolateRight: 'clamp' }) : 0;

  return (
    <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
      {/* Cursor pointer SVG — positioned so the tip of the arrow lands at (x, y) */}
      <svg width="28" height="28" viewBox="0 0 24 24"
        style={{ position: 'absolute', left: cursorX, top: cursorY, opacity: cursorOpacity,
          filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))' }}>
        <path d="M5 3l14 8-6.5 1.5L10 19z" fill="white" stroke="black" strokeWidth="1.5" />
      </svg>
      {/* Click ripple ring — centered exactly at the target point */}
      <div style={{ position: 'absolute', left: x - 20, top: y - 20, width: 40, height: 40,
        borderRadius: '50%', border: '3px solid rgba(255,255,255,0.8)',
        transform: `scale(${rippleScale})`, opacity: rippleOpacity }} />
      {/* Optional label */}
      {label && cursorOpacity > 0.5 && (
        <div style={{ position: 'absolute', left: x + 18, top: y - 10,
          background: 'rgba(0,0,0,0.75)', color: '#fff', fontSize: 12, fontWeight: 600,
          padding: '4px 10px', borderRadius: 6, opacity: cursorOpacity, whiteSpace: 'nowrap' }}>
          {label}
        </div>
      )}
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

**Click indicators for interactive steps.** When narration mentions clicking, selecting, tapping, or pressing a UI element:
1. Add `<ClickIndicator>` inside the scene, OUTSIDE `<SafeZone>` (it uses absolute positioning in the full 1920×1080 frame)
2. **Calculate `x` and `y` precisely** — see coordinate math below
3. Set `startFrame` to `getRevealFrame()` of the sentence mentioning the click
4. Optionally set `label` to the button text (e.g., `label="Create API Key"`)
5. Auto-hides after 36 frames (~1.2s at 30fps)

**⚠️ ACCURATE CLICK POSITIONING — coordinate calculation (MUST follow this):**

The video frame is 1920×1080. SafeZone creates a centered column:
- SafeZone left edge: `(1920 - 1200) / 2 = 360px` from left
- SafeZone right edge: `360 + 1200 = 1560px` from left
- SafeZone top padding: `60px`
- SafeZone bottom: `1080 - 60 = 1020px`
- Content padding inside SafeZone: `80px` left/right → content starts at `360 + 80 = 440px`, ends at `1560 - 80 = 1480px`
- Usable content width: `1480 - 440 = 1040px`

**To find the exact center of a button, work from the inside out:**

1. **Identify the button's container** — is it inside a Card with padding? A flex row? Centered or left-aligned?
2. **Calculate the button's horizontal center:**
   - If the button is **centered** in SafeZone (default flex column + alignItems center): `x = 960` (frame center)
   - If the button is **left-aligned**: `x = 440 + buttonPaddingLeft + (buttonWidth / 2)`
   - If the button is **right-aligned**: `x = 1480 - buttonPaddingRight - (buttonWidth / 2)`
   - If inside a **flex row with gap**: calculate each item's position based on flex layout
   - If the button is inside a Card with its own padding (e.g., `p-8` = 32px): add that padding to the offset
3. **Calculate the button's vertical center:**
   - Count the elements above the button in the scene layout (titles, text, spacing, margins)
   - SafeZone uses `justifyContent: 'center'`, so content is vertically centered in the frame
   - Estimate total content height, then: `contentTop = (1080 - totalContentHeight) / 2`
   - Add heights of elements above the button + half the button's own height
4. **Common button sizes to assume:** standard button ~40px tall, large button ~48px, small ~32px. Standard button width ~120-200px depending on text length.

**Quick reference for common layouts:**

| Layout | Button position | x | y (approx) |
|--------|----------------|---|-------------|
| Centered card, button at bottom | Center of card | 960 | 540 + (cardHeight/2) - 20 |
| Sidebar nav, menu item | Left column | 440 + sidebarWidth/2 | itemTop + 20 |
| Top-right action button | Right side | 1400-1480 | 120-160 |
| Form with submit at bottom | Center | 960 | formBottom - 30 |
| Mock browser, button inside content | Center of mock content area | 960 | mockContentY + buttonOffsetY |

**Example — scene with a Card containing a title + text + centered button:**
```
Card padding: 32px (p-8). Card is centered in SafeZone.
Title: ~40px tall, marginBottom 16px
Description text: ~24px tall, marginBottom 24px
Button: ~44px tall

Total content height ≈ 32 + 40 + 16 + 24 + 24 + 44 + 32 = 212px
Card top = (1080 - 212) / 2 ≈ 434
Button center Y = 434 + 32 + 40 + 16 + 24 + 24 + 22 = 592
Button center X = 960 (centered)

→ <ClickIndicator x={960} y={592} ... />
```

**IMPORTANT: When writing scene JSX, give the target button a known size.** If the button's size is explicit (e.g., `style={{ width: 200, height: 44 }}`), coordinate calculation is much more reliable. Always set explicit `width` and `height` on clickable elements when using ClickIndicator.

**When to use ClickIndicator:** narration contains "click", "select", "tap", "press", "hit", "choose" AND the scene shows a mock UI with a visible button or link.
**When NOT to use:** terminal/code scenes (no buttons), abstract concepts, intro/summary scenes.

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

/** Group the flat timecodes array into per-scene groups by matching timecode text
 *  to narration paragraphs. Each timecode's `.text` is checked against each paragraph —
 *  if the paragraph contains that text, the timecode belongs to that scene.
 *  This avoids period-splitting issues ("Dr.", "vs.") since it uses the actual
 *  timecodes returned by the TTS engine. */
function groupTimecodesByScene(timecodes: Timecode[], paragraphs: string[]): Timecode[][] {
  const groups: Timecode[][] = paragraphs.map(() => []);
  let paraIdx = 0;

  for (const tc of timecodes) {
    // Find which paragraph this timecode belongs to by checking if its text
    // appears in the paragraph (starting from current paragraph, moving forward)
    let placed = false;
    for (let p = paraIdx; p < paragraphs.length; p++) {
      const normalizedPara = paragraphs[p].toLowerCase().replace(/[^a-z0-9 ]/g, '');
      const normalizedTc = tc.text.toLowerCase().replace(/[^a-z0-9 ]/g, '');
      if (normalizedPara.includes(normalizedTc) || normalizedTc.includes(normalizedPara.slice(0, 20))) {
        groups[p].push(tc);
        paraIdx = p;
        placed = true;
        break;
      }
    }
    // If timecode text didn't match any paragraph, assign to next paragraph that has no timecodes yet
    if (!placed) {
      // Advance to next paragraph if current one already has timecodes and this tc starts later
      if (paraIdx < paragraphs.length - 1 && groups[paraIdx].length > 0 &&
          tc.start > groups[paraIdx][groups[paraIdx].length - 1].end + 0.1) {
        paraIdx++;
      }
      if (paraIdx < groups.length) {
        groups[paraIdx].push(tc);
      }
    }
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
    "Let's set up Stripe payments in your app.",
    "Step 1. Run the install command to grab the Stripe SDK.",
    "And just like that, the package is ready to go.",
    "Step 2. Create a checkout session. The key part is the line_items array — that defines what the customer is buying.",
    "One important thing — never expose your secret key in client-side code.",
    "Step 3. Drop your API key into the environment file so Stripe can authenticate your requests.",
    "That's it! You've installed Stripe, created a checkout, and secured your key.",
  ];
  const scenes = groupTimecodesByScene(timecodes, narrationParagraphs);

  return (
    <AbsoluteFill style={{ background: '#000', fontFamily }}>
      {audio.music?.staticPath && (
        <Audio
          src={staticFile(audio.music.staticPath)}
          volume={(f) => {
            const duckFrame = getSceneDuration(scenes[0], fps);
            return interpolate(f, [duckFrame, duckFrame + 15], [0.25, 0.12], {
              extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
            });
          }}
        />
      )}
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
- **Click indicators:** When a scene narration says "click X", add `<ClickIndicator x={buttonCenterX} y={buttonCenterY} startFrame={getRevealFrame(sceneTimecodes[0], sceneStart, fps) + 15} label="X" />` as a sibling to `<SafeZone>`, not inside it. **Calculate `x` and `y` precisely** using the coordinate math in the "ACCURATE CLICK POSITIONING" section — do NOT guess approximate values. Give the target button explicit `width` and `height` styles so you can calculate its center accurately.

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
- Music volume: use `volume={(f) => ...}` callback for ducking — 0.25 during intro, fades to 0.12 when steps begin. Use `getSceneDuration(scenes[0], fps)` as the duck point.

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
12. **Music uses volume ducking** — `volume={(f) => ...}` callback, NOT a flat number. 0.25 during intro, ducks to 0.12 when narration steps begin.

**Scene structure:**
13. Has intro scene and summary scene
14. **Each scene explains exactly ONE step** — no scene combines two steps. If you see a numbered list (`1. ... 2. ... 3. ...`) in any scene's JSX, the video is BROKEN — split immediately
15. **No numbered or bulleted lists in scenes** — if a scene renders `<ol>`, `<ul>`, or manual numbering, it MUST be split into separate scenes. This is the #1 most common mistake.
16. **Every scene has at least 30% empty space** — if it looks crowded, remove content or split
17. **SafeZone constrains all content** — no element extends beyond the 1200px centered column. No mock UIs pushed to screen edges. No content touching the 1920px frame boundary.
18. **Every narration paragraph has a matching visual scene** — no explanation without a visual
19. **Every sentence in the narration has a matching visual change** — the screen NEVER stays static while the narrator keeps talking
20. **No scene has more than 3 sentences of narration** — if it does, split into two scenes
21. Narration content matches visual progression 1:1

**Tutorial quality:**
22. **All code/commands use TypingText** — characters appear one by one with blinking cursor
23. **Multi-line code uses HighlightedCode** — important line spotlighted, rest dimmed
24. **Step scenes have StepIndicator** — progress dots showing "Step N of M" (skip on intro/summary)
25. **Elements appear in stages synced to timecodes** — each reveal at a `getRevealFrame()` value, never all at once
26. **Command scenes are followed by ResultScene** — show `✓ Success` output after running a command
27. **Warnings/tips from docs are CalloutScene** — distinct styled cards, not embedded in code scenes
28. **Pacing driven by timecodes** — scene durations match narration length, not arbitrary guesses
29. **Click indicators on interactive steps** — when narration says "click/select/tap/press", a `<ClickIndicator>` appears over the target button, synced to the sentence's `getRevealFrame()`

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
