import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

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
	const env = { ...process.env, PATH: '' };
	const continuation = runHook('check.mjs', { hook_event_name: 'Stop', stop_hook_active: true }, env);
	assert.equal(continuation.status, 0);
	assert.equal(continuation.stdout, '');

	const missingGit = runHook('check.mjs', { hook_event_name: 'Stop', stop_hook_active: false }, env);
	assert.equal(missingGit.status, 0);
	const output = JSON.parse(missingGit.stdout);
	assert.equal(output.decision, 'block');
	assert.match(output.reason, /Could not list changed files/);
});
