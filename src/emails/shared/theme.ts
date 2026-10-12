// Email clients can't read CSS variables or load the apps' fonts, so the templates need literal
// values. These are copied from the staff app theme and landing-page/brand/theme.css: keep them in sync.

export const colors = {
	navy900: '#0B2341',
	navy100: '#EAF0F7',
	gold500: '#F2B544',
	gold800: '#8A5B00',
	ink: '#33445A',
	muted: '#56667A',
	line: '#E2E5EA',
	paper: '#FBFAF7',
	surface: '#FFFFFF',
} as const;

export const fonts = {
	display: 'Newsreader, Georgia, "Times New Roman", serif',
	sans: "Figtree, -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
	logo: 'Inter, Arial, Helvetica, sans-serif',
} as const;
