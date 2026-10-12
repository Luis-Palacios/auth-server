import { VerifyEmail } from './verify-email.js';

// Spanish preview for `pnpm email:dev`.
export default function VerifyEmailEsPreview() {
	return <VerifyEmail locale="es" verificationUrl="https://example.com/verify-email?token=abc123" />;
}
