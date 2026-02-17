#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Import tools
import { extractDocsContent } from './tools/extract-docs.js';
import { extractUrlContent } from './tools/extract-url.js';
import { generateAudio } from './tools/generate-audio.js';
import { renderVideo } from './tools/render-video.js';

// ESM __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env relative to this file (dist/server.js → ../.env), not cwd
dotenv.config({ path: path.join(__dirname, '../.env') });

// Create MCP server
const server = new Server(
  {
    name: 'docs-to-tutorial-mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Define tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'extract_docs_content',
      description: 'Extract documentation content as markdown with structured metadata (title, technology, doc type, difficulty, prerequisites, sections). Optimized for docs, tutorials, API references, and guides. Downloads logo for branding. Uses Tabstack markdown endpoint ($1/1k, cheapest) + JSON metadata.',
      inputSchema: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: 'The documentation URL to extract',
          },
          remotionProjectPath: {
            type: 'string',
            description: 'Absolute path to the remotion/ directory inside the user\'s project. Defaults to {cwd}/remotion if not specified.',
          },
        },
        required: ['url'],
      },
    },
    {
      name: 'extract_url_content',
      description: 'Extract content, branding (logo, colors, fonts), and metadata from a marketing/landing page URL. Downloads logo to remotion/public/images/ for staticFile() access. Best for promotional videos, not documentation.',
      inputSchema: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: 'The URL to extract content from',
          },
          remotionProjectPath: {
            type: 'string',
            description: 'Absolute path to the remotion/ directory inside the user\'s project. Defaults to {cwd}/remotion if not specified.',
          },
        },
        required: ['url'],
      },
    },
    {
      name: 'generate_audio',
      description: 'Generate instrumental background music and narration via ElevenLabs. Music requires a paid plan; TTS works on free tier. Falls back gracefully if music fails. Files are saved to remotion/public/audio/ for staticFile() access. Returns staticPath for each audio file.',
      inputSchema: {
        type: 'object',
        properties: {
          musicStyle: {
            type: 'string',
            description: 'Music style: pop, hip-hop, rap, jazz, lo-fi, ambient, cinematic, rock',
          },
          narrationScript: {
            type: 'string',
            description: 'The script for AI narration (text-to-speech via ElevenLabs)',
          },
          duration: {
            type: 'number',
            description: 'Duration in seconds',
          },
          remotionProjectPath: {
            type: 'string',
            description: 'Absolute path to the remotion/ directory inside the user\'s project. Defaults to {cwd}/remotion if not specified.',
          },
        },
        required: ['narrationScript', 'duration'],
      },
    },
    {
      name: 'render_video',
      description: 'Render the Generated.tsx composition to MP4. Duration is automatically calculated from audio length via calculateMetadata. Pass audio.music.staticPath and audio.narration.staticPath in inputProps. Write custom video code to Generated.tsx before calling this tool. Set remotionProjectPath to the remotion/ directory inside the user\'s project.',
      inputSchema: {
        type: 'object',
        properties: {
          inputProps: {
            type: 'object',
            description: 'Props to pass to the composition (content, branding, audio, etc.)',
          },
          outputFileName: {
            type: 'string',
            description: 'Output file name (without extension)',
          },
          remotionProjectPath: {
            type: 'string',
            description: 'Absolute path to the remotion/ directory inside the user\'s project. Defaults to {cwd}/remotion if not specified.',
          },
        },
        required: ['inputProps', 'outputFileName'],
      },
    },
  ],
}));

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'extract_docs_content': {
        const { url, remotionProjectPath } = args as { url: string; remotionProjectPath?: string };
        if (!url) {
          throw new McpError(ErrorCode.InvalidParams, 'URL is required');
        }
        const result = await extractDocsContent(url, remotionProjectPath);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'extract_url_content': {
        const { url, remotionProjectPath } = args as { url: string; remotionProjectPath?: string };
        if (!url) {
          throw new McpError(ErrorCode.InvalidParams, 'URL is required');
        }
        const result = await extractUrlContent(url, remotionProjectPath);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'generate_audio': {
        const { musicStyle, narrationScript, duration, remotionProjectPath } = args as {
          musicStyle?: string;
          narrationScript: string;
          duration: number;
          remotionProjectPath?: string;
        };
        if (!narrationScript || !duration) {
          throw new McpError(
            ErrorCode.InvalidParams,
            'narrationScript and duration are required'
          );
        }
        const result = await generateAudio({
          musicStyle: musicStyle || 'ambient',
          narrationScript,
          duration,
          remotionProjectPath,
        });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'render_video': {
        const { inputProps, outputFileName, remotionProjectPath } = args as {
          inputProps: Record<string, any>;
          outputFileName: string;
          remotionProjectPath?: string;
        };
        if (!inputProps || !outputFileName) {
          throw new McpError(
            ErrorCode.InvalidParams,
            'inputProps and outputFileName are required'
          );
        }
        const result = await renderVideo({
          inputProps,
          outputFileName,
          remotionProjectPath,
        });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      default:
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
  } catch (error) {
    if (error instanceof McpError) {
      throw error;
    }
    throw new McpError(
      ErrorCode.InternalError,
      `Error executing tool ${name}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Docs-to-Tutorial MCP server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
