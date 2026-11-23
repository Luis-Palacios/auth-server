import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { commandFailureMessage } from './command-failure.mjs';

const runHook = (name, input, env = process.env) =>
	spawnSync(process.execPath, [fileURLToPath(new URL(name, import.meta.url))], {
		input: JSON.stringify(input),
		encoding: 'utf8',
		env,
	});

test('branch guard allows valid names and denies invalid names for both clients', () => {
	const valid = runHook('branch-name.mjs', { tool_input: { command: 'git switch -c feature/example' } });
	assert.equal(valid.status, 0);
	assert.equal(valid.stdout, '');

	const invalid = runHook('branch-name.mjs', { tool_input: { command: 'git switch -c InvalidName' } });
	assert.equal(invalid.status, 0);
	const output = JSON.parse(invalid.stdout);
	assert.equal(output.permissionDecision, 'deny');
	assert.equal(output.hookSpecificOutput.permissionDecision, 'deny');
	assert.match(output.permissionDecisionReason, /InvalidName/);
});

test('stop hook skips a continuation but blocks when Git is unavailable', () => {
	const env = {
		...Object.fromEntries(Object.entries(process.env).filter(([key]) => key.toLowerCase() !== 'path')),
		PATH: '',
	};
	assert.equal(Object.keys(env).filter((key) => key.toLowerCase() === 'path').length, 1);

	const continuation = runHook('check.mjs', { hook_event_name: 'Stop', stop_hook_active: true }, env);
	assert.equal(continuation.status, 0);
	assert.equal(continuation.stdout, '');

	const missingGit = runHook('check.mjs', { hook_event_name: 'Stop', stop_hook_active: false }, env);
	assert.equal(missingGit.status, 0);
	const output = JSON.parse(missingGit.stdout);
	assert.equal(output.decision, 'block');
	assert.match(output.reason, /Could not list changed files/);
});

test('command failures report spawn and timeout errors without null output', () => {
	assert.match(
		commandFailureMessage({ error: new Error('spawn pnpm ENOENT'), stdout: null, stderr: null }),
		/spawn pnpm ENOENT/,
	);
	assert.match(
		commandFailureMessage({ error: new Error('spawnSync pnpm ETIMEDOUT'), stdout: null, stderr: null }),
		/spawnSync pnpm ETIMEDOUT/,
	);
});

test('post-edit validation reports a missing pnpm executable', () => {
	const env = {
		...Object.fromEntries(Object.entries(process.env).filter(([key]) => key.toLowerCase() !== 'path')),
		PATH: '',
	};
	const file = fileURLToPath(new URL('hooks.test.mjs', import.meta.url));
	const result = runHook('check.mjs', { hook_event_name: 'PostToolUse', tool_input: { file_path: file } }, env);

	assert.equal(result.status, 2);
	assert.match(result.stderr, /Biome errors in /);
	assert.match(result.stderr, /pnpm/i);
	assert.doesNotMatch(result.stderr, /nullnull/);
});
