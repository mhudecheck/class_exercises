import { assist, defaultEndpoint } from './assist.mjs?v=3';
import { dealTerms, vcMethod, revenueForShare, preForShare } from './math.mjs?v=2';

const $ = (id) => document.getElementById(id);
const storageKey = 'venture_funding_v2';
const defaults = { years: '5', multiple: '2', rate: '60' };
const textIds = [
  'team',
  'company',
  'milestone',
  'ask',
  'pre',
  'postGuess',
  'shareGuess',
  'revenue',
  'years',
  'multiple',
  'rate',
  'fair',
  'cInvestment',
  'cShare',
  'cPre',
  'message',
  'decision',
  'next',
];
const read = (key) => {
  try {
    return JSON.parse(localStorage.getItem(key));
  } catch {
    return null;
  }
};
let state = {
    ...defaults,
    status: 'practice',
    basis: 'share',
    turns: [],
    ...(read(storageKey) || {}),
  },
  config = read('venture_ai_settings') || {},
  apiKey = config.key || '',
  pending = null;
const legacy = read('venture_decision_v1_funding');

const money = (n) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: Math.abs(n) >= 1000 ? 0 : 2,
  }).format(n);
const pct = (n) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(n) + '%';
const plain = (n) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(n);
const node = (tag, text, className) => {
  const el = document.createElement(tag);
  if (text) el.textContent = text;
  if (className) el.className = className;
  return el;
};
const attempt = (fn) => {
  try {
    return fn();
  } catch (error) {
    return { error: error.message };
  }
};
function save() {
  try {
    localStorage.setItem(storageKey, JSON.stringify(state));
    $('saved').textContent = 'Saved in this browser';
  } catch {
    $('saved').textContent = 'This browser can’t save your work. Download it to keep a copy.';
  }
}

// Every number on the page comes from these three calculations.
const offer = () =>
  attempt(() => dealTerms({ investment: state.ask, basis: 'valuation', pre: state.pre }));
const vcFor = (investment) =>
  attempt(() =>
    vcMethod({
      investment,
      revenue: state.revenue,
      multiple: state.multiple,
      years: state.years,
      rate: state.rate,
    }),
  );
const ours = () =>
  attempt(() =>
    dealTerms({
      investment: state.cInvestment,
      basis: state.basis,
      share: state.cShare,
      pre: state.cPre,
    }),
  );
const lastCounter = () => state.turns.findLast((turn) => turn.counter)?.counter || null;
function finalTerms() {
  if (state.outcome === 'test') return offer();
  if (state.outcome === 'ours') return ours();
  if (state.outcome === 'investor')
    return lastCounter() || { error: 'The investor hasn’t countered.' };
  return null;
}
const termsText = (t) => pct(t.share) + ' for ' + money(t.investment);
// Fingerprints of the numbers that earlier work relied on, to flag it when they change.
// Investor replies depend on the test offer and the forecast; revising your own terms
// between replies is the point of negotiating. The decision depends on everything.
function signature(withTerms = true) {
  const o = offer(),
    c = ours(),
    v = vcFor(state.ask);
  return JSON.stringify([
    o.error || [o.pre, o.investment].map(Math.round),
    v.error || [Math.round(v.exit), v.needed && +v.needed.toFixed(2)],
    withTerms ? c.error || [Math.round(c.investment), +c.share.toFixed(2)] : null,
  ]);
}

function setTag(id) {
  const tag = $(id + 'Tag');
  const isDefault = Number(state[id]) === Number(defaults[id]) && String(state[id]).trim() !== '';
  tag.textContent = isDefault ? 'Course default' : 'Your number';
  tag.classList.toggle('mine', !isDefault);
}

