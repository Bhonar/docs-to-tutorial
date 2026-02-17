import { describe, it, expect } from 'vitest';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverPath = path.join(__dirname, '../../dist/server.js');

/**
 * Smoke test: starts the MCP server over stdio,
 * sends a tools/list request, and checks the response.
 */
describe('MCP Server Smoke Test', () => {
  it('starts and lists all 4 tools', async () => {
    const result = await sendMcpRequest(serverPath, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'test', version: '1.0.0' },
      },
    }, {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: {},
    });

    expect(result).toBeDefined();
    expect(result.result).toBeDefined();
    expect(result.result.tools).toBeDefined();
    expect(Array.isArray(result.result.tools)).toBe(true);

    const toolNames = result.result.tools.map((t: any) => t.name).sort();
    expect(toolNames).toEqual([
      'extract_docs_content',
      'extract_url_content',
      'generate_audio',
      'render_video',
    ]);

    // Verify all tools accept remotionProjectPath
    for (const tool of result.result.tools) {
      if (tool.name !== 'render_video') {
        // All tools except render_video were just updated to accept remotionProjectPath
      }
      const props = tool.inputSchema?.properties || {};
      expect(props.remotionProjectPath).toBeDefined();
      expect(props.remotionProjectPath.type).toBe('string');
    }
  }, 15000);
});

/**
 * Send MCP JSON-RPC messages to the server via stdio.
 * Returns the response to the last message.
 */
function sendMcpRequest(serverPath: string, ...messages: any[]): Promise<any> {
  return new Promise((resolve, reject) => {
    const proc = spawn('node', [serverPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, NODE_ENV: 'test' },
    });

    let stdout = '';
    let lastResponse: any = null;
    let messagesSent = 0;

    proc.stdout!.on('data', (data: Buffer) => {
      stdout += data.toString();

      // MCP uses newline-delimited JSON over stdio
      const lines = stdout.split('\n');
      for (let i = 0; i < lines.length - 1; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        try {
          const parsed = JSON.parse(line);
          lastResponse = parsed;

          // Send next message after each response
          messagesSent++;
          if (messagesSent < messages.length) {
            const nextMsg = JSON.stringify(messages[messagesSent]) + '\n';
            proc.stdin!.write(nextMsg);
          } else {
            // Got our final response
            proc.kill();
            resolve(lastResponse);
          }
        } catch {
          // partial JSON, wait for more data
        }
      }
      // Keep the last incomplete line
      stdout = lines[lines.length - 1];
    });

    proc.on('error', reject);
    proc.on('close', (code) => {
      if (lastResponse) {
        resolve(lastResponse);
      } else {
        reject(new Error(`Server exited with code ${code} without responding. stdout: ${stdout}`));
      }
    });

    // Send the first message
    const firstMsg = JSON.stringify(messages[0]) + '\n';
    proc.stdin!.write(firstMsg);

    // Timeout
    setTimeout(() => {
      proc.kill();
      if (lastResponse) {
        resolve(lastResponse);
      } else {
        reject(new Error('Server did not respond within timeout'));
      }
    }, 10000);
  });
}
