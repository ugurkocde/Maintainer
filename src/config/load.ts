import { promises as fs } from 'fs';
import { resolve } from 'path';
import * as yaml from 'js-yaml';
import { ConfigSchema, type Config } from './schema.js';

export async function loadConfig(workspacePath: string, configPath: string): Promise<Config> {
  const fullPath = resolve(workspacePath, configPath);
  let raw: unknown = {};
  try {
    const content = await fs.readFile(fullPath, 'utf-8');
    raw = yaml.load(content) ?? {};
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw new Error(`Failed to read config at ${fullPath}: ${(err as Error).message}`);
    }
  }
  const parsed = ConfigSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Invalid maintainer config:\n${parsed.error.message}`);
  }
  return parsed.data;
}
