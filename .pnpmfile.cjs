// better-auth declares optional peers for frameworks and tools it never imports at run time here:
// drizzle-kit (its schema CLI) and next (its `better-auth/next-js` entry, unused). When one of them
// is in our tree as a devDependency (drizzle-kit directly; next through @react-email/ui, the
// `email:dev` preview server), pnpm links it as better-auth's peer, and `pnpm install --prod` then
// ships it in the production image (drizzle-kit + esbuild ~105 MB; next + sharp ~320 MB). Dropping
// the peers keeps them dev-only. Remove an entry if better-auth stops declaring it.
const droppedBetterAuthPeers = ['drizzle-kit', 'next'];

module.exports = {
	hooks: {
		readPackage(pkg) {
			if (pkg.name === 'better-auth') {
				for (const peer of droppedBetterAuthPeers) {
					delete pkg.peerDependencies?.[peer];
					delete pkg.peerDependenciesMeta?.[peer];
				}
			}
			return pkg;
		},
	},
};
