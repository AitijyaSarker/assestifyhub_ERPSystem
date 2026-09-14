import { Decimal } from 'decimal.js';

export function d(value: Decimal.Value): Decimal {
  return new Decimal(value ?? 0);
}

export function money(value: Decimal.Value): Decimal {
  return d(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

export function qty(value: Decimal.Value): Decimal {
  return d(value).toDecimalPlaces(3, Decimal.ROUND_HALF_UP);
}

export function moneyStr(value: Decimal.Value): string {
  return money(value).toFixed(2);
}

export function qtyStr(value: Decimal.Value): string {
  return qty(value).toFixed(3);
}
