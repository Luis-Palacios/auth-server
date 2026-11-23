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

const reminderGroupsOne = [{ name: 'Jóvenes Bello Horizonte', hasDraft: false }];
const reminderGroupsDraft = [{ name: 'Jóvenes Bello Horizonte', hasDraft: true }];
const reminderGroupsMulti = [
	{ name: 'Jóvenes Bello Horizonte', hasDraft: true },
	{ name: 'Matrimonios Villa Fontana', hasDraft: false },
];
const reminder = { recipientName: 'Roberto Aguilar', groups: reminderGroupsOne, weekStart: '2026-11-22' };
const reminderList = '/groups/reports';
const reminderNew = '/groups/reports/new?groupId=12';
const reminderEdit = '/groups/reports/812/edit';

describe('report.reminder data', () => {
	it('accepts a single group without a draft', () => {
		assert.deepEqual(validate('report.reminder', reminder, reminderNew)?.data, reminder);
	});

	it('accepts a single group with a draft', () => {
		assert.ok(validate('report.reminder', { ...reminder, groups: reminderGroupsDraft }, reminderEdit));
	});

	it('accepts several groups, mixed drafts', () => {
		assert.ok(validate('report.reminder', { ...reminder, groups: reminderGroupsMulti }, reminderList));
	});

	const invalid: Record<string, unknown> = {
		'no groups': { ...reminder, groups: [] },
		'51 groups': { ...reminder, groups: Array.from({ length: 51 }, (_, i) => ({ name: `G${i}`, hasDraft: false })) },
		'group without hasDraft': { ...reminder, groups: [{ name: 'Grupo' }] },
		'hasDraft as a string': { ...reminder, groups: [{ name: 'Grupo', hasDraft: 'true' }] },
		'blank group name': { ...reminder, groups: [{ name: '  ', hasDraft: false }] },
		'extra key on a group': { ...reminder, groups: [{ name: 'Grupo', hasDraft: false, id: 3 }] },
		'blank recipientName': { ...reminder, recipientName: ' ' },
		'missing recipientName': { ...reminder, recipientName: undefined },
		'weekStart not ISO': { ...reminder, weekStart: '11/22/2026' },
		'weekStart with time': { ...reminder, weekStart: '2026-11-22T00:00:00Z' },
		'missing weekStart': { ...reminder, weekStart: undefined },
		'extra key (free text)': { ...reminder, observations: 'Prayed for Ana' },
		'not an object': 'reminder',
	};
	for (const [name, data] of Object.entries(invalid)) {
		it(`rejects ${name}`, () => {
			assert.equal(validate('report.reminder', data, reminderList), null);
		});
	}
});

describe('report.reminder path', () => {
	for (const path of [reminderList, reminderNew, reminderEdit, '/groups/reports/new?groupId=1']) {
		it(`accepts ${path}`, () => {
			assert.ok(validate('report.reminder', reminder, path));
		});
	}

	const wrong = [
		'/groups/reports/',
		'/groups/reports?x=1',
		'/groups/reports/new',
		'/groups/reports/new?groupId=',
		'/groups/reports/new?groupId=0',
		'/groups/reports/new?groupId=012',
		'/groups/reports/new?groupId=12&x=1',
		'/groups/reports/new?groupId=abc',
		'/groups/reports/812',
		'/groups/reports/812/edit/',
		'/groups/reports/0/edit',
		'/groups/reports/012/edit',
		'/groups/reports/812/edit?x=1',
		'/groups/reports\n',
		'groups/reports',
		'//evil.example/groups/reports',
		'https://evil.example/groups/reports',
		'',
	];
	for (const path of wrong) {
		it(`rejects ${JSON.stringify(path)}`, () => {
			assert.equal(validate('report.reminder', reminder, path), null);
		});
	}
});

