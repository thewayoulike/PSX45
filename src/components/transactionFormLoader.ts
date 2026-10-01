import { retryableModule } from '../utils/retryableModule';
export const loadTransactionForm = retryableModule(() => import('./TransactionForm'));
