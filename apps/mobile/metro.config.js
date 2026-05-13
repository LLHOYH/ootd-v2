// Metro config tuned for a pnpm monorepo: watch sibling workspace packages
// and resolve modules from the workspace root in addition to the app dir.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
config.resolver.disableHierarchicalLookup = true;

// ---- ESM `.js` extension on TS-source imports -----------------------------
//
// Our workspace packages (@mei/types in particular) use the TS5+ Bundler
// resolution convention: `export * from './entities.js'` where the actual
// file on disk is `entities.ts`. `tsc` resolves that fine; Metro doesn't —
// it tries to literally find `entities.js` and bails. The fix is a tiny
// resolveRequest hook that retries with `.ts` (then `.tsx`) whenever a
// relative `.js` import fails.
//
// We deliberately only retry on relative `.js` requests, and only after
// the default resolver has already failed — so non-monorepo modules
// (`react`, `expo`, etc.) keep their fast path.
const defaultResolveRequest = config.resolver.resolveRequest;
const resolveWith = (context, moduleName, platform) =>
  defaultResolveRequest
    ? defaultResolveRequest(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (
    !moduleName.endsWith('.js') ||
    (!moduleName.startsWith('.') && !moduleName.startsWith('/'))
  ) {
    return resolveWith(context, moduleName, platform);
  }
  try {
    return resolveWith(context, moduleName, platform);
  } catch (err) {
    const stem = moduleName.slice(0, -3);
    try {
      return resolveWith(context, stem + '.ts', platform);
    } catch {
      try {
        return resolveWith(context, stem + '.tsx', platform);
      } catch {
        // Re-throw the ORIGINAL error so Metro's UI shows the user's
        // import path, not the rewritten one.
        throw err;
      }
    }
  }
};

module.exports = config;
