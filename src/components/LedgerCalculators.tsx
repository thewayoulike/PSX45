import React, { useState } from 'react';
import {
  dividendYield,
  fifoVsAverage,
  shareSaleTax,
  sipFutureValue,
  tradeCost,
  zakatDue,
} from '../../public/calculators.js';

type Tab = 'gain' | 'sip' | 'zakat' | 'fifo' | 'yield' | 'costs';

const TABS: { id: Tab; label: string }[] = [
  { id: 'gain', label: 'Capital gain' },
  { id: 'sip', label: 'SIP' },
  { id: 'zakat', label: 'Zakat' },
  { id: 'fifo', label: 'FIFO vs average' },
  { id: 'yield', label: 'Dividend yield' },
  { id: 'costs', label: 'Trade costs' },
];

function money(value: number) {
  if (!Number.isFinite(value)) return '—';
  return value.toLocaleString('en-PK', { maximumFractionDigits: 2 });
}

function num(raw: string) {
  if (raw.trim() === '') return 0;
  return Number(raw);
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm font-medium text-slate-600 dark:text-slate-300">
      {label}
      <div className="mt-1">{children}</div>
    </label>
  );
}

const control = 'w-full min-h-11 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-slate-900 dark:text-slate-100';

function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={control} />;
}

export const LedgerCalculators: React.FC = () => {
  const [tab, setTab] = useState<Tab>('gain');
  const [out, setOut] = useState('');

  const pick = (id: Tab) => {
    setTab(id);
    setOut('');
  };

  return (
    <div className="space-y-5 w-full min-w-0 max-w-3xl text-slate-900 dark:text-slate-100">
      <div>
        <h1 className="text-2xl font-bold">Calculators</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
          Capital gain, SIP, zakat, FIFO, dividend yield, and trade charges. You type every number. The same pages are public at <a className="underline" href="/tools">/tools</a> if you want them without the portfolio open.
        </p>
      </div>
      <div className="flex flex-wrap gap-2" role="tablist">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            onClick={() => pick(item.id)}
            className={`min-h-11 px-3 rounded-xl text-sm font-semibold border ${tab === item.id ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'}`}
          >
            {item.label}
          </button>
        ))}
      </div>
      {tab === 'gain' && <GainForm onResult={setOut} />}
      {tab === 'sip' && <SipForm onResult={setOut} />}
      {tab === 'zakat' && <ZakatForm onResult={setOut} />}
      {tab === 'fifo' && <FifoForm onResult={setOut} />}
      {tab === 'yield' && <YieldForm onResult={setOut} />}
      {tab === 'costs' && <CostForm onResult={setOut} />}
      {out && <p role="status" className="text-sm leading-relaxed rounded-xl border border-slate-200 dark:border-slate-700 p-4">{out}</p>}
    </div>
  );
};

function GainForm({ onResult }: { onResult: (text: string) => void }) {
  return (
    <form className="grid sm:grid-cols-2 gap-3" onSubmit={(event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const data = new FormData(form);
      const row = shareSaleTax({
        quantity: num(String(data.get('quantity') || '')),
        buyPrice: num(String(data.get('buyPrice') || '')),
        sellPrice: num(String(data.get('sellPrice') || '')),
        buyFees: num(String(data.get('buyFees') || '')),
        sellFees: num(String(data.get('sellFees') || '')),
        acquired: String(data.get('acquired') || ''),
        sold: String(data.get('sold') || ''),
        onAtl: String(data.get('onAtl') || 'yes') !== 'no',
      });
      onResult(row.error
        ? row.error
        : `${row.band}. ${row.onAtl ? 'On the Active Taxpayers List' : 'Not on the Active Taxpayers List'}: ${money(row.rate)}%, tax Rs. ${money(row.tax)}, after tax Rs. ${money(row.net)}. Filer tax Rs. ${money(row.filer.tax)} at ${money(row.filer.rate)}%. Non-filer tax Rs. ${money(row.nonFiler.tax)} at ${money(row.nonFiler.rate)}%. Gain Rs. ${money(row.gain)}. NCCPL collects on the year’s net gains. Super tax is not included.`);
    }}>
      <Field label="Quantity"><TextInput name="quantity" type="number" inputMode="decimal" step="any" required /></Field>
      <Field label="Buy price"><TextInput name="buyPrice" type="number" inputMode="decimal" step="any" required /></Field>
      <Field label="Sell price"><TextInput name="sellPrice" type="number" inputMode="decimal" step="any" required /></Field>
      <Field label="Buy fees (Rs)"><TextInput name="buyFees" type="number" inputMode="decimal" step="any" /></Field>
      <Field label="Sell fees (Rs)"><TextInput name="sellFees" type="number" inputMode="decimal" step="any" /></Field>
      <Field label="Buy date"><TextInput name="acquired" type="date" required /></Field>
      <Field label="Sell date"><TextInput name="sold" type="date" required /></Field>
      <Field label="Your status">
        <select name="onAtl" className={control} defaultValue="yes">
          <option value="yes">On the Active Taxpayers List (filer)</option>
          <option value="no">Not on the Active Taxpayers List (non-filer)</option>
        </select>
      </Field>
      <div className="sm:col-span-2"><button type="submit" className="min-h-11 px-4 rounded-xl bg-emerald-600 text-white font-semibold">Calculate</button></div>
    </form>
  );
}

