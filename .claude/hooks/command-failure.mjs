export function commandFailureMessage(result, stdout = result.stdout) {
	const output = [
		result.error?.message,
		typeof stdout === 'string' ? stdout.trimEnd() : '',
		typeof result.stderr === 'string' ? result.stderr.trimEnd() : '',
	].filter(Boolean);

	return output.join('\n') || 'No diagnostic output was produced.';
}