function render() {
  const o = offer();
  const v = o.error ? o : vcFor(o.investment);
  for (const id of ['years', 'multiple', 'rate']) setTag(id);

  // Step 2: the group works out post-money and the investor's share.
  $('offerPractice').hidden = Boolean(o.error || state.offerShown);
  $('offerRung').textContent =
    !o.error && state.offerShown
      ? (state.offerShown === 'right' ? 'Right. ' : 'Here’s the working. ') +
        'Post-money: ' +
        money(o.pre) +
        ' + ' +
        money(o.investment) +
        ' = ' +
        money(o.post) +
        '. Investor’s share: ' +
        money(o.investment) +
        ' ÷ ' +
        money(o.post) +
        ' = ' +
        pct(o.share) +
        '.'
      : '';

  // Step 3: predict, then see the venture capital method worked through.
  const ready = !o.error && state.offerShown;
  $('needPredict').hidden = !ready || state.needShown;
  $('showNeed').disabled = Boolean(v.error);
  if (ready && !state.needShown && v.error) $('needResult').textContent = v.error;
  else if ($('needResult').textContent.startsWith('Enter')) $('needResult').textContent = '';
  if (ready) {
    $('predictQuestion').textContent =
      'Will the investor need more or less than the ' + pct(o.share) + ' they’re offered?';
  }
  const working = $('needWorking');
  working.replaceChildren();
  working.hidden = !state.needShown;
  if (state.needShown) {
    if (v.error) working.append(node('p', v.error));
    else {
      if (state.predictionResult) working.append(node('p', state.predictionResult, 'verdict'));
      const list = node('ul');
      list.append(
        node(
          'li',
          'Exit value: ' +
            money(Number(state.revenue)) +
            ' × ' +
            plain(Number(state.multiple)) +
            ' = ' +
            money(v.exit),
        ),
        node(
          'li',
          'Value today: ' +
            money(v.exit) +
            ' ÷ (1 + ' +
            pct(Number(state.rate)) +
            ')^' +
            plain(Number(state.years)) +
            ' = ' +
            money(v.exit) +
            ' ÷ ' +
            plain(v.factor) +
            ' = ' +
            money(v.today),
        ),
        node(
          'li',
          v.needed === null
            ? 'Share the investor needs: none would do. The company would be worth nothing at the sale.'
            : 'Share the investor needs: ' +
                money(o.investment) +
                ' ÷ ' +
                money(v.today) +
                ' = ' +
                pct(v.needed),
        ),
      );
      working.append(list);
    }
  }

  // Steps 4 to 6 stay open once reached, even while an input is being corrected.
  for (const id of ['gapPanel', 'negotiatePanel', 'decidePanel']) $(id).hidden = !state.needShown;
  if (state.needShown) {
    renderGap(o, v);
    renderTerms();
    renderTurns();
    renderOutcomes();
  }
  renderPrint();
}

