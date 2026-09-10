import {
  PluginInitializerContext,
  CoreSetup,
  CoreStart,
  Plugin,
  Logger,
} from '../../../src/core/server';

import { FullExportPluginSetup, FullExportPluginStart } from './types';
import { defineRoutes } from './routes';

export class FullExportPlugin implements Plugin<FullExportPluginSetup, FullExportPluginStart> {
  private readonly logger: Logger;

  constructor(initializerContext: PluginInitializerContext) {
    this.logger = initializerContext.logger.get();
  }

  public setup(core: CoreSetup) {
    this.logger.debug('fullExport: Setup');
    const router = core.http.createRouter();

    // Register server side APIs
    defineRoutes(router);

    return {};
  }

  public start(core: CoreStart) {
    this.logger.debug('fullExport: Started');
    return {};
  }

  public stop() {}
}
