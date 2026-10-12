import { InviteUserEmail } from './invite-user.js';

// Spanish preview for `pnpm email:dev`.
export default function InviteUserEsPreview() {
	return (
		<InviteUserEmail
			locale="es"
			inviterName="María López"
			inviterEmail="maria@iglesia.org"
			roleName="admin"
			url="https://example.com/accept-invite?token=abc123"
			email="ana@iglesia.org"
			churchName="Petra Managua"
			ministryName="Ministerio Cristiano Petra"
		/>
	);
}
