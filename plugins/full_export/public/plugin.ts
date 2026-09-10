import { CoreSetup, CoreStart, Plugin } from '../../../src/core/public';
import {
  FullExportPluginSetup,
  FullExportPluginStart,
  FullExportSetupDependencies,
  FullExportStartDependencies,
} from './types';
import { SLA_DOWNLOAD_EMBEDDABLE } from './embeddable/constants';
import { SlaDownloadEmbeddableFactory } from './embeddable/sla_download_embeddable_factory';

export class FullExportPlugin
  implements
    Plugin<
      FullExportPluginSetup,
      FullExportPluginStart,
      FullExportSetupDependencies,
      FullExportStartDependencies
    >
{
  public setup(
    core: CoreSetup,
    plugins: FullExportSetupDependencies
  ): FullExportPluginSetup {
    plugins.embeddable.registerEmbeddableFactory(
      SLA_DOWNLOAD_EMBEDDABLE,
      new SlaDownloadEmbeddableFactory(core.http.basePath)
    );

    return {};
  }

  public start(core: CoreStart): FullExportPluginStart {
    return {};
  }

  public stop() {}
}
