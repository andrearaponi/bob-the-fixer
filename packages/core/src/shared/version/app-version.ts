/**
 * App Version
 *
 * Single source of truth for the version this server reports about itself: the
 * MCP handshake (`serverInfo.version`), the health check, and the GitHub release
 * comparison all read it from the package manifest, so what a client sees can
 * never drift from the released package.
 *
 * The relative path resolves identically before and after compilation: this
 * module sits three levels below the package root both as `src/shared/version/`
 * and as `dist/shared/version/`.
 */

import pkg from '../../../package.json';

export const APP_VERSION: string = pkg.version;
