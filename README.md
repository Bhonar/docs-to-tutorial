# Docs to Tutorial Video

Turn any documentation URL into a polished tutorial video — using **your own React components** so the video looks like your actual product.

Give it a docs URL, and it will:
- Extract the content, branding, and metadata
- Generate AI narration and background music
- Build animated scenes using your Button, Card, Badge (etc.) components
- Render an MP4 video

---

## Prerequisites

- [Node.js](https://nodejs.org/) v18+
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) CLI installed
- A React/Next.js project with reusable UI components (buttons, cards, badges, etc.)

### API Keys

| Key | Required? | Free tier? | Get it at |
|-----|-----------|------------|-----------|
| Tabstack | Yes | 50k credits/month free | https://tabstack.ai/dashboard |
| ElevenLabs | Yes | Yes (TTS). Music needs paid plan. | https://elevenlabs.io |

---

## Setup

This tool runs **inside your existing project**. It scans your codebase for components, so it must live alongside your source code.

### Step 1: Clone into your project

From your project root (where your `src/` and `package.json` are):

```bash
# You should be in your project root
# Example: /Users/you/my-react-app

git clone <repo-url> docs-to-tutorial
```

This creates a `docs-to-tutorial/` folder inside your project:

```
my-react-app/               <-- your project root
├── src/
│   └── components/
│       └── ui/
│           ├── button.tsx
│           ├── card.tsx
│           └── badge.tsx
├── package.json
├── tailwind.config.ts
└── docs-to-tutorial/        <-- cloned here
    ├── mcp-server/
    ├── remotion-template/
    └── skill/
```

### Step 2: Install the MCP server

```bash
cd docs-to-tutorial/mcp-server
npm install
npm run build
```

### Step 3: Add your API keys

```bash
cp .env.example .env
```

Edit `docs-to-tutorial/mcp-server/.env` and fill in your keys:

```env
TABSTACK_API_KEY=your_key_here
ELEVENLABS_API_KEY=your_key_here
```

### Step 4: Register the MCP server with Claude Code

Open (or create) `.claude/settings.local.json` **in your project root** (not inside `docs-to-tutorial/`):

```json
{
  "mcpServers": {
    "docs-to-tutorial": {
      "command": "node",
      "args": ["docs-to-tutorial/mcp-server/dist/server.js"],
      "env": {}
    }
  }
}
```

### Step 5: Install the skill

The skill file tells Claude *how* to use the MCP tools step by step:

```bash
# From your project root
mkdir -p .claude/skills
ln -s ../../docs-to-tutorial/skill/SKILL.md .claude/skills/docs-to-tutorial
```

### Step 6: Verify it works

Restart Claude Code (or start a new session) in your project root:

```bash
cd /path/to/my-react-app
claude
```

Then type:

```
/docs-to-tutorial https://docs.stripe.com/payments/quickstart
```

Claude will:
1. Scan your codebase for components
2. Create a `remotion/` folder in your project (first run only)
3. Extract the documentation
4. Generate narration and music
5. Write `remotion/src/compositions/Generated.tsx` using your components
6. Render the video to `~/Videos/docs-to-tutorial/`

---

## How It Works

### What gets created in your project

On first run, a `remotion/` directory is scaffolded in your project root:

```
my-react-app/
├── src/components/          <-- your existing components
├── remotion/                <-- created automatically
│   ├── src/
│   │   ├── Root.tsx
│   │   ├── index.ts
│   │   ├── style.css           <-- Tailwind entry file
│   │   └── compositions/
│   │       └── Generated.tsx   <-- rewritten each video
│   ├── public/
│   │   ├── audio/              <-- generated music + narration
│   │   └── images/             <-- downloaded logos
│   ├── package.json
│   └── tailwind.config.js      <-- includes ../src/** for your components
├── docs-to-tutorial/        <-- the MCP server (unchanged)
└── package.json
```

### Why it lives inside your project

The `remotion/` folder needs to import your components with relative paths:

