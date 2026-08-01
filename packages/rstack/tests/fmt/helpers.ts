import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const withTempProject = async (
  callback: (rootPath: string) => Promise<void>,
): Promise<void> => {
  const rootPath = mkdtempSync(path.join(import.meta.dirname, 'test-temp-fmt-'));
  // Prevent repository-level ignore rules from affecting the fixture.
  mkdirSync(path.join(rootPath, '.git'));

  try {
    await callback(rootPath);
  } finally {
    rmSync(rootPath, { force: true, recursive: true });
  }
};

export const writeProjectFile = (rootPath: string, filePath: string, content = ''): string => {
  const absolutePath = path.join(rootPath, filePath);
  mkdirSync(path.dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, content);
  return absolutePath;
};
