import type { CSSProperties, ReactNode } from 'react';
import { Body, Button, Container, Head, Heading, Hr, Html, Link, Preview, Section, Text } from 'react-email';
import type { Locale } from '../locale.js';
import { colors as c, fonts as f } from './theme.js';

const sharedCopy: Record<Locale, { sentBy: string; fallbackLink: string }> = {
	en: { sentBy: 'Sent by ekklesiaio.', fallbackLink: 'Button not working? Paste this link into your browser:' },
	es: { sentBy: 'Enviado por ekklesiaio.', fallbackLink: '¿El botón no funciona? Pega este enlace en tu navegador:' },
};

// The wordmark is HTML text, not an image: Gmail doesn't render SVG and this needs no hosted file.
const wordmark: CSSProperties = {
	margin: '0 0 24px',
	fontFamily: f.logo,
	fontSize: 22,
	fontWeight: 650,
	letterSpacing: '-0.03em',
	lineHeight: '28px',
};

const card: CSSProperties = {
	backgroundColor: c.surface,
	border: `1px solid ${c.line}`,
	borderRadius: 16,
	padding: '32px 28px',
};

const eyebrowStyle: CSSProperties = {
	margin: '0 0 8px',
	fontSize: 12,
	fontWeight: 600,
	letterSpacing: '0.08em',
	textTransform: 'uppercase',
	lineHeight: '16px',
	color: c.gold800,
};

const headingStyle: CSSProperties = {
	margin: '0 0 12px',
	fontFamily: f.display,
	fontSize: 30,
	fontWeight: 500,
	lineHeight: '36px',
	color: c.navy900,
};

type EmailShellProps = {
	locale: Locale;
	preview: string;
	eyebrow: string;
	heading: string;
	children: ReactNode;
};

// The frame shared by every email: paper background, wordmark, white card, footer line.
export function EmailShell({ locale, preview, eyebrow, heading, children }: EmailShellProps) {
	return (
		<Html lang={locale}>
			<Head />
			<Preview>{preview}</Preview>
			<Body style={{ margin: 0, backgroundColor: c.paper, fontFamily: f.sans }}>
				<Container style={{ maxWidth: 560, padding: '40px 16px' }}>
					<Text style={wordmark}>
						<span style={{ color: c.navy900 }}>ekklesia</span>
						<span style={{ color: c.gold500 }}>io</span>
					</Text>
					<Section style={card}>
						<Text style={eyebrowStyle}>{eyebrow}</Text>
						<Heading as="h1" style={headingStyle}>
							{heading}
						</Heading>
						{children}
					</Section>
					<Text style={{ margin: '20px 0 0', fontSize: 13, lineHeight: '20px', color: c.muted }}>
						{sharedCopy[locale].sentBy}
					</Text>
				</Container>
			</Body>
		</Html>
	);
}

export function BodyText({ children, spaceAfter = 28 }: { children: ReactNode; spaceAfter?: number }) {
	return (
		<Text style={{ margin: `0 0 ${spaceAfter}px`, fontSize: 16, lineHeight: '26px', color: c.ink }}>{children}</Text>
	);
}

export function Strong({ children }: { children: ReactNode }) {
	return <strong style={{ color: c.navy900 }}>{children}</strong>;
}

export function ActionButton({ href, children }: { href: string; children: ReactNode }) {
	return (
		<Button
			href={href}
			style={{
				display: 'inline-block',
				backgroundColor: c.navy900,
				borderRadius: 10,
				padding: '15px 24px',
				fontSize: 16,
				fontWeight: 700,
				lineHeight: '22px',
				color: '#FFFFFF',
				textDecoration: 'none',
			}}
		>
			{children}
		</Button>
	);
}

// The raw URL under the button, for clients that block or mangle buttons.
export function FallbackLink({ locale, href }: { locale: Locale; href: string }) {
	return (
		<Text style={{ margin: '20px 0 0', fontSize: 13, lineHeight: '20px', color: c.muted }}>
			{sharedCopy[locale].fallbackLink}
			<br />
			<Link href={href} style={{ color: c.navy900, wordBreak: 'break-all' }}>
				{href}
			</Link>
		</Text>
	);
}

export function IgnoreNote({ children }: { children: ReactNode }) {
	return (
		<>
			<Hr style={{ margin: '28px 0 20px', borderColor: c.line, borderTop: `1px solid ${c.line}` }} />
			<Text style={{ margin: 0, fontSize: 14, lineHeight: '22px', color: c.muted }}>{children}</Text>
		</>
	);
}
