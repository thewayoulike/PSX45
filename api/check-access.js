import { accountAccessHandler } from '../lib/accountAccess.js';
import practiceTradingHandler from '../lib/practiceTradingRoute.js';

const accessHandler = accountAccessHandler(false);
export default function handler(req, res) {
  // Share a deployment entrypoint; practice retains its own authentication and limits.
  if (req.query?.service === 'practice-trading') return practiceTradingHandler(req, res);
  return accessHandler(req, res);
}
