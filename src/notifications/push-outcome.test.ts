import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { judgeDevice, judgeRequest } from './push-outcome.js';

describe('judgeDevice', () => {
	const cases = [
		[201, 'sent'],
		[200, 'sent'],
		[404, 'gone'],
		[410, 'gone'],
		[400, 'bug'],
		[413, 'bug'],
		[401, 'bug'],
		[403, 'bug'],
		[429, 'transient'],
		[500, 'transient'],
		[503, 'transient'],
	] as const;
	for (const [status, verdict] of cases) {
		it(`${status} is ${verdict}`, () => {
			assert.equal(judgeDevice({ kind: 'answered', status }), verdict);
		});
	}

	it('no answer and the deadline are transient', () => {
		assert.equal(judgeDevice({ kind: 'unreachable', reason: 'ETIMEDOUT' }), 'transient');
		assert.equal(judgeDevice('deadline'), 'transient');
	});
});

describe('judgeRequest', () => {
	it('any transient means retry, even if others were sent', () => {
		assert.deepEqual(judgeRequest({ sent: 2, alreadySent: 1, transient: 1 }), { outcome: 'transient' });
	});

	it('counts devices sent now and on earlier attempts', () => {
		assert.deepEqual(judgeRequest({ sent: 1, alreadySent: 2, transient: 0 }), { outcome: 'sent', sent: 3 });
		assert.deepEqual(judgeRequest({ sent: 0, alreadySent: 2, transient: 0 }), { outcome: 'sent', sent: 2 });
	});

	it('nothing sent and nothing to retry is no_push_subscription', () => {
		assert.deepEqual(judgeRequest({ sent: 0, alreadySent: 0, transient: 0 }), { outcome: 'none' });
	});
});
