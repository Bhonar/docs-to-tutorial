# Contributing to Docs-to-Tutorial

> Internal developer guide for agents and contributors working on this project before release.

---

## What Is This Project?

**Docs-to-Tutorial** turns any documentation URL into a polished MP4 tutorial video — using the user's **own React components** so the video matches their actual product's look and feel.

It's built as an **MCP (Model Context Protocol) server** + **Claude Code Skill** + **Remotion template**. When a user types `/docs-to-tutorial https://docs.example.com/quickstart` in Claude Code, Claude orchestrates a 7-step pipeline: scan the codebase → scaffold a Remotion project → extract the docs → generate audio → design scenes → write a composition → render to MP4.

### Architecture at a Glance

```
┌─────────────────────────────────────────────────────────┐
│  User's Project (e.g. my-react-app/)                    │
│                                                         │
│  src/components/ui/  ← user's Button, Card, Badge       │
│  remotion/           ← scaffolded on first run           │
│    src/compositions/Generated.tsx  ← rewritten per video │
│    public/audio/     ← narration + music MP3s            │
│    public/images/    ← downloaded logos + screenshots     │
│                                                         │
│  docs-to-tutorial/   ← this repo, cloned inside project  │
│    mcp-server/       ← MCP server (runs in background)   │
│    remotion-template/← template copied to remotion/      │
│    skill/SKILL.md    ← 7-step workflow Claude follows    │
└─────────────────────────────────────────────────────────┘
```

### Why It Lives Inside the User's Project

The `remotion/` folder imports the user's components with relative paths (`../../../src/components/ui/button`). The Tailwind config scans `../src/**/*.{ts,tsx}` to pick up their classes. This only works if `remotion/` is a sibling of the user's `src/`.

---

## Data Flow: URL → MP4

```
/docs-to-tutorial https://docs.stripe.com/payments/quickstart
  │
  ▼
Step 1: Claude scans the user's codebase
  → Finds components, import paths, Tailwind config, project root
  │
  ▼
Step 2: Scaffold remotion/ (if needed)
  → Copies remotion-template/ into user's project
  → Updates tailwind.config.js content paths for user's component dirs
  → npm install
  │
  ▼
Step 3: MCP Tool → extract_docs_content
  → Tabstack API: markdown + JSON metadata
  → Playwright: logo, screenshot colors, CSS variables
  → Saves: logo to remotion/public/images/
  → Returns: { markdown, metadata, branding, domain, warnings }
  │
  ▼
Step 4: Claude writes narration script, then MCP Tool → generate_audio
  → ElevenLabs TTS: narration MP3 (free tier)
  → ElevenLabs Music: background music MP3 (paid plan, optional)
  → Beat detection: aubio → ffmpeg → heuristic fallback
  → Saves: audio to remotion/public/audio/
  → Returns: { music, narration, beats, warnings }
  │
  ▼
Step 5-6: Claude designs scenes, writes Generated.tsx
  → Imports user's components with relative paths
  → Uses Remotion animation APIs (spring, interpolate, TransitionSeries)
  → Mounts <Audio> with staticFile() paths to saved MP3s
  │
  ▼
Step 7: MCP Tool → render_video
  → bundle() with Tailwind webpack override
  → selectComposition() triggers calculateMetadata
    → Reads actual narration duration → sets durationInFrames
  → renderMedia() → h264 MP4
  → Saves: ~/Videos/docs-to-tutorial/<name>.mp4
```

---

## Key Technical Decisions

### Narration Drives Video Duration
`calculateMetadata` in `Root.tsx` reads the actual narration MP3 duration at render time. Claude's `duration` estimate only affects music length. This means the video is always exactly as long as the narration — no awkward silence or truncation.

Priority: narration duration → music duration → props.duration → 30s fallback.

### `remotionProjectPath` on Every Tool
All 4 MCP tools accept an optional `remotionProjectPath` parameter. Without it, they fall back to `process.cwd()/remotion`, but `cwd` depends on how Claude Code spawns the server — so the explicit parameter is the reliable option. The SKILL.md instructs Claude to always pass it.

Resolution priority: explicit arg → `REMOTION_PROJECT_PATH` env → `{cwd}/remotion`.

### `staticPath` vs `localPath`
- `localPath`: absolute filesystem path (e.g., `/Users/me/my-app/remotion/public/audio/narration-123.mp3`)
- `staticPath`: relative to `remotion/public/` (e.g., `audio/narration-123.mp3`)

