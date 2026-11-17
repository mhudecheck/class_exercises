import { assist, defaultEndpoint, quoteContainsValue } from './assist.mjs';
import { number } from './math.mjs';

const $ = (id) => document.getElementById(id);
const labels = {
  cost: 'Cost to make or deliver one unit ($)',
  price: 'Selling price per unit ($)',
  spend: 'Spending on this channel ($)',
  units: 'Expected sales from this channel (units)',
  fee: 'Payment fee (%)',
  other: 'Other operating costs per unit ($)',
};
const ids = ['product', 'channel', 'description', ...Object.keys(labels), 'reflection', 'evidence'];
const storageKey = 'venture_margin_ladder_v1';
const read = (key) => {
  try {
    return JSON.parse(localStorage.getItem(key));
  } catch {
    return null;
  }
};
let state = read(storageKey) || {},
  config = read('venture_ai_settings') || {},
  apiKey = config.key || '';
let pending = null;
const legacy = read('venture_decision_v1_margin');
const money = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
const percent = (n) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(n) + '%';
const node = (tag, text) => {
  const el = document.createElement(tag);
  el.textContent = text;
  return el;
};
function save() {
  try {
    localStorage.setItem(storageKey, JSON.stringify(state));
    $('saved').textContent = 'Saved in this browser';
  } catch {
    $('saved').textContent = 'Download your worksheet to keep a copy.';
  }
}
function checked(id, raw = state[id]) {
  return number(raw, labels[id], {
    positive: id === 'price' || id === 'units',
    integer: id === 'units',
    max: id === 'fee' ? 100 : Infinity,
  });
}
function calculate() {
  const result = {};
  // Reveal each rung as its inputs become available, without treating blank costs as zero.
  try {
    const price = checked('price'),
      cost = checked('cost');
    result.price = price;
    result.cost = cost;
    result.cm1 = price - cost;
    const spend = checked('spend'),
      marketing = spend === 0 ? 0 : spend / checked('units');
    result.marketing = marketing;
    result.cm2 = result.cm1 - marketing;
    const fee = price * (checked('fee') / 100),
      other = checked('other');
    result.fee = fee;
    result.other = other;
    result.cm3 = result.cm2 - fee - other;
  } catch (e) {
    result.missing = e.message;
  }
  return result;
}
const marginText = (value, price) =>
  money(value) + ' (' + percent((100 * value) / price) + ' of the selling price)';
