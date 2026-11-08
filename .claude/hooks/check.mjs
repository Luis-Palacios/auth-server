// PostToolUse (Edit|Write): Biome-check the edited file. Stop: Biome-check every changed file, then tsc.
// Exit 2 sends the errors back to Claude. Stop runs too because most edits here go through Bash, which
// PostToolUse on Edit|Write never sees.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const input = JSON.parse(readFileSync(0, 'utf8'));
const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const run = (cmd, args) =>
  spawnSync(cmd, args, { cwd: root, encoding: 'utf8', shell: process.platform === 'win32', timeout: 170_000 });
const lintable = (f) => /\.(m?[jt]sx?)$/.test(f) && !f.includes('node_modules') && !f.endsWith('.d.json.ts');
const fail = (msg) => { process.stderr.write(msg); process.exit(2); };

if (input.hook_event_name === 'PostToolUse') {
  const file = input.tool_input?.file_path;
  if (!file || !lintable(file) || path.relative(root, file).startsWith('..')) process.exit(0);
  const r = run('pnpm', ['exec', 'biome', 'check', file]);
  if (r.status !== 0) fail(`Biome errors in ${file}:\n${r.stdout}${r.stderr}`);
  process.exit(0);
}

// Stop
if (input.stop_hook_active) process.exit(0);
const changed = [
  ...run('git', ['diff', '--name-only', 'HEAD']).stdout.split('\n'),
  ...run('git', ['ls-files', '--others', '--exclude-standard']).stdout.split('\n'),
].filter((f) => f && existsSync(path.join(root, f)));
const errors = [];
const files = changed.filter(lintable);
if (files.length) {
  const r = run('pnpm', ['exec', 'biome', 'check', ...files]);
  if (r.status !== 0) errors.push(`Biome:\n${r.stdout}${r.stderr}`);
  const t = run('pnpm', ['exec', 'tsc', '--noEmit', '--pretty', 'false']);
  if (t.status !== 0) errors.push(`tsc:\n${t.stdout.split('\n').slice(0, 40).join('\n')}`);
}
if (errors.length) fail(`Checks on the changed files failed. Fix them before finishing:\n\n${errors.join('\n\n')}`);