function renderGap(o, v) {
  const bars = $('gapBars'),
    options = $('gapOptions');
  bars.replaceChildren();
  options.replaceChildren();
  if (o.error || v.error) {
    $('gapLead').textContent =
      (o.error || v.error) + ' The comparison updates when it’s filled in.';
    return;
  }
  bars.append(...gapBars(o.share, v.needed));
  const assumptions = {
    investment: o.investment,
    multiple: state.multiple,
    years: state.years,
    rate: state.rate,
  };
  const revenueNeeded = revenueForShare(o.share, assumptions);
  const forecast = Number(state.revenue);
  const add = (text) => options.append(node('li', text));
  if (v.needed === null || v.needed > 100) {
    $('gapLead').textContent =
      'Even owning the whole company would not give the investor a ' +
      pct(Number(state.rate)) +
      ' return under your forecast. The forecast has to grow before any deal can work.';
    add(
      'For the offered ' +
        pct(o.share) +
        ' to work, revenue in the exit year would need to be ' +
        money(revenueNeeded) +
        '.',
    );
  } else if (v.needed - o.share > 0.05) {
    $('gapLead').textContent =
      'The investor is offered ' +
      pct(o.share) +
      ' but needs ' +
      pct(v.needed) +
      '. For ' +
      pct(o.share) +
      ' to be fair, one of these has to be true:';
    add(
      'Revenue of ' +
        money(revenueNeeded) +
        ' in the exit year instead of your ' +
        money(forecast) +
        '. That’s ' +
        plain(revenueNeeded / forecast) +
        ' times your forecast.',
    );
    add(
      'A pre-money valuation of ' +
        money(preForShare(v.needed, o.investment)) +
        ' instead of ' +
        money(o.pre) +
        ', so the investor gets ' +
        pct(v.needed) +
        '.',
    );
    const settles = ((v.exit / o.post) ** (1 / Number(state.years)) - 1) * 100;
    if (Number.isFinite(settles) && settles >= 0)
      add(
        'The investor settles for about ' +
          pct(settles) +
          ' a year instead of ' +
          pct(Number(state.rate)) +
          '.',
      );
  } else {
    $('gapLead').textContent =
      'The offer already gives the investor their return. You may be giving away more than you need to.';
    add(
      'Your forecast could fall to ' +
        money(revenueNeeded) +
        ' in the exit year and ' +
        pct(o.share) +
        ' would still meet the investor’s return.',
    );
    const pre = preForShare(v.needed, o.investment);
    if (pre !== null)
      add(
        'You could ask for a pre-money valuation of up to ' +
          money(pre) +
          ', giving the investor ' +
          pct(v.needed) +
          '.',
      );
  }
}
function gapBars(offered, needed) {
  return [
    ['Offered to the investor', offered, 'offered'],
    ['Needed for their return', needed, 'needed'],
  ].map(([label, value, cls]) => {
    const row = node('div', '', 'gap-row ' + cls);
    const track = node('span', '', 'gap-track');
    const bar = node('i');
    bar.style.width = Math.min(100, value ?? 100) + '%';
    track.append(bar);
    row.append(
      node('span', label),
      track,
      node('strong', value === null ? 'Not possible' : value > 100 ? 'Over 100%' : pct(value)),
    );
    return row;
  });
}

function renderTerms() {
  $('cShareLabel').hidden = state.basis !== 'share';
  $('cPreLabel').hidden = state.basis !== 'valuation';
  const c = ours();
  if (c.error) {
    $('termsRung').textContent = c.error;
    return;
  }
  const v = vcFor(c.investment);
  $('termsRung').textContent =
    'The investor would own ' +
    termsText(c) +
    '. Pre-money ' +
    money(c.pre) +
    ', post-money ' +
    money(c.post) +
    '.' +
    (v.error || v.needed === null ? '' : ' Under your forecast they need ' + pct(v.needed) + '.');
}

const stances = {
  accept: 'Accepts your terms',
  counter: 'Counteroffer',
  wait: 'Waiting for evidence',
};
function renderTurns() {
  const list = $('turns'),
    now = signature(false);
  list.replaceChildren();
  state.turns.forEach((turn, i) => {
    const item = node('li', '', 'turn ' + turn.stance);
    item.append(
      node('p', 'You: ' + turn.founder, 'founder'),
      node('p', 'Your terms: ' + turn.terms, 'small'),
    );
    const reply = node('div', '', 'investor');
    reply.append(
      node(
        'p',
        stances[turn.stance] +
          (turn.counter
            ? ': ' + termsText(turn.counter) + ' (pre-money ' + money(turn.counter.pre) + ')'
            : ''),
        'stance',
      ),
      node('p', turn.message),
    );
    if (turn.evidence) reply.append(node('p', 'Evidence they want: ' + turn.evidence, 'small'));
    if (turn.counter) {
      const use = node('button', 'Use these terms', 'quiet');
      use.type = 'button';
      use.onclick = () => {
        state.basis = 'share';
        state.cInvestment = String(turn.counter.investment);
        state.cShare = String(+turn.counter.share.toFixed(4));
        state.cPre = String(Math.round(turn.counter.pre));
        restoreInputs();
        changed();
        $('cShare').focus();
      };
      reply.append(use);
    }
    item.append(reply);
    if (turn.key !== now)
      item.append(node('p', 'Your terms or forecast have changed since this reply.', 'flag'));
    item.setAttribute('aria-label', 'Exchange ' + (i + 1));
    list.append(item);
  });
  const full = state.turns.length >= 3;
  $('composer').hidden = full;
  if (full && !$('investorStatus').textContent)
    $('investorStatus').textContent =
      'That’s three replies. Use the conversation to decide what you would sign.';
}

