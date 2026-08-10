#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const rootDir = path.resolve(import.meta.dirname, '..');
const websiteDir = path.join(rootDir, 'website');
const websiteDistDir = path.join(websiteDir, 'doc_build');
const packageDocsDir = path.join(rootDir, 'packages/rstack/docs');
const legacyPackageDocsDir = path.join(rootDir, 'packages/rstack/dist/docs');

const run = (command, args) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: rootDir,
      env: {
        ...process.env,
        RSPRESS_INJECT_LLMS_HINT: 'false',
      },
      stdio: 'inherit',
    });

    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      const reason = signal ? `signal ${signal}` : `exit code ${code}`;
      reject(new Error(`${command} ${args.join(' ')} failed with ${reason}.`));
    });
  });

const collectMarkdownFiles = async (directory, relativeDir = '') => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.isDirectory() && entry.name === 'zh') {
      continue;
    }

    const relativePath = path.join(relativeDir, entry.name);
    const absolutePath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await collectMarkdownFiles(absolutePath, relativePath)));
    } else if (entry.isFile() && path.extname(entry.name) === '.md') {
      files.push(relativePath);
    }
  }

  return files;
};

const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

console.log('Building the website...');
await run(pnpmCommand, ['--dir', websiteDir, 'build']);

const markdownFiles = await collectMarkdownFiles(websiteDistDir);
if (markdownFiles.length === 0) {
  throw new Error(`No English Markdown files found in ${websiteDistDir}.`);
}

await Promise.all([
  rm(packageDocsDir, { recursive: true, force: true }),
  rm(legacyPackageDocsDir, { recursive: true, force: true }),
]);

for (const relativePath of markdownFiles) {
  const destination = path.join(packageDocsDir, relativePath);
  await mkdir(path.dirname(destination), { recursive: true });
  await copyFile(path.join(websiteDistDir, relativePath), destination);
}

const llmsTxt = await readFile(path.join(websiteDistDir, 'llms.txt'), 'utf8');
const packageLlmsTxt = llmsTxt.replace(/\]\(\/(?!\/)/g, '](./');
await writeFile(path.join(packageDocsDir, 'llms.txt'), packageLlmsTxt);

console.log(
  `Copied ${markdownFiles.length} English Markdown files and llms.txt to ${packageDocsDir}.`,
);