```typescript
// remotion/src/compositions/Generated.tsx
import { Button } from '../../../src/components/ui/button';
import { Card } from '../../../src/components/ui/card';
```

And the Tailwind config extends to your source:

```javascript
// remotion/tailwind.config.js
content: [
  './src/**/*.{ts,tsx}',
  '../src/**/*.{ts,tsx}',  // picks up YOUR component classes
]
```

### MCP Tools

The server exposes 4 tools that Claude calls in sequence:

| Tool | What it does |
|------|-------------|
| `extract_docs_content` | Scrapes a docs URL into markdown + metadata + branding |
| `extract_url_content` | Same but for marketing/landing pages + screenshots |
| `generate_audio` | Creates background music + TTS narration via ElevenLabs |
| `render_video` | Bundles and renders the Remotion composition to MP4 |

### Audio

- **Narration**: ElevenLabs TTS (free tier works). Video duration is set by narration length.
- **Music**: ElevenLabs Music (paid plan only). If it fails, video renders with narration only.

### Output

Rendered videos are saved to:

```
~/Videos/docs-to-tutorial/<video-name>.mp4
```

---

## Previewing Before Rendering

You can preview the video in Remotion Studio before rendering:

```bash
cd remotion
npm run dev
```

This opens a browser where you can scrub through the video frame by frame.

---

## Troubleshooting

### "Remotion project not found"

The `remotion/` folder hasn't been scaffolded yet. Claude creates it on the first run. If it fails, you can manually copy the template:

```bash
# From your project root
cp -r docs-to-tutorial/remotion-template remotion
cd remotion && npm install
```

### Components not rendering in video

- **CSS animations**: Remotion does not support them. Claude overrides them with `style={{ animation: 'none' }}`
- **Portals/Modals**: Won't work in Remotion's render context — they get skipped
- **Browser APIs** (`window`, `document`): Not available during server-side rendering

### Audio not generating

- Check that `ELEVENLABS_API_KEY` is set in `docs-to-tutorial/mcp-server/.env`
- TTS (narration) works on the free tier
- Music generation requires a paid ElevenLabs plan — if it fails, the video renders with narration only

### MCP server not connecting

1. Make sure you built it: `cd docs-to-tutorial/mcp-server && npm run build`
2. Check the path in `.claude/settings.local.json` is correct
3. Restart Claude Code after changing settings

---

## Project Structure

```
docs-to-tutorial/
├── mcp-server/              # The MCP server (runs as a background process)
│   ├── src/
│   │   ├── server.ts        # MCP server entry point (stdio transport)
│   │   ├── tools/
│   │   │   ├── extract-docs.ts    # Documentation extraction (Tabstack + Playwright)
│   │   │   ├── extract-url.ts     # Marketing page extraction + screenshots
│   │   │   ├── generate-audio.ts  # Music + narration via ElevenLabs
│   │   │   └── render-video.ts    # Remotion bundling + MP4 rendering
│   │   └── utils/
│   │       ├── paths.ts           # Shared path resolution (cwd/remotion)
│   │       ├── branding.ts        # Logo + color extraction
│   │       ├── beat-detection.ts  # Audio beat detection for transitions
│   │       ├── color-extraction.ts # Color palette from screenshots
│   │       └── screenshot.ts      # Playwright screenshot capture
│   ├── .env.example
│   └── package.json
├── remotion-template/       # Template copied into user's project as remotion/
│   ├── src/
│   │   ├── Root.tsx         # Composition registration + duration calculation
│   │   ├── index.ts         # Remotion entry point
│   │   ├── style.css        # Tailwind CSS entry file
│   │   └── compositions/
│   │       └── Generated.tsx # Placeholder (overwritten per video)
│   ├── public/
│   │   ├── audio/
│   │   └── images/
│   ├── package.json
│   └── tailwind.config.js
└── skill/
    └── SKILL.md             # 7-step workflow Claude follows
```
