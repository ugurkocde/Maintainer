import { promises as fs } from 'fs';
import { resolve } from 'path';
import { CONTEXT_FILE_PATH } from './path.js';

export async function loadProjectContext(workspaceRoot: string): Promise<string | null> {
  try {
    const content = await fs.readFile(resolve(workspaceRoot, CONTEXT_FILE_PATH), 'utf-8');
    return content.trim() || null;
  } catch {
    return null;
  }
}
