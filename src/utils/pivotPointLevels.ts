/** TradingView-style pivot point level sets from a completed period H/L/C(/O). */

export type PivotType =
  | 'Traditional'
  | 'Fibonacci'
  | 'Woodie'
  | 'Classic'
  | 'DM'
  | 'Camarilla';

export interface PivotSource {
  high: number;
  low: number;
  close: number;
  open?: number;
}

/** Sparse map of level name → price (undefined = not applicable for that type). */
export type PivotLevelsMap = {
  P?: number;
  R1?: number;
  R2?: number;
  R3?: number;
  R4?: number;
  R5?: number;
  S1?: number;
  S2?: number;
  S3?: number;
  S4?: number;
  S5?: number;
};

export function pivotPointLevels(type: PivotType, src: PivotSource): PivotLevelsMap {
  const { high: H, low: L, close: C } = src;
  const O = src.open ?? C;
  const range = H - L;

  switch (type) {
    case 'Traditional': {
      const P = (H + L + C) / 3;
      return {
        P,
        R1: 2 * P - L,
        S1: 2 * P - H,
        R2: P + range,
        S2: P - range,
        R3: 2 * P + (H - 2 * L),
        S3: 2 * P - (2 * H - L),
        R4: 3 * P + (H - 3 * L),
        S4: 3 * P - (3 * H - L),
        R5: 4 * P + (H - 4 * L),
        S5: 4 * P - (4 * H - L),
      };
    }
    case 'Fibonacci': {
      const P = (H + L + C) / 3;
      return {
        P,
        R1: P + 0.382 * range,
        S1: P - 0.382 * range,
        R2: P + 0.618 * range,
        S2: P - 0.618 * range,
        R3: P + range,
        S3: P - range,
      };
    }
    case 'Woodie': {
      const P = (H + L + 2 * C) / 4;
      return {
        P,
        R1: 2 * P - L,
        S1: 2 * P - H,
        R2: P + range,
        S2: P - range,
        R3: H + 2 * (P - L),
        S3: L - 2 * (H - P),
      };
    }
    case 'Classic': {
      const P = (H + L + C) / 3;
      return {
        P,
        R1: 2 * P - L,
        S1: 2 * P - H,
        R2: P + range,
        S2: P - range,
        R3: H + 2 * (P - L),
        S3: L - 2 * (H - P),
      };
    }
    case 'DM': {
      let x: number;
      if (C < O) x = H + 2 * L + C;
      else if (C > O) x = 2 * H + L + C;
      else x = H + L + 2 * C;
      return {
        P: x / 4,
        R1: x / 2 - L,
        S1: x / 2 - H,
      };
    }
    case 'Camarilla': {
      const r5 = (H / L) * C;
      return {
        P: (H + L + C) / 3,
        R1: C + (range * 1.1) / 12,
        S1: C - (range * 1.1) / 12,
        R2: C + (range * 1.1) / 6,
        S2: C - (range * 1.1) / 6,
        R3: C + (range * 1.1) / 4,
        S3: C - (range * 1.1) / 4,
        R4: C + (range * 1.1) / 2,
        S4: C - (range * 1.1) / 2,
        R5: r5,
        S5: C - (r5 - C),
      };
    }
    default:
      return pivotPointLevels('Traditional', src);
  }
}

/** Ordered list for drawing (TradingView graphicSettingsArray order). */
export function pivotLevelsAsArray(
  type: PivotType,
  src: PivotSource,
): { label: string; value: number }[] {
  const m = pivotPointLevels(type, src);
  const order = ['P', 'R1', 'S1', 'R2', 'S2', 'R3', 'S3', 'R4', 'S4', 'R5', 'S5'] as const;
  const out: { label: string; value: number }[] = [];
  for (const label of order) {
    const v = m[label];
    if (v != null && Number.isFinite(v)) out.push({ label, value: v });
  }
  return out;
}