function renderOutcomes() {
  const box = $('outcomes'),
    legend = box.querySelector('legend');
  const o = offer(),
    c = ours(),
    counter = lastCounter();
  const choices = [
    ['test', 'Take the test offer' + (o.error ? '' : ': ' + termsText(o))],
    ['ours', 'Propose our terms' + (c.error ? '' : ': ' + termsText(c))],
    ...(counter ? [['investor', 'Accept the investor’s counteroffer: ' + termsText(counter)]] : []),
    ['walk', 'Walk away'],
  ];
  if (state.outcome === 'investor' && !counter) delete state.outcome;
  box.replaceChildren(legend);
  for (const [value, text] of choices) {
    const label = node('label', '', 'check');
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = 'outcome';
    input.value = value;
    input.checked = state.outcome === value;
    input.onchange = () => {
      state.outcome = value;
      changed();
    };
    label.append(input, ' ' + text);
    box.append(label);
  }
  const t = finalTerms();
  const rung = $('finalRung');
  if (!state.outcome) rung.textContent = '';
  else if (t === null)
    rung.textContent =
      'No deal. You keep the whole company and look for other ways to fund the milestone.';
  else if (t.error) rung.textContent = t.error;
  else {
    const v = vcFor(t.investment);
    rung.textContent =
      'You would sign: the investor owns ' +
      termsText(t) +
      ', at a pre-money valuation of ' +
      money(t.pre) +
      (v.error || v.needed === null
        ? '.'
        : '. Under your forecast they need ' + pct(v.needed) + '.');
  }
  const flag = $('decisionFlag');
  flag.hidden = !(
    state.decision?.trim() &&
    state.decisionKey &&
    state.decisionKey !== signature() + state.outcome
  );
  flag.textContent =
    'Your terms or forecast changed after you wrote this. Reread it before you print.';
}

// Calculation practice only resets while the group is still on step 2.
function changed(id) {
  if (['ask', 'pre'].includes(id) && !state.needShown && state.offerShown) {
    state.offerShown = null;
    state.offerAttempts = 0;
  }
  if (id === 'decision') state.decisionKey = signature() + state.outcome;
  $('status').textContent = '';
  render();
  save();
}
function restoreInputs() {
  for (const id of textIds) $(id).value = state[id] ?? '';
  for (const name of ['status', 'prediction', 'basis'])
    for (const input of document.querySelectorAll('input[name="' + name + '"]'))
      input.checked = input.value === state[name];
}
for (const id of textIds)
  $(id).addEventListener('input', () => {
    state[id] = $(id).value;
    changed(id);
  });
for (const name of ['status', 'prediction', 'basis'])
  for (const input of document.querySelectorAll('input[name="' + name + '"]'))
    input.addEventListener('change', () => {
      state[name] = input.value;
      if (name === 'basis') {
        // Carry the current terms across so switching never changes the deal.
        const c = attempt(() =>
          dealTerms({
            investment: state.cInvestment,
            basis: input.value === 'share' ? 'valuation' : 'share',
            share: state.cShare,
            pre: state.cPre,
          }),
        );
        if (!c.error) {
          state.cShare = String(+c.share.toFixed(4));
          state.cPre = String(Math.round(c.pre));
          restoreInputs();
        }
      }
      changed();
    });

