// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

// ── Fixture data ────────────────────────────────────────────────────

const FIXTURE_VAULT = {
  address: '0xbeef0e0834849acc03f0089f01f4f1eeb06873c9',
  chainId: 8453,
  name: 'STEAKUSDC',
  slug: '8453-0xbeef0e0834849acc03f0089f01f4f1eeb06873c9',
  network: 'Base',
  description: 'A Morpho vault',
  protocol: { name: 'morpho-v1', url: 'https://app.morpho.org' },
  provider: 'DEFILLAMA_PRO',
  syncedAt: '2026-04-11T08:12:09.113Z',
  tags: ['stablecoin', 'single'],
  underlyingTokens: [
    { symbol: 'USDC', address: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', decimals: 6 },
  ],
  lpTokens: [],
  analytics: {
    apy: { base: 3.84705, total: 3.84705, reward: 0 },
    tvl: { usd: '33833688' },
    apy1d: 4.18039,
    apy7d: 3.72156,
    apy30d: 3.80036,
    updatedAt: '2026-04-11T07:01:41.187Z',
  },
  isTransactional: true,
  isRedeemable: true,
  depositPacks: [{ name: 'morpho-zaps', stepsType: 'instant' }],
  redeemPacks: [{ name: 'morpho-zaps', stepsType: 'instant' }],
};

const FIXTURE_CHAIN = { chainId: 8453, name: 'Base', networkCaip: 'eip155:8453' };
const FIXTURE_PROTOCOL = { name: 'morpho-v1', url: 'https://app.morpho.org' };
const FIXTURE_PORTFOLIO = {
  positions: [
    {
      chainId: 8453,
      protocolName: 'morpho-v1',
      asset: { address: '0xbeef', name: 'STEAKUSDC', symbol: 'STEAKUSDC', decimals: 6 },
      balanceUsd: '1000.00',
      balanceNative: '1000000000',
    },
  ],
};

// ── Mock the SDK ────────────────────────────────────────────────────

const mockForge = {
  vaults: {
    list: vi.fn(),
    listAll: vi.fn(),
    get: vi.fn(),
    top: vi.fn(),
  },
  chains: { list: vi.fn() },
  protocols: { list: vi.fn() },
  portfolio: { get: vi.fn() },
  buildDepositQuote: vi.fn(),
  preflight: vi.fn(),
  riskScore: vi.fn(),
  suggest: vi.fn(),
  optimizeGasRoutes: vi.fn(),
  watch: vi.fn(),
  getApyHistory: vi.fn(),
  earnDataClient: {},
  composerClient: null,
};

vi.mock('@earnforge/sdk', () => ({
  createEarnForge: () => mockForge,
  STRATEGIES: {
    conservative: { name: 'conservative', description: 'test', filters: {}, sort: 'apy', sortDirection: 'desc' },
    'max-apy': { name: 'max-apy', description: 'test', filters: {}, sort: 'apy', sortDirection: 'desc' },
    diversified: { name: 'diversified', description: 'test', filters: {}, sort: 'apy', sortDirection: 'desc' },
    'risk-adjusted': { name: 'risk-adjusted', description: 'test', filters: {}, sort: 'apy', sortDirection: 'desc' },
  },
}));

// ── Client/Server setup ─────────────────────────────────────────────

let client: Client;
let cleanup: () => Promise<void>;

async function setup() {
  const { createServer } = await import('../src/index.js');
  const server = createServer();

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  await server.connect(serverTransport);

  client = new Client({ name: 'test-client', version: '0.1.0' });
  await client.connect(clientTransport);

  cleanup = async () => {
    await client.close();
    await server.close();
  };
}

function parseText(result: { content?: Array<{ type: string; text?: string }> }) {
  const textItem = result.content?.find((c) => c.type === 'text' && c.text);
  if (!textItem || !textItem.text) throw new Error('No text content in result');
  return JSON.parse(textItem.text);
}

// ── Tests ───────────────────────────────────────────────────────────

describe('EarnForge MCP Server', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await setup();
  });

  afterEach(async () => {
    await cleanup();
  });

  // ── Tool registration ─────────────────────────────────────────────

  describe('tool registration', () => {
    it('registers all 9 tools', async () => {
      const { tools } = await client.listTools();
      const names = tools.map((t) => t.name);

      expect(names).toContain('get-earn-vaults');
      expect(names).toContain('get-earn-vault');
      expect(names).toContain('get-earn-chains');
      expect(names).toContain('get-earn-protocols');
      expect(names).toContain('get-earn-portfolio');
      expect(names).toContain('get-vault-risk');
      expect(names).toContain('quote-vault-deposit');
      expect(names).toContain('suggest-allocation');
      expect(names).toContain('run-doctor');
    });

    it('each tool has a non-empty description', async () => {
      const { tools } = await client.listTools();

      for (const tool of tools) {
        expect(tool.description, `Tool "${tool.name}" should have a description`).toBeTruthy();
        expect(tool.description!.length).toBeGreaterThan(10);
      }
    });

    it('each tool has an inputSchema', async () => {
      const { tools } = await client.listTools();

      for (const tool of tools) {
        expect(tool.inputSchema, `Tool "${tool.name}" should have inputSchema`).toBeDefined();
        expect(tool.inputSchema.type).toBe('object');
      }
    });
  });

  // ── get-earn-vaults ───────────────────────────────────────────────

  describe('get-earn-vaults', () => {
    it('returns vault list with count', async () => {
      mockForge.vaults.top.mockResolvedValue([FIXTURE_VAULT]);

      const result = await client.callTool({ name: 'get-earn-vaults', arguments: {} });
      const data = parseText(result);

      expect(data.count).toBe(1);
      expect(data.vaults).toHaveLength(1);
      expect(data.vaults[0].name).toBe('STEAKUSDC');
      expect(data.vaults[0].slug).toBe(FIXTURE_VAULT.slug);
      expect(data.vaults[0].apy.total).toBe(3.84705);
    });

    it('passes filter params to SDK', async () => {
      mockForge.vaults.top.mockResolvedValue([]);

      await client.callTool({
        name: 'get-earn-vaults',
        arguments: {
          chainId: 8453,
          asset: 'USDC',
          minTvl: 1000000,
          limit: 5,
          strategy: 'conservative',
        },
      });

      expect(mockForge.vaults.top).toHaveBeenCalledWith({
        chainId: 8453,
        asset: 'USDC',
        minTvl: 1000000,
        limit: 5,
        strategy: 'conservative',
      });
    });

    it('uses default limit of 10', async () => {
      mockForge.vaults.top.mockResolvedValue([]);

      await client.callTool({ name: 'get-earn-vaults', arguments: {} });

      expect(mockForge.vaults.top).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 10 }),
      );
    });

    it('returns error on SDK failure', async () => {
      mockForge.vaults.top.mockRejectedValue(new Error('Network error'));

      const result = await client.callTool({ name: 'get-earn-vaults', arguments: {} });

      expect(result.isError).toBe(true);
      const text = result.content?.find((c: { type: string }) => c.type === 'text') as { text: string } | undefined;
      expect(text?.text).toContain('Network error');
    });

    it('summarizes vault fields correctly', async () => {
      mockForge.vaults.top.mockResolvedValue([FIXTURE_VAULT]);

      const result = await client.callTool({ name: 'get-earn-vaults', arguments: {} });
      const data = parseText(result);
      const vault = data.vaults[0];

      expect(vault.chainId).toBe(8453);
      expect(vault.network).toBe('Base');
      expect(vault.protocol).toBe('morpho-v1');
      expect(vault.tags).toEqual(['stablecoin', 'single']);
      expect(vault.tvlUsd).toBe('33833688');
      expect(vault.underlyingTokens).toEqual(['USDC']);
      expect(vault.isTransactional).toBe(true);
      expect(vault.isRedeemable).toBe(true);
    });
  });

  // ── get-earn-vault ────────────────────────────────────────────────

  describe('get-earn-vault', () => {
    it('returns full vault data for valid slug', async () => {
      mockForge.vaults.get.mockResolvedValue(FIXTURE_VAULT);

      const result = await client.callTool({
        name: 'get-earn-vault',
        arguments: { slug: FIXTURE_VAULT.slug },
      });
      const data = parseText(result);

      expect(data.name).toBe('STEAKUSDC');
      expect(data.address).toBe(FIXTURE_VAULT.address);
      expect(data.chainId).toBe(8453);
    });

    it('returns error for invalid slug', async () => {
      mockForge.vaults.get.mockRejectedValue(new Error('Invalid slug format'));

      const result = await client.callTool({
        name: 'get-earn-vault',
        arguments: { slug: 'bad-slug' },
      });

      expect(result.isError).toBe(true);
      const text = result.content?.find((c: { type: string }) => c.type === 'text') as { text: string } | undefined;
      expect(text?.text).toContain('Invalid slug format');
    });
  });

  // ── get-earn-chains ───────────────────────────────────────────────

  describe('get-earn-chains', () => {
    it('returns chains with count', async () => {
      mockForge.chains.list.mockResolvedValue([FIXTURE_CHAIN]);

      const result = await client.callTool({ name: 'get-earn-chains', arguments: {} });
      const data = parseText(result);

      expect(data.count).toBe(1);
      expect(data.chains[0].chainId).toBe(8453);
      expect(data.chains[0].name).toBe('Base');
    });

    it('returns error on failure', async () => {
      mockForge.chains.list.mockRejectedValue(new Error('API down'));

      const result = await client.callTool({ name: 'get-earn-chains', arguments: {} });

      expect(result.isError).toBe(true);
      const text = result.content?.find((c: { type: string }) => c.type === 'text') as { text: string } | undefined;
      expect(text?.text).toContain('API down');
    });
  });

  // ── get-earn-protocols ────────────────────────────────────────────

  describe('get-earn-protocols', () => {
    it('returns protocols with count', async () => {
      mockForge.protocols.list.mockResolvedValue([FIXTURE_PROTOCOL]);

      const result = await client.callTool({ name: 'get-earn-protocols', arguments: {} });
      const data = parseText(result);

      expect(data.count).toBe(1);
      expect(data.protocols[0].name).toBe('morpho-v1');
    });

    it('returns error on failure', async () => {
      mockForge.protocols.list.mockRejectedValue(new Error('Timeout'));

      const result = await client.callTool({ name: 'get-earn-protocols', arguments: {} });

      expect(result.isError).toBe(true);
      const text = result.content?.find((c: { type: string }) => c.type === 'text') as { text: string } | undefined;
      expect(text?.text).toContain('Timeout');
    });
  });

  // ── get-earn-portfolio ────────────────────────────────────────────

  describe('get-earn-portfolio', () => {
    it('returns portfolio positions', async () => {
      mockForge.portfolio.get.mockResolvedValue(FIXTURE_PORTFOLIO);

      const result = await client.callTool({
        name: 'get-earn-portfolio',
        arguments: { wallet: '0xabc123' },
      });
      const data = parseText(result);

      expect(data.positions).toHaveLength(1);
      expect(data.positions[0].protocolName).toBe('morpho-v1');
      expect(data.positions[0].balanceUsd).toBe('1000.00');
    });

    it('passes wallet address to SDK', async () => {
      mockForge.portfolio.get.mockResolvedValue({ positions: [] });

      await client.callTool({
        name: 'get-earn-portfolio',
        arguments: { wallet: '0xdeadbeef' },
      });

      expect(mockForge.portfolio.get).toHaveBeenCalledWith('0xdeadbeef');
    });

    it('returns error on failure', async () => {
      mockForge.portfolio.get.mockRejectedValue(new Error('Invalid address'));

      const result = await client.callTool({
        name: 'get-earn-portfolio',
        arguments: { wallet: 'bad' },
      });

      expect(result.isError).toBe(true);
      const text = result.content?.find((c: { type: string }) => c.type === 'text') as { text: string } | undefined;
      expect(text?.text).toContain('Invalid address');
    });
  });

  // ── get-vault-risk ────────────────────────────────────────────────

  describe('get-vault-risk', () => {
    it('returns risk score with breakdown', async () => {
      mockForge.vaults.get.mockResolvedValue(FIXTURE_VAULT);
      mockForge.riskScore.mockReturnValue({
        score: 8.2,
        label: 'low',
        breakdown: {
          tvl: 8,
          apyStability: 9,
          protocol: 9,
          redeemability: 10,
          assetType: 9,
        },
      });

      const result = await client.callTool({
        name: 'get-vault-risk',
        arguments: { slug: FIXTURE_VAULT.slug },
      });
      const data = parseText(result);

      expect(data.slug).toBe(FIXTURE_VAULT.slug);
      expect(data.name).toBe('STEAKUSDC');
      expect(data.score).toBe(8.2);
      expect(data.label).toBe('low');
      expect(data.breakdown.tvl).toBe(8);
      expect(data.breakdown.protocol).toBe(9);
    });

    it('returns error when vault not found', async () => {
      mockForge.vaults.get.mockRejectedValue(new Error('Not found'));

      const result = await client.callTool({
        name: 'get-vault-risk',
        arguments: { slug: 'bogus' },
      });

      expect(result.isError).toBe(true);
      const text = result.content?.find((c: { type: string }) => c.type === 'text') as { text: string } | undefined;
      expect(text?.text).toContain('Not found');
    });
  });

  // ── quote-vault-deposit ───────────────────────────────────────────

  describe('quote-vault-deposit', () => {
    it('returns deposit quote with transaction data', async () => {
      mockForge.vaults.get.mockResolvedValue(FIXTURE_VAULT);
      mockForge.buildDepositQuote.mockResolvedValue({
        quote: {
          estimate: {
            tool: 'morpho-zaps',
            toAmount: '99900000',
            toAmountMin: '99800000',
            executionDuration: 15,
            gasCosts: [{ amount: '0.001', amountUSD: '2.50', token: {} }],
            feeCosts: [],
          },
          transactionRequest: {
            to: '0xrouter',
            value: '0',
            chainId: 8453,
          },
        },
        vault: FIXTURE_VAULT,
        humanAmount: '100',
        rawAmount: '100000000',
        decimals: 6,
      });

      const result = await client.callTool({
        name: 'quote-vault-deposit',
        arguments: {
          slug: FIXTURE_VAULT.slug,
          wallet: '0xwallet',
          fromAmount: '100',
        },
      });
      const data = parseText(result);

      expect(data.vault).toBe('STEAKUSDC');
      expect(data.humanAmount).toBe('100');
      expect(data.rawAmount).toBe('100000000');
      expect(data.decimals).toBe(6);
      expect(data.estimate.tool).toBe('morpho-zaps');
      expect(data.transactionRequest.to).toBe('0xrouter');
    });

    it('passes optional params to SDK', async () => {
      mockForge.vaults.get.mockResolvedValue(FIXTURE_VAULT);
      mockForge.buildDepositQuote.mockResolvedValue({
        quote: {
          estimate: { tool: 'test', toAmount: '0', toAmountMin: '0', executionDuration: 0, gasCosts: [], feeCosts: [] },
          transactionRequest: { to: '0x', value: '0', chainId: 1 },
        },
        vault: FIXTURE_VAULT,
        humanAmount: '50',
        rawAmount: '50000000',
        decimals: 6,
      });

      await client.callTool({
        name: 'quote-vault-deposit',
        arguments: {
          slug: FIXTURE_VAULT.slug,
          wallet: '0xwallet',
          fromAmount: '50',
          fromToken: '0xcustom',
          fromChain: 1,
          slippage: 0.03,
        },
      });

      expect(mockForge.buildDepositQuote).toHaveBeenCalledWith(
        FIXTURE_VAULT,
        expect.objectContaining({
          fromAmount: '50',
          wallet: '0xwallet',
          fromToken: '0xcustom',
          fromChain: 1,
          slippage: 0.03,
        }),
      );
    });

    it('returns error when API key missing', async () => {
      mockForge.vaults.get.mockResolvedValue(FIXTURE_VAULT);
      mockForge.buildDepositQuote.mockRejectedValue(
        new Error('Composer API key required'),
      );

      const result = await client.callTool({
        name: 'quote-vault-deposit',
        arguments: {
          slug: FIXTURE_VAULT.slug,
          wallet: '0xwallet',
          fromAmount: '100',
        },
      });

      expect(result.isError).toBe(true);
      const text = result.content?.find((c: { type: string }) => c.type === 'text') as { text: string } | undefined;
      expect(text?.text).toContain('Composer API key required');
    });
  });

  // ── suggest-allocation ────────────────────────────────────────────

  describe('suggest-allocation', () => {
    it('returns allocation suggestion', async () => {
      mockForge.suggest.mockResolvedValue({
        totalAmount: 10000,
        expectedApy: 4.5,
        allocations: [
          {
            vault: FIXTURE_VAULT,
            risk: { score: 8.2, label: 'low', breakdown: {} },
            percentage: 60,
            amount: 6000,
            apy: 3.85,
          },
        ],
      });

      const result = await client.callTool({
        name: 'suggest-allocation',
        arguments: { amount: 10000 },
      });
      const data = parseText(result);

      expect(data.totalAmount).toBe(10000);
      expect(data.expectedApy).toBe(4.5);
      expect(data.allocations).toHaveLength(1);
      expect(data.allocations[0].vault).toBe('STEAKUSDC');
      expect(data.allocations[0].percentage).toBe(60);
      expect(data.allocations[0].riskScore).toBe(8.2);
      expect(data.allocations[0].riskLabel).toBe('low');
    });

    it('passes all params to SDK', async () => {
      mockForge.suggest.mockResolvedValue({
        totalAmount: 5000,
        expectedApy: 0,
        allocations: [],
      });

      await client.callTool({
        name: 'suggest-allocation',
        arguments: {
          amount: 5000,
          asset: 'ETH',
          maxChains: 3,
          maxVaults: 2,
          strategy: 'diversified',
        },
      });

      expect(mockForge.suggest).toHaveBeenCalledWith({
        amount: 5000,
        asset: 'ETH',
        maxChains: 3,
        maxVaults: 2,
        strategy: 'diversified',
      });
    });

    it('returns error on failure', async () => {
      mockForge.suggest.mockRejectedValue(new Error('No vaults found'));

      const result = await client.callTool({
        name: 'suggest-allocation',
        arguments: { amount: 100 },
      });

      expect(result.isError).toBe(true);
      const text = result.content?.find((c: { type: string }) => c.type === 'text') as { text: string } | undefined;
      expect(text?.text).toContain('No vaults found');
    });
  });

  // ── run-doctor ────────────────────────────────────────────────────

  describe('run-doctor', () => {
    it('returns passing report for healthy vault', async () => {
      mockForge.vaults.get.mockResolvedValue(FIXTURE_VAULT);
      mockForge.preflight.mockReturnValue({
        ok: true,
        issues: [],
        vault: FIXTURE_VAULT,
        wallet: '0xwallet',
      });

      const result = await client.callTool({
        name: 'run-doctor',
        arguments: { slug: FIXTURE_VAULT.slug, wallet: '0xwallet' },
      });
      const data = parseText(result);

      expect(data.ok).toBe(true);
      expect(data.issueCount).toBe(0);
      expect(data.vault).toBe('STEAKUSDC');
      expect(data.wallet).toBe('0xwallet');
    });

    it('returns failing report with issues', async () => {
      const nonTxVault = { ...FIXTURE_VAULT, isTransactional: false };
      mockForge.vaults.get.mockResolvedValue(nonTxVault);
      mockForge.preflight.mockReturnValue({
        ok: false,
        issues: [
          {
            code: 'NOT_TRANSACTIONAL',
            message: 'Vault is not transactional',
            severity: 'error',
          },
        ],
        vault: nonTxVault,
        wallet: '0xwallet',
      });

      const result = await client.callTool({
        name: 'run-doctor',
        arguments: { slug: FIXTURE_VAULT.slug, wallet: '0xwallet' },
      });
      const data = parseText(result);

      expect(data.ok).toBe(false);
      expect(data.issueCount).toBe(1);
      expect(data.issues[0].code).toBe('NOT_TRANSACTIONAL');
      expect(data.issues[0].severity).toBe('error');
    });

    it('passes optional params to preflight', async () => {
      mockForge.vaults.get.mockResolvedValue(FIXTURE_VAULT);
      mockForge.preflight.mockReturnValue({
        ok: true,
        issues: [],
        vault: FIXTURE_VAULT,
        wallet: '0xwallet',
      });

      await client.callTool({
        name: 'run-doctor',
        arguments: {
          slug: FIXTURE_VAULT.slug,
          wallet: '0xwallet',
          walletChainId: 1,
          depositAmount: '100',
        },
      });

      expect(mockForge.preflight).toHaveBeenCalledWith(
        FIXTURE_VAULT,
        '0xwallet',
        { walletChainId: 1, depositAmount: '100' },
      );
    });

    it('returns error when vault lookup fails', async () => {
      mockForge.vaults.get.mockRejectedValue(new Error('Vault not found'));

      const result = await client.callTool({
        name: 'run-doctor',
        arguments: { slug: 'bad-slug', wallet: '0xwallet' },
      });

      expect(result.isError).toBe(true);
      const text = result.content?.find((c: { type: string }) => c.type === 'text') as { text: string } | undefined;
      expect(text?.text).toContain('Vault not found');
    });
  });

  // ── Response format ───────────────────────────────────────────────

  describe('response format', () => {
    it('successful responses have content array with text type', async () => {
      mockForge.chains.list.mockResolvedValue([]);

      const result = await client.callTool({ name: 'get-earn-chains', arguments: {} });

      expect(Array.isArray(result.content)).toBe(true);
      const textItem = (result.content as Array<{ type: string; text?: string }>).find((c) => c.type === 'text');
      expect(textItem).toBeDefined();
      expect(typeof textItem!.text).toBe('string');
    });

    it('successful responses produce valid JSON', async () => {
      mockForge.protocols.list.mockResolvedValue([FIXTURE_PROTOCOL]);

      const result = await client.callTool({ name: 'get-earn-protocols', arguments: {} });

      const textItem = (result.content as Array<{ type: string; text?: string }>).find((c) => c.type === 'text');
      expect(() => JSON.parse(textItem!.text!)).not.toThrow();
    });

    it('error responses set isError flag', async () => {
      mockForge.chains.list.mockRejectedValue(new Error('fail'));

      const result = await client.callTool({ name: 'get-earn-chains', arguments: {} });

      expect(result.isError).toBe(true);
    });
  });

  // ── Schema validation ─────────────────────────────────────────────

  describe('input schema', () => {
    it('get-earn-vaults schema includes strategy enum', async () => {
      const { tools } = await client.listTools();
      const tool = tools.find((t) => t.name === 'get-earn-vaults');
      const schema = tool!.inputSchema;

      expect(schema.properties?.strategy).toBeDefined();
    });

    it('get-earn-vault requires slug', async () => {
      const { tools } = await client.listTools();
      const tool = tools.find((t) => t.name === 'get-earn-vault');
      const schema = tool!.inputSchema;

      expect(schema.required).toContain('slug');
    });

    it('get-earn-portfolio requires wallet', async () => {
      const { tools } = await client.listTools();
      const tool = tools.find((t) => t.name === 'get-earn-portfolio');
      const schema = tool!.inputSchema;

      expect(schema.required).toContain('wallet');
    });

    it('quote-vault-deposit requires slug, wallet, fromAmount', async () => {
      const { tools } = await client.listTools();
      const tool = tools.find((t) => t.name === 'quote-vault-deposit');
      const schema = tool!.inputSchema;

      expect(schema.required).toContain('slug');
      expect(schema.required).toContain('wallet');
      expect(schema.required).toContain('fromAmount');
    });

    it('suggest-allocation requires amount', async () => {
      const { tools } = await client.listTools();
      const tool = tools.find((t) => t.name === 'suggest-allocation');
      const schema = tool!.inputSchema;

      expect(schema.required).toContain('amount');
    });

    it('run-doctor requires slug and wallet', async () => {
      const { tools } = await client.listTools();
      const tool = tools.find((t) => t.name === 'run-doctor');
      const schema = tool!.inputSchema;

      expect(schema.required).toContain('slug');
      expect(schema.required).toContain('wallet');
    });
  });
});
