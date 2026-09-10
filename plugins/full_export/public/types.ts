import { EmbeddableSetup, EmbeddableStart } from '../../../src/plugins/embeddable/public';

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface FullExportPluginSetup {}
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface FullExportPluginStart {}

export interface FullExportSetupDependencies {
  embeddable: EmbeddableSetup;
}

export interface FullExportStartDependencies {
  embeddable: EmbeddableStart;
}