// Hints name the most likely slip; after two misses the working is shown.
$('checkOffer').onclick = () => {
  const o = offer();
  if (o.error) return;
  const post = Number(state.postGuess),
    share = Number(state.shareGuess);
  if (!String(state.postGuess ?? '').trim() || !String(state.shareGuess ?? '').trim()) {
    $('offerResult').textContent = 'Fill in both answers first.';
    return;
  }
  const postRight = Math.abs(post - o.post) <= Math.max(1, o.post * 0.005);
  const shareRight = Math.abs(share - o.share) <= 0.06;
  if (postRight && shareRight) return showOffer('right');
  state.offerAttempts = (state.offerAttempts || 0) + 1;
  if (state.offerAttempts >= 2) return showOffer('shown');
  let hint = 'Not quite.';
  if (!postRight)
    hint =
      Math.abs(post - o.pre) < 1
        ? 'Post-money adds the investment to the pre-money valuation.'
        : 'Check the post-money: pre-money plus the investment.';
  else if (Math.abs(share - (100 * o.investment) / o.pre) < 0.06)
    hint = 'Divide the investment by the post-money valuation, not the pre-money.';
  else if (Math.abs(share * 100 - o.share) < 0.06)
    hint = 'Enter the share as a percentage, like 20 for 20%.';
  else hint = 'The post-money is right. Now divide the investment by it.';
  $('offerResult').textContent = hint + ' Try once more.';
  save();
};
function showOffer(how) {
  state.offerShown = how;
  $('offerResult').textContent = '';
  render();
  save();
  $('offerRung').setAttribute('tabindex', '-1');
  $('offerRung').focus();
}
$('showOffer').onclick = () => showOffer('shown');
$('showNeed').onclick = () => {
  const o = offer(),
    v = vcFor(o.investment);
  if (v.error) return;
  if (!state.prediction) {
    $('needResult').textContent = 'Pick an answer first. A guess is fine.';
    return;
  }
  const actual =
    v.needed === null || v.needed - o.share > 1 ? 'more' : o.share - v.needed > 1 ? 'less' : 'same';
  const words = { more: 'more', less: 'less', same: 'about the same' };
  state.predictionResult =
    (state.prediction === actual
      ? 'You predicted ' + words[actual] + ', and you were right.'
      : 'You predicted ' + words[state.prediction] + '. Not this time.') +
    ' The investor needs ' +
    (v.needed === null || v.needed > 100 ? 'more than the whole company' : pct(v.needed)) +
    ' and is offered ' +
    pct(o.share) +
    '.';
  state.needShown = true;
  if (!state.cInvestment) state.cInvestment = String(o.investment);
  if (!state.cShare) state.cShare = String(+o.share.toFixed(4));
  if (!state.cPre) state.cPre = String(Math.round(o.pre));
  restoreInputs();
  render();
  save();
  $('needWorking').setAttribute('tabindex', '-1');
  $('needWorking').focus();
};

