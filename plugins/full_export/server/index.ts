import { PluginInitializerContext } from '../../../src/core/server';
import { FullExportPlugin } from './plugin';

//  This exports static code and TypeScript types,
//  as well as, Kibana Platform `plugin()` initializer.

export function plugin(initializerContext: PluginInitializerContext) {
  return new FullExportPlugin(initializerContext);
}

export type { FullExportPluginSetup, FullExportPluginStart } from './types';
