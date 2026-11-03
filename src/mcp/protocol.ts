// Minimal MCP server over JSON-RPC (Streamable HTTP, JSON responses, stateless).
// Only what a read-only tool server needs: initialize, ping, tools/list and tools/call.

export const SUPPORTED_PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];
export const SERVER_INFO = { name: 'psx-tracker', title: 'PSX Tracker', version: '1.0.0' };

export interface McpTool {
  name: string;
  title?: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: Record<string, unknown>;
}

export interface McpToolResult {
  content: { type: 'text'; text: string }[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

export interface McpHandlers {
  instructions: string;
  listTools: () => McpTool[];
  callTool: (name: string, args: Record<string, unknown>) => Promise<McpToolResult>;
}

type JsonRpcId = string | number | null;
interface JsonRpcMessage { jsonrpc?: string; id?: JsonRpcId; method?: string; params?: any }

export const RPC_ERRORS = { parse: -32700, invalidRequest: -32600, methodNotFound: -32601, invalidParams: -32602, internal: -32603 } as const;

const ok = (id: JsonRpcId, result: unknown) => ({ jsonrpc: '2.0', id, result });
const fail = (id: JsonRpcId, code: number, message: string) => ({ jsonrpc: '2.0', id, error: { code, message } });

export function toolResult(value: unknown, isError = false): McpToolResult {
  const structured = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 1) }], ...(structured && !isError ? { structuredContent: structured } : {}), ...(isError ? { isError: true } : {}) };
}

async function handleOne(msg: JsonRpcMessage, h: McpHandlers): Promise<object | null> {
  const isRequest = msg && Object.prototype.hasOwnProperty.call(msg, 'id');
  if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
    return isRequest ? fail(msg?.id ?? null, RPC_ERRORS.invalidRequest, 'Invalid JSON-RPC request') : null;
  }
  // Notifications (no id) never get a response.
  if (!isRequest) return null;
  const id = msg.id ?? null;
  switch (msg.method) {
    case 'initialize': {
      const asked = String(msg.params?.protocolVersion || '');
      return ok(id, {
        protocolVersion: SUPPORTED_PROTOCOL_VERSIONS.includes(asked) ? asked : SUPPORTED_PROTOCOL_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions: h.instructions,
      });
    }
    case 'ping':
      return ok(id, {});
    case 'tools/list':
      return ok(id, { tools: h.listTools() });
    case 'tools/call': {
      const name = msg.params?.name;
      const args = msg.params?.arguments ?? {};
      if (typeof name !== 'string' || typeof args !== 'object' || Array.isArray(args)) return fail(id, RPC_ERRORS.invalidParams, 'tools/call needs a tool name and an arguments object');
      if (!h.listTools().some((t) => t.name === name)) return fail(id, RPC_ERRORS.invalidParams, `Unknown tool: ${name}`);
      try {
        return ok(id, await h.callTool(name, args));
      } catch (error) {
        // Tool failures go back to the model as results it can explain, not as protocol errors.
        return ok(id, toolResult({ error: error instanceof Error ? error.message : 'The tool failed.' }, true));
      }
    }
    default:
      return fail(id, RPC_ERRORS.methodNotFound, `Method not supported: ${msg.method}`);
  }
}

/** Returns the JSON body to send, or null when the request held only notifications (HTTP 202). */
export async function handleMcpBody(body: unknown, h: McpHandlers): Promise<object | object[] | null> {
  if (Array.isArray(body)) {
    if (!body.length) return fail(null, RPC_ERRORS.invalidRequest, 'Empty batch');
    const replies = (await Promise.all(body.map((m) => handleOne(m as JsonRpcMessage, h)))).filter(Boolean) as object[];
    return replies.length ? replies : null;
  }
  if (!body || typeof body !== 'object') return fail(null, RPC_ERRORS.parse, 'Request body must be JSON');
  return handleOne(body as JsonRpcMessage, h);
}
