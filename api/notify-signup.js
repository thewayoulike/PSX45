// Compatibility route; all writes require a verified account identity.
import { accountAccessHandler } from '../lib/accountAccess.js';
export default accountAccessHandler(true);