function SipForm({ onResult }: { onResult: (text: string) => void }) {
  return (
    <form className="grid sm:grid-cols-2 gap-3" onSubmit={(event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      const annual = num(String(data.get('annualReturnPct') || ''));
      const row = sipFutureValue({
        monthly: num(String(data.get('monthly') || '')),
        annualReturnPct: annual,
        years: num(String(data.get('years') || '')),
        initial: num(String(data.get('initial') || '')),
      });
      onResult(row.error
        ? row.error
        : `You put in Rs. ${money(row.invested)}. At ${money(annual)}% a year, the estimate is Rs. ${money(row.futureValue)}. The difference is Rs. ${money(row.gain)}. That return is the assumption you typed, not a forecast.`);
    }}>
      <Field label="Monthly amount (Rs)"><TextInput name="monthly" type="number" inputMode="decimal" step="any" required /></Field>
      <Field label="Assumed annual return %"><TextInput name="annualReturnPct" type="number" inputMode="decimal" step="any" required /></Field>
      <Field label="Years"><TextInput name="years" type="number" inputMode="decimal" step="any" required /></Field>
      <Field label="Amount you already have (Rs)"><TextInput name="initial" type="number" inputMode="decimal" step="any" /></Field>
      <div className="sm:col-span-2"><button type="submit" className="min-h-11 px-4 rounded-xl bg-emerald-600 text-white font-semibold">Calculate</button></div>
    </form>
  );
}

function ZakatForm({ onResult }: { onResult: (text: string) => void }) {
  return (
    <form className="grid sm:grid-cols-2 gap-3" onSubmit={(event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      const row = zakatDue({
        cash: num(String(data.get('cash') || '')),
        goldGrams: num(String(data.get('goldGrams') || '')),
        goldPricePerGram: num(String(data.get('goldPrice') || '')),
        silverGrams: num(String(data.get('silverGrams') || '')),
        silverPricePerGram: num(String(data.get('silverPrice') || '')),
        investments: num(String(data.get('investments') || '')),
        debts: num(String(data.get('debts') || '')),
        nisabMetal: String(data.get('nisabMetal') || '') === 'gold' ? 'gold' : 'silver',
      });
      onResult(row.error
        ? row.error
        : `Zakatable net Rs. ${money(row.net)}. Nisab Rs. ${money(row.nisab)}. ${row.belowNisab ? 'Below nisab, so this estimate is Rs. 0.' : `Zakat at 2.5% is Rs. ${money(row.zakat)}.`} This is not a ruling.`);
    }}>
      <Field label="Cash and bank balances (Rs)"><TextInput name="cash" type="number" inputMode="decimal" step="any" /></Field>
      <Field label="Gold you hold (grams)"><TextInput name="goldGrams" type="number" inputMode="decimal" step="any" /></Field>
      <Field label="Gold price per gram (Rs)"><TextInput name="goldPrice" type="number" inputMode="decimal" step="any" /></Field>
      <Field label="Silver you hold (grams)"><TextInput name="silverGrams" type="number" inputMode="decimal" step="any" /></Field>
      <Field label="Silver price per gram (Rs)"><TextInput name="silverPrice" type="number" inputMode="decimal" step="any" /></Field>
      <Field label="Shares and funds you are treating as zakatable (Rs)"><TextInput name="investments" type="number" inputMode="decimal" step="any" /></Field>
      <Field label="Debts you are deducting (Rs)"><TextInput name="debts" type="number" inputMode="decimal" step="any" /></Field>
      <Field label="Nisab measure">
        <select name="nisabMetal" className={control} defaultValue="silver">
          <option value="silver">Silver nisab (612.36 grams)</option>
          <option value="gold">Gold nisab (87.48 grams)</option>
        </select>
      </Field>
      <div className="sm:col-span-2"><button type="submit" className="min-h-11 px-4 rounded-xl bg-emerald-600 text-white font-semibold">Calculate</button></div>
    </form>
  );
}

