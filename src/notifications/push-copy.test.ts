import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { reportConversationPushCopy, reportReminderPushCopy, reportSubmittedPushCopy } from './push-copy.js';
import type { ReportConversationData, ReportReminderData, ReportSubmittedData } from './templates.js';

// 2026-10-08 is a Thursday, 2026-11-22 a Sunday.
const conversation: ReportConversationData = {
	actorName: 'Roberto Aguilar',
	groupName: 'Jóvenes Bello Horizonte',
	meetingDate: '2026-10-08',
	reason: 'participant',
	topic: 'person',
	startedBy: 'leaders',
};

describe('conversation push copy', () => {
	it('new, person row', () => {
		assert.deepEqual(reportConversationPushCopy('new', conversation, 'en'), {
			title: 'Roberto Aguilar started a conversation about someone',
			body: 'Jóvenes Bello Horizonte · report for Thursday, October 8',
		});
		assert.deepEqual(reportConversationPushCopy('new', conversation, 'es'), {
			title: 'Roberto Aguilar inició una conversación sobre una persona',
			body: 'Jóvenes Bello Horizonte · reporte del jueves 8 de octubre',
		});
	});

	const sectionCases = [
		['prayer', 'prayer requests', 'las peticiones de oración'],
		['praise', 'praise reports', 'los motivos de alabanza'],
		['followUp', 'items for the elders to follow up', 'los puntos para seguimiento de los ancianos'],
	] as const;
	for (const [topic, en, es] of sectionCases) {
		it(`new, ${topic} section`, () => {
			const data = { ...conversation, topic };
			assert.equal(reportConversationPushCopy('new', data, 'en').title, `Roberto Aguilar commented on the ${en}`);
			assert.equal(reportConversationPushCopy('new', data, 'es').title, `Roberto Aguilar comentó en ${es}`);
			assert.equal(
				reportConversationPushCopy('new', data, 'en').body,
				'Jóvenes Bello Horizonte · report for Thursday, October 8',
			);
		});
	}

	it('reply, whatever the topic', () => {
		for (const topic of ['person', 'prayer', 'praise', 'followUp'] as const) {
			const data = { ...conversation, topic };
			assert.deepEqual(reportConversationPushCopy('reply', data, 'en'), {
				title: 'Roberto Aguilar replied in a conversation',
				body: 'Jóvenes Bello Horizonte · report for Thursday, October 8',
			});
			assert.deepEqual(reportConversationPushCopy('reply', data, 'es'), {
				title: 'Roberto Aguilar respondió en una conversación',
				body: 'Jóvenes Bello Horizonte · reporte del jueves 8 de octubre',
			});
		}
	});
});

const submittedCommon = {
	submitterName: 'Ana Pérez',
	groupName: 'Jóvenes Bello Horizonte',
	meetingDate: '2026-10-08',
	reason: 'watcher',
} as const;

describe('report.submitted push copy', () => {
	it('held', () => {
		const data: ReportSubmittedData = { ...submittedCommon, held: true, attendedCount: 9, peopleCount: 12 };
		assert.deepEqual(reportSubmittedPushCopy(data, 'en'), {
			title: 'Jóvenes Bello Horizonte submitted its report',
			body: 'Thursday, October 8 · 9 of 12 attended · by Ana Pérez',
		});
		assert.deepEqual(reportSubmittedPushCopy(data, 'es'), {
			title: 'Jóvenes Bello Horizonte envió su reporte',
			body: 'jueves 8 de octubre · Asistieron 9 de 12 · por Ana Pérez',
		});
	});

	it("didn't meet", () => {
		const data: ReportSubmittedData = { ...submittedCommon, held: false };
		assert.deepEqual(reportSubmittedPushCopy(data, 'en'), {
			title: 'Jóvenes Bello Horizonte didn’t meet',
			body: 'Thursday, October 8 · reported by Ana Pérez',
		});
		assert.deepEqual(reportSubmittedPushCopy(data, 'es'), {
			title: 'Jóvenes Bello Horizonte no se reunió',
			body: 'jueves 8 de octubre · reportado por Ana Pérez',
		});
	});
});

describe('report.reminder push copy', () => {
	const weekStart = '2026-11-22';
	const base = { recipientName: 'Ana Pérez', weekStart };

	it('one group', () => {
		const data: ReportReminderData = { ...base, groups: [{ name: 'Bello Horizonte', hasDraft: false }] };
		assert.deepEqual(reportReminderPushCopy(data, 'en'), {
			title: 'Time to submit the Bello Horizonte report',
			body: 'Week of Sunday, November 22',
		});
		assert.deepEqual(reportReminderPushCopy(data, 'es'), {
			title: 'Es momento de enviar el reporte de Bello Horizonte',
			body: 'Semana del domingo 22 de noviembre',
		});
	});

	it('one group, draft', () => {
		const data: ReportReminderData = { ...base, groups: [{ name: 'Bello Horizonte', hasDraft: true }] };
		assert.deepEqual(reportReminderPushCopy(data, 'en'), {
			title: 'Your Bello Horizonte report is still a draft',
			body: 'Week of Sunday, November 22',
		});
		assert.deepEqual(reportReminderPushCopy(data, 'es'), {
			title: 'El reporte de Bello Horizonte sigue en borrador',
			body: 'Semana del domingo 22 de noviembre',
		});
	});

	it('several groups, drafts or not', () => {
		const data: ReportReminderData = {
			...base,
			groups: [
				{ name: 'Bello Horizonte', hasDraft: true },
				{ name: 'Altamira', hasDraft: false },
				{ name: 'Monseñor Lezcano', hasDraft: false },
			],
		};
		assert.deepEqual(reportReminderPushCopy(data, 'en'), {
			title: 'Time to submit 3 small group reports',
			body: 'Week of Sunday, November 22',
		});
		assert.deepEqual(reportReminderPushCopy(data, 'es'), {
			title: 'Es momento de enviar 3 reportes de grupos pequeños',
			body: 'Semana del domingo 22 de noviembre',
		});
	});
});