function ladderRows(r) {
  return [
    ['Selling price', money(r.price), '100%'],
    ['CM1 · After production', money(r.cm1), percent((100 * r.cm1) / r.price)],
    ['CM2 · After marketing', money(r.cm2), percent((100 * r.cm2) / r.price)],
    ['CM3 · After fees and overhead', money(r.cm3), percent((100 * r.cm3) / r.price)],
  ];
}
function table(rows) {
  const t = document.createElement('table');
  const tr = t.createTHead().insertRow();
  for (const h of ['Step', 'Dollars per unit', 'Share of price']) {
    const th = node('th', h);
    th.scope = 'col';
    tr.append(th);
  }
  const body = t.createTBody();
  for (const row of rows) {
    const tr = body.insertRow();
    row.forEach((v, i) => {
      const c = node(i ? 'td' : 'th', v);
      if (!i) c.scope = 'row';
      tr.append(c);
    });
  }
  return t;
}
function waterfall(r) {
  const div = $('waterfall');
  div.replaceChildren();
  const min = Math.min(0, r.cm3),
    span = r.price - min;
  for (const [label, start, end] of [
    ['Price', 0, r.price],
    ['Make and deliver', r.price, r.cm1],
    ['Marketing', r.cm1, r.cm2],
    ['Fees and overhead', r.cm2, r.cm3],
    ['Amount left', 0, r.cm3],
  ]) {
    const row = node('div', '');
    row.className = 'waterrow';
    const track = node('span', '');
    track.className = 'track';
    const bar = node('i', '');
    bar.className = end < start ? 'cost' : '';
    track.style.setProperty('--zero', (-min / span) * 100 + '%');
    bar.style.left = (100 * (Math.min(start, end) - min)) / span + '%';
    bar.style.width = (100 * Math.abs(end - start)) / span + '%';
    track.append(bar);
    row.append(node('span', label), track, node('span', money(end - start)));
    div.append(row);
  }
}
function render() {
  const r = calculate();
  const done = r.cm3 !== undefined;
  $('units').required = Number(state.spend) > 0;
  $('cm1').textContent =
    r.cm1 === undefined
      ? ''
      : 'CM1 · ' + money(r.price) + ' − ' + money(r.cost) + ' = ' + marginText(r.cm1, r.price);
  const acquisition =
    Number(state.spend) > 0
      ? money(Number(state.spend)) +
        ' ÷ ' +
        state.units +
        ' units = ' +
        money(r.marketing) +
        ' per unit. '
      : '';
  $('cm2').textContent =
    r.cm2 === undefined
      ? ''
      : acquisition +
        'CM2 · ' +
        money(r.cm1) +
        ' − ' +
        money(r.marketing) +
        ' = ' +
        marginText(r.cm2, r.price);
  $('practice').hidden = !done || Boolean(state.revealed);
  $('practicePrompt').textContent = done
    ? 'Try the last step yourself. Start with CM2 and subtract ' +
      money(r.fee) +
      ' in payment fees and ' +
      money(r.other) +
      ' in other costs. What percentage of your price is left?'
    : '';
  $('cm3').textContent =
    done && state.revealed
      ? 'CM3 · ' +
        money(r.cm2) +
        ' − ' +
        money(r.fee) +
        ' in fees − ' +
        money(r.other) +
        ' in other costs = ' +
        marginText(r.cm3, r.price)
      : '';
  $('results').hidden = !done || !state.revealed;
  if (done) {
    waterfall(r);
    $('ladderTable').replaceChildren(table(ladderRows(r)));
    const cents = Math.round(Math.abs(r.cm3) * 100);
    $('interpretation').textContent =
      cents === 0
        ? 'At this price, the sale just covers the costs you entered.'
        : r.cm3 < 0
          ? 'The costs you entered exceed the selling price by ' + money(-r.cm3) + ' per unit.'
          : 'After the costs you entered, each sale leaves ' + money(r.cm3) + '.';
  }
  $('feedback').textContent = state.coach || '';
  $('printout').replaceChildren();
  if (done) $('printout').append(node('h1', 'Contribution margin worksheet'), node('pre', report(r)));
}
function report(r) {
  const lines = [
    state.product || 'My venture',
    '',
    'Selling price per unit: ' + money(r.price),
    'Cost to make or deliver one unit: ' + money(r.cost),
    'CM1: ' + $('cm1').textContent.split(' · ')[1],
    '',
    'Marketing channel: ' + (state.channel || 'Unspecified'),
    'Marketing spend: ' + money(Number(state.spend)),
    ...(Number(state.spend) > 0 ? ['Expected sales from this channel: ' + state.units] : []),
    'Marketing cost per unit: ' + money(r.marketing),
    'CM2: ' + marginText(r.cm2, r.price),
    '',
    'Payment fee: ' + state.fee + '% of price = ' + money(r.fee),
    'Other operating costs per unit: ' + money(r.other),
    'CM3: ' + marginText(r.cm3, r.price),
    $('interpretation').textContent,
    '',
    'Which cost would you work on first, and why?',
    state.reflection || '',
    'Where did your estimates come from?',
    state.evidence || '',
  ];
  if (state.description) lines.push('', 'Venture notes', state.description);
  for (const [id, note] of Object.entries(state.sources || {})) lines.push(labels[id] + ' — ' + note);
  if (state.coach) lines.push('', 'Feedback', state.coach);
  return lines.join('\n');
}
function download(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type })),
    a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function restore() {
  for (const id of ids) $(id).value = state[id] ?? '';
  $('legacy').hidden = !legacy || !Object.keys(legacy.fields || {}).length;
  showSuggestions();
  render();
  save();
}
for (const id of ids)
  $(id).addEventListener('input', () => {
    if (pending) pending.abort();
    state[id] = $(id).value;
    delete state.coach;
    if (Object.hasOwn(labels, id)) state.revealed = false;
    if (state.sources) delete state.sources[id];
    state.suggestions = [];
    state.questions = [];
    showSuggestions();
    $('status').textContent = '';
    $('draftStatus').textContent = '';
    render();
    save();
  });
