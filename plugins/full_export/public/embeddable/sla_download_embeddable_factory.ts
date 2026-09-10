import { IBasePath } from '../../../../src/core/public';
import { EmbeddableFactoryDefinition, IContainer } from '../../../../src/plugins/embeddable/public';
import { SLA_DOWNLOAD_EMBEDDABLE } from './constants';
import { SlaDownloadEmbeddable, SlaDownloadEmbeddableInput } from './sla_download_embeddable';

export class SlaDownloadEmbeddableFactory implements EmbeddableFactoryDefinition {
  public readonly type = SLA_DOWNLOAD_EMBEDDABLE;

  constructor(private readonly basePath: IBasePath) {}

  public async isEditable() {
    return true;
  }

  public canCreateNew() {
  return true;
  }
  
  public getDisplayName() {
    return 'SLA CSV Download';
  }

  public getIconType() {
    return 'download';
  }

  public async create(initialInput: SlaDownloadEmbeddableInput, parent?: IContainer) {
    return new SlaDownloadEmbeddable(initialInput, this.basePath, parent);
  }
}