async function askInvestor() {
  if (pending) return;
  const status = $('investorStatus');
  const o = offer(),
    c = ours(),
    v = c.error ? c : vcFor(c.investment);
  if (!state.message?.trim()) {
    status.textContent = 'Write your message to the investor first.';
    $('message').focus();
    return;
  }
  if (o.error || c.error || v.error) {
    status.textContent = o.error || c.error || v.error;
    return;
  }
  const payload = {
    venture: state.company || '',
    milestone: state.milestone || '',
    practiceOffer: state.status !== 'real',
    testOffer: { investment: o.investment, preMoney: o.pre, postMoney: o.post, share: o.share },
    ourTerms: { investment: c.investment, preMoney: c.pre, postMoney: c.post, share: c.share },
    forecast: {
      exitYearRevenue: Number(state.revenue),
      revenueMultiple: Number(state.multiple),
      yearsToSale: Number(state.years),
      targetReturnPercent: Number(state.rate),
      exitValue: v.exit,
      valueToday: v.today,
      neededShare: v.needed,
    },
    teamReasoning: state.fair || '',
    history: state.turns.map((t) => ({
      team: t.founder,
      investorStance: t.stance,
      investor: t.message,
      counter: t.counter ? { share: t.counter.share, preMoney: t.counter.pre } : null,
    })),
    message: state.message,
  };
  const controller = new AbortController();
  pending = controller;
  const timer = setTimeout(() => controller.abort(), 60000);
  $('send').disabled = true;
  status.textContent = 'The investor is reading your terms…';
  try {
    const out = await assist(
      'funding_investor',
      payload,
      { endpoint: config.endpoint || defaultEndpoint, key: apiKey },
      controller.signal,
    );
    let counter = null,
      note = '';
    if (out.stance === 'counter') {
      const proposed = attempt(() =>
        dealTerms({
          investment: c.investment,
          basis: out.counter_basis === 'valuation' ? 'valuation' : 'share',
          share: out.counter_value,
          pre: out.counter_value,
        }),
      );
      if (proposed.error || !['share', 'valuation'].includes(out.counter_basis))
        note = ' (The investor’s terms didn’t come through as numbers. Ask them to name a share.)';
      else counter = proposed;
    }
    state.turns.push({
      founder: state.message.trim(),
      terms: termsText(c) + ', pre-money ' + money(c.pre),
      stance: out.stance === 'counter' && !counter ? 'wait' : out.stance,
      message: out.message.trim() + note,
      evidence: String(out.evidence || '').trim(),
      counter,
      key: signature(false),
    });
    state.message = '';
    $('message').value = '';
    status.textContent = 'The investor replied.';
  } catch (error) {
    const gap =
      v.needed === null
        ? 'the investor can’t reach their return under your forecast'
        : 'the investor needs ' + pct(v.needed) + ' and you’re offering ' + pct(c.share);
    status.textContent =
      (controller.signal.aborted ? 'The investor took too long to answer.' : error.message) +
      ' Your message is saved. While the investor is away, answer this as a group: ' +
      gap +
      '. What evidence would make them agree to your terms?';
  } finally {
    clearTimeout(timer);
    pending = null;
    $('send').disabled = false;
    render();
    save();
  }
}
$('send').onclick = askInvestor;

