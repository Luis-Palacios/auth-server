import { ReportSubmittedEmail, reportSubmittedPreviewProps } from './report-submitted.js';

// Spanish preview for `pnpm email:dev`.
export default function ReportSubmittedEsPreview() {
	return <ReportSubmittedEmail locale="es" {...reportSubmittedPreviewProps} />;
}
