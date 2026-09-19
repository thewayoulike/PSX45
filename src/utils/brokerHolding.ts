import type { Holding, Broker } from '../types';
/** Earliest broker in the brokers list that still holds this ticker. */

export const firstBrokerHolding = (ticker: string, holdings: Holding[], brokers: Broker[] = []): Holding | undefined => {

  const lots = holdings.filter(h => h.ticker === ticker && h.quantity > 0);

  if (lots.length === 0) return undefined;

  const orderedBrokers = [...brokers.filter(b => b.isDefault), ...brokers.filter(b => !b.isDefault)];

  for (const b of orderedBrokers) {

    const hit = lots.find(h => h.broker === b.name);

    if (hit) return hit;

  }

  return lots[0];

};



