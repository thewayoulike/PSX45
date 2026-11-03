import { accountAccessHandler } from '../lib/accountAccess.js';
import practiceTradingHandler from '../lib/practiceTradingRoute.js';
import { handleConnector, handleConnectorSettings } from '../lib/mcpConnector.js';

const accessHandler = accountAccessHandler(false);
export default function handler(req, res) {
  // Share a deployment entrypoint; practice retains its own authentication and limits.
  if (req.query?.service === 'practice-trading') return practiceTradingHandler(req, res);
  // PSX Tracker connector for Claude, ChatGPT and Cursor, and its settings actions.
  if (req.query?.service === 'mcp') return handleConnector(req, res);
  if (req.query?.service === 'mcp-settings') return handleConnectorSettings(req, res);
  return accessHandler(req, res);
}
