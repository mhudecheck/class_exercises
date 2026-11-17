import { number, channel, allocation, funding } from './math.mjs';
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
const rowsFor = (prefix, definitions) =>
  definitions.map(([id, label, opts]) => num(prefix + id, label, opts));
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
          ['Spend', 'Amount spent or budgeted ($)'],
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
    'Ownership you want to offer',
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
      'Assume the company raises no more equity before it sells. The investor gets paid once, at the sale.',
      ...(latest.required === null || latest.required > 100
        ? ['Even 100% ownership would not deliver the target return under this forecast.']
        : []),
    ],
  };
}
export const assignments = {
  channels: {
    topic: 'Customer acquisition',
    title: 'Where should our next marketing dollars go?',
    scenario: 'Where could you reach your first customers? Describe two channels you could try.',
    intro:
      'Decide how to split your marketing budget between two channels. Then plan a test you could actually run.',
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
        area('constraint', 'What limits how much you can spend or how many people you can reach?'),
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
      area(
        'decision',
        'Why did you split the budget this way? What makes you think each channel can bring in those customers?',
      ),
      choice('testChannel', 'Which channel will you test?', ['Channel 1', 'Channel 2']),
      field('cta', 'Call to action'),
      num('testBudget', 'Experiment budget ($)'),
      field('window', 'When will you run the test?'),
      num('pass', 'How many new customers would make the test worth repeating?', positiveCount),
      area('next', 'If fewer customers buy than you expected, what will you try next?'),
    ],
    fallback:
      'Which part of your revised allocation relies on untested reach or capacity? What result would make you stop spending?',
  },
  funding: {
    topic: 'Funding negotiation',
    title: 'How much of your company would you offer an investor?',
    scenario: 'What milestone will the investment fund, and what offer are you considering?',
    intro:
      'Work out what the investor would own and what your company would need to sell for. Then decide what terms you would offer.',
    groups: () => [
      group(
        'The offer',
        choice('status', 'Offer status', ['Hypothetical offer', 'Offer received']),
        ...rowsFor('', dealFields),
      ),
    ],
    predict: [
      num('ownership', 'Predict the investor’s ownership (%)', { max: 100 }),
      area('reason', 'Why would you be willing to give up that share of the company?'),
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
      area(
        'decision',
        'What terms would you accept? Use the investor’s share and your expected sale price to explain why.',
      ),
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
export { money, fmt };
