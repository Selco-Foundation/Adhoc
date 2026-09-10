import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom';
import {
  EuiButton,
  EuiComboBox,
  EuiComboBoxOptionOption,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFormRow,
} from '@elastic/eui';
import { IBasePath } from '../../../../src/core/public';
import {
  Embeddable,
  EmbeddableInput,
  EmbeddableOutput,
  IContainer,
} from '../../../../src/plugins/embeddable/public';
import { SLA_DOWNLOAD_EMBEDDABLE } from './constants';

export type SlaDownloadEmbeddableInput = EmbeddableInput;
export type SlaDownloadEmbeddableOutput = EmbeddableOutput;

interface SlaFilters {
  states: string[];
  districts: string[];
}

function toOptions(values: string[]): Array<EuiComboBoxOptionOption<string>> {
  return values.map((value) => ({ label: value, value }));
}

function SlaDownloadPanel({ basePath }: { basePath: IBasePath }) {
  const [stateOptions, setStateOptions] = useState<Array<EuiComboBoxOptionOption<string>>>([]);
  const [districtOptions, setDistrictOptions] = useState<Array<EuiComboBoxOptionOption<string>>>(
    []
  );
  const [selectedState, setSelectedState] = useState<Array<EuiComboBoxOptionOption<string>>>([]);
  const [selectedDistrict, setSelectedDistrict] = useState<Array<EuiComboBoxOptionOption<string>>>(
    []
  );
  const [isLoadingDistricts, setIsLoadingDistricts] = useState(false);

  const fetchFilters = async (state?: string): Promise<SlaFilters> => {
    const params = new URLSearchParams();
    if (state) params.set('state', state);
    const query = params.toString();
    const res = await fetch(
      basePath.prepend(`/api/full_export/sla-filters${query ? `?${query}` : ''}`)
    );
    return res.json();
  };

  useEffect(() => {
    fetchFilters().then(({ states, districts }) => {
      setStateOptions(toOptions(states));
      setDistrictOptions(toOptions(districts));
    });
  }, []);

  const handleStateChange = (selected: Array<EuiComboBoxOptionOption<string>>) => {
    setSelectedState(selected);
    setSelectedDistrict([]);
    setIsLoadingDistricts(true);
    fetchFilters(selected[0]?.value)
      .then(({ districts }) => setDistrictOptions(toOptions(districts)))
      .finally(() => setIsLoadingDistricts(false));
  };

  const handleDownload = () => {
    const params = new URLSearchParams();
    if (selectedState[0]?.value) params.set('state', selectedState[0].value);
    if (selectedDistrict[0]?.value) params.set('district', selectedDistrict[0].value);

    const query = params.toString();
    window.open(
      basePath.prepend(`/api/full_export/sla-report${query ? `?${query}` : ''}`),
      '_blank'
    );
  };

  return (
    <EuiFlexGroup
      direction="column"
      alignItems="center"
      justifyContent="center"
      style={{ height: '100%', padding: 8 }}
      gutterSize="s"
    >
      <EuiFlexItem grow={false} style={{ width: '100%', maxWidth: 240 }}>
        <EuiFormRow label="State" display="rowCompressed">
          <EuiComboBox
            compressed
            singleSelection={{ asPlainText: true }}
            options={stateOptions}
            selectedOptions={selectedState}
            onChange={handleStateChange}
            placeholder="Select state"
          />
        </EuiFormRow>
      </EuiFlexItem>
      <EuiFlexItem grow={false} style={{ width: '100%', maxWidth: 240 }}>
        <EuiFormRow label="District" display="rowCompressed">
          <EuiComboBox
            compressed
            isLoading={isLoadingDistricts}
            singleSelection={{ asPlainText: true }}
            options={districtOptions}
            selectedOptions={selectedDistrict}
            onChange={setSelectedDistrict}
            placeholder="Select district"
          />
        </EuiFormRow>
      </EuiFlexItem>
      <EuiFlexItem grow={false}>
        <EuiButton iconType="download" onClick={handleDownload}>
          Download SLA CSV
        </EuiButton>
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
    super(initialInput, {}, parent);
  }

  public render(node: HTMLElement) {
    this.node = node;
    ReactDOM.render(<SlaDownloadPanel basePath={this.basePath} />, node);
  }

  public reload() {}

  public destroy() {
    super.destroy();
    if (this.node) {
      ReactDOM.unmountComponentAtNode(this.node);
    }
  }
}
