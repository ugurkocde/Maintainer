import type { AgentTool } from '../agent/loop.js';
import type { Workspace } from './sandbox.js';

const ALLOWED_BINARIES = new Set([
  'npm', 'pnpm', 'yarn', 'bun', 'npx',
  'pytest', 'python', 'python3', 'pip', 'pip3',
  'cargo', 'rustc',
  'go',
  'bundle', 'rake', 'ruby',
  'mvn', 'gradle', './gradlew',
  'make',
  'node',
  'grep', 'find', 'cat', 'head', 'tail', 'wc', 'ls',
  'git',
]);

export function workspaceTools(ws: Workspace): AgentTool[] {
  return [
    {
      spec: {
        name: 'list_directory',
        description: 'List the contents of a directory in the repository, relative to its root.',
        input_schema: {
          type: 'object',
          properties: { path: { type: 'string', description: 'Directory path. Use "." for repo root.' } },
          required: ['path'],
        },
      },
      handler: async (input: unknown) => {
        const { path } = input as { path: string };
        const entries = await ws.listDirectory(path);
        return entries.join('\n') || '(empty)';
      },
    },
    {
      spec: {
        name: 'read_file',
        description: 'Read a file from the repository, relative to its root. Files larger than 200KB are truncated.',
        input_schema: {
          type: 'object',
          properties: { path: { type: 'string' } },
          required: ['path'],
        },
      },
      handler: async (input: unknown) => {
        const { path } = input as { path: string };
        return ws.readFile(path);
      },
    },
    {
      spec: {
        name: 'write_file',
        description: 'Overwrite or create a file in the repository with the provided content. Use this to apply your fix.',
        input_schema: {
          type: 'object',
          properties: {
            path: { type: 'string' },
            content: { type: 'string', description: 'Full new file contents.' },
          },
          required: ['path', 'content'],
        },
      },
      handler: async (input: unknown) => {
        const { path, content } = input as { path: string; content: string };
        await ws.writeFile(path, content);
        return `wrote ${content.length} bytes to ${path}`;
      },
    },
    {
      spec: {
        name: 'grep',
        description: 'Recursive grep across the repository. Use a literal pattern.',
        input_schema: {
          type: 'object',
          properties: {
            pattern: { type: 'string' },
            path: { type: 'string', description: 'Optional starting path. Defaults to repo root.' },
          },
          required: ['pattern'],
        },
      },
      handler: async (input: unknown) => {
        const { pattern, path } = input as { pattern: string; path?: string };
        return ws.grep(pattern, { path });
      },
    },
    {
      spec: {
        name: 'run_command',
        description:
          'Run a command from a small allow-list of build/test tools (npm, pnpm, yarn, bun, npx, pytest, python, cargo, go, mvn, gradle, make, node, grep, find, git, etc.). Arguments are passed verbatim, no shell interpolation.',
        input_schema: {
          type: 'object',
          properties: {
            command: { type: 'string' },
            args: { type: 'array', items: { type: 'string' } },
            timeout_seconds: { type: 'integer', description: 'Default 300, max 900.' },
          },
          required: ['command', 'args'],
        },
      },
      handler: async (input: unknown) => {
        const { command, args, timeout_seconds } = input as {
          command: string;
          args: string[];
          timeout_seconds?: number;
        };
        if (!ALLOWED_BINARIES.has(command)) {
          return `command "${command}" is not on the allow-list. Allowed: ${[...ALLOWED_BINARIES].join(', ')}`;
        }
        const timeoutMs = Math.min((timeout_seconds ?? 300) * 1000, 900_000);
        const result = await ws.run(command, args, { timeoutMs });
        return [
          `exit: ${result.code}${result.timedOut ? ' (timed out)' : ''}`,
          `stdout:\n${result.stdout || '(empty)'}`,
          `stderr:\n${result.stderr || '(empty)'}`,
        ].join('\n');
      },
    },
  ];
}
