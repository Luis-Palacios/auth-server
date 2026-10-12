import { ResetPasswordEmail } from './reset-password.js';

// Spanish preview for `pnpm email:dev`.
export default function ResetPasswordEsPreview() {
	return (
		<ResetPasswordEmail locale="es" url="https://example.com/reset-password?token=abc123" email="ana@iglesia.org" />
	);
}
