import type { ReactElement } from 'react';
import { z } from 'zod';
import type { Locale } from '../emails/locale.js';
import {
	ReportConversationEmail,
	type ReportConversationEmailProps,
	reportConversationSubject,
} from '../emails/report-conversation.js';
import {
	ReportSubmittedEmail,
	type ReportSubmittedEmailProps,
	reportSubmittedSubject,
} from '../emails/report-submitted.js';

// The envelope every notification request shares. `template` and `data` are only checked for shape
// here; what they must contain depends on the template (below).
export const notificationEnvelope = z.strictObject({
	idempotencyKey: z.string().min(1).max(200),
	recipientUserId: z.string().min(1).max(200),
	template: z.string().max(100),
	data: z.unknown(),
	path: z.string(),
});

const reportConversationData = z.strictObject({
	actorName: z.string().trim().min(1).max(200),
	groupName: z.string().trim().min(1).max(200),
	meetingDate: z.iso.date(),
	reason: z.enum(['leader', 'participant', 'watcher']),
	topic: z.enum(['person', 'prayer', 'praise', 'followUp']),
	startedBy: z.enum(['elders', 'leaders']),
});

// A thread's deep link in staff-app: a member's row, a guest's row, or a report section. Anchored,
// so only a path on our own app is ever accepted (never a full URL, never "//host").
const reportConversationPath =
	/^\/groups\/reports\/[1-9]\d*\?(?:person|guest)=[1-9]\d*$|^\/groups\/reports\/[1-9]\d*\?section=(?:prayer|praise|followUp)$/;

// `report.submitted`. `held` decides the rest: a held meeting must carry both counts, a no meeting
// must carry neither (strict objects, so an extra key fails too). Counts are attendance rows
// (members and guests) and those who attended, so attended can't exceed people.
const reportSubmittedCommon = {
	submitterName: z.string().trim().min(1).max(200),
	groupName: z.string().trim().min(1).max(200),
	meetingDate: z.iso.date(),
	reason: z.literal('watcher'),
};
const count = z.int().min(0).max(10_000);
const reportSubmittedData = z.discriminatedUnion('held', [
	z
		.strictObject({ ...reportSubmittedCommon, held: z.literal(true), attendedCount: count, peopleCount: count })
		.refine((data) => data.attendedCount <= data.peopleCount),
	z.strictObject({ ...reportSubmittedCommon, held: z.literal(false) }),
]);

// The report itself in staff-app, no query. Anchored, like the conversation links.
const reportPath = /^\/groups\/reports\/[1-9]\d*$/;

export type RenderContext = { url: string; locale: Locale };
export type RenderedEmail = { subject: string; react: ReactElement };

// What a template gives the route once data and path pass: the validated data (what the request
// hash is computed from) and a render function already bound to it.
export type ValidatedNotification = { data: unknown; render: (context: RenderContext) => RenderedEmail };
type TemplateEntry = { validate: (data: unknown, path: string) => ValidatedNotification | null };

// Ties a template's schema, allowed paths and renderer together, typed end to end: `render` receives
// exactly what `data` parsed to. The registry only stores the resulting validate().
function defineTemplate<T>(definition: {
	data: z.ZodType<T>;
	path: RegExp;
	render: (data: T, context: RenderContext) => RenderedEmail;
}): TemplateEntry {
	return {
		validate(data, path) {
			const parsed = definition.data.safeParse(data);
			if (!parsed.success || !definition.path.test(path)) return null;
			return { data: parsed.data, render: (context) => definition.render(parsed.data, context) };
		},
	};
}

function reportConversationEmail(props: ReportConversationEmailProps): RenderedEmail {
	return { subject: reportConversationSubject(props), react: <ReportConversationEmail {...props} /> };
}

function reportSubmittedEmail(props: ReportSubmittedEmailProps): RenderedEmail {
	return { subject: reportSubmittedSubject(props), react: <ReportSubmittedEmail {...props} /> };
}

// One entry per template key. A new email type is a new entry here (plus its React template), never
// a new route.
export const notificationTemplates: Record<string, TemplateEntry> = {
	'report-conversation.new': defineTemplate({
		data: reportConversationData,
		path: reportConversationPath,
		render: (data, context) => reportConversationEmail({ kind: 'new', ...data, ...context }),
	}),
	'report-conversation.reply': defineTemplate({
		data: reportConversationData,
		path: reportConversationPath,
		render: (data, context) => reportConversationEmail({ kind: 'reply', ...data, ...context }),
	}),
	'report.submitted': defineTemplate({
		data: reportSubmittedData,
		path: reportPath,
		render: (data, context) => reportSubmittedEmail({ ...data, ...context }),
	}),
};

export function findNotificationTemplate(template: string): TemplateEntry | undefined {
	return Object.hasOwn(notificationTemplates, template) ? notificationTemplates[template] : undefined;
}
