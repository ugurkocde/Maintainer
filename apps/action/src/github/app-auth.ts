import { createAppAuth } from '@octokit/auth-app';
import { context } from '@actions/github';
import { log } from '../util/log.js';

/**
 * Mints an installation access token for the configured GitHub App, scoped
 * to the repository where the workflow is running. Returns null if either
 * the App ID or the private key is missing, or if token generation fails.
 *
 * Callers fall back to the workflow's default GITHUB_TOKEN when this returns
 * null, keeping backwards compatibility for installs that haven't created
 * an App yet.
 */
export async function mintInstallationToken(opts: {
  appId: string;
  privateKey: string;
}): Promise<string | null> {
  try {
    const auth = createAppAuth({
      appId: opts.appId,
      privateKey: normalizePem(opts.privateKey),
    });

    // Get an app-level JWT, then look up the installation for the current repo.
    const { token: jwt } = await auth({ type: 'app' });

    const owner = context.repo.owner;
    const repo = context.repo.repo;
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/installation`,
      {
        headers: {
          Authorization: `Bearer ${jwt}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      },
    );
    if (!res.ok) {
      const text = await res.text();
      log.warn(
        `App is not installed on ${owner}/${repo}, or installation lookup failed (${res.status}): ${text.slice(0, 200)}. Falling back to GITHUB_TOKEN.`,
      );
      return null;
    }
    const installation = (await res.json()) as { id?: number };
    if (!installation.id) {
      log.warn(`Installation lookup returned no id. Falling back to GITHUB_TOKEN.`);
      return null;
    }

    const installationAuth = await auth({
      type: 'installation',
      installationId: installation.id,
    });
    return installationAuth.token;
  } catch (err) {
    log.warn(`Failed to mint App installation token: ${(err as Error).message}. Falling back to GITHUB_TOKEN.`);
    return null;
  }
}

/**
 * GitHub Actions secrets sometimes strip newlines from PEM keys when set via
 * the web UI. This rebuilds the canonical PEM if needed.
 */
function normalizePem(pem: string): string {
  if (pem.includes('\n')) return pem;
  // The PEM header and footer are fixed; everything between is base64 that
  // got stripped of newlines. Rebuild as 64-char-wide lines.
  const match = pem.match(/^-----BEGIN ([A-Z ]+) KEY-----(.+)-----END \1 KEY-----$/s);
  if (!match) return pem;
  const [, label, body] = match;
  const cleaned = body.replace(/\s+/g, '');
  const wrapped = cleaned.match(/.{1,64}/g)?.join('\n') ?? cleaned;
  return `-----BEGIN ${label} KEY-----\n${wrapped}\n-----END ${label} KEY-----\n`;
}
