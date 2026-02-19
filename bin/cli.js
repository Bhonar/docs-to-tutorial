#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import readline from 'readline';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.resolve(__dirname, '..');

// ─── Colors ───────────────────────────────────────────────────────────
const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
const cyan = (s) => `\x1b[36m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;

// ─── Helpers ──────────────────────────────────────────────────────────
const isInteractive = process.stdin.isTTY === true;

function prompt(question, defaultValue = '') {
  if (!isInteractive) {
    return Promise.resolve(defaultValue);
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function check(label, ok) {
  console.log(`  ${ok ? green('✓') : red('✗')} ${label}`);
  return ok;
}

/**
 * Recursively copy a directory's contents into a destination.
 */
function copyDirRecursive(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// ─── Paths ────────────────────────────────────────────────────────────
const configDir = path.join(os.homedir(), '.docs-to-video');
const envPath = path.join(configDir, '.env');
const claudeConfigPath = path.join(os.homedir(), '.claude', 'config.json');
const skillDir = path.join(os.homedir(), '.claude', 'skills', 'docs-to-video');

// Source paths (inside the npm package)
const skillSource = path.join(packageRoot, 'skill', 'SKILL.md');
const mcpServerSource = path.join(packageRoot, 'mcp-server');
const templateSource = path.join(packageRoot, 'remotion-template');

// ═══════════════════════════════════════════════════════════════════════
//  SETUP
// ═══════════════════════════════════════════════════════════════════════
async function setup() {
  console.log('');
  console.log(bold('  docs-to-video setup'));
  console.log(dim('  Turn documentation URLs into tutorial videos'));
  console.log('');

  const projectRoot = process.cwd();

  // 1. Check Node version
  const nodeVersion = parseInt(process.versions.node.split('.')[0]);
  if (!check('Node.js v18+', nodeVersion >= 18)) {
    console.log(red('\n  Please upgrade Node.js to v18 or later.'));
    process.exit(1);
  }

  // 2. Check we're in a project directory
  const hasPackageJson = fs.existsSync(path.join(projectRoot, 'package.json'));
  const hasSrc = fs.existsSync(path.join(projectRoot, 'src'));
  const hasApp = fs.existsSync(path.join(projectRoot, 'app'));

  if (!hasPackageJson && !hasSrc && !hasApp) {
    console.log('');
    console.log(yellow('  Warning: No package.json, src/, or app/ found here.'));
    console.log(dim(`  Current directory: ${projectRoot}`));
    console.log('');
    console.log(`  ${bold('Run this from your project root')} (where your React/Next.js code lives).`);
    console.log(`  Example: ${cyan('cd ~/my-app && npx docs-to-video setup')}`);
    console.log('');
    const proceed = await prompt(`  ${cyan('?')} Continue anyway? ${dim('(y/N)')} `, 'n');
    if (proceed.toLowerCase() !== 'y') {
      console.log(dim('\n  Setup cancelled.\n'));
      process.exit(0);
    }
  } else {
    check(`Project detected at ${dim(projectRoot)}`, true);
  }

  // 3. Verify package source files exist
  const serverSourceJs = path.join(mcpServerSource, 'dist', 'server.js');
  if (!check('MCP server found in package', fs.existsSync(serverSourceJs))) {
    console.log(red(`\n  Server not found at: ${serverSourceJs}`));
    console.log(red('  The package may be corrupted. Try reinstalling.'));
    process.exit(1);
  }

  if (!check('Skill file found in package', fs.existsSync(skillSource))) {
    console.log(red(`\n  SKILL.md not found at: ${skillSource}`));
    process.exit(1);
  }

  // 4. Copy docs-to-video/ into the user's project
  console.log('');
  console.log(bold('  Installing into project...'));
  console.log('');

  const localDir = path.join(projectRoot, 'docs-to-video');
  const localMcpServer = path.join(localDir, 'mcp-server');
  const localTemplate = path.join(localDir, 'remotion-template');
  const localSkill = path.join(localDir, 'skill');
  const localServerJs = path.join(localMcpServer, 'dist', 'server.js');

  // Copy MCP server (dist + package.json + .env.example)
  const mcpDistSource = path.join(mcpServerSource, 'dist');
  const mcpDistDest = path.join(localMcpServer, 'dist');

  if (fs.existsSync(localServerJs)) {
    check(`docs-to-video/mcp-server/ already exists ${dim('(updating)')}`, true);
  }

  // Always copy to ensure latest version
  copyDirRecursive(mcpDistSource, mcpDistDest);
  // Copy package.json for npm install
  fs.copyFileSync(
    path.join(mcpServerSource, 'package.json'),
    path.join(localMcpServer, 'package.json')
  );
  // Copy .env.example
  const envExampleSrc = path.join(mcpServerSource, '.env.example');
  if (fs.existsSync(envExampleSrc)) {
    fs.copyFileSync(envExampleSrc, path.join(localMcpServer, '.env.example'));
  }
  check('Copied MCP server to docs-to-video/mcp-server/', true);

  // Copy remotion-template
  if (fs.existsSync(templateSource)) {
    if (fs.existsSync(localTemplate)) {
      check(`docs-to-video/remotion-template/ already exists ${dim('(skipping)')}`, true);
    } else {
      copyDirRecursive(templateSource, localTemplate);
      check('Copied remotion-template/ to docs-to-video/', true);
    }
  }

  // Copy skill
  fs.mkdirSync(localSkill, { recursive: true });
  fs.copyFileSync(skillSource, path.join(localSkill, 'SKILL.md'));
  check('Copied skill/ to docs-to-video/', true);

  // 5. Install MCP server dependencies
  console.log('');
  console.log(dim('  Installing MCP server dependencies (this may take a minute)...'));
  try {
    execSync('npm install --production', {
      cwd: localMcpServer,
      stdio: 'pipe',
    });
    check('MCP server dependencies installed', true);
  } catch (err) {
    console.log(yellow('  Warning: npm install failed. You can run it manually:'));
    console.log(cyan(`  cd ${localMcpServer} && npm install`));
  }

  console.log('');

  // 6. API keys
  let tabstackKey = '';
  let elevenLabsKey = '';
  let elevenLabsVoiceId = '';

  // Check if .env already exists
  if (fs.existsSync(envPath)) {
    const existing = fs.readFileSync(envPath, 'utf8');
    const existingKeys = {};
    existing.split('\n').forEach((line) => {
      const match = line.match(/^([A-Z_]+)=(.+)$/);
      if (match) existingKeys[match[1]] = match[2];
    });

    if (existingKeys.TABSTACK_API_KEY || existingKeys.ELEVENLABS_API_KEY) {
      console.log(dim('  Found existing API keys in ~/.docs-to-video/.env'));
      // In non-interactive mode, always keep existing keys
      const reuse = await prompt(`  ${cyan('?')} Keep existing keys? ${dim('(Y/n)')} `, 'y');
      if (reuse.toLowerCase() !== 'n') {
        tabstackKey = existingKeys.TABSTACK_API_KEY || '';
        elevenLabsKey = existingKeys.ELEVENLABS_API_KEY || '';
        elevenLabsVoiceId = existingKeys.ELEVENLABS_VOICE_ID || '';
        check('Using existing API keys', true);
      }
    }
  }

  if (isInteractive) {
    console.log('');
    console.log(bold('  API Keys'));
    console.log(dim('  Press Enter to skip optional keys\n'));

    if (!tabstackKey) {
      tabstackKey = await prompt(`  ${cyan('?')} Tabstack API key ${dim('(https://tabstack.ai/dashboard)')}: `);
      if (!tabstackKey) {
        console.log(yellow('  Skipped — you can add it later to ~/.docs-to-video/.env'));
      }
    }

    if (!elevenLabsKey) {
      elevenLabsKey = await prompt(`  ${cyan('?')} ElevenLabs API key ${dim('(https://elevenlabs.io)')}: `);
      if (!elevenLabsKey) {
        console.log(yellow('  Skipped — you can add it later to ~/.docs-to-video/.env'));
      }
    }

    if (!elevenLabsVoiceId) {
      elevenLabsVoiceId = await prompt(`  ${cyan('?')} ElevenLabs Voice ID ${dim('(optional, press Enter for default)')}: `);
    }
  } else if (!tabstackKey && !elevenLabsKey) {
    console.log(dim('  Non-interactive mode — skipping API key prompts'));
    console.log(dim('  Add your keys later to ~/.docs-to-video/.env'));
  }

  // 7. Write .env
  console.log('');
  fs.mkdirSync(configDir, { recursive: true });
  let envContent = '';
  envContent += `# docs-to-video configuration\n`;
  envContent += `# Edit this file to update your API keys\n\n`;
  envContent += `TABSTACK_API_KEY=${tabstackKey || 'your_tabstack_api_key_here'}\n`;
  envContent += `ELEVENLABS_API_KEY=${elevenLabsKey || 'your_elevenlabs_api_key_here'}\n`;
  if (elevenLabsVoiceId) {
    envContent += `ELEVENLABS_VOICE_ID=${elevenLabsVoiceId}\n`;
  }
  fs.writeFileSync(envPath, envContent);
  check(`API keys saved to ${dim('~/.docs-to-video/.env')}`, true);

  // 8. Register MCP server pointing to the LOCAL copy inside the project
  const claudeDir = path.join(os.homedir(), '.claude');
  fs.mkdirSync(claudeDir, { recursive: true });

  let config = {};
  if (fs.existsSync(claudeConfigPath)) {
    try {
      config = JSON.parse(fs.readFileSync(claudeConfigPath, 'utf8'));
    } catch {
      config = {};
    }
  }

  config.mcpServers = config.mcpServers || {};
  config.mcpServers['docs-to-video'] = {
    command: 'node',
    args: [localServerJs],
    cwd: projectRoot,
  };
  fs.writeFileSync(claudeConfigPath, JSON.stringify(config, null, 2));
  check(`MCP server registered ${dim('(cwd: ' + projectRoot + ')')}`, true);

  // 9. Install skill (copy, not symlink — survives npx cache clears)
  fs.mkdirSync(skillDir, { recursive: true });
  const skillDest = path.join(skillDir, 'SKILL.md');
  if (fs.existsSync(skillDest)) {
    fs.unlinkSync(skillDest);
  }
  fs.copyFileSync(skillSource, skillDest);
  check(`Skill installed at ${dim('~/.claude/skills/docs-to-video/')}`, true);

  // 10. Clean up old docs-to-tutorial registrations
  if (config.mcpServers['docs-to-tutorial']) {
    delete config.mcpServers['docs-to-tutorial'];
    fs.writeFileSync(claudeConfigPath, JSON.stringify(config, null, 2));
    check('Removed old docs-to-tutorial MCP registration', true);
  }
  const oldSkillDir = path.join(os.homedir(), '.claude', 'skills', 'docs-to-tutorial');
  if (fs.existsSync(oldSkillDir)) {
    fs.rmSync(oldSkillDir, { recursive: true });
    check('Removed old docs-to-tutorial skill', true);
  }

  // Done
  console.log('');
  console.log(green(bold('  Setup complete!')));
  console.log('');
  console.log(`  ${bold('Installed to:')} ${cyan(localDir)}`);
  console.log(dim('  ├── mcp-server/    (MCP server + dependencies)'));
  console.log(dim('  ├── remotion-template/  (video scaffolding)'));
  console.log(dim('  └── skill/         (SKILL.md)'));
  console.log('');
  console.log(`  ${bold('Next steps:')}`);
  console.log(`  1. ${bold('Restart Claude Code')} (quit and reopen)`);
  console.log(`  2. Start Claude Code from ${bold('this directory')}:`);
  console.log(`     ${cyan('cd ' + projectRoot + ' && claude')}`);
  console.log(`  3. Run: ${cyan('/docs-to-video <documentation-url>')}`);
  console.log('');
  console.log(dim('  Example:'));
  console.log(dim('  /docs-to-video https://docs.stripe.com/payments/quickstart'));
  console.log('');
  console.log(dim(`  Config: ~/.docs-to-video/.env`));
  console.log(dim(`  To uninstall: npx docs-to-video uninstall`));
  console.log('');
}

