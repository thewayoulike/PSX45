export function brokerIdForName(transactions: { broker?: string; brokerId?: string }[], name: string): string | undefined {
  return transactions.find(t => (t.broker || 'Unknown Broker') === name && t.brokerId)?.brokerId;
}
