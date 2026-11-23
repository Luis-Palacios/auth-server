import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { render } from 'react-email';
import type { Locale } from '../emails/locale.js';
import { findNotificationTemplate } from './templates.js';

const url = 'https://staff.example.com/groups/reports/812';

function validate(template: string, data: unknown, path: string) {
	const entry = findNotificationTemplate(template);
	assert.ok(entry, `template ${template} is registered`);
	return entry.validate(data, path);
}

async function renderText(template: string, data: unknown, path: string, locale: Locale) {
	const validated = validate(template, data, path);
	assert.ok(validated, 'data and path are valid');
	const { subject, react } = validated.render({ url, locale });
	return { subject, text: await render(react, { plainText: true }) };
}

const common = {
	submitterName: 'Roberto Aguilar',
	groupName: 'Jóvenes Bello Horizonte',
	meetingDate: '2026-10-08',
	reason: 'watcher',
};
const held = { ...common, held: true, attendedCount: 9, peopleCount: 12 };
const notHeld = { ...common, held: false };
const reportPath = '/groups/reports/812';

describe('report.submitted data', () => {
	it('accepts a held meeting with both counts', () => {
		assert.deepEqual(validate('report.submitted', held, reportPath)?.data, held);
	});

	it('accepts a no meeting without counts', () => {
		assert.deepEqual(validate('report.submitted', notHeld, reportPath)?.data, notHeld);
	});

	it('accepts zero attendance', () => {
		assert.ok(validate('report.submitted', { ...held, attendedCount: 0, peopleCount: 0 }, reportPath));
	});

	const invalid: Record<string, unknown> = {
		'held without counts': { ...common, held: true },
		'held without peopleCount': { ...common, held: true, attendedCount: 3 },
		'held without attendedCount': { ...common, held: true, peopleCount: 3 },
		'not held with counts': { ...notHeld, attendedCount: 3, peopleCount: 5 },
		'not held with one count': { ...notHeld, peopleCount: 5 },
		'no held': common,
		'held as a string': { ...held, held: 'true' },
		'attended over people': { ...held, attendedCount: 13 },
		'negative count': { ...held, attendedCount: -1 },
		'fractional count': { ...held, peopleCount: 12.5 },
		'count as a string': { ...held, peopleCount: '12' },
		'other reason': { ...held, reason: 'leader' },
		'no reason': { ...common, reason: undefined, held: false },
		'meetingDate not ISO': { ...held, meetingDate: '10/08/2026' },
		'meetingDate with time': { ...held, meetingDate: '2026-10-08T00:00:00Z' },
		'blank submitterName': { ...held, submitterName: '  ' },
		'missing groupName': { ...held, groupName: undefined },
		'extra key (free text)': { ...held, observations: 'Prayed for Ana' },
		'not an object': 'held',
	};
	for (const [name, data] of Object.entries(invalid)) {
		it(`rejects ${name}`, () => {
			assert.equal(validate('report.submitted', data, reportPath), null);
		});
	}
});

describe('report.submitted path', () => {
	it('accepts /groups/reports/{id}', () => {
		assert.ok(validate('report.submitted', held, '/groups/reports/1'));
		assert.ok(validate('report.submitted', held, '/groups/reports/9876543'));
	});

	const wrong = [
		'/groups/reports/812/',
		'/groups/reports/812?person=1207',
		'/groups/reports/812?section=prayer',
		'/groups/reports/812?',
		'/groups/reports/812#x',
		'/groups/reports/0',
		'/groups/reports/012',
		'/groups/reports/',
		'/groups/reports/abc',
		'/groups/reports/812/edit',
		'/groups/report/812',
		'groups/reports/812',
		'//evil.example/groups/reports/812',
		'https://evil.example/groups/reports/812',
		'/groups/reports/812\n',
		'',
	];
	for (const path of wrong) {
		it(`rejects ${JSON.stringify(path)}`, () => {
			assert.equal(validate('report.submitted', held, path), null);
		});
	}

	it('stays off the conversation templates', () => {
		const conversation = {
			actorName: 'Roberto Aguilar',
			groupName: 'Jóvenes Bello Horizonte',
			meetingDate: '2026-10-08',
			reason: 'leader',
			topic: 'person',
			startedBy: 'elders',
		};
		assert.equal(validate('report-conversation.new', conversation, reportPath), null);
		assert.ok(validate('report-conversation.new', conversation, '/groups/reports/812?person=1207'));
		assert.ok(validate('report-conversation.reply', conversation, '/groups/reports/812?guest=3'));
		assert.ok(validate('report-conversation.reply', conversation, '/groups/reports/812?section=followUp'));
	});
});

describe('report.submitted rendering', () => {
	it('held, English', async () => {
		const { subject, text } = await renderText('report.submitted', held, reportPath, 'en');
		assert.equal(subject, 'Jóvenes Bello Horizonte submitted its report for Thursday, October 8');
		assert.match(text, /Roberto Aguilar submitted the report\. 9 of 12 attended\./);
		assert.match(text, /Open report/);
		assert.match(
			text,
			/You’re getting this because you watch this group\. You can unwatch it, or turn off submitted report emails, in My profile\./,
		);
		assert.ok(text.includes(url));
	});

	it('held, Spanish', async () => {
		const { subject, text } = await renderText('report.submitted', held, reportPath, 'es');
		assert.equal(subject, 'Jóvenes Bello Horizonte envió su reporte del jueves 8 de octubre');
		assert.match(text, /Roberto Aguilar envió el reporte\. Asistieron 9 de 12\./);
		assert.match(text, /Abrir reporte/);
		assert.match(
			text,
			/Recibes este correo porque sigues este grupo\. Puedes dejar de seguirlo, o desactivar los correos de reportes enviados, en Mi perfil\./,
		);
		assert.ok(text.includes(url));
	});

	it('not held, English', async () => {
		const { subject, text } = await renderText('report.submitted', notHeld, reportPath, 'en');
		assert.equal(subject, 'Jóvenes Bello Horizonte didn’t meet on Thursday, October 8');
		assert.match(text, /Roberto Aguilar reported that the group didn’t meet\./);
		assert.doesNotMatch(text, /attended/);
	});

	it('not held, Spanish', async () => {
		const { subject, text } = await renderText('report.submitted', notHeld, reportPath, 'es');
		assert.equal(subject, 'Jóvenes Bello Horizonte no se reunió el jueves 8 de octubre');
		assert.match(text, /Roberto Aguilar reportó que el grupo no se reunió\./);
		assert.doesNotMatch(text, /Asistieron/);
	});

	it('keeps the meeting day whatever the server time zone', async () => {
		const { subject } = await renderText('report.submitted', { ...held, meetingDate: '2026-01-01' }, reportPath, 'en');
		assert.match(subject, /Thursday, January 1$/);
	});
});
