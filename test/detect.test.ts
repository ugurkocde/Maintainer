import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { detectProject } from '../src/fix/detect.js';

let dir: string;

beforeAll(async () => {
  dir = await fs.mkdtemp(join(tmpdir(), 'maintainer-detect-'));
});

afterAll(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe('detectProject', () => {
  it('detects unknown for empty dir', async () => {
    const sub = await fs.mkdtemp(join(dir, 'empty-'));
    expect(await detectProject(sub)).toEqual({ language: 'unknown' });
  });

  it('detects npm when package.json with test script present', async () => {
    const sub = await fs.mkdtemp(join(dir, 'npm-'));
    await fs.writeFile(join(sub, 'package.json'), JSON.stringify({ scripts: { test: 'vitest' } }));
    const info = await detectProject(sub);
    expect(info.language).toBe('javascript');
    expect(info.package_manager).toBe('npm');
    expect(info.test_command).toBe('npm test');
  });

  it('detects pnpm via lockfile', async () => {
    const sub = await fs.mkdtemp(join(dir, 'pnpm-'));
    await fs.writeFile(join(sub, 'package.json'), JSON.stringify({ scripts: { test: 'vitest' } }));
    await fs.writeFile(join(sub, 'pnpm-lock.yaml'), '');
    const info = await detectProject(sub);
    expect(info.package_manager).toBe('pnpm');
    expect(info.test_command).toBe('pnpm test');
  });

  it('detects rust', async () => {
    const sub = await fs.mkdtemp(join(dir, 'rust-'));
    await fs.writeFile(join(sub, 'Cargo.toml'), '[package]\nname = "x"\n');
    const info = await detectProject(sub);
    expect(info.language).toBe('rust');
    expect(info.test_command).toContain('cargo test');
  });
});