function FifoForm({ onResult }: { onResult: (text: string) => void }) {
  return (
    <form className="grid sm:grid-cols-2 gap-3" onSubmit={(event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      const row = fifoVsAverage(
        [
          { quantity: num(String(data.get('q1') || '')), price: num(String(data.get('p1') || '')) },
          { quantity: num(String(data.get('q2') || '')), price: num(String(data.get('p2') || '')) },
        ].filter((lot) => lot.quantity > 0),
        num(String(data.get('sellQty') || '')),
        num(String(data.get('sellPrice') || '')),
      );
      onResult(row.error
        ? row.error
        : `FIFO gain Rs. ${money(row.fifoGain)}. Average-cost gain Rs. ${money(row.averageGain)}. Blended open price Rs. ${money(row.averagePrice)}.`);
    }}>
      <Field label="First lot quantity"><TextInput name="q1" type="number" inputMode="decimal" step="any" required /></Field>
      <Field label="First lot price"><TextInput name="p1" type="number" inputMode="decimal" step="any" required /></Field>
      <Field label="Second lot quantity"><TextInput name="q2" type="number" inputMode="decimal" step="any" required /></Field>
      <Field label="Second lot price"><TextInput name="p2" type="number" inputMode="decimal" step="any" required /></Field>
      <Field label="Shares sold"><TextInput name="sellQty" type="number" inputMode="decimal" step="any" required /></Field>
      <Field label="Sale price"><TextInput name="sellPrice" type="number" inputMode="decimal" step="any" required /></Field>
      <div className="sm:col-span-2"><button type="submit" className="min-h-11 px-4 rounded-xl bg-emerald-600 text-white font-semibold">Calculate</button></div>
    </form>
  );
}

function YieldForm({ onResult }: { onResult: (text: string) => void }) {
  return (
    <form className="grid sm:grid-cols-2 gap-3" onSubmit={(event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      const row = dividendYield(num(String(data.get('dividend') || '')), num(String(data.get('price') || '')));
      onResult(row.error ? row.error : `Yield on the price you entered: ${money(row.yieldPct)}%.`);
    }}>
      <Field label="Annual cash dividend per share"><TextInput name="dividend" type="number" inputMode="decimal" step="any" required /></Field>
      <Field label="Price per share"><TextInput name="price" type="number" inputMode="decimal" step="any" required /></Field>
      <div className="sm:col-span-2"><button type="submit" className="min-h-11 px-4 rounded-xl bg-emerald-600 text-white font-semibold">Calculate</button></div>
    </form>
  );
}

function CostForm({ onResult }: { onResult: (text: string) => void }) {
  return (
    <form className="grid sm:grid-cols-2 gap-3" onSubmit={(event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      const row = tradeCost({
        value: num(String(data.get('value') || '')),
        commissionPct: num(String(data.get('commissionPct') || '')),
        salesTaxPctOnCommission: num(String(data.get('salesTaxPct') || '')),
        cdc: num(String(data.get('cdc') || '')),
      });
      onResult(`Commission Rs. ${money(row.commission)}. Tax on commission Rs. ${money(row.salesTax)}. CDC amount Rs. ${money(row.cdc)}. Total Rs. ${money(row.total)}.`);
    }}>
      <Field label="Trade value (Rs)"><TextInput name="value" type="number" inputMode="decimal" step="any" required /></Field>
      <Field label="Commission %"><TextInput name="commissionPct" type="number" inputMode="decimal" step="any" required /></Field>
      <Field label="Tax on commission %"><TextInput name="salesTaxPct" type="number" inputMode="decimal" step="any" required /></Field>
      <Field label="CDC amount (Rs)"><TextInput name="cdc" type="number" inputMode="decimal" step="any" required /></Field>
      <div className="sm:col-span-2"><button type="submit" className="min-h-11 px-4 rounded-xl bg-emerald-600 text-white font-semibold">Calculate</button></div>
    </form>
  );
}
