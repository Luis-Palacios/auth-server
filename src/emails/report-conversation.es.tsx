import { ReportConversationEmail, reportConversationPreviewProps } from './report-conversation.js';

// Spanish preview for `pnpm email:dev`.
export default function ReportConversationEsPreview() {
	return <ReportConversationEmail locale="es" {...reportConversationPreviewProps} />;
}
