import { ReportReminderEmail, reportReminderPreviewProps } from './report-reminder.js';

// Spanish preview for `pnpm email:dev`.
export default function ReportReminderEsPreview() {
	return (
		<ReportReminderEmail locale="es" {...reportReminderPreviewProps} groups={[...reportReminderPreviewProps.groups]} />
	);
}
