import { assist, defaultEndpoint, quoteContainsValue } from './assist.mjs?v=2';
import { number } from './math.mjs';

const $ = (id) => document.getElementById(id);
// `label` is what students see on the field; `says` reads naturally inside a sentence.
const labels = {
  price: 'Price the customer pays ($)',
  cost: 'Cost to make and deliver one ($)',
  fee: 'Card or platform fee (%)',
  other: 'Other costs per sale ($)',
};
const says = {
  price: 'the price the customer pays',
  cost: 'the cost to make and deliver one',
  fee: 'the card or platform fee (enter 0 if there isn’t one)',
  other: 'other costs per sale (enter 0 if there aren’t any)',
};
const ids = ['team', 'product', 'description', ...Object.keys(labels), 'reflection', 'evidence'];
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
const share = (value, price) => percent((100 * value) / price);
const node = (tag, text, className) => {
  const el = document.createElement(tag);
  if (text) el.textContent = text;
  if (className) el.className = className;
  return el;
};
function save() {
  try {
    localStorage.setItem(storageKey, JSON.stringify(state));
    $('saved').textContent = 'Saved in this browser';
  } catch {
    $('saved').textContent = 'This browser can’t save your work. Download it to keep a copy.';
  }
}
const newSalesCost = (key) => ({ key, name: '', basis: 'total', spend: '', units: '', perUnit: '' });
function loadSalesCosts() {
  if (state.salesCosts?.length) return;
  state.salesCosts = [
    {
      ...newSalesCost(1),
      name: state.channel ?? $('channel')?.value ?? '',
      spend: state.spend ?? $('spend')?.value ?? '',
      units: state.units ?? $('units')?.value ?? '',
    },
  ];
  delete state.channel;
  delete state.spend;
  delete state.units;
}
const salesName = (row, index) => row.name.trim() || 'Sales cost ' + (index + 1);
function salesFields(row, index) {
  const descriptor = salesName(row, index);
  const fields =
    row.basis === 'perUnit'
      ? [['perUnit', 'Amount per sale ($)', 'the amount you pay per sale for ' + descriptor]]
      : [
          ['spend', 'Total spent ($)', 'how much you spent on ' + descriptor],
          ['units', 'Sales it brought in', 'how many sales ' + descriptor + ' brought in'],
        ];
  return fields.map(([key, label, sentence]) => ({
    id: row.key === 1 ? key : key + '-' + row.key,
    label: descriptor + ' · ' + label,
    inputLabel: label,
    says: sentence,
    kind: key,
    row,
  }));
}
function worksheetFields() {
  return [
    ...Object.entries(labels).map(([id, label]) => ({ id, label, says: says[id], kind: id, row: state })),
    ...state.salesCosts.flatMap(salesFields),
  ];
}
function fieldValue(field) {
  return field.row[field.kind];
}
function checked(field, raw = fieldValue(field)) {
  return number(raw, field.says || field.label, {
    positive: field.kind === 'price' || field.kind === 'units',
    integer: field.kind === 'units',
    max: field.kind === 'fee' ? 100 : Infinity,
  });
}
function checkedBase(id) {
  return checked({ kind: id, label: labels[id], says: says[id], row: state });
}
function resetPractice() {
  state.revealed = false;
  delete state.attempts;
  delete state.practice;
  $('cm3Guess').value = '';
  $('checkResult').textContent = '';
}
function costChanged(id) {
  pending?.abort();
  delete state.coach;
  resetPractice();
  if (state.sources) delete state.sources[id];
  state.suggestions = id ? (state.suggestions || []).filter((suggestion) => suggestion.id !== id) : [];
  if (!id) state.questions = [];
  $('status').textContent = '';
  $('draftStatus').textContent = '';
  showSuggestions();
  render();
  save();
}
function renderSalesCosts() {
  const rows = document.createDocumentFragment();
  state.salesCosts.forEach((row, index) => {
    const group = node('fieldset', '', 'sales-cost');
    group.append(node('legend', 'Sales cost ' + (index + 1)));
    const name = document.createElement('input');
    name.id = row.key === 1 ? 'channel' : 'channel-' + row.key;
    name.value = row.name;
    name.placeholder = index ? 'Sales commission' : 'Campus flyers';
    name.addEventListener('input', () => {
      row.name = name.value;
      costChanged();
    });
    const basis = document.createElement('select');
    basis.append(
      new Option('A total amount, spread over sales', 'total'),
      new Option('A set amount per sale', 'perUnit'),
    );
    basis.value = row.basis;
    basis.addEventListener('change', () => {
      row.basis = basis.value;
      renderSalesCosts();
      $(name.id).closest('fieldset').querySelector('select').focus();
      costChanged();
    });
    const grid = node('div', '', 'grid');
    const label = (text, input) => {
      const wrapper = node('label', text);
      wrapper.append(input);
      return wrapper;
    };
    grid.append(label('What is it?', name), label('How do you pay for it?', basis));
    for (const field of salesFields(row, index)) {
      const input = document.createElement('input');
      input.id = field.id;
      input.type = 'number';
      input.step = field.kind === 'units' ? '1' : 'any';
      input.min = field.kind === 'units' ? '1' : '0';
      input.value = fieldValue(field);
      input.required = field.kind !== 'units';
      input.setAttribute('aria-describedby', 'marketingHelp');
      input.addEventListener('input', () => {
        row[field.kind] = input.value;
        costChanged(field.id);
      });
      grid.append(label(field.inputLabel, input));
    }
    group.append(grid);
    if (state.salesCosts.length > 1) {
      const remove = node('button', 'Remove sales cost ' + (index + 1), 'quiet');
      remove.type = 'button';
      remove.addEventListener('click', () => {
        if (state.sources) {
          for (const key of ['spend', 'units', 'perUnit'])
            delete state.sources[row.key === 1 ? key : key + '-' + row.key];
        }
        state.salesCosts = state.salesCosts.filter((item) => item !== row);
        renderSalesCosts();
        $('addSalesCost').focus();
        costChanged();
      });
      group.append(remove);
    }
    rows.append(group);
  });
  $('salesCosts').replaceChildren(rows);
  $('addSalesCost').disabled = false;
}
$('addSalesCost').onclick = () => {
  const key = Math.max(...state.salesCosts.map((row) => row.key)) + 1;
  state.salesCosts.push(newSalesCost(key));
  renderSalesCosts();
  $('channel-' + key).focus();
  costChanged();
};
function calculate() {
  const result = {};
  // Reveal each rung as its inputs become available, without treating blank costs as zero.
  try {
    const price = checkedBase('price'),
      cost = checkedBase('cost');
    result.price = price;
    result.cost = cost;
    result.cm1 = price - cost;
    result.salesCosts = state.salesCosts.map((row, index) => {
      const [amountField, unitsField] = salesFields(row, index);
      const amount = checked(amountField);
      const units = unitsField && amount > 0 ? checked(unitsField) : null;
      return {
        name: salesName(row, index),
        amount,
        units,
        perUnit: units ? amount / units : amount,
      };
    });
    result.marketing = result.salesCosts.reduce((sum, cost) => sum + cost.perUnit, 0);
    if (!Number.isFinite(result.marketing))
      throw Error('One of the sales costs is too large to calculate. Check the numbers.');
    result.cm2 = result.cm1 - result.marketing;
    result.feeRate = checkedBase('fee');
    const fee = price * (result.feeRate / 100),
      other = checkedBase('other');
    result.fee = fee;
    result.other = other;
    result.cm3 = result.cm2 - fee - other;
  } catch (e) {
    result.missing = e.message;
  }
  return result;
}
const ofPrice = (value, price) => money(value) + ', or ' + share(value, price) + ' of the price';
const cm1Working = (r) => money(r.price) + ' − ' + money(r.cost) + ' = ' + ofPrice(r.cm1, r.price);
const cm2Working = (r) => money(r.cm1) + ' − ' + money(r.marketing) + ' = ' + ofPrice(r.cm2, r.price);
const cm3Working = (r) =>
  money(r.cm2) +
  ' − ' +
  money(r.fee) +
  ' fee − ' +
  money(r.other) +
  ' other costs = ' +
  ofPrice(r.cm3, r.price);
