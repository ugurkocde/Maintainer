# GitHub App setup

Maintainer can authenticate as a custom GitHub App. When configured, every comment, label, branch, and pull request is attributed to the App's name and avatar instead of the generic `github-actions[bot]`.

This is optional. The Action keeps working with the workflow's `GITHUB_TOKEN` if no App is configured.

## When you want this

- **Brand visibility.** Comments and PRs read as "Maintainer" with your logo.
- **Marketplace credibility.** Required if you eventually publish a public install flow.
- **Org-scoped permissions.** Set permissions once at the App level instead of per-workflow.

## Setup (one time, ~10 min)

### 1. Create the App

Go to **https://github.com/settings/apps/new** and fill in:

| Field | Value |
| --- | --- |
| GitHub App name | `Maintainer` (must be globally unique; try `Maintainer Bot` if taken) |
| Homepage URL | `https://github.com/ugurkocde/Maintainer` |
| Webhook | **Uncheck "Active"** — Maintainer doesn't run a webhook receiver |
| Repository permissions | `Contents: Read & write`, `Issues: Read & write`, `Pull requests: Read & write`, `Metadata: Read-only` |
| Where can this be installed? | "Only on this account" or "Any account" depending on your distribution plan |

Click **Create GitHub App**.

### 2. Upload a logo

On the App's settings page, scroll to the **Display information** section and upload a square PNG (recommended ~400×400). This becomes the avatar on every comment.

### 3. Generate a private key

In the App's settings, scroll to **Private keys** → **Generate a private key**. A `.pem` file downloads — keep it; you'll paste its contents into a secret next.

### 4. Note the App ID

At the top of the App's settings page, copy the **App ID** (a number like `12345`).

### 5. Install the App on the repos you want maintained

In the App's settings, click **Install App** in the left sidebar. Select the account, then choose either "All repositories" or specific repos. Click Install.

### 6. Set the secrets

For each repository (or once at the org level):

```bash
gh secret set MAINTAINER_APP_ID --repo <owner>/<repo> --body "<app-id-number>"
gh secret set MAINTAINER_APP_PRIVATE_KEY --repo <owner>/<repo> --body "$(cat path/to/private-key.pem)"
```

Or use **Settings → Secrets and variables → Actions** in the browser.

### 7. Update the workflow

In each repo's `.github/workflows/maintainer.yml`, add the two new inputs:

```yaml
- uses: ugurkocde/Maintainer@v2
  with:
    anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
    github-token: ${{ secrets.GITHUB_TOKEN }}
    app-id: ${{ secrets.MAINTAINER_APP_ID }}
    app-private-key: ${{ secrets.MAINTAINER_APP_PRIVATE_KEY }}
    supabase-url: ${{ secrets.SUPABASE_URL }}
    supabase-secret-key: ${{ secrets.SUPABASE_SECRET_KEY }}
```

Both `app-id` and `app-private-key` must be present. If either is missing or invalid, the Action falls back to `github-token` and logs a warning.

## How the auth flow works at runtime

1. The Action receives `app-id` and `app-private-key`.
2. It mints an App-level JWT using `@octokit/auth-app`.
3. It calls `GET /repos/{owner}/{repo}/installation` with that JWT to find the installation ID for the running repo.
4. It exchanges that for an **installation access token** scoped to that single repo, valid for one hour.
5. All subsequent GitHub API calls use the installation token — comments and PRs are now attributed to the App.

If step 3 fails (App not installed on this repo), the Action logs a warning and falls back to `GITHUB_TOKEN` so the run still completes.

## Troubleshooting

- **"App is not installed on owner/repo"** — visit your App's install page and add the repo.
- **"Bad credentials"** — confirm the private key was pasted correctly. GitHub's web UI sometimes strips newlines from PEM bodies; the Action's PEM normalizer handles this, but copy-paste through certain terminals can mangle it differently.
- **Comments still attributed to `github-actions[bot]`** — the App auth path errored and fell back. Check the Action log for `Failed to mint App installation token`.
