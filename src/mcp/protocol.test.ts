import { describe, expect, it, vi } from 'vitest';
import { handleMcpBody, RPC_ERRORS, toolResult, type McpHandlers } from './protocol';

const handlers = (over: Partial<McpHandlers> = {}): McpHandlers => ({
  instructions: 'PSX data',
  listTools: () => [{ name: 'get_live_price', description: 'Prices', inputSchema: { type: 'object', properties: {} } }],
  callTool: vi.fn(async () => toolResult({ price: 1 })),
  ...over,
});

describe('MCP protocol', () => {
  it('negotiates a supported protocol version', async () => {
    const r: any = await handleMcpBody({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26' } }, handlers());
    expect(r.result).toMatchObject({ protocolVersion: '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'psx-tracker' }, instructions: 'PSX data' });
    const latest: any = await handleMcpBody({ jsonrpc: '2.0', id: 2, method: 'initialize', params: { protocolVersion: '1999-01-01' } }, handlers());
    expect(latest.result.protocolVersion).toBe('2025-06-18');
  });
  it('lists and calls tools', async () => {
    const h = handlers();
    const list: any = await handleMcpBody({ jsonrpc: '2.0', id: 3, method: 'tools/list' }, h);
    expect(list.result.tools[0].name).toBe('get_live_price');
    const call: any = await handleMcpBody({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'get_live_price', arguments: { symbols: ['OGDC'] } } }, h);
    expect(h.callTool).toHaveBeenCalledWith('get_live_price', { symbols: ['OGDC'] });
    expect(call.result).toMatchObject({ structuredContent: { price: 1 }, content: [{ type: 'text' }] });
  });
  it('returns tool failures as results the model can read', async () => {
    const r: any = await handleMcpBody({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'get_live_price', arguments: {} } },
      handlers({ callTool: async () => { throw new Error('PSX is down'); } }));
    expect(r.result.isError).toBe(true);
    expect(r.result.content[0].text).toContain('PSX is down');
  });
  it('rejects unknown tools and methods, and ignores notifications', async () => {
    const unknownTool: any = await handleMcpBody({ jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'delete_everything', arguments: {} } }, handlers());
    expect(unknownTool.error.code).toBe(RPC_ERRORS.invalidParams);
    const unknownMethod: any = await handleMcpBody({ jsonrpc: '2.0', id: 7, method: 'resources/list' }, handlers());
    expect(unknownMethod.error.code).toBe(RPC_ERRORS.methodNotFound);
    expect(await handleMcpBody({ jsonrpc: '2.0', method: 'notifications/initialized' }, handlers())).toBeNull();
    const batch: any = await handleMcpBody([{ jsonrpc: '2.0', method: 'notifications/initialized' }, { jsonrpc: '2.0', id: 8, method: 'ping' }], handlers());
    expect(batch).toEqual([{ jsonrpc: '2.0', id: 8, result: {} }]);
  });
});
