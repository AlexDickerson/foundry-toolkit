import { DEFAULT_CONFIG } from '@/config/defaults';
import type { ModuleConfig } from '@/config/types';

jest.mock('@/ui/ApiConfigForm', () => ({
  ApiConfigForm: class MockApiConfigForm {},
}));

import { registerSettings, registerMenu, getConfig, setConfig, parseServerConfigs } from '@/settings/SettingsManager';

const mockSettings = {
  register: jest.fn(),
  registerMenu: jest.fn(),
  get: jest.fn(),
  set: jest.fn(),
};

(global as unknown as Record<string, unknown>)['game'] = {
  settings: mockSettings,
};

describe('SettingsManager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('registerSettings', () => {
    it('should register config setting with correct parameters', () => {
      registerSettings();

      expect(mockSettings.register).toHaveBeenCalledWith('foundry-api-bridge', 'config', {
        name: 'Module Configuration',
        scope: 'world',
        config: false,
        type: Object,
        default: DEFAULT_CONFIG,
      });
    });

    it('should register wsUrl and apiKey settings', () => {
      registerSettings();

      expect(mockSettings.register).toHaveBeenCalledWith(
        'foundry-api-bridge',
        'wsUrl',
        expect.objectContaining({ name: 'WebSocket URL', type: String }),
      );
      expect(mockSettings.register).toHaveBeenCalledWith(
        'foundry-api-bridge',
        'apiKey',
        expect.objectContaining({ name: 'API Key', type: String }),
      );
    });
  });

  describe('registerMenu', () => {
    it('should register settings menu with correct parameters', async () => {
      await registerMenu();

      expect(mockSettings.registerMenu).toHaveBeenCalledWith(
        'foundry-api-bridge',
        'configMenu',
        expect.objectContaining({
          name: 'Configure Module',
          label: 'Configure',
          icon: 'fas fa-cog',
          restricted: true,
        }),
      );
    });
  });

  describe('getConfig', () => {
    it('should retrieve config from game.settings', () => {
      const mockConfig: ModuleConfig = {
        ...DEFAULT_CONFIG,
        webSocket: { ...DEFAULT_CONFIG.webSocket, reconnectInterval: 3000 },
      };

      mockSettings.get.mockReturnValue(mockConfig);

      const result = getConfig();

      expect(mockSettings.get).toHaveBeenCalledWith('foundry-api-bridge', 'config');
      expect(result).toEqual(mockConfig);
    });

    it('should return default config when nothing is saved', () => {
      mockSettings.get.mockReturnValue(DEFAULT_CONFIG);

      const result = getConfig();

      expect(result).toEqual(DEFAULT_CONFIG);
    });
  });

  describe('setConfig', () => {
    it('should save config to game.settings', async () => {
      const newConfig: ModuleConfig = {
        ...DEFAULT_CONFIG,
        webSocket: { ...DEFAULT_CONFIG.webSocket, maxReconnectAttempts: 20 },
      };

      mockSettings.set.mockResolvedValue(newConfig);

      await setConfig(newConfig);

      expect(mockSettings.set).toHaveBeenCalledWith('foundry-api-bridge', 'config', newConfig);
    });
  });

  describe('parseServerConfigs', () => {
    it('returns primary when only primary is configured', () => {
      expect(parseServerConfigs('ws://a/foundry', 'pk_a', '')).toEqual([{ url: 'ws://a/foundry', apiKey: 'pk_a' }]);
    });

    it('returns empty when primary is missing url or key', () => {
      expect(parseServerConfigs('', 'pk_a', '')).toEqual([]);
      expect(parseServerConfigs('ws://a/foundry', '', '')).toEqual([]);
    });

    it('inherits primary apiKey for additional URLs without pipe', () => {
      expect(parseServerConfigs('ws://a/foundry', 'pk_a', 'ws://b/foundry\nws://c/foundry')).toEqual([
        { url: 'ws://a/foundry', apiKey: 'pk_a' },
        { url: 'ws://b/foundry', apiKey: 'pk_a' },
        { url: 'ws://c/foundry', apiKey: 'pk_a' },
      ]);
    });

    it('accepts explicit apiKey per additional entry via pipe', () => {
      expect(parseServerConfigs('ws://a/foundry', 'pk_a', 'ws://b/foundry|pk_b\nws://c/foundry|pk_c')).toEqual([
        { url: 'ws://a/foundry', apiKey: 'pk_a' },
        { url: 'ws://b/foundry', apiKey: 'pk_b' },
        { url: 'ws://c/foundry', apiKey: 'pk_c' },
      ]);
    });

    it('skips blank lines and # comments', () => {
      const additional = ['', '# primary is defined above', 'ws://b/foundry', '   ', '# another server'].join('\n');
      expect(parseServerConfigs('ws://a/foundry', 'pk_a', additional)).toEqual([
        { url: 'ws://a/foundry', apiKey: 'pk_a' },
        { url: 'ws://b/foundry', apiKey: 'pk_a' },
      ]);
    });

    it('drops additional entries that have no key after inheritance', () => {
      expect(parseServerConfigs('', '', 'ws://b/foundry')).toEqual([]);
      expect(parseServerConfigs('', '', 'ws://b/foundry|pk_b')).toEqual([{ url: 'ws://b/foundry', apiKey: 'pk_b' }]);
    });

    it('handles CRLF line endings', () => {
      expect(parseServerConfigs('ws://a/foundry', 'pk_a', 'ws://b/foundry\r\nws://c/foundry')).toEqual([
        { url: 'ws://a/foundry', apiKey: 'pk_a' },
        { url: 'ws://b/foundry', apiKey: 'pk_a' },
        { url: 'ws://c/foundry', apiKey: 'pk_a' },
      ]);
    });
  });
});