// The brief, the Markdown file and the printed sheet all read the same final terms.
function summary() {
  const o = offer(),
    v = o.error ? o : vcFor(o.investment),
    t = finalTerms();
  return { o, v, t };
}
const outcomeText = {
  test: 'Take the test offer',
  ours: 'Propose our terms',
  investor: 'Accept the investor’s counteroffer',
  walk: 'Walk away',
};
function finalLine(t) {
  if (!state.outcome) return 'Not decided yet.';
  if (t === null) return 'Walk away. No new investor ownership.';
  if (t.error) return t.error;
  return (
    outcomeText[state.outcome] +
    ': the investor owns ' +
    termsText(t) +
    ' (pre-money ' +
    money(t.pre) +
    ', post-money ' +
    money(t.post) +
    ').'
  );
}
function report() {
  const { o, v, t } = summary();
  const L = ['# Price your round', ''];
  if (state.team?.trim()) L.push('**Team:** ' + state.team.trim());
  L.push('**Venture:** ' + (state.company?.trim() || 'Not described yet'));
  L.push('**Milestone:** ' + (state.milestone?.trim() || 'Not described yet'));
  L.push('**Offer:** ' + (state.status === 'real' ? 'A real offer' : 'Practice offer'), '');
  L.push('## Our decision', finalLine(t), '');
  if (o.error) L.push(o.error);
  else {
    L.push(
      '## 1 · The test offer',
      '- Ask: ' + money(o.investment),
      '- Pre-money valuation: ' + money(o.pre),
      '- Post-money: ' + money(o.pre) + ' + ' + money(o.investment) + ' = ' + money(o.post),
      '- Investor’s share: ' + money(o.investment) + ' ÷ ' + money(o.post) + ' = ' + pct(o.share),
      '',
    );
  }
  if (!v.error && !o.error) {
    L.push(
      '## 2 · What the investor needs',
      '- Revenue in the exit year (our forecast): ' + money(Number(state.revenue)),
      '- Revenue multiple: ' +
        plain(Number(state.multiple)) +
        ' · years to sale: ' +
        plain(Number(state.years)) +
        ' · target return: ' +
        pct(Number(state.rate)) +
        ' a year',
      '- Exit value: ' + money(v.exit),
      '- Value today: ' + money(v.today),
      '- Share the investor needs: ' + (v.needed === null ? 'not possible' : pct(v.needed)),
    );
    if (state.predictionResult) L.push('- Our prediction: ' + state.predictionResult);
    L.push(
      '',
      '## 3 · Closing the gap',
      $('gapLead').textContent,
      ...[...$('gapOptions').children].map((li) => '- ' + li.textContent),
      '',
    );
  }
  L.push(
    '**Which we could defend, and with what evidence:** ' +
      (state.fair?.trim() || '_Not answered yet._'),
    '',
  );
  if (state.turns.length) {
    L.push('## 4 · Negotiation');
    state.turns.forEach((turn, i) => {
      L.push(
        '### Exchange ' + (i + 1),
        '- Our terms: ' + turn.terms,
        '- We said: ' + turn.founder,
        '- Investor (' +
          stances[turn.stance].toLowerCase() +
          (turn.counter ? ', ' + termsText(turn.counter) : '') +
          '): ' +
          turn.message,
      );
      if (turn.evidence) L.push('- Evidence they want: ' + turn.evidence);
    });
    L.push('');
  }
  L.push('## 5 · Why these terms', state.decision?.trim() || '_Not answered yet._', '');
  L.push('## Evidence we will gather next', state.next?.trim() || '_Not answered yet._');
  return L.join('\n');
}

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
function answerOrLines(text, lines = 3) {
  if (text?.trim()) return node('p', text.trim(), 'sh-answer');
  const blank = node('div', '', 'sh-lines');
  for (let i = 0; i < lines; i++) blank.append(node('span'));
  return blank;
}
const assumptionNote = (id) =>
  Number(state[id]) === Number(defaults[id]) ? 'course default' : 'our number';
