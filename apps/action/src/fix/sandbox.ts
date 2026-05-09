import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import { join, normalize, resolve, relative } from 'path';

export class WorkspaceError extends Error {}

export class Workspace {
  constructor(public readonly root: string) {}

  resolveSafe(relativePath: string): string {
    const abs = resolve(this.root, relativePath);
    const rel = relative(this.root, abs);
    if (rel.startsWith('..') || normalize(rel).startsWith('..')) {
      throw new WorkspaceError(`Path "${relativePath}" escapes the workspace.`);
    }
    return abs;
  }

  async readFile(relativePath: string, maxBytes = 200_000): Promise<string> {
    const abs = this.resolveSafe(relativePath);
    const stat = await fs.stat(abs);
    if (stat.size > maxBytes) {
      const handle = await fs.open(abs, 'r');
      try {
        const buf = Buffer.alloc(maxBytes);
        await handle.read(buf, 0, maxBytes, 0);
        return `${buf.toString('utf-8')}\n\n[truncated, file is ${stat.size} bytes]`;
      } finally {
        await handle.close();
      }
    }
    return fs.readFile(abs, 'utf-8');
  }

  async writeFile(relativePath: string, content: string): Promise<void> {
    const abs = this.resolveSafe(relativePath);
    await fs.mkdir(join(abs, '..'), { recursive: true });
    await fs.writeFile(abs, content, 'utf-8');
  }

  async listDirectory(relativePath: string, maxEntries = 200): Promise<string[]> {
    const abs = this.resolveSafe(relativePath);
    const entries = await fs.readdir(abs, { withFileTypes: true });
    return entries
      .slice(0, maxEntries)
      .map((e) => (e.isDirectory() ? `${e.name}/` : e.name))
      .sort();
  }

  run(
    command: string,
    args: string[],
    opts: { timeoutMs?: number; cwd?: string; env?: NodeJS.ProcessEnv } = {},
  ): Promise<{ code: number; stdout: string; stderr: string; timedOut: boolean }> {
    return new Promise((resolveProm) => {
      const child = spawn(command, args, {
        cwd: opts.cwd ?? this.root,
        env: { ...process.env, ...opts.env },
        shell: false,
      });
      let stdout = '';
      let stderr = '';
      const limit = 200_000;
      const truncate = (existing: string, chunk: string): string => {
        if (existing.length >= limit) return existing;
        const next = existing + chunk;
        return next.length > limit ? `${next.slice(0, limit)}\n[output truncated]` : next;
      };
      child.stdout.on('data', (d: Buffer) => {
        stdout = truncate(stdout, d.toString('utf-8'));
      });
      child.stderr.on('data', (d: Buffer) => {
        stderr = truncate(stderr, d.toString('utf-8'));
      });
      let timedOut = false;
      const timeout = opts.timeoutMs
        ? setTimeout(() => {
            timedOut = true;
            child.kill('SIGKILL');
          }, opts.timeoutMs)
        : null;
      child.on('close', (code) => {
        if (timeout) clearTimeout(timeout);
        resolveProm({ code: code ?? -1, stdout, stderr, timedOut });
      });
      child.on('error', (err) => {
        if (timeout) clearTimeout(timeout);
        resolveProm({ code: -1, stdout, stderr: stderr + `\n${err.message}`, timedOut });
      });
    });
  }

  async grep(pattern: string, opts: { maxResults?: number; path?: string } = {}): Promise<string> {
    const args = [
      '-rni',
      '--exclude-dir=node_modules',
      '--exclude-dir=.git',
      '--exclude-dir=dist',
      '--exclude-dir=lib',
      '--exclude-dir=build',
      '--exclude-dir=target',
      '--exclude-dir=.next',
      pattern,
      opts.path ?? '.',
    ];
    const result = await this.run('grep', args, { timeoutMs: 30_000 });
    const lines = result.stdout.split('\n').filter(Boolean).slice(0, opts.maxResults ?? 50);
    return lines.join('\n') || '(no matches)';
  }

  async listChangedFiles(): Promise<string[]> {
    const r = await this.run('git', ['status', '--porcelain'], { timeoutMs: 10_000 });
    if (r.code !== 0) return [];
    // Porcelain v1 format: `XY PATH` where XY are exactly two status chars
    // followed by a single space. Slice the first 3 chars off literally
    // rather than regex-matching, which previously over-ate into filenames
    // whose first character was an uppercase letter (e.g. "IntuneBrew.ps1").
    return r.stdout
      .split('\n')
      .filter((l) => l.length > 3)
      .map((l) => l.slice(3))
      .filter(Boolean);
  }

  async hasChanges(): Promise<boolean> {
    return (await this.listChangedFiles()).length > 0;
  }
}