const steps = {
  cm1: 'CM1 · after making and delivering',
  cm2: 'CM2 · after winning the sale',
  cm3: 'CM3 · after fees and other costs',
};
function ladderRows(r) {
  return [
    ['Price', money(r.price), '100%'],
    [steps.cm1, money(r.cm1), share(r.cm1, r.price)],
    [steps.cm2, money(r.cm2), share(r.cm2, r.price)],
    [steps.cm3, money(r.cm3), share(r.cm3, r.price)],
  ];
}
function table(rows) {
  const t = document.createElement('table');
  const tr = t.createTHead().insertRow();
  for (const h of ['Step', 'Per sale', 'Share of price']) {
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
function waterfallRows(r) {
  return [
    ['Price', 0, r.price],
    ['Make and deliver', r.price, r.cm1],
    ['Win the sale', r.cm1, r.cm2],
    ['Fees and other', r.cm2, r.cm3],
    ['What you keep', 0, r.cm3],
  ];
}
function waterfall(r, target) {
  target.replaceChildren();
  const min = Math.min(0, r.cm3, r.cm2, r.cm1),
    span = r.price - min;
  for (const [label, start, end] of waterfallRows(r)) {
    const row = node('div', '', 'waterrow');
    const track = node('span', '', 'track');
    const bar = node('i', '', end < start ? 'cost' : label === 'Price' ? 'price' : 'kept');
    track.style.setProperty('--zero', (-min / span) * 100 + '%');
    bar.style.left = (100 * (Math.min(start, end) - min)) / span + '%';
    bar.style.width = (100 * Math.abs(end - start)) / span + '%';
    track.append(bar);
    row.append(node('span', label), track, node('span', money(end - start)));
    target.append(row);
  }
}
function interpretation(r) {
  const cents = Math.round(Math.abs(r.cm3) * 100);
  if (cents === 0) return 'Each sale just breaks even after the costs you entered.';
  if (r.cm3 < 0)
    return (
      'Each sale loses ' +
      money(-r.cm3) +
      ' after the costs you entered. Selling more would make the loss bigger, not smaller.'
    );
  return (
    'After every cost you entered, you keep ' +
    money(r.cm3) +
    ' of each ' +
    money(r.price) +
    ' sale (' +
    share(r.cm3, r.price) +
    ').'
  );
}
function practicePrompt(r) {
  return (
    'Start from CM2, ' +
    money(r.cm2) +
    '. Take away the ' +
    percent(r.feeRate) +
    ' fee on the ' +
    money(r.price) +
    ' price and ' +
    money(r.other) +
    ' in other costs. How much of each sale is left?'
  );
}
function render() {
  const r = calculate();
  const done = r.cm3 !== undefined;
  for (const row of state.salesCosts) {
    const input = $(row.key === 1 ? 'units' : 'units-' + row.key);
    if (input) input.required = Number(row.spend) > 0;
  }
  $('cm1').textContent = r.cm1 === undefined ? '' : 'CM1 · ' + cm1Working(r);
  const working = $('salesCostWorking');
  working.replaceChildren();
  working.hidden = r.cm2 === undefined;
  if (r.cm2 !== undefined) {
    const list = node('ul');
    for (const cost of r.salesCosts) list.append(node('li', formatSalesCost(cost)));
    working.append(list, node('p', 'Total cost to win one sale: ' + money(r.marketing) + '.'));
  }
  $('cm2').textContent = r.cm2 === undefined ? '' : 'CM2 · ' + cm2Working(r);
  $('practice').hidden = !done || Boolean(state.revealed);
  $('practicePrompt').textContent = done ? practicePrompt(r) : '';
  const lead = state.practice === 'right' ? 'Right. ' : state.practice === 'shown' ? 'Here’s the working. ' : '';
  $('cm3').textContent = done && state.revealed ? lead + 'CM3 · ' + cm3Working(r) : '';
  $('results').hidden = !done || !state.revealed;
  if (done) {
    waterfall(r, $('waterfall'));
    $('ladderTable').replaceChildren(table(ladderRows(r)));
    $('interpretation').textContent = interpretation(r);
  }
  $('feedback').textContent = state.coach || '';
  $('printout').replaceChildren();
  if (done) $('printout').append(printSheet(r));
}
function formatSalesCost(cost) {
  const amount = cost.units ? money(cost.amount) + ' ÷ ' + cost.units + ' sales = ' : '';
  return cost.name + ': ' + amount + money(cost.perUnit) + ' per sale';
}
function sourceNotes() {
  return worksheetFields()
    .filter((field) => state.sources?.[field.id])
    .map((field) => field.label + ': ' + state.sources[field.id]);
}
function report(r) {
  const lines = ['# The contribution margin ladder', ''];
  if (state.team?.trim()) lines.push('**Team:** ' + state.team.trim());
  lines.push('**One sale:** ' + (state.product?.trim() || 'Not described yet'), '');
  lines.push(
    '## 1 · One sale',
    '- Price the customer pays: ' + money(r.price),
    '- Cost to make and deliver one: ' + money(r.cost),
    '- **CM1:** ' + cm1Working(r),
    '',
    '## 2 · What it costs to win the sale',
    ...r.salesCosts.map((cost) => '- ' + formatSalesCost(cost)),
    '- Total cost to win one sale: ' + money(r.marketing),
    '- **CM2:** ' + cm2Working(r),
    '',
    '## 3 · Fees and everything else',
    '- Card or platform fee: ' + percent(r.feeRate) + ' of ' + money(r.price) + ' = ' + money(r.fee),
    '- Other costs per sale: ' + money(r.other),
    '- **CM3:** ' + cm3Working(r),
    '',
    interpretation(r),
    '',
    '## 4 · What we learned',
    '### Which cost would you go after first, and why?',
    state.reflection?.trim() || '_Not answered yet._',
    '',
    '### Where did your numbers come from?',
    state.evidence?.trim() || '_Not answered yet._',
  );
  const notes = sourceNotes();
  if (notes.length) lines.push('', '### Numbers suggested by the AI', ...notes.map((n) => '- ' + n));
  if (state.description?.trim()) lines.push('', '### What we told the AI', state.description.trim());
  if (state.coach) lines.push('', '### A question from the AI coach', state.coach);
  return lines.join('\n');
}

// The printout follows the course's Letter exercise sheets: kicker, title, name boxes,
// then numbered boxes with black headers and the result box in EWU red.
function sheetBox(number, title, hint, ...content) {
  const box = node('section', '', 'sh-box');
  const head = node('div', '', 'sh-boxhead');
  head.append(node('span', number + ' · ' + title), node('span', hint, 'sh-hint'));
  const body = node('div', '', 'sh-body');
  body.append(...content);
  box.append(head, body);
  return box;
}
function sheetRows(rows) {
  const list = node('dl', '', 'sh-rows');
  for (const [term, value, total, note] of rows) {
    const row = node('div', '', total ? 'sh-total' : '');
    const dt = node('dt', term);
    if (note) dt.append(node('small', note));
    row.append(dt, node('dd', value));
    list.append(row);
  }
  return list;
}
function answerOrLines(text, lines = 4) {
  if (text?.trim()) return node('p', text.trim(), 'sh-answer');
  const blank = node('div', '', 'sh-lines');
  for (let i = 0; i < lines; i++) blank.append(node('span'));
  return blank;
}
function printSheet(r) {
  const sheet = node('div', '', 'sheet');
  const head = node('header', '', 'sh-head');
  const titles = node('div');
  titles.append(
    node('p', 'ENTP 311 · Engines of growth · Contribution margin', 'sh-kicker'),
    node('h1', 'The contribution margin ladder', 'sh-title'),
  );
  const meta = node('p', '', 'sh-meta');
  meta.append(
    node('span', 'EWU · Launching the venture'),
    document.createElement('br'),
    node('span', 'Group exercise · slides 21–28'),
  );
  head.append(titles, meta);
  const ids = node('div', '', 'sh-ids');
  const today = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(new Date());
  for (const [label, value, cls] of [
    ['Team', state.team?.trim(), 'wide'],
    ['One sale', state.product?.trim(), 'wide'],
    ['Date', today, ''],
  ]) {
    const box = node('div', '', 'sh-id ' + cls);
    box.append(node('span', label), node('strong', value || ''));
    ids.append(box);
  }
  const salesRows = r.salesCosts.map((cost) => [
    cost.name,
    '− ' + money(cost.perUnit),
    false,
    cost.units ? money(cost.amount) + ' ÷ ' + cost.units + ' sales' : 'per sale',
  ]);
  if (r.salesCosts.length > 1) salesRows.push(['Total to win one sale', '− ' + money(r.marketing)]);
  const ladder = node('div', '', 'sh-ladder');
  const bars = node('div', '', 'sh-waterfall');
  waterfall(r, bars);
  const short = ladderRows(r).map(([step, ...rest]) => [step.split(' · ')[0], ...rest]);
  ladder.append(bars, table(short));
  const learned = [answerOrLines(state.evidence)];
  const notes = sourceNotes();
  if (notes.length) {
    const list = node('ul', '', 'sh-notes');
    for (const note of notes) list.append(node('li', note));
    learned.push(node('p', 'Numbers suggested by the AI', 'sh-sub'), list);
  }
  const grid = node('div', '', 'sh-grid');
  grid.append(
    sheetBox(
      1,
      'One sale',
      'Price and the cost to make it',
      sheetRows([
        ['Price the customer pays', money(r.price)],
        ['Make and deliver one', '− ' + money(r.cost)],
        ['CM1', money(r.cm1) + ' · ' + share(r.cm1, r.price), true],
      ]),
    ),
    sheetBox(
      2,
      'Winning the sale',
      'Spread over the sales it brings in',
      sheetRows([...salesRows, ['CM2', money(r.cm2) + ' · ' + share(r.cm2, r.price), true]]),
    ),
    sheetBox(
      3,
      'Fees and the rest',
      'Card fees and a share of overhead',
      sheetRows([
        ['Fee: ' + percent(r.feeRate) + ' of ' + money(r.price), '− ' + money(r.fee)],
        ['Other costs per sale', '− ' + money(r.other)],
        ['CM3', money(r.cm3) + ' · ' + share(r.cm3, r.price), true],
      ]),
    ),
    sheetBox(
      4,
      'The cost we’d go after first',
      'And why that one',
      answerOrLines(state.reflection),
    ),
  );
  const result = sheetBox(5, 'Your ladder', 'Per sale and as a share of the price', ladder, node('p', interpretation(r), 'sh-verdict'));
  result.classList.add('sh-result');
  const sources = sheetBox(6, 'Where our numbers came from', 'Quotes, prices, sales records or guesses to check', ...learned);
  sources.classList.add('sh-span');
  grid.append(result, sources);
  if (state.coach) {
    const coach = sheetBox(7, 'A question from the AI coach', 'Talk it through as a group', node('p', state.coach, 'sh-answer'));
    coach.classList.add('sh-span');
    grid.append(coach);
  }
  sheet.append(head, ids, grid);
  return sheet;
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
  loadSalesCosts();
  renderSalesCosts();
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
    if (Object.hasOwn(labels, id)) resetPractice();
    if (state.sources) delete state.sources[id];
    if (!['team', 'reflection', 'evidence'].includes(id)) {
      state.suggestions = [];
      state.questions = [];
      showSuggestions();
    }
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
    const field = worksheetFields().find(({ id }) => id === p.id);
    if (!field || fieldValue(field)) continue;
    const item = node('div', '', 'ai-card');
    const label = node('label', field.label),
      input = document.createElement('input');
    input.type = 'number';
    input.step = field.kind === 'units' ? '1' : 'any';
    input.value = p.value;
    label.append(input);
    const accept = node('button', 'Use this estimate');
    accept.type = 'button';
    accept.onclick = () => {
      try {
        checked(field, input.value);
      } catch (e) {
        $('draftStatus').textContent = e.message;
        return;
      }
      if (fieldValue(field)) return;
      const edited = input.value !== p.value;
      field.row[field.kind] = input.value;
      $(p.id).value = input.value;
      resetPractice();
      state.sources ||= {};
      state.sources[p.id] =
        (edited
          ? 'Edited AI suggestion. '
          : p.origin === 'stated'
            ? 'From your notes. '
            : 'AI estimate. ') + p.rationale;
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
        (p.origin === 'stated' ? 'From your notes: “' + p.quote + '”. ' : 'AI estimate: ') + p.rationale,
      ),
      accept,
    );
    panel.append(item);
  }
}
function validSuggestions(output, fields) {
  const seen = new Set();
  return output.suggestions.filter((suggestion) => {
    const field = fields.find(({ id }) => id === suggestion?.id);
    if (
      !field ||
      fieldValue(field) ||
      seen.has(suggestion.id) ||
      !['estimate', 'stated'].includes(suggestion.origin) ||
      typeof suggestion.rationale !== 'string'
    )
      return false;
    if (suggestion.origin === 'stated') {
      const sourceText = [state.description, state.product, ...state.salesCosts.map((row) => row.name)];
      if (
        !suggestion.quote ||
        !quoteContainsValue(suggestion.quote, suggestion.value) ||
        !sourceText.some((text) => text?.includes(suggestion.quote))
      )
        return false;
    }
    try {
      checked(field, suggestion.value);
    } catch {
      return false;
    }
    seen.add(suggestion.id);
    return true;
  });
}
async function requestEstimates(input, eligible, settings, signal, status) {
  const ask = (fields) =>
    assist(
      'margin_draft',
      {
        ...input,
        eligible: fields.map(({ id, label }) => ({ id, label })),
      },
      settings,
      signal,
    );
  const draft = await ask(eligible);
  const suggestions = validSuggestions(draft, eligible);
  const questions = draft.questions.filter((question) => typeof question === 'string');
  const missingCore = eligible.filter(
    (field) =>
      ['cost', 'price'].includes(field.id) &&
      !suggestions.some((suggestion) => suggestion.id === field.id),
  );
  let retryFailed = false;
  if (missingCore.length && !signal.aborted) {
    status.textContent =
      'Still looking for a starting ' +
      (missingCore.length === 2 ? 'price and cost…' : missingCore[0].id === 'price' ? 'price…' : 'cost…');
    try {
      const followUp = await ask(missingCore);
      suggestions.push(...validSuggestions(followUp, missingCore));
      questions.push(...followUp.questions.filter((question) => typeof question === 'string'));
    } catch (error) {
      if (!suggestions.length) throw error;
      retryFailed = true;
    }
  }
  return { suggestions, questions: [...new Set(questions)].slice(0, 3), retryFailed };
}
async function request(mode) {
  if (pending) return;
  const status = mode === 'draft' ? $('draftStatus') : $('feedback'),
    r = calculate();
  if (!state.product?.trim() && (mode !== 'draft' || !state.description?.trim())) {
    status.textContent = 'First, say what one sale looks like.';
    $('product').focus();
    return;
  }
  if (mode === 'coach' && (r.missing || !state.reflection?.trim())) {
    status.textContent = r.missing || 'First, write a sentence about the cost you’d go after.';
    return;
  }
  const fields = worksheetFields();
  const eligible = fields.filter(
    (field) =>
      !fieldValue(field) &&
      (field.row === state ||
        field.row.name.trim() ||
        field.row.spend !== '' ||
        field.row.perUnit !== '') &&
      !(field.kind === 'units' && field.row.spend !== '' && Number(field.row.spend) === 0),
  );
  if (mode === 'draft' && !eligible.length) {
    status.textContent = state.salesCosts.some(
      (row) => !row.name.trim() && row.spend === '' && row.perUnit === '',
    )
      ? 'Name the sales cost first, or type its amount yourself.'
      : 'Every number is already filled in.';
    return;
  }
  const controller = new AbortController();
  pending = controller;
  const timer = setTimeout(() => controller.abort(), 60000);
  $('draft').disabled = $('coach').disabled = true;
  status.textContent = 'Asking the AI…';
  const input = {
    assignment:
      'Contribution margin ladder for one sale. Use one selling price. Follow CM1 after production, CM2 after marketing, CM3 after fees and overhead.',
    product: state.product,
    notes: state.description || '',
    salesCosts: state.salesCosts
      .filter((row) => row.name.trim())
      .map(({ name, basis }) => ({ name, basis })),
    figures: fields
      .filter((field) => fieldValue(field))
      .map((field) => ({ id: field.id, label: field.label, value: fieldValue(field) })),
  };
  const settings = { endpoint: config.endpoint || defaultEndpoint, key: apiKey };
  try {
    if (mode === 'draft') {
      const result = await requestEstimates(input, eligible, settings, controller.signal, status);
      if (controller.signal.aborted) return;
      state.suggestions = result.suggestions;
      state.questions = result.questions;
      showSuggestions();
      status.textContent = result.suggestions.length
        ? 'Check each suggestion before you use it.' +
          (result.retryFailed ? ' Some numbers didn’t come through. Try again for the rest.' : '')
        : 'The AI didn’t have enough to go on and had no figures to suggest. Add what you know about the product, your market or your sales costs, then try again.';
    } else {
      const output = await assist(mode, { ...input, worksheet: report(r) }, settings, controller.signal);
      if (controller.signal.aborted) return;
      state.coach = output.question;
      render();
    }
    save();
  } catch (e) {
    status.textContent =
      (controller.signal.aborted ? 'The AI took too long to answer.' : e.message) +
      ' You can still finish with your own estimates.';
  } finally {
    clearTimeout(timer);
    pending = null;
    $('draft').disabled = $('coach').disabled = false;
  }
}
// Hints name the most likely slip; after two misses the working is shown.
function practiceHint(guess, r) {
  const near = (value) => Math.abs(guess - value) < 0.006;
  const rate = r.feeRate / 100;
  if (near(r.cm2 - r.cm2 * rate - r.other))
    return 'Close. The fee is ' + percent(r.feeRate) + ' of the price (' + money(r.price) + '), not of CM2.';
  if (r.feeRate && near(r.cm2 - r.feeRate - r.other))
    return 'The fee is a percentage. Work out ' + percent(r.feeRate) + ' of ' + money(r.price) + ' first.';
  if (r.other && near(r.cm2 - r.fee)) return 'You took off the fee. Now take away the other costs too.';
  if (r.fee && near(r.cm2 - r.other)) return 'You took off the other costs. Now take away the fee too.';
  return 'Not quite. Start from CM2 and take away the fee and the other costs.';
}
function revealCm3(how) {
  state.revealed = true;
  state.practice = how;
  render();
  save();
  $('cm3').setAttribute('tabindex', '-1');
  $('cm3').focus();
}
$('check').onclick = () => {
  const r = calculate();
  if (r.missing) return;
  const raw = $('cm3Guess').value.trim();
  const guess = Number(raw);
  if (!raw || !Number.isFinite(guess)) {
    $('checkResult').textContent = 'Type your answer in dollars first.';
    $('cm3Guess').focus();
    return;
  }
  if (Math.abs(guess - r.cm3) < 0.006) return revealCm3('right');
  state.attempts = (state.attempts || 0) + 1;
  save();
  if (state.attempts >= 2) return revealCm3('shown');
  $('checkResult').textContent = practiceHint(guess, r) + ' Try once more.';
};
$('reveal').onclick = () => revealCm3('shown');
$('draft').onclick = () => request('draft');
$('coach').onclick = () => request('coach');
$('worksheet').onsubmit = (e) => {
  e.preventDefault();
  const r = calculate();
  if (r.missing) {
    $('status').textContent = r.missing;
    return;
  }
  if (!state.revealed) state.practice = 'shown';
  state.revealed = true;
  render();
  save();
  if (e.submitter?.id === 'download')
    download('contribution-margin-ladder.md', report(r) + '\n', 'text/markdown');
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
  if (confirm('Clear everything on this worksheet and start over?')) {
    pending?.abort();
    state = { salesCosts: [newSalesCost(1)] };
    $('draftStatus').textContent = $('status').textContent = '';
    resetPractice();
    restore();
  }
};
$('legacyDownload').onclick = () =>
  download('earlier-margin-worksheet.json', JSON.stringify(legacy, null, 2), 'application/json');
restore();
