import maxCoinAmount from './maxCoinAmount';
import { isSafeConvertToNumber } from '../check';
import { compareCoinAmount } from '@suiet/chrome-ext/src/utils/check';

/**
 * Calculate max coin amount based on coin type
 * @param coinType
 * @param amount  should be the actual amount, without decimal
 * @param decimals
 * @param opts
 */
export default function maxCoinAmountWithDecimal(
  coinType: string,
  amount: string,
  decimals: number,
  opts?: {
    gasBudget?: string;
  }
) {
  const maxAmount = maxCoinAmount(coinType, amount, opts);
  const decimalMultiplier = 10 ** decimals;
  if (compareCoinAmount(maxAmount, decimalMultiplier) < 0) {
    return '0';
  }
  if (isSafeConvertToNumber(maxAmount)) {
    const res = Number(maxAmount) / decimalMultiplier;
    // js will convert 0.0000001 to 1e-7, so we need to convert it back
    return res < 1e-6 ? res.toFixed(decimals) : String(res);
  }
  return String(BigInt(maxAmount) / BigInt(decimalMultiplier));
}