// ═══════════════════════════════════════════════════════════════════════
//  UNINSTALL
// ═══════════════════════════════════════════════════════════════════════
async function uninstall() {
  console.log('');
  console.log(bold('  docs-to-video uninstall'));
  console.log('');

  // Remove MCP registration
  if (fs.existsSync(claudeConfigPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(claudeConfigPath, 'utf8'));
      if (config.mcpServers?.['docs-to-video']) {
        delete config.mcpServers['docs-to-video'];
        fs.writeFileSync(claudeConfigPath, JSON.stringify(config, null, 2));
        check('Removed MCP server registration', true);
      } else {
        check('MCP server registration (already removed)', true);
      }
    } catch {
      console.log(yellow('  Could not parse ~/.claude/config.json'));
    }
  }

  // Remove skill
  if (fs.existsSync(skillDir)) {
    fs.rmSync(skillDir, { recursive: true });
    check('Removed skill', true);
  } else {
    check('Skill (already removed)', true);
  }

  // Note about docs-to-video/ in project
  const localDir = path.join(process.cwd(), 'docs-to-video');
  if (fs.existsSync(localDir)) {
    console.log(dim(`\n  Note: docs-to-video/ still exists in your project.`));
    console.log(dim(`  Remove it manually if you no longer need it:`));
    console.log(dim(`  rm -rf ${localDir}`));
  }

  // Note about remotion/ directory
  const remotionDir = path.join(process.cwd(), 'remotion');
  if (fs.existsSync(remotionDir)) {
    console.log(dim(`\n  Note: remotion/ directory still exists (contains your generated videos).`));
    console.log(dim(`  Remove it manually if you no longer need it:`));
    console.log(dim(`  rm -rf ${remotionDir}`));
  }

  // Keep .env (user's API keys)
  if (fs.existsSync(envPath)) {
    console.log(dim(`\n  Note: API keys preserved at ~/.docs-to-video/.env`));
    console.log(dim(`  Delete manually if you want to remove them:`));
    console.log(dim(`  rm -rf ~/.docs-to-video`));
  }

  console.log('');
  console.log(green('  Uninstalled. Restart Claude Code to apply changes.'));
  console.log('');
}

// ═══════════════════════════════════════════════════════════════════════
//  MAIN
// ═══════════════════════════════════════════════════════════════════════
const command = process.argv[2];

switch (command) {
  case 'setup':
  case undefined:
    await setup();
    break;
  case 'uninstall':
    await uninstall();
    break;
  case '--help':
  case '-h':
    console.log('');
    console.log(bold('  docs-to-video') + ' — Turn docs into tutorial videos');
    console.log('');
    console.log('  Usage:');
    console.log(`    ${cyan('npx docs-to-video setup')}       Set up MCP server, skill, and API keys`);
    console.log(`    ${cyan('npx docs-to-video uninstall')}   Remove MCP registration and skill`);
    console.log(`    ${cyan('npx docs-to-video --help')}      Show this help`);
    console.log('');
    console.log(dim('  Run setup from your project root (where package.json lives).'));
    console.log('');
    break;
  default:
    console.log(red(`  Unknown command: ${command}`));
    console.log(`  Run ${cyan('npx docs-to-video --help')} for usage.`);
    process.exit(1);
}
