import { number, margin, matchingVolume, channel, allocation, funding } from './math.mjs';
const money = (n) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(n);
const fmt = (n) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(n);
const pct = (n) => fmt(n) + '%';
const field = (id, label, type = 'text', options = {}) => ({ id, label, type, ...options });
const num = (id, label, opts = {}) => field(id, label, 'number', opts);
const choice = (id, label, choices) => field(id, label, 'select', { choices });
const group = (title, ...fields) => ({ title, fields });
const optional = { optional: true };
const positive = { positive: true },
  count = { integer: true },
  positiveCount = { positive: true, integer: true };
const area = (id, label) => field(id, label, 'textarea');
const costLayers = {
  fulfillment: 'Make or deliver',
  acquisition: 'Marketing and sales',
  operating: 'Other operating costs',
};
const bases = { unit: 'Dollars per unit', month: 'Dollars per month', percent: 'Percent of revenue' };
const directions = ['Rise', 'Fall', 'Stay the same'];
const rowsFor = (prefix, definitions) =>
  definitions.map(([id, label, opts]) => num(prefix + id, label, opts));
export const initialCosts = [
  { label: 'Making and delivering the unit', layer: 'fulfillment', basis: 'unit' },
  { label: 'Marketing and sales', layer: 'acquisition', basis: 'month' },
  { label: 'Payment fees', layer: 'operating', basis: 'percent' },
  { label: 'Rent or other overhead', layer: 'operating', basis: 'month' },
];
function marginGroups(s) {
  const base = group(
    'Sales',
    field('unit', 'What is one unit of sale?'),
    num('basePrice', 'Current price per unit ($)', positive),
    num('newPrice', 'Proposed price per unit ($)', positive),
    num('baseVolume', 'Current units per month', positiveCount),
    num('newVolume', 'Proposed units per month', positiveCount),
    num('capacity', 'Maximum units you could deliver per month (optional)', { ...optional, ...count }),
  );
  return [
    base,
    ...s.costs.map((c, i) =>
      group(c.label, num('baseCost' + i, 'Current cost'), num('newCost' + i, 'Proposed cost')),
    ),
  ];
}
function costModel(s, get, side, volume) {
  const costs = s.costs.map((c, i) => ({ ...c, amount: get(side + 'Cost' + i) }));
  return margin(get(side + 'Price'), volume, costs);
}
function marginResult(s, get, lab) {
  const baseline = costModel(s, get, 'base', get('baseVolume'));
  const proposed = costModel(s, get, 'new', lab ? get('trialVolume') : get('newVolume'));
  const threshold = matchingVolume(baseline.monthly, proposed),
    capacity = get('capacity');
  const unit = get('unit');
  const detail = (m) => [
    money(m.price),
    money(m.totals.fulfillment),
    money(m.cm1) + ' (' + pct((100 * m.cm1) / m.price) + ')',
    money(m.totals.acquisition),
    money(m.cm2) + ' (' + pct((100 * m.cm2) / m.price) + ')',
    money(m.totals.operating),
    money(m.cm3) + ' (' + pct((100 * m.cm3) / m.price) + ')',
    fmt(m.volume),
    money(m.monthly),
  ];
  const labels = [
    'Selling price per ' + unit,
    'Fulfillment cost per unit',
    'CM1 = price − fulfillment',
    'Acquisition cost per unit',
    'CM2 = CM1 − acquisition',
    'Operating cost per unit',
    'CM3 = CM2 − operating costs',
    'Monthly volume',
    'Monthly contribution = CM3 × volume',
  ];
  const b = detail(baseline),
    p = detail(proposed);
  const interpretation =
    threshold === null
      ? 'No volume reaches the baseline with these costs.'
      : fmt(threshold) +
        ' units per month to match or exceed the current monthly contribution.' +
        (capacity !== '' && threshold > Number(capacity)
          ? ' That exceeds your capacity of ' + fmt(capacity) + '.'
          : '');
  return {
    tables: [
      {
        title: 'Contribution by layer',
        head: ['Calculation', 'Current', 'Proposed'],
        rows: labels.map((label, i) => [label, b[i], p[i]]),
      },
    ],
    notes: [
      interpretation,
      ...(capacity !== '' && proposed.volume > Number(capacity)
        ? ['Your proposed volume exceeds your stated capacity.']
        : []),
    ],
    charts: [baseline, proposed].map((m, i) => ({
      title: i ? 'Proposed per unit' : 'Current per unit',
      amounts: [m.price, m.cm1, m.cm2, m.cm3],
    })),
  };
}
const channelIds = ['a', 'b'];
function channelGroups() {
  return [
    group(
      'Budget and customer',
      num('budget', 'Available test budget ($)', positive),
      field('customer', 'What counts as a new paying customer?'),
    ),
    ...channelIds.map((id, i) =>
      group(
        'Channel ' + (i + 1),
        field(id + 'Name', 'Channel name'),
        ...rowsFor(id, [
          ['Spend', 'Historical or estimated spend ($)'],
          ['Reach', 'People reached', count],
          ['Won', 'New paying customers', count],
        ]),
        choice(id + 'Type', 'How do you buy this channel?', ['Flexible dollars', 'Whole bookings']),
        num(id + 'Rate', 'Cost per booking ($)', { ...positive, when: [id + 'Type', 'Whole bookings'] }),
        field(id + 'LimitText', 'What limits how much this channel can deliver?'),
        num(id + 'Initial', 'Initial allocation (dollars or number of bookings)'),
      ),
    ),
    group(
      'Repeat business (optional)',
      num('orderValue', 'Average revenue per order ($)', optional),
      num('orders', 'Expected lifetime orders per customer', optional),
      num('orderMargin', 'Contribution per order before acquisition ($)', {
        optional: true,
        min: -Infinity,
      }),
    ),
  ];
}
function channelResult(s, get, lab) {
  const metrics = channelIds.map((id) => channel(get(id + 'Spend'), get(id + 'Reach'), get(id + 'Won')));
  const plan = (revised) =>
    allocation(
      get('budget'),
      metrics,
      channelIds.map((id) => ({
        name: get(id + 'Name'),
        type: get(id + 'Type') === 'Whole bookings' ? 'bookings' : 'dollars',
        rate: get(id + 'Rate'),
        quantity: get(id + (revised ? 'Revised' : 'Initial')),
        cap: revised ? get(id + 'Cap') : '',
      })),
    );
  const original = plan(false),
    updated = lab ? plan(true) : null;
  const tables = [
    {
      title: 'Channel performance',
      head: ['Channel', 'Conversion = customers ÷ reach', 'CAC = spend ÷ customers'],
      rows: metrics.map((m, i) => [
        get(channelIds[i] + 'Name'),
        fmt(m.won) +
          ' ÷ ' +
          fmt(m.reach) +
          ' = ' +
          (m.conversion === null ? 'Unavailable (no reach)' : pct(m.conversion)),
        money(m.spend) +
          ' ÷ ' +
          fmt(m.won) +
          ' = ' +
          (m.cac === null ? 'Unavailable (no customers)' : money(m.cac)),
      ]),
    },
  ];
  const line = (l) =>
    money(l.spend) +
    ' · ' +
    (l.customers === null ? 'no spend-based forecast' : fmt(l.customers) + ' expected new customers');
  tables.push({
    title: 'Budget allocation',
    head: ['Channel', 'Original', ...(lab ? ['Revised'] : [])],
    rows: [
      ...original.lines.map((l, i) => [l.name, line(l), ...(lab ? [line(updated.lines[i])] : [])]),
      ['Unspent', money(original.unspent), ...(lab ? [money(updated.unspent)] : [])],
    ],
  });
  const notes = [
    'Projected customers = planned spend ÷ historical CAC. This assumes the channel performs at the same rate at the new spending level.',
  ];
  for (const [i, m] of metrics.entries())
    if (m.cac === null || !m.cac)
      notes.push(
        get(channelIds[i] + 'Name') +
          ': ' +
          (m.cac === null ? 'No new customers were recorded.' : 'Historical spend was zero.') +
          ' A paid acquisition forecast needs a measured, positive CAC.',
      );
  if ([get('orderValue'), get('orders'), get('orderMargin')].some((v) => v !== '')) {
    const orders = number(get('orders'), 'expected lifetime orders'),
      price = number(get('orderValue'), 'average order revenue');
    notes.push('Lifetime revenue per customer = ' + money(price * orders) + '.');
    if (get('orderMargin') !== '')
      notes.push(
        'Lifetime contribution before acquisition = ' + money(Number(get('orderMargin')) * orders) + '.',
      );
  }
  return { tables, notes };
}
const dealFields = [
  ['investment', 'Investment ($)', positive],
  ['pre', 'Pre-money valuation ($)'],
  ['years', 'Years to exit', positive],
  ['revenue', 'Projected annual revenue at exit ($)'],
  ['multiple', 'Exit revenue multiple', positive],
  ['rate', 'Annual investor target return (%)'],
  ['target', 'Ownership you want to offer (%)', { ...positive, max: 100 }],
];
function deal(get, prefix) {
  return Object.fromEntries(dealFields.map(([key]) => [key, get(prefix + key)]));
}
function fundingResult(s, get, lab) {
  function figures(prefix) {
    const inputs = deal(get, prefix),
      r = funding(inputs);
    return [
      money(r.post),
      pct(r.offered),
      money(r.exit),
      money(r.today),
      r.required === null ? 'No finite stake (zero exit value)' : pct(r.required),
      pct(Number(inputs.target)),
      money(r.targetExit),
      money(r.targetRevenue),
    ];
  }
  const labels = [
    'Post-money = pre-money + investment',
    'Offered ownership = investment ÷ post-money',
    'Exit value = exit revenue × multiple',
    'Value today = exit value ÷ (1 + annual return) ^ years',
    'Required ownership = investment ÷ value today',
    'Desired ownership for reverse calculation',
    'Required exit value = investor payoff ÷ desired fraction',
    'Required annual exit revenue = required exit value ÷ multiple',
  ];
  const first = figures(''),
    next = lab ? figures('counter') : [];
  const latest = funding(deal(get, lab ? 'counter' : ''));
  return {
    tables: [
      {
        title: 'Terms and exit forecast',
        head: ['Calculation', 'Original offer', ...(lab ? ['Counteroffer'] : [])],
        rows: labels.map((label, i) => [label, first[i], ...(lab ? [next[i]] : [])]),
      },
    ],
    notes: [
      'This simplified VC method assumes no intervening dilution and one payout at exit.',
      ...(latest.required === null || latest.required > 100
        ? ['Even 100% ownership would not deliver the target return under this forecast.']
        : []),
    ],
  };
}
export const assignments = {
  margin: {
    topic: 'Contribution margin',
    title: 'Is this change worth making?',
    scenario: 'What change are you considering, and what do you expect it to cost?',
    intro:
      'Compare today’s economics with the change you want to make. Find the sales volume that would justify it.',
    groups: marginGroups,
    predict: [
      choice('perUnit', 'How will contribution per unit change?', directions),
      choice('perMonth', 'How will total monthly contribution change?', directions),
    ],
    lab: (s) => [
      group(
        'Test another sales volume',
        num('trialVolume', 'Proposed monthly units to test', positiveCount),
      ),
    ],
    seed: (s, get) => [['trialVolume', get('newVolume'), 'newVolume']],
    result: marginResult,
    final: [
      area('decision', 'What change will you make, and why?'),
      field('trigger', 'What sales threshold would change your decision?'),
      area('next', 'Which assumption will you verify, and how?'),
    ],
    fallback:
      'Compare the monthly contribution with the amount each sale leaves. Can you deliver enough units to reach the calculated threshold?',
  },
  channels: {
    topic: 'Customer acquisition',
    title: 'Where should our next marketing dollars go?',
    scenario: 'Which two channels are you considering, and what budget decision do you face?',
    intro:
      'Compare two ways to reach paying customers. Allocate your budget, then test a real constraint.',
    groups: channelGroups,
    predict: [
      area(
        'forecast',
        'Predict which channel will win customers more cheaply. Show your conversion and CAC calculations for each.',
      ),
    ],
    lab: (s, get) => [
      group(
        'Test a practical limit',
        area('constraint', 'What changed or became binding? Use a constraint from your venture.'),
      ),
      ...channelIds.map((id) => {
        const units = get(id + 'Type') === 'Whole bookings' ? 'bookings' : 'dollars';
        return group(
          get(id + 'Name'),
          num(id + 'Cap', 'Maximum ' + units + ' available (set at least one channel limit)', {
            optional: true,
            integer: units === 'bookings',
          }),
          num(id + 'Revised', 'Revised allocation in ' + units, { integer: units === 'bookings' }),
        );
      }),
    ],
    seed: (s, get) => channelIds.map((id) => [id + 'Revised', get(id + 'Initial'), id + 'Initial']),
    result: channelResult,
    final: [
      area('decision', 'Why this allocation? What supports using the past rate at this scale?'),
      choice('testChannel', 'Which channel will you test?', ['Channel 1', 'Channel 2']),
      field('cta', 'Call to action'),
      num('testBudget', 'Experiment budget ($)'),
      field('window', 'Measurement window'),
      num('pass', 'Minimum new paying customers to continue', positiveCount),
      area('next', 'What will you do if the channel misses that pass mark?'),
    ],
    fallback:
      'Which part of your revised allocation relies on untested reach or capacity? What result would make you stop spending?',
  },
  funding: {
    topic: 'Funding negotiation',
    title: 'What ownership can we defend?',
    scenario: 'What milestone will the investment fund, and what offer are you considering?',
    intro: 'Price an offer for your venture, test the investor’s return, and defend a counteroffer.',
    groups: () => [
      group(
        'The offer',
        choice('status', 'Offer status', ['Hypothetical offer', 'Offer received']),
        ...rowsFor('', dealFields),
      ),
    ],
    predict: [
      num('ownership', 'Predict the investor’s ownership (%)', { max: 100 }),
      area('reason', 'What makes that stake reasonable or difficult to defend?'),
    ],
    lab: () => [group('Revise terms or forecast', ...rowsFor('counter', dealFields))],
    seed: (s, get) => dealFields.map(([key]) => ['counter' + key, get(key), key]),
    result: fundingResult,
    final: [
      choice('outcome', 'Your decision', [
        'Stand by the original offer',
        'Make the counteroffer',
        'Walk away',
      ]),
      area('decision', 'Defend the terms using your ownership and exit forecast.'),
      area('next', 'What evidence would most strengthen your position?'),
    ],
    fallback:
      'As the investor, I would ask what evidence supports your exit revenue forecast. Which assumption would you revise if that evidence fell short?',
  },
};
export function active(f, get) {
  return !f.when || get(f.when[0]) === f.when[1];
}
export function validateFields(fields, get) {
  for (const f of fields) {
    if (!active(f, get)) continue;
    const value = get(f.id);
    if (!String(value).trim() && f.optional) continue;
    if (f.type === 'number') number(value, f.label, f);
    else if (!String(value).trim() || (f.choices && !f.choices.includes(value)))
      throw Error('Complete “' + f.label + '”.');
  }
}
export { money, fmt, costLayers, bases };
