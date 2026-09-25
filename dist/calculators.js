export function capitalGain({ quantity, buyPrice, sellPrice, buyFees = 0, sellFees = 0, taxRatePct = null }) {
  const qty = Number(quantity);
  const proceeds = qty * Number(sellPrice);
  const cost = qty * Number(buyPrice) + Number(buyFees);
  const gain = proceeds - Number(sellFees) - cost;
  const rate = taxRatePct === null || taxRatePct === '' ? null : Number(taxRatePct);
  const tax = rate === null || !Number.isFinite(rate) ? null : (gain > 0 ? gain * rate / 100 : 0);
  return {
    proceeds,
    cost,
    gain,
    tax,
    net: tax === null ? null : gain - tax,
  };
}

function parseIsoUtc(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  if (!match) return null;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function exceedsYears(acquiredMs, soldMs, years) {
  const start = new Date(acquiredMs);
  const anniversary = Date.UTC(start.getUTCFullYear() + years, start.getUTCMonth(), start.getUTCDate());
  return soldMs > anniversary;
}

/** Listed-share CGT from the NCCPL explanation of the Finance Act, 2025. Not a filing. */
export function listedShareCgtRate({ acquired, sold, onAtl }) {
  const buy = String(acquired || '');
  const sale = String(sold || '');
  if (!parseIsoUtc(buy) || !parseIsoUtc(sale)) return { error: 'Enter the buy date and the sell date.' };
  if (sale < buy) return { error: 'The sell date is before the buy date.' };
  const atl = !!onAtl;
  const pair = (filer, nonFiler, band) => ({ rate: atl ? filer : nonFiler, band, onAtl: atl });
  if (buy < '2013-07-01') return pair(0, 0, 'Acquired before 1 July 2013');
  if (buy < '2022-07-01') return pair(12.5, 25, 'Acquired from 1 July 2013 to 30 June 2022');
  if (buy < '2024-07-01') {
    const slabs = [
      [1, 15, 30, 'Held up to 1 year'],
      [2, 12.5, 25, 'Held more than 1 year, up to 2 years'],
      [3, 10, 20, 'Held more than 2 years, up to 3 years'],
      [4, 7.5, 15, 'Held more than 3 years, up to 4 years'],
      [5, 5, 10, 'Held more than 4 years, up to 5 years'],
      [6, 2.5, 5, 'Held more than 5 years, up to 6 years'],
    ];
    const buyMs = parseIsoUtc(buy);
    const soldMs = parseIsoUtc(sale);
    const hit = slabs.find(([years]) => !exceedsYears(buyMs, soldMs, years));
    if (!hit) return pair(0, 0, 'Acquired from 1 July 2022 to 30 June 2024. Held more than 6 years');
    return pair(hit[1], hit[2], `Acquired from 1 July 2022 to 30 June 2024. ${hit[3]}`);
  }
  if (buy < '2025-07-01') return pair(15, 30, 'Acquired from 1 July 2024 to 30 June 2025');
  return pair(15, 15, 'Acquired on or after 1 July 2025');
}

export function shareSaleTax({ quantity, buyPrice, sellPrice, buyFees = 0, sellFees = 0, acquired, sold, onAtl }) {
  const gain = capitalGain({ quantity, buyPrice, sellPrice, buyFees, sellFees, taxRatePct: null });
  const filerRate = listedShareCgtRate({ acquired, sold, onAtl: true });
  if (filerRate.error) return { ...gain, error: filerRate.error };
  const nonFilerRate = listedShareCgtRate({ acquired, sold, onAtl: false });
  const taxAt = (rate) => (gain.gain > 0 ? gain.gain * rate / 100 : 0);
  const side = (rate) => ({ rate, tax: taxAt(rate), net: gain.gain - taxAt(rate) });
  const filer = side(filerRate.rate);
  const nonFiler = side(nonFilerRate.rate);
  const chosen = onAtl ? filer : nonFiler;
  return {
    ...gain,
    tax: chosen.tax,
    net: chosen.net,
    rate: chosen.rate,
    band: filerRate.band,
    onAtl: !!onAtl,
    filer,
    nonFiler,
  };
}

/** Monthly amount invested at the start of each month. The return is an assumption you type. */
export function sipFutureValue({ monthly = 0, annualReturnPct = 0, years = 0, initial = 0 }) {
  const pmt = Number(monthly) || 0;
  const start = Number(initial) || 0;
  const span = Number(years);
  const annual = Number(annualReturnPct);
  if (!(span > 0)) return { error: 'Enter a time longer than zero.' };
  if (!(pmt > 0) && !(start > 0)) return { error: 'Enter a monthly amount or a starting amount.' };
  if (!(annual > -100)) return { error: 'Return cannot be −100% or worse.' };
  const months = span * 12;
  const invested = pmt * months + start;
  if (annual === 0) return { invested, futureValue: invested, gain: 0, months };
  const monthlyRate = annual / 100 / 12;
  const growth = (1 + monthlyRate) ** months;
  const futureValue = pmt * ((growth - 1) / monthlyRate) * (1 + monthlyRate) + start * growth;
  return { invested, futureValue, gain: futureValue - invested, months };
}

export const SILVER_NISAB_GRAMS = 612.36;
export const GOLD_NISAB_GRAMS = 87.48;

/** 2.5% of net zakatable wealth when it reaches the nisab you measure. Not a ruling. */
export function zakatDue({
  cash = 0,
  goldGrams = 0,
  goldPricePerGram = 0,
  silverGrams = 0,
  silverPricePerGram = 0,
  investments = 0,
  debts = 0,
  nisabMetal = 'silver',
}) {
  const gold = (Number(goldGrams) || 0) * (Number(goldPricePerGram) || 0);
  const silver = (Number(silverGrams) || 0) * (Number(silverPricePerGram) || 0);
  const gross = (Number(cash) || 0) + gold + silver + (Number(investments) || 0);
  const net = Math.max(0, gross - (Number(debts) || 0));
  const metal = nisabMetal === 'gold' ? 'gold' : 'silver';
  const price = metal === 'gold' ? Number(goldPricePerGram) : Number(silverPricePerGram);
  if (!(price > 0)) {
    return { error: metal === 'gold'
      ? 'Enter a gold price per gram to measure nisab.'
      : 'Enter a silver price per gram to measure nisab.' };
  }
  const nisab = (metal === 'gold' ? GOLD_NISAB_GRAMS : SILVER_NISAB_GRAMS) * price;
  const belowNisab = net < nisab;
  const zakat = belowNisab ? 0 : net * 0.025;
  return { gross, gold, silver, net, nisab, belowNisab, zakat, ratePct: 2.5 };
}

export function fifoVsAverage(lots, sellQty, sellPrice) {
  const quantity = Number(sellQty);
  const price = Number(sellPrice);
  let left = quantity;
  let fifoCost = 0;
  let filled = 0;
  for (const lot of lots) {
    const take = Math.min(left, Number(lot.quantity));
    if (take <= 0) continue;
    fifoCost += take * Number(lot.price);
    filled += take;
    left -= take;
  }
  if (filled + 1e-9 < quantity) return { error: 'Sell quantity is larger than the lots entered.' };
  const totalQty = lots.reduce((sum, lot) => sum + Number(lot.quantity), 0);
  const totalCost = lots.reduce((sum, lot) => sum + Number(lot.quantity) * Number(lot.price), 0);
  if (!(totalQty > 0)) return { error: 'Enter at least one lot.' };
  const averagePrice = totalCost / totalQty;
  const proceeds = quantity * price;
  return {
    fifoGain: proceeds - fifoCost,
    averageGain: proceeds - averagePrice * quantity,
    averagePrice,
  };
}

export function dividendYield(annualDividend, price) {
  const px = Number(price);
  if (!(px > 0)) return { error: 'Enter a price above zero.' };
  return { yieldPct: Number(annualDividend) / px * 100 };
}

export function tradeCost({ value, commissionPct, salesTaxPctOnCommission, cdc }) {
  const commission = Number(value) * Number(commissionPct) / 100;
  const salesTax = commission * Number(salesTaxPctOnCommission) / 100;
  const cdcAmount = Number(cdc);
  return { commission, salesTax, cdc: cdcAmount, total: commission + salesTax + cdcAmount };
}

function money(value) {
  if (value === null || !Number.isFinite(value)) return '—';
  return value.toLocaleString('en-PK', { maximumFractionDigits: 2 });
}

function read(form, name) {
  const raw = new FormData(form).get(name);
  if (raw === null || String(raw).trim() === '') return null;
  return Number(raw);
}

function readText(form, name) {
  const raw = new FormData(form).get(name);
  return raw === null ? '' : String(raw);
}

function show(id, text) {
  const node = document.getElementById(id);
  if (node) node.textContent = text;
}

function bind() {
  const gain = document.getElementById('capital-gains');
  gain?.addEventListener('submit', (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const row = shareSaleTax({
      quantity: read(form, 'quantity'),
      buyPrice: read(form, 'buyPrice'),
      sellPrice: read(form, 'sellPrice'),
      buyFees: read(form, 'buyFees') || 0,
      sellFees: read(form, 'sellFees') || 0,
      acquired: readText(form, 'acquired'),
      sold: readText(form, 'sold'),
      onAtl: readText(form, 'onAtl') !== 'no',
    });
    if (row.error) {
      show('capital-gains-out', row.error);
      return;
    }
    const who = row.onAtl ? 'On the Active Taxpayers List' : 'Not on the Active Taxpayers List';
    show('capital-gains-out', `${row.band}. ${who}: ${money(row.rate)}% , tax Rs. ${money(row.tax)}, after tax Rs. ${money(row.net)}. Filer tax Rs. ${money(row.filer.tax)} at ${money(row.filer.rate)}%. Non-filer tax Rs. ${money(row.nonFiler.tax)} at ${money(row.nonFiler.rate)}%. Gain Rs. ${money(row.gain)}. NCCPL collects on the year’s net gains. Super tax is not included.`);
  });

  const fifo = document.getElementById('fifo-vs-average');
  fifo?.addEventListener('submit', (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const row = fifoVsAverage(
      [
        { quantity: read(form, 'q1'), price: read(form, 'p1') },
        { quantity: read(form, 'q2'), price: read(form, 'p2') },
      ].filter((lot) => lot.quantity > 0),
      read(form, 'sellQty'),
      read(form, 'sellPrice'),
    );
    show('fifo-vs-average-out', row.error
      ? row.error
      : `FIFO gain Rs. ${money(row.fifoGain)}. Average-cost gain Rs. ${money(row.averageGain)}. Blended open price Rs. ${money(row.averagePrice)}.`);
  });

  const yieldForm = document.getElementById('dividend-yield');
  yieldForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const row = dividendYield(read(form, 'dividend'), read(form, 'price'));
    show('dividend-yield-out', row.error ? row.error : `Yield on the price you entered: ${money(row.yieldPct)}%.`);
  });

  const costs = document.getElementById('trade-costs');
  costs?.addEventListener('submit', (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const row = tradeCost({
      value: read(form, 'value') || 0,
      commissionPct: read(form, 'commissionPct') || 0,
      salesTaxPctOnCommission: read(form, 'salesTaxPct') || 0,
      cdc: read(form, 'cdc') || 0,
    });
    show('trade-costs-out', `Commission Rs. ${money(row.commission)}. Tax on commission Rs. ${money(row.salesTax)}. CDC amount Rs. ${money(row.cdc)}. Total Rs. ${money(row.total)}.`);
  });

  const sip = document.getElementById('sip');
  sip?.addEventListener('submit', (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const row = sipFutureValue({
      monthly: read(form, 'monthly') || 0,
      annualReturnPct: read(form, 'annualReturnPct') || 0,
      years: read(form, 'years'),
      initial: read(form, 'initial') || 0,
    });
    show('sip-out', row.error
      ? row.error
      : `You put in Rs. ${money(row.invested)}. At ${money(read(form, 'annualReturnPct') || 0)}% a year, the estimate is Rs. ${money(row.futureValue)}. The difference is Rs. ${money(row.gain)}. That return is the assumption you typed, not a forecast.`);
  });

  const zakat = document.getElementById('zakat');
  zakat?.addEventListener('submit', (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const row = zakatDue({
      cash: read(form, 'cash') || 0,
      goldGrams: read(form, 'goldGrams') || 0,
      goldPricePerGram: read(form, 'goldPrice') || 0,
      silverGrams: read(form, 'silverGrams') || 0,
      silverPricePerGram: read(form, 'silverPrice') || 0,
      investments: read(form, 'investments') || 0,
      debts: read(form, 'debts') || 0,
      nisabMetal: readText(form, 'nisabMetal') === 'gold' ? 'gold' : 'silver',
    });
    show('zakat-out', row.error
      ? row.error
      : `Zakatable net Rs. ${money(row.net)}. Nisab Rs. ${money(row.nisab)}. ${row.belowNisab ? 'Below nisab, so this estimate is Rs. 0.' : `Zakat at 2.5% is Rs. ${money(row.zakat)}.`} This is not a ruling.`);
  });
}

if (typeof document !== 'undefined') bind();
