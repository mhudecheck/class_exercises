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
      field('customer', 'What counts as a first-time paying customer?', 'text', {
        help: 'Count a person once, when they make their first purchase.',
      }),
    ),
    ...channelIds.map((id, i) =>
      group(
        'Channel ' + (i + 1),
        field(id + 'Name', 'Channel name'),
        ...rowsFor(id, [
          ['Spend', 'Cost of the trial ($)'],
          ['Reach', 'People reached in that trial', count],
          [
            'Won',
            'How many first-time paying customers should I target?',
            {
              ...count,
              help: 'Estimate how many people will buy from you for the first time in this trial. If you’ve already run it, enter the actual count.',
            },
          ],
        ]),
        field(id + 'Type', 'How do you pay for this channel?', 'select', {
          choices: ['Flexible dollars', 'Whole bookings'],
          help: 'Choose Flexible dollars when you decide what to spend, like $40 on ads. Choose Whole bookings when you pay a set price for each spot, like $50 per market table.',
        }),
        num(id + 'Rate', 'Cost per booking ($)', { ...positive, when: [id + 'Type', 'Whole bookings'] }),
        field(id + 'LimitText', 'Does this channel have a limit? (optional)', 'text', {
          ...optional,
          help: 'Write down any restriction you already know about, like a $40 printing cap or only one market table available per week.',
        }),
        num(id + 'Initial', 'Initial allocation (dollars or number of bookings)', {
          help: 'Enter dollars for flexible spending or the number of bookings for a channel with a set price. Enter 0 to leave it unfunded.',
        }),
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
function channelMetrics(get) {
  return channelIds.map((id) => channel(get(id + 'Spend'), get(id + 'Reach'), get(id + 'Won')));
}
function channelPlan(get, metrics, revised) {
  return allocation(
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
}
function channelResult(s, get, lab) {
  const metrics = channelMetrics(get);
  const original = channelPlan(get, metrics, false);
  const updated = lab ? channelPlan(get, metrics, true) : null;
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
  const line = (l, i) =>
    money(l.spend) +
    ' · ' +
    (metrics[i].cac > 0 ? fmt(l.customers) + ' expected new customers' : 'no spend-based forecast');
  tables.push({
    title: 'Budget allocation',
    head: ['Channel', 'Original', ...(lab ? ['Revised'] : [])],
    rows: [
      ...original.lines.map((l, i) => [l.name, line(l, i), ...(lab ? [line(updated.lines[i], i)] : [])]),
      ['Unspent', money(original.unspent), ...(lab ? [money(updated.unspent)] : [])],
    ],
  });
  const notes = [
    'Projected customers = planned spend ÷ the trial’s customer acquisition cost (CAC). This assumes each channel performs at the same rate as spending changes. If you entered estimates, the forecast depends on those estimates.',
  ];
  for (const [i, m] of metrics.entries())
    if (m.cac === null || !m.cac)
      notes.push(
        get(channelIds[i] + 'Name') +
          ': ' +
          (m.cac === null ? 'The trial has no paying customers.' : 'The trial has no spending.') +
          ' A spending forecast needs both a positive cost and paying customers.',
      );
  if (get('orders') !== '' && get('orderValue') !== '') {
    notes.push(
      'Lifetime revenue per customer = ' +
        money(Number(get('orders')) * Number(get('orderValue'))) +
        '.',
    );
  }
  if (get('orders') !== '' && get('orderMargin') !== '') {
    notes.push(
      'Lifetime contribution before acquisition = ' +
        money(Number(get('orders')) * Number(get('orderMargin'))) +
        '.',
    );
  }
  return { tables, notes };
}
export function channelExperiment(get) {
  const selected = get('testChannel');
  if (!selected || get('testBudget') === '') return null;
  const index = selected === 'Channel 1' ? 0 : 1;
  const id = channelIds[index];
  const name = get(id + 'Name');
  const spend = number(get('testBudget'), 'test budget');
  const budgetError = (message) => {
    const error = Error(message);
    error.fieldId = 'testBudget';
    return error;
  };
  const metrics = channelMetrics(get);
  const line = channelPlan(get, metrics, true).lines[index];
  if (spend - line.spend > 1e-8) {
    throw budgetError(
      'The test budget exceeds the ' +
        money(line.spend) +
        ' set aside for ' +
        name +
        '. Reduce the test budget or change your revised allocation.',
    );
  }
  if (get(id + 'Type') === 'Whole bookings') {
    const bookings = spend / Number(get(id + 'Rate'));
    if (bookings < 1 || Math.abs(bookings - Math.round(bookings)) > 1e-8) {
      throw budgetError(
        'The test budget for ' +
          name +
          ' must cover at least one whole booking at ' +
          money(Number(get(id + 'Rate'))) +
          ' each.',
      );
    }
  }
  const target =
    get('pass') === '' ? null : number(get('pass'), 'first-time customer target', positiveCount);
  const trial = metrics[index];
  return {
    name,
    spend,
    allocation: line.spend,
    trialCac: trial.cac,
    forecast: spend > 0 && trial.cac > 0 ? spend / trial.cac : null,
    target,
    targetCac: target && spend > 0 ? spend / target : null,
  };
}
export function experimentNotes(test) {
  if (!test) return [];
  const notes = [
    test.name +
      ' has ' +
      money(test.allocation) +
      ' in the revised plan. This test uses ' +
      money(test.spend) +
      '.',
  ];
  if (test.forecast !== null) {
    notes.push(
      'At the trial’s acquisition cost, this test would bring in about ' +
        fmt(test.forecast) +
        ' first-time paying customers.',
    );
  } else {
    notes.push(
      'There is no spending forecast for this test. Use the test to measure how many first-time customers buy.',
    );
  }
  if (test.targetCac !== null) {
    notes.push(
      'At this budget, getting ' +
        fmt(test.target) +
        ' first-time paying customers means spending at most ' +
        money(test.targetCac) +
        ' per customer.',
    );
  }
  if (test.target !== null && test.forecast !== null && test.target - test.forecast > 1e-8) {
    notes.push('Your target is higher than the forecast. What has to improve to reach it?');
  }
  return notes;
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
        area('constraint', 'What limit will you test? For example, only one market stall is available.'),
      ),
      ...channelIds.map((id) => {
        const units = get(id + 'Type') === 'Whole bookings' ? 'bookings' : 'dollars';
        return group(
          get(id + 'Name'),
          num(id + 'Cap', 'Maximum ' + units + ' available (optional)', {
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
      field('cta', 'What will you ask people to do?', 'text', {
        help: 'For example, scan the flyer’s QR code and buy their first cup.',
      }),
      num('testBudget', 'Budget for this test ($)'),
      field('window', 'When will you run the test?'),
      num('pass', 'How many new customers would make the test worth repeating?', positiveCount),
      area('next', 'If you miss your customer target, what will you try next?'),
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
    try {
      if (f.type === 'number') number(value, f.label, f);
      else if (!String(value).trim() || (f.choices && !f.choices.includes(value))) {
        throw Error('Complete “' + f.label + '”.');
      }
    } catch (error) {
      error.fieldId = f.id;
      throw error;
    }
  }
}
export { money, fmt };
