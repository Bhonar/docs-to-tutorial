# Docs to Tutorial Video

Turn any documentation URL into a polished tutorial video — using **your own React components** so the video looks like your actual product.

## Prerequisites

- [Node.js](https://nodejs.org/) v18+
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) CLI installed
- A React/Next.js project with reusable UI components

### API Keys

| Key | Required? | Free tier? | Get it at |
|-----|-----------|------------|-----------|
| Tabstack | Yes | 50k credits/month free | https://tabstack.ai/dashboard |
| ElevenLabs | Yes | Yes (TTS). Music needs paid plan. | https://elevenlabs.io |

---

## Setup

This tool runs **inside your existing project**. You must follow these steps from your project root.

### Step 1: Clone into your project

```bash
cd /path/to/my-react-app
git clone https://github.com/Bhonar/docs-to-tutorial.git docs-to-tutorial
```

### Step 2: Build the MCP server

```bash
cd docs-to-tutorial/mcp-server
npm install
npm run build
cd ../..
```

### Step 3: Add your API keys

```bash
cp docs-to-tutorial/mcp-server/.env.example docs-to-tutorial/mcp-server/.env
```

Edit `docs-to-tutorial/mcp-server/.env` and fill in your keys:

```env
TABSTACK_API_KEY=your_key_here
ELEVENLABS_API_KEY=your_key_here
```

### Step 4: Register the MCP server

Create `.mcp.json` **in your project root**:

```json
{
  "mcpServers": {
    "docs-to-tutorial": {
      "command": "node",
      "args": ["docs-to-tutorial/mcp-server/dist/server.js"]
    }
  }
}
```

### Step 5: Install the skill

> **Use the global skills directory** — project-level `.claude/skills/` can break depending on where you launch Claude Code from.

```bash
mkdir -p ~/.claude/skills
ln -s "$(pwd)/docs-to-tutorial/skill/SKILL.md" ~/.claude/skills/docs-to-tutorial.md
```

> **Note:** The symlink must end in `.md` — Claude Code only recognises `.md` skill files.

### Step 6: Run it

Start Claude Code **from your project root** (not from inside `docs-to-tutorial/`):

```bash
claude
```

Then type:

```
/docs-to-tutorial https://docs.stripe.com/payments/quickstart
```

---

## Troubleshooting

### "Unknown skill"

1. **Symlink doesn't end in `.md`** — check with `ls -la ~/.claude/skills/`. Fix:
   ```bash
   rm -f ~/.claude/skills/docs-to-tutorial
   ln -s "$(pwd)/docs-to-tutorial/skill/SKILL.md" ~/.claude/skills/docs-to-tutorial.md
   ```

2. **Symlink target doesn't resolve** — the symlink must use an absolute path. Re-run the `ln -s` command from Step 5 while in your project root.

3. **Wrong directory** — you must run `claude` from your project root, not from inside `docs-to-tutorial/`.

### MCP server not connecting

1. Make sure you built it: `cd docs-to-tutorial/mcp-server && npm run build`
2. Check `.mcp.json` exists in your project root with the correct path
3. Restart Claude Code after changing settings

### Audio not generating

- Check `ELEVENLABS_API_KEY` is set in `docs-to-tutorial/mcp-server/.env`
- TTS (narration) works on the free tier
- Music requires a paid ElevenLabs plan — video renders with narration only if music fails