Only `staticPath` is used inside `Generated.tsx` via `staticFile()`. This is a Remotion requirement.

### Graceful Degradation Everywhere
Every extraction step has 2-3 fallbacks. Nothing throws an unrecoverable error:
- Tabstack fails → Playwright DOM walking → placeholder content
- Logo: Clearbit → common paths → Google favicon
- Music fails (paid plan required) → narration-only video
- Beat detection: aubio → ffmpeg silencedetect → 120 BPM heuristic
- Colors: CSS variables → button backgrounds → screenshot analysis → hardcoded `#0066FF`

All degradation is reported in the `warnings` array so Claude can adapt.

### Single Playwright Session Per Tool
Both `extract-docs.ts` and `extract-url.ts` consolidate screenshot capture + CSS extraction into a single browser launch to reduce latency.

### Tailwind in Remotion
The `webpackOverride: enableTailwind` in `render-video.ts` is **critical** — without it, Tailwind classes in both the template and the user's imported components would be ignored during rendering. The template includes `style.css` with `@tailwind` directives and a `tailwind.config.js` that scans the parent project.

---

## File-by-File Reference

### MCP Server (`mcp-server/src/`)

| File | Purpose |
|------|---------|
| `server.ts` | MCP entry point. Stdio transport. Registers 4 tools, routes tool calls. Loads `.env` relative to its own location (not cwd). |
| `tools/extract-docs.ts` | Docs URL → markdown + metadata + branding. Tabstack markdown + JSON endpoints, Playwright fallback, CSS color extraction. |
| `tools/extract-url.ts` | Marketing URL → content + branding + screenshots. Tabstack JSON, Playwright single-session extraction. Validates Tabstack response structure. |
| `tools/generate-audio.ts` | Narration + music → MP3 files + beat timestamps. ElevenLabs TTS (free) + Music (paid). Saves to `remotion/public/audio/`. |
| `tools/render-video.ts` | Bundles + renders Remotion composition → MP4. Applies Tailwind webpack override. Output to `~/Videos/docs-to-tutorial/`. |
| `utils/paths.ts` | Single source of truth for `remotion/`, `public/`, `audio/`, `images/`, and output directories. All tools import from here. |
| `utils/branding.ts` | Logo extraction (Clearbit → common paths → favicon), `downloadLogoToPublic()`, `rgbaToHex()` (handles hex/rgb/rgba/hsl/hsla/named colors), `darkenHex()`, `detectTheme()`, `inferIndustry()`. |
| `utils/beat-detection.ts` | `detectBeats()`: aubio → ffmpeg silencedetect → 120 BPM heuristic. Accepts `duration` param for heuristic fallback. |
| `utils/color-extraction.ts` | `extractColorsFromScreenshot()`: sharp dominant color → 4-color palette (primary/secondary/accent/background). |
| `utils/screenshot.ts` | `takeScreenshot()`: Playwright headless, `domcontentloaded` (not `networkidle` — avoids SPA hangs), viewport-only (not fullPage). |

### Remotion Template (`remotion-template/`)

