import type { ReactNode } from 'react';

// A sentence with bold parts, kept as data so the same copy gives the HTML body (bold names) and
// the plain-text inbox preview.
export type Segment = string | { strong: string };

export const toText = (segments: Segment[]) => segments.map((s) => (typeof s === 'string' ? s : s.strong)).join('');

export function Segments({ segments, strong }: { segments: Segment[]; strong: (text: string) => ReactNode }) {
	return (
		<>
			{segments.map((s, i) =>
				// biome-ignore lint/suspicious/noArrayIndexKey: the list is static for one render
				typeof s === 'string' ? s : <span key={i}>{strong(s.strong)}</span>,
			)}
		</>
	);
}
