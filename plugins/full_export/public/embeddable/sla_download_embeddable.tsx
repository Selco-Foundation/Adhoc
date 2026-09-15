import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import { EuiButton, EuiFlexGroup, EuiFlexItem, EuiText } from '@elastic/eui';
import type { Filter, Query, TimeRange } from '@kbn/es-query';
import { IBasePath } from '../../../../src/core/public';
import {
  Embeddable,
  EmbeddableInput,
  EmbeddableOutput,
  IContainer,
} from '../../../../src/plugins/embeddable/public';
import { SLA_DOWNLOAD_EMBEDDABLE } from './constants';

// The dashboard container passes its filter pills (including everything emitted by
// Controls), the query bar and the time picker down to every child panel as input.
export interface SlaDownloadEmbeddableInput extends EmbeddableInput {
  filters?: Filter[];
  query?: Query;
  timeRange?: TimeRange;
}

export type SlaDownloadEmbeddableOutput = EmbeddableOutput;

interface SlaDownloadPanelProps {
  basePath: IBasePath;
  getInput: () => SlaDownloadEmbeddableInput;
}

function SlaDownloadPanel({ basePath, getInput }: SlaDownloadPanelProps) {
  const [isDownloading, setIsDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDownload = async () => {
    setIsDownloading(true);
    setError(null);

    try {
      // Read at click time so the export always reflects the dashboard's current state.
      const { filters, query, timeRange } = getInput();

      const res = await fetch(basePath.prepend('/api/full_export/sla-report'), {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'kbn-xsrf': 'true',
        },
        body: JSON.stringify({ filters, query, timeRange }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || `Export failed with status ${res.status}`);
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'sla-report.csv';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed');
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <EuiFlexGroup
      direction="column"
      alignItems="center"
      justifyContent="center"
      style={{ height: '100%', padding: 8 }}
      gutterSize="s"
    >
      <EuiFlexItem grow={false}>
        <EuiButton
          iconType="download"
          onClick={handleDownload}
          isLoading={isDownloading}
          disabled={isDownloading}
        >
          {isDownloading ? 'Preparing CSV…' : 'Download SLA CSV'}
        </EuiButton>
      </EuiFlexItem>
      <EuiFlexItem grow={false}>
        <EuiText size="xs" color={error ? 'danger' : 'subdued'} textAlign="center">
          {error ?? 'Exports the rows matching the current dashboard filters.'}
        </EuiText>
      </EuiFlexItem>
    </EuiFlexGroup>
  );
}

export class SlaDownloadEmbeddable extends Embeddable<
  SlaDownloadEmbeddableInput,
  SlaDownloadEmbeddableOutput
> {
  public readonly type = SLA_DOWNLOAD_EMBEDDABLE;
  private node?: HTMLElement;

  constructor(
    initialInput: SlaDownloadEmbeddableInput,
    private readonly basePath: IBasePath,
    parent?: IContainer
  ) {
    // Without a defaultTitle the dashboard renders the panel header as "[No Title]".
    super(initialInput, { defaultTitle: 'SLA CSV Download' }, parent);
  }

  public render(node: HTMLElement) {
    this.node = node;
    ReactDOM.render(
      <SlaDownloadPanel basePath={this.basePath} getInput={() => this.getInput()} />,
      node
    );
  }

  public reload() {}

  public destroy() {
    super.destroy();
    if (this.node) {
      ReactDOM.unmountComponentAtNode(this.node);
    }
  }
}