describe('report.reminder rendering', () => {
	it('single group, no draft, English', async () => {
		const { subject, text } = await renderText('report.reminder', reminder, reminderNew, 'en');
		assert.equal(subject, 'Time to submit your small group report');
		assert.match(text, /Hi Roberto Aguilar, thank you for shepherding Jóvenes Bello Horizonte this week\./);
		assert.match(text, /please submit this week’s report so the elders can pray with you and care for your group\./);
		assert.match(text, /Weekly reminder/i);
		assert.match(text, /Submit report/);
		assert.match(text, /You’re getting this because you lead or co-lead an open small group\./);
		assert.ok(text.includes(url));
	});

	it('single group, no draft, Spanish', async () => {
		const { subject, text } = await renderText('report.reminder', reminder, reminderNew, 'es');
		assert.equal(subject, 'Es momento de enviar el reporte de tu grupo pequeño');
		assert.match(text, /Hola Roberto Aguilar, gracias por cuidar y servir a Jóvenes Bello Horizonte esta semana\./);
		assert.match(text, /Enviar reporte/);
		assert.match(text, /Recibes este correo porque lideras o co-lideras un grupo pequeño activo\./);
	});

	it('single group with a draft, English', async () => {
		const data = { ...reminder, groups: reminderGroupsDraft };
		const { subject, text } = await renderText('report.reminder', data, reminderEdit, 'en');
		assert.equal(subject, 'Don’t forget to submit your small group report draft');
		assert.match(text, /You have a saved draft that hasn’t been submitted yet—when you have a moment/);
		assert.match(text, /Review & submit draft/);
	});

	it('single group with a draft, Spanish', async () => {
		const data = { ...reminder, groups: reminderGroupsDraft };
		const { subject, text } = await renderText('report.reminder', data, reminderEdit, 'es');
		assert.equal(subject, 'No olvides enviar el borrador del reporte de tu grupo pequeño');
		assert.match(text, /Tienes un borrador guardado que aún no ha sido enviado; cuando tengas un momento/);
		assert.match(text, /Revisar y enviar borrador/);
	});

	it('several groups, English, keeps the given order and flags drafts', async () => {
		const data = { ...reminder, groups: [...reminderGroupsMulti].reverse() };
		const { subject, text } = await renderText('report.reminder', data, reminderList, 'en');
		assert.equal(subject, 'Time to submit your small group reports');
		assert.match(text, /thank you for shepherding your small groups this week\./);
		assert.match(text, /Open reports/);
		const villa = text.indexOf('Matrimonios Villa Fontana');
		const bello = text.indexOf('Jóvenes Bello Horizonte');
		assert.ok(villa !== -1 && bello > villa, 'groups stay in the order sent');
		assert.match(text, /Jóvenes Bello Horizonte — draft saved, not submitted yet/);
		assert.doesNotMatch(text, /Matrimonios Villa Fontana — /);
	});

	it('several groups, Spanish', async () => {
		const data = { ...reminder, groups: reminderGroupsMulti };
		const { subject, text } = await renderText('report.reminder', data, reminderList, 'es');
		assert.equal(subject, 'Es momento de enviar los reportes de tus grupos pequeños');
		assert.match(text, /gracias por cuidar y servir a tus grupos pequeños esta semana\./);
		assert.match(text, /Abrir reportes/);
		assert.match(text, /Jóvenes Bello Horizonte — borrador guardado, aún sin enviar/);
	});
});

describe('report.reminder weekly verse', () => {
	const en = [
		'Romans 12:11',
		'Galatians 6:9',
		'Colossians 3:23–24',
		'1 Corinthians 15:58',
		'Ecclesiastes 9:10',
		'Proverbs 21:5',
		'2 Peter 1:5–7',
	];
	const es = [
		'Romanos 12:11',
		'Gálatas 6:9',
		'Colosenses 3:23–24',
		'1 Corintios 15:58',
		'Eclesiastés 9:10',
		'Proverbios 21:5',
		'2 Pedro 1:5–7',
	];

	// The index of the one reference the email carries for that week.
	async function verseOf(weekStart: string, locale: Locale) {
		const { text } = await renderText('report.reminder', { ...reminder, weekStart }, reminderNew, locale);
		const found = (locale === 'en' ? en : es).flatMap((reference, index) =>
			text.includes(`— ${reference}`) ? [index] : [],
		);
		assert.equal(found.length, 1, `exactly one verse for ${weekStart}`);
		return found[0] as number;
	}

	it('counts whole days from 1970-01-01, seven days per entry', async () => {
		// Days 0-6 are entry 0 (1970-01-04 is the first Sunday), days 7-13 entry 1, and so on.
		assert.equal(await verseOf('1970-01-04', 'en'), 0);
		assert.equal(await verseOf('1970-01-11', 'en'), 1);
		assert.equal(await verseOf('1970-01-18', 'en'), 2);
		assert.equal(await verseOf('1970-02-22', 'en'), 7 % 7);
	});

	it('advances one entry every church Sunday, then wraps', async () => {
		const start = Date.UTC(2026, 10, 22); // Sunday, November 22, 2026
		const seen: number[] = [];
		for (let week = 0; week < 15; week++) {
			seen.push(await verseOf(new Date(start + week * 7 * 86_400_000).toISOString().slice(0, 10), 'en'));
		}
		assert.equal(new Set(seen.slice(0, 7)).size, 7);
		seen.forEach((index, week) => {
			assert.equal(index, ((seen[0] as number) + week) % 7);
		});
	});

	it('picks the same entry in both languages', async () => {
		assert.equal(await verseOf('2026-11-22', 'es'), await verseOf('2026-11-22', 'en'));
	});
});
