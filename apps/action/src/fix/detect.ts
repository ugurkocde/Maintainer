import { promises as fs } from 'fs';
import { join } from 'path';

export type ProjectInfo = {
  language: string;
  test_command?: string;
  package_manager?: string;
};

export async function detectProject(workspace: string): Promise<ProjectInfo> {
  const has = async (p: string): Promise<boolean> => {
    try {
      await fs.access(join(workspace, p));
      return true;
    } catch {
      return false;
    }
  };

  if (await has('package.json')) {
    const pm = (await has('pnpm-lock.yaml'))
      ? 'pnpm'
      : (await has('yarn.lock'))
        ? 'yarn'
        : (await has('bun.lockb'))
          ? 'bun'
          : 'npm';
    let testCommand: string | undefined;
    try {
      const pkg = JSON.parse(await fs.readFile(join(workspace, 'package.json'), 'utf-8')) as {
        scripts?: Record<string, string>;
      };
      if (pkg.scripts?.test) testCommand = `${pm} test`;
    } catch {
      // fall through
    }
    return { language: 'javascript', package_manager: pm, test_command: testCommand };
  }
  if (await has('pyproject.toml')) {
    return { language: 'python', test_command: 'pytest -q' };
  }
  if (await has('requirements.txt')) {
    return { language: 'python', test_command: 'pytest -q' };
  }
  if (await has('Cargo.toml')) {
    return { language: 'rust', test_command: 'cargo test --quiet' };
  }
  if (await has('go.mod')) {
    return { language: 'go', test_command: 'go test ./...' };
  }
  if (await has('Gemfile')) {
    return { language: 'ruby', test_command: 'bundle exec rake test' };
  }
  if (await has('pom.xml')) {
    return { language: 'java', test_command: 'mvn test -q' };
  }
  if (await has('build.gradle') || (await has('build.gradle.kts'))) {
    return { language: 'java', test_command: './gradlew test' };
  }
  return { language: 'unknown' };
}