| File | Purpose |
|------|---------|
| `src/Root.tsx` | Composition registration. Defines `TutorialVideoProps` type contract. `calculateMetadata` determines video duration from narration audio. |
| `src/index.ts` | Remotion entry. `registerRoot(Root)`, imports `style.css` for Tailwind. |
| `src/style.css` | Tailwind CSS directives (`@tailwind base/components/utilities`). Required for Tailwind processing. |
| `src/compositions/Generated.tsx` | Placeholder composition. **Overwritten by Claude for every video.** Has working default with font loading, audio, and animation. |
| `package.json` | Remotion 4.0.421 + React 18 + Tailwind 3.4 dependencies. |
| `tsconfig.json` | `jsx: "react-jsx"` (automatic JSX transform), `moduleResolution: "bundler"`. |
| `tailwind.config.js` | Content paths: `./src/**` + `../src/**` (user's project). No keyframes/animations (Remotion forbids them). |

### Skill & Config

| File | Purpose |
|------|---------|
| `skill/SKILL.md` | The 7-step workflow Claude follows. Describes what each step does, what tool to call, what params to pass, and what to do with the results. |
| `README.md` | User-facing setup guide. Step-by-step from clone to first video. |
| `.env.example` | Template for API keys: `TABSTACK_API_KEY`, `ELEVENLABS_API_KEY`, optional `ELEVENLABS_VOICE_ID`. |

### Tests (`mcp-server/src/__tests__/`)

| File | Purpose |
|------|---------|
| `utils/__tests__/branding.test.ts` | 19 tests for `rgbaToHex`, `darkenHex`, `detectTheme`, `inferIndustry`. Covers hex, rgb, rgba, hsl, hsla, named colors, edge cases. |
| `utils/__tests__/paths.test.ts` | 9 tests for all path resolution functions. Tests explicit/env/fallback priority chain. |
| `__tests__/server-smoke.test.ts` | Spawns the real compiled MCP server, sends JSON-RPC `initialize` + `tools/list`, verifies 4 tools with `remotionProjectPath` on all of them. |
| `__tests__/integration.test.ts` | Live API tests (auto-skipped without keys). Tests `extract_docs_content` against Stripe docs, `extract_url_content` against remotion.dev, `generate_audio` with a short narration script. |

---

## External APIs

| API | What We Use It For | Auth | Free Tier |
|-----|-------------------|------|-----------|
| **Tabstack** (`api.tabstack.ai`) | `/v1/extract/markdown` for page content, `/v1/extract/json` for structured metadata | Bearer token | 50k credits/month |
| **ElevenLabs** (`api.elevenlabs.io`) | `/v1/text-to-speech/{voiceId}` for narration, `/v1/music` for background music | `xi-api-key` header | TTS: yes. Music: no (paid plan). |
| **Clearbit** (`logo.clearbit.com`) | High-quality logo images by domain | None (free) | Unlimited |
| **Google Favicon** (`google.com/s2/favicons`) | Fallback logo (256px favicon) | None (free) | Unlimited |

### ElevenLabs Specifics
- `output_format` is a **query parameter**, not a body parameter: `POST /v1/music?output_format=mp3_44100_128`
- Default voice: `onwK4e9ZLuTAKqWW03F9` (Daniel — professional male, good for tutorials)
- Model: `eleven_multilingual_v2` for TTS, `music_v1` for music
- Responses are raw binary audio (`responseType: 'arraybuffer'`)

### Tabstack Specifics
- Markdown endpoint returns `{ content: "..." }` (NOT `{ markdown: "..." }`)
- JSON endpoint accepts a `json_schema` object defining the extraction shape
- Priced per request, not per token

---

## What We Fixed (Changelog from Development)

### Round 1 — Showstoppers

| Issue | What Was Wrong | Fix |
|-------|---------------|-----|
| Path chaos | 3 different hardcoded paths across files (`__dirname/../../../remotion-project`, `__dirname/../../../../remotion-project`, `process.cwd()/remotion`) | Created `src/utils/paths.ts` with single `getRemotionProjectPath()`. All tools import from it. |
| FFmpeg beat detection never worked | `2>&1` redirected stderr to stdout, but code read from `{ stderr }` which was empty | Removed `2>&1`. FFmpeg silencedetect output stays in stderr where the code reads it. |
| Heuristic beats hardcoded 60s | `detectBeats()` always generated beats for 60 seconds | Added `duration` parameter, passed from `generateAudio()`. |
| ElevenLabs `output_format` | Was in request body | Moved to query parameter: `POST /v1/music?output_format=mp3_44100_128`. |
| Duplicate H1 in Playwright markdown | H1 extracted separately AND encountered during DOM traversal | Removed separate H1 extraction. `processNode` handles it once. |
| Template missing files | No `src/index.ts`, no `src/style.css`, `Generated.tsx` was barebones | Created all three with proper content. |
| Duration priority wrong | Music duration took priority over narration | Changed to narration-first in `calculateMetadata`. |
| MiniMax TTS code | Unused, user chose ElevenLabs only | Removed all MiniMax code entirely. |
| Brandfetch API | Required API key that was never configured, always 401 | Removed. Logo extraction uses Clearbit → common paths → Google favicon. |

### Round 2 — Reliability

| Issue | What Was Wrong | Fix |
|-------|---------------|-----|
| **SKILL.md workflow ordering** | Steps 2-3 saved audio/images to `remotion/public/` BEFORE Step 4 scaffolded `remotion/`. A `cp -r` would overwrite those files. | Moved scaffold to Step 2 (before extraction). |
| `process.cwd()` unreliable | Only `render_video` accepted explicit path. Other tools relied on `cwd` blindly. | Added `remotionProjectPath` parameter to all 4 tools, threaded through all internal functions. |
| Missing `tsconfig.json` | Remotion template had no TypeScript config. JSX transform could fail. | Created with `jsx: "react-jsx"`, `moduleResolution: "bundler"`. |
| `rgbaToHex` limited | Only handled `rgb()` and `rgba()`. Failed on `hsl()`, `oklch()`, named colors. | Rewrote to handle hex (incl. shorthand), rgb/rgba, hsl/hsla, 30+ named CSS colors. |
| Tailwind content paths | Hardcoded `../src/**/*.{ts,tsx}`. Fails for `app/`, monorepo structures. | SKILL.md Step 2 now instructs Claude to inspect and update content paths. |
| Tabstack response not validated | `extract-url.ts` returned `response.data` directly | Added type checking and field normalization with safe defaults. |
| 2+ Playwright sessions in extract-docs | Separate browser launches for screenshot and CSS colors | Combined into single `extractBrandingWithCssColors()` function. |
| `extractColorsFromImage` stub | Always returned hardcoded `#0066FF` | Removed the stub function entirely. Only `extractColorsFromScreenshot` (which uses sharp) remains. |
| `networkidle` hangs | `screenshot.ts` used `networkidle` which hangs on SPAs with WebSockets | Changed to `domcontentloaded` + 2s wait. Also `fullPage: false` to avoid huge screenshots. |
| Empty `public/` dirs lost by git | `public/audio/` and `public/images/` were empty, wouldn't survive clone | Added `.gitkeep` files. |

---

## How to Run Tests

```bash
cd docs-to-tutorial/mcp-server

# Unit tests (no API keys needed, fast)
npm test

# Run a specific test file
npx vitest run src/utils/__tests__/branding.test.ts

# Integration tests (needs API keys)
TABSTACK_API_KEY=xxx ELEVENLABS_API_KEY=xxx npx vitest run src/__tests__/integration.test.ts

# Build (always run after code changes)
npm run build
```

**Test coverage (29 passing tests):**
- `branding.test.ts` — 19 tests: `rgbaToHex` (9 cases), `darkenHex` (4), `detectTheme` (3), `inferIndustry` (3)
- `paths.test.ts` — 9 tests: all 5 path functions with priority chain validation
- `server-smoke.test.ts` — 1 test: MCP server startup + tools/list verification

---

## How to Test End-to-End

1. Have a React project with components (buttons, cards, etc.)
2. Clone this repo inside that project
3. Follow README setup (build MCP server, add API keys, register with Claude Code)
4. Run: `/docs-to-tutorial https://docs.stripe.com/payments/quickstart`
5. Check: `~/Videos/docs-to-tutorial/` for the output MP4

---

## Known Limitations (Pre-Release)

1. **Narration timecodes are estimated** — The `timecodes` array in `generateAudio` uses a ~150 wpm heuristic, not actual audio timing. Scene-to-speech sync may drift on longer videos. A proper fix would use ElevenLabs' word-level timestamps API.

2. **oklch/lab/lch colors fall back to `#0066FF`** — Modern CSS color functions can't be converted to hex without a full CSS engine. These formats are becoming more common in modern design systems.

3. **No hot reload in development** — After code changes, you must `npm run build` before testing via Claude Code. The `npm run dev` script uses `tsx watch` but only for the server entry point, not for MCP integration testing.

4. **`extractColorsFromScreenshot` is basic** — Uses sharp's single dominant color. A production implementation would use k-means clustering for a proper 4-color palette extraction.

5. **Narration voice is hardcoded** — The `ELEVENLABS_VOICE_ID` env var works, but SKILL.md doesn't mention it. Claude always uses the Daniel voice unless the user manually sets the env var.

6. **No video preview before render** — The user can run `cd remotion && npm run dev` to preview in Remotion Studio, but the SKILL.md workflow goes straight to render. Could add a preview step.

7. **`tailwind.config.js` content paths need manual adjustment** — SKILL.md tells Claude to update them, but if Claude misses a component directory, those classes get purged in the rendered video.

---

## Development Workflow

```bash
# 1. Make code changes in mcp-server/src/
# 2. Build
cd docs-to-tutorial/mcp-server && npm run build

# 3. Run unit tests
npm test

# 4. Test via Claude Code (restart Claude Code after build)
claude
> /docs-to-tutorial https://some-docs-url.com

# 5. Check output
ls ~/Videos/docs-to-tutorial/
```

When modifying tool interfaces (adding params, changing return types):
1. Update the tool function signature in `tools/*.ts`
2. Update the schema in `server.ts` (both `ListToolsRequestSchema` and `CallToolRequestSchema` handlers)
3. Update `SKILL.md` to tell Claude about the new parameter
4. Update tests in `__tests__/`
5. Rebuild: `npm run build`
