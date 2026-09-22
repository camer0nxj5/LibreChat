import type { useLocalize } from '~/hooks';
import type { Endpoint } from '~/common';
import { filterItems, getDisplayValue } from '../utils';

const agentsEndpoint: Endpoint = {
  value: 'agents',
  label: 'My Agents',
  hasModels: true,
  icon: null,
  showMarketplace: true,
  searchAliases: ['agent marketplace', 'marketplace'],
};

const disabledAgentsEndpoint: Endpoint = {
  value: 'agents',
  label: 'My Agents',
  hasModels: false,
  icon: null,
};

describe('model selector utilities', () => {
  it('shortens the selected Fireworks model in the trigger', () => {
    const localize = ((key: string) => key) as ReturnType<typeof useLocalize>;
    expect(
      getDisplayValue({
        localize,
        agentsMap: undefined,
        modelSpecs: [],
        selectedValues: {
          endpoint: 'Fireworks',
          model: 'accounts/fireworks/models/nemotron-3-ultra-nvfp4',
          modelSpec: '',
        },
        mappedEndpoints: [{ value: 'Fireworks', label: 'Fireworks', icon: null }],
      }),
    ).toBe('nemotron-3-ultra-nvfp4');
  });

  it('matches endpoint search aliases', () => {
    const results = filterItems([agentsEndpoint], 'marketplace', undefined, undefined);
    expect(results).toEqual([agentsEndpoint]);
  });

  it('matches localized Marketplace labels', () => {
    const localize = ((key: string) => {
      if (key === 'com_agents_marketplace') {
        return 'Tienda de Agentes';
      }
      if (key === 'com_ui_marketplace') {
        return 'Tienda';
      }
      return key;
    }) as ReturnType<typeof useLocalize>;

    const results = filterItems([agentsEndpoint], 'tienda', undefined, undefined, localize);
    expect(results).toEqual([agentsEndpoint]);
  });

  it('does not match agents when there are no selectable agent options', () => {
    const results = filterItems([disabledAgentsEndpoint], 'my agents', undefined, undefined);
    expect(results).toEqual([]);
  });
});