function renderPrint() {
  const out = $('printout');
  out.replaceChildren();
  const { o, v, t } = summary();
  if (o.error || v.error) return;
  const sheet = node('div', '', 'sheet');
  const head = node('header', '', 'sh-head');
  const titles = node('div');
  titles.append(
    node('p', 'ENTP 311 · Funding · Valuation', 'sh-kicker'),
    node('h1', 'Price your round', 'sh-title'),
  );
  // The course line sits in the header so a long negotiation can't strand it on page 2.
  const meta = node('p', '', 'sh-meta');
  meta.append(
    node('span', 'EWU · Launching the venture'),
    document.createElement('br'),
    node('span', (state.status === 'real' ? 'Real offer' : 'Practice offer') + ' · slides 50–56'),
  );
  head.append(titles, meta);
  const ids = node('div', '', 'sh-ids');
  const today = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(new Date());
  for (const [label, value] of [
    ['Team', state.team?.trim()],
    ['Venture', state.company?.trim()],
    ['Date', today],
  ]) {
    const box = node('div', '', 'sh-id');
    box.append(node('span', label), node('strong', value || ''));
    ids.append(box);
  }
  const grid = node('div', '', 'sh-grid');
  const pair = node('div', '', 'sh-pair');
  const pays = node('div');
  pays.append(node('p', 'What the money pays for', 'sh-sub'), answerOrLines(state.milestone, 1));
  const amount = node('div');
  amount.append(node('p', 'Ask', 'sh-sub'), node('p', money(o.investment), 'sh-amount'));
  pair.append(pays, amount);
  const ask = sheetBox(1, 'Our ask', 'From Exercise 5', pair);
  ask.classList.add('sh-span');
  grid.append(
    ask,
    sheetBox(
      2,
      'The test offer',
      'What the investor would own',
      sheetRows([
        ['Pre-money valuation', money(o.pre)],
        ['Post-money', money(o.post), false, money(o.pre) + ' + ' + money(o.investment)],
        ['Investor’s share', pct(o.share), true, money(o.investment) + ' ÷ ' + money(o.post)],
      ]),
    ),
    sheetBox(
      3,
      'What the investor needs',
      'Venture capital method',
      sheetRows([
        ['Exit-year revenue', money(Number(state.revenue)), false, 'our forecast'],
        [
          'Revenue multiple',
          plain(Number(state.multiple)) + '×',
          false,
          assumptionNote('multiple'),
        ],
        [
          'Return and years',
          pct(Number(state.rate)) + ' · ' + plain(Number(state.years)) + ' yrs',
          false,
          assumptionNote('rate') === assumptionNote('years')
            ? assumptionNote('rate').replace('default', 'defaults').replace('number', 'numbers')
            : assumptionNote('rate') + ', ' + assumptionNote('years'),
        ],
        ['Exit value → value today', money(v.exit) + ' → ' + money(v.today)],
        ['Share the investor needs', v.needed === null ? 'Not possible' : pct(v.needed), true],
      ]),
    ),
  );
  const options = node('ul', '', 'sh-notes');
  for (const li of $('gapOptions').children) options.append(node('li', li.textContent));
  const bars = node('div', '', 'gap-bars');
  bars.append(...gapBars(o.share, v.needed));
  const gap = sheetBox(
    4,
    'Close the gap',
    'What would have to be true',
    bars,
    node('p', $('gapLead').textContent, 'sh-verdict'),
    options,
    node('p', 'What we could defend, and with what evidence', 'sh-sub'),
    answerOrLines(state.fair),
  );
  gap.classList.add('sh-span');
  grid.append(gap);
  const decision = sheetBox(
    5,
    'Our decision',
    'What we would sign, and why',
    node('p', finalLine(t), 'sh-verdict'),
    node('p', 'Why these terms', 'sh-sub'),
    answerOrLines(state.decision),
    node('p', 'Evidence we will gather next', 'sh-sub'),
    answerOrLines(state.next, 2),
  );
  decision.classList.add('sh-result', 'sh-span');
  grid.append(decision);
  if (state.turns.length) {
    const talk = node('ol', '', 'sh-turns');
    for (const turn of state.turns) {
      const li = node('li');
      li.append(
        node('p', 'We offered ' + turn.terms + ': ' + turn.founder),
        node(
          'p',
          'Investor · ' +
            stances[turn.stance] +
            (turn.counter ? ' (' + termsText(turn.counter) + ')' : '') +
            ': ' +
            turn.message,
        ),
      );
      talk.append(li);
    }
    const negotiation = sheetBox(6, 'Negotiation', 'Up to three replies', talk);
    negotiation.classList.add('sh-span');
    grid.append(negotiation);
  }
  sheet.append(head, ids, grid);
  out.append(sheet);
}

function download(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type })),
    a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$('worksheet').onsubmit = (e) => {
  e.preventDefault();
  const { o, v } = summary();
  const problem = o.error || v.error || (!state.needShown && 'Work through steps 2 and 3 first.');
  if (problem) {
    $('status').textContent = problem;
    return;
  }
  render();
  if (e.submitter?.id === 'download')
    download('price-your-round.md', report() + '\n', 'text/markdown');
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
    state = { ...defaults, status: 'practice', basis: 'share', turns: [] };
    for (const id of ['offerResult', 'needResult', 'investorStatus', 'status'])
      $(id).textContent = '';
    restoreInputs();
    render();
    save();
  }
};
$('legacy').hidden = !legacy || !Object.keys(legacy.fields || {}).length;
$('legacyDownload').onclick = () =>
  download('earlier-funding-worksheet.json', JSON.stringify(legacy, null, 2), 'application/json');
restoreInputs();
render();
save();
