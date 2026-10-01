// better-auth declares drizzle-kit as an optional peer (for its schema CLI) but never imports it
// at run time. Because drizzle-kit is our devDependency, pnpm links it as better-auth's peer,
// and `pnpm install --prod` then ships drizzle-kit + esbuild (~105 MB) in the production image.
// Dropping the peer keeps drizzle-kit dev-only. Remove this if better-auth stops declaring it.
module.exports = {
	hooks: {
		readPackage(pkg) {
			if (pkg.name === 'better-auth' && pkg.peerDependencies?.['drizzle-kit']) {
				delete pkg.peerDependencies['drizzle-kit'];
				delete pkg.peerDependenciesMeta?.['drizzle-kit'];
			}
			return pkg;
		},
	},
};