function showSuggestions() {
  const panel = $('suggestions');
  panel.replaceChildren();
  for (const q of state.questions || []) panel.append(node('p', q));
  for (const p of state.suggestions || []) {
    if (!Object.hasOwn(labels, p.id) || state[p.id]) continue;
    const item = node('div', '');
    item.className = 'ai-card';
    const label = node('label', labels[p.id]),
      input = document.createElement('input');
    input.type = 'number';
    input.step = p.id === 'units' ? '1' : 'any';
    input.value = p.value;
    label.append(input);
    const accept = node('button', 'Use this estimate');
    accept.type = 'button';
    accept.onclick = () => {
      try {
        checked(p.id, input.value);
      } catch (e) {
        $('draftStatus').textContent = e.message;
        return;
      }
      const edited = input.value !== p.value;
      state[p.id] = input.value;
      $(p.id).value = input.value;
      state.revealed = false;
      state.sources ||= {};
      state.sources[p.id] =
        (edited
          ? 'Edited suggestion. '
          : p.origin === 'stated'
            ? 'From your notes. '
            : 'Accepted AI estimate. ') + p.rationale;
      state.suggestions = state.suggestions.filter((v) => v.id !== p.id);
      delete state.coach;
      showSuggestions();
      render();
      save();
    };
    item.append(
      label,
      node(
        'p',
        (p.origin === 'stated' ? 'From your notes: “' + p.quote + '”. ' : 'AI estimate. ') + p.rationale,
      ),
      accept,
    );
    panel.append(item);
  }
}
async function request(mode) {
  if (pending) return;
  const status = mode === 'draft' ? $('draftStatus') : $('feedback'),
    r = calculate();
  if (!state.product?.trim()) {
    status.textContent = 'Describe the product or service you plan to sell first.';
    $('product').focus();
    return;
  }
  if (mode === 'coach' && (r.missing || !state.reflection?.trim())) {
    status.textContent = r.missing || 'Write a sentence about the cost you would work on first.';
    return;
  }
  const eligible = Object.entries(labels)
    .filter(([id]) => !state[id])
    .map(([id, label]) => ({ id, label }));
  if (mode === 'draft' && !eligible.length) {
    status.textContent = 'You’ve already entered all the figures.';
    return;
  }
  const controller = new AbortController();
  pending = controller;
  const timer = setTimeout(() => controller.abort(), 60000);
  $('draft').disabled = $('coach').disabled = true;
  status.textContent = 'Waiting for the AI coach…';
  const input = {
    assignment:
      'Contribution margin ladder for one sale. Use one selling price. Follow CM1 after production, CM2 after marketing, CM3 after fees and overhead.',
    product: state.product,
    notes: state.description || '',
    channel: state.channel || '',
    figures: Object.fromEntries(
      Object.entries(labels)
        .filter(([id]) => state[id])
        .map(([id, label]) => [label, state[id]]),
    ),
  };
  try {
    const output = await assist(
      mode,
      mode === 'draft' ? { ...input, eligible } : { ...input, worksheet: report(r) },
      { endpoint: config.endpoint || defaultEndpoint, key: apiKey },
      controller.signal,
    );
    if (controller.signal.aborted) return;
    if (mode === 'draft') {
      const seen = new Set();
      state.suggestions = output.suggestions.filter((p) => {
        if (
          !eligible.some((f) => f.id === p?.id) ||
          seen.has(p.id) ||
          !['estimate', 'stated'].includes(p.origin) ||
          typeof p.rationale !== 'string'
        )
          return false;
        if (
          p.origin === 'stated' &&
          (!p.quote ||
            !quoteContainsValue(p.quote, p.value) ||
            ![state.description, state.product, state.channel].some((v) => v?.includes(p.quote)))
        )
          return false;
        try {
          checked(p.id, p.value);
        } catch {
          return false;
        }
        seen.add(p.id);
        return true;
      });
      state.questions = output.questions.filter((q) => typeof q === 'string');
      showSuggestions();
      status.textContent = 'Review each suggestion before using it.';
    } else {
      state.coach = output.question;
      render();
    }
    save();
  } catch (e) {
    status.textContent =
      (controller.signal.aborted ? 'Request stopped.' : e.message) +
      ' You can finish the worksheet using your own estimates.';
  } finally {
    clearTimeout(timer);
    pending = null;
    $('draft').disabled = $('coach').disabled = false;
  }
}
$('reveal').onclick = () => {
  state.revealed = true;
  render();
  save();
  $('cm3').setAttribute('tabindex', '-1');
  $('cm3').focus();
};
$('draft').onclick = () => request('draft');
$('coach').onclick = () => request('coach');
$('worksheet').onsubmit = (e) => {
  e.preventDefault();
  const r = calculate();
  if (r.missing) {
    $('status').textContent = r.missing;
    return;
  }
  state.revealed = true;
  render();
  save();
  if (e.submitter?.id === 'download')
    download(
      'contribution-margin.md',
      '# Contribution margin worksheet\n\n' + report(r) + '\n',
      'text/markdown',
    );
  else window.print();
};
$('settings').onclick = () => {
  $('endpoint').value = config.endpoint || defaultEndpoint;
  $('apiKey').value = apiKey;
  $('remember').checked = Boolean(config.key);
  $('config').returnValue = 'cancel';
  $('config').showModal();
};
$('config').onclose = () => {
  if ($('config').returnValue !== 'save') return;
  config = { endpoint: $('endpoint').value.trim() || defaultEndpoint };
  apiKey = $('apiKey').value.trim();
  if ($('remember').checked) config.key = apiKey;
  try {
    localStorage.setItem('venture_ai_settings', JSON.stringify(config));
  } catch {
    /* Applies for this tab. */
  }
};
$('reset').onclick = () => {
  if (confirm('Clear this worksheet and start again?')) {
    pending?.abort();
    state = {};
    $('draftStatus').textContent = $('status').textContent = '';
    restore();
  }
};
$('legacyDownload').onclick = () =>
  download('earlier-margin-worksheet.json', JSON.stringify(legacy, null, 2), 'application/json');
restore();
