// All calculations use unrounded inputs. Formatting belongs to the worksheet.
export function number(
  value,
  label,
  { min = 0, positive = false, integer = false, max = Infinity } = {},
) {
  if (value == null || String(value).trim() === '') throw Error('Enter ' + label + '.');
  const n = Number(value);
  if (
    !Number.isFinite(n) ||
    n < min ||
    n > max ||
    (positive && n === 0) ||
    (integer && !Number.isSafeInteger(n))
  ) {
    throw Error(
      'Check ' +
        label +
        '. Enter a ' +
        (positive ? 'positive ' : 'nonnegative ') +
        (integer ? 'whole number' : 'number') +
        (max !== Infinity ? ' up to ' + max : '') +
        '.',
    );
  }
  return n;
}
function finite(values) {
  if (!values.every(Number.isFinite))
    throw Error('These values are too large to calculate. Check the inputs and units.');
}
export function margin(priceInput, volumeInput, costs) {
  const price = number(priceInput, 'unit price', { positive: true });
  const volume = number(volumeInput, 'monthly volume', { positive: true, integer: true });
  let fixed = 0,
    variable = 0;
  const totals = { fulfillment: 0, acquisition: 0, operating: 0 };
  for (const cost of costs) {
    const amount = number(cost.amount, cost.label);
    if (!Object.hasOwn(totals, cost.layer)) throw Error('Choose a cost layer.');
    if (cost.basis === 'month') {
      fixed += amount;
      totals[cost.layer] += amount / volume;
    } else {
      if (!['percent', 'unit'].includes(cost.basis)) throw Error('Choose a cost basis.');
      const perUnit = cost.basis === 'percent' ? (price * amount) / 100 : amount;
      variable += perUnit;
      totals[cost.layer] += perUnit;
    }
  }
  const cm1 = price - totals.fulfillment,
    cm2 = cm1 - totals.acquisition,
    cm3 = cm2 - totals.operating;
  const slope = price - variable,
    monthly = slope * volume - fixed;
  finite([monthly, cm1, cm2, cm3]);
  return { price, volume, totals, cm1, cm2, cm3, fixed, slope, monthly };
}
export function matchingVolume(target, model) {
  // At zero sales, fixed expenses still apply. Negative contribution per
  // additional unit can only move the venture farther from the target.
  if (-model.fixed >= target) return 0;
  if (model.slope <= 0) return null;
  const quotient = (target + model.fixed) / model.slope;
  const threshold = Math.ceil(quotient - 4 * Number.EPSILON * Math.max(1, quotient));
  if (!Number.isSafeInteger(threshold)) throw Error('The required volume exceeds the supported range.');
  return threshold;
}
export function channel(spendInput, reachInput, wonInput) {
  const spend = number(spendInput, 'channel spend');
  const reach = number(reachInput, 'people reached', { integer: true });
  const won = number(wonInput, 'new paying customers', { integer: true, max: reach });
  return {
    spend,
    reach,
    won,
    conversion: reach ? (100 * won) / reach : null,
    cac: won ? spend / won : null,
  };
}
export function allocation(budgetInput, channels, decisions) {
  const budget = number(budgetInput, 'available budget');
  const lines = channels.map((c, i) => {
    const d = decisions[i],
      discrete = d.type === 'bookings';
    const quantity = number(d.quantity, 'allocation for ' + d.name, { integer: discrete });
    const price = discrete ? number(d.rate, 'price per booking', { positive: true }) : 1;
    if (
      d.cap != null &&
      d.cap !== '' &&
      quantity > number(d.cap, 'channel limit', { integer: discrete })
    ) {
      throw Error(d.name + ' exceeds its confirmed limit.');
    }
    const spend = price * quantity;
    const customers = spend === 0 ? 0 : c.cac > 0 ? spend / c.cac : null;
    finite(customers === null ? [spend] : [spend, customers]);
    return { name: d.name, quantity, spend, customers };
  });
  const total = lines.reduce((sum, line) => sum + line.spend, 0);
  if (total - budget > 1e-8) throw Error('The allocation exceeds your available budget.');
  return { lines, total, unspent: Math.max(0, budget - total) };
}
export function funding(input) {
  const investment = number(input.investment, 'investment', { positive: true });
  const pre = number(input.pre, 'pre-money valuation');
  const years = number(input.years, 'exit horizon in years', { positive: true });
  const revenue = number(input.revenue, 'annual revenue at exit');
  const multiple = number(input.multiple, 'revenue multiple', { positive: true });
  const rate = number(input.rate, 'annual investor target return (%)');
  const target = number(input.target, 'ownership you want to offer (%)', { positive: true, max: 100 });
  const post = pre + investment,
    offered = (100 * investment) / post;
  const factor = (1 + rate / 100) ** years,
    exit = revenue * multiple,
    today = exit / factor;
  const payoff = investment * factor,
    required = today > 0 ? (100 * investment) / today : null;
  const targetExit = payoff / (target / 100),
    targetRevenue = targetExit / multiple;
  finite([post, offered, factor, exit, today, payoff, targetExit, targetRevenue]);
  if (required !== null) finite([required]);
  return { post, offered, exit, today, required, targetExit, targetRevenue, payoff };
}
