import './index.scss';

import { FullExportPlugin } from './plugin';

// This exports static code and TypeScript types,
// as well as, Kibana Platform `plugin()` initializer.
export function plugin() {
  return new FullExportPlugin();
}
export type { FullExportPluginSetup, FullExportPluginStart } from './types';
