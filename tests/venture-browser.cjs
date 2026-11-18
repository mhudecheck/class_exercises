// Optional integration check: supply Playwright via Node's module resolution.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const base = process.env.EXERCISE_URL || 'http://127.0.0.1:8793/';
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
  try {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      acceptDownloads: true,
      serviceWorkers: 'block',
    });
    const page = await ctx.newPage(),
      errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    let failure = false,
      emptyEstimates = false,
      requests = [];
    await ctx.route('**/v1/responses', async (route) => {
      const body = route.request().postDataJSON(),
        name = body.text.format.name;
      const context = JSON.parse(body.input);
      requests.push({ mode: name, context });
      if (failure)
        return route.fulfill({
          status: 503,
          body: 'Unavailable',
          headers: { 'Access-Control-Allow-Origin': '*' },
        });
      if (name === 'venture_channels_draft') {
        const eligible = new Set(context.eligible.map(({ id }) => id));
        const firstReply = eligible.has('aSpend');
        const figures = firstReply
          ? {
              budget: '$999',
              aName: 'Social ads',
              aSpend: '300',
              aWon: '5,000',
              aType: 'Flexible dollars',
              aRate: '99',
              bName: 'Repair clinics',
              bSpend: '$120',
              bReach: '200',
              bWon: '12',
              bType: 'Whole bookings',
              bRate: '120',
              orderValue: '200',
              aInitial: '999',
            }
          : { aWon: '0' };
        const output = {
          suggestions: emptyEstimates
            ? []
            : Object.entries(figures).map(([id, value]) => ({
                id,
                value,
                origin: 'estimate',
                quote: '',
                rationale: 'An illustrative assumption for one trial.',
              })),
          questions: [],
        };
        return route.fulfill({ json: { output_text: JSON.stringify(output) } });
      }
      const output =
        name === 'venture_margin_draft' && emptyEstimates
          ? { suggestions: [], questions: ['How many units can you make?'] }
          : name === 'venture_margin_draft' &&
              context.eligible.map((field) => field.id).join() === 'cost'
            ? {
                questions: [],
                suggestions: [
                  {
                    id: 'cost',
                    value: '4.30',
                    origin: 'estimate',
                    quote: '',
                    rationale: 'An illustrative ingredient and labor cost.',
                  },
                ],
              }
            : name === 'venture_margin_draft'
              ? {
                  questions: ['Does the stated price apply to a seat?'],
                  suggestions: [
                    {
                      id: 'units',
                      value: '30',
                      origin: 'estimate',
                      quote: '',
                      rationale: 'A provisional enrollment target. Check room capacity.',
                    },
                    {
                      id: 'price',
                      value: '80',
                      origin: 'stated',
                      quote: '$80 per seat',
                      rationale: 'Price quoted by the student.',
                    },
                  ],
                }
              : { question: 'Which customer commitments support the volume in your forecast?' };
      await route.fulfill({
        json: { output: [{ content: [{ type: 'output_text', text: JSON.stringify(output) }] }] },
      });
    });
    async function keyboardFocus(locator) {
      for (let i = 0; i < 320; i++) {
        if (await locator.evaluate((e) => e === document.activeElement)) return;
        await page.keyboard.press('Tab');
      }
      assert.fail('Control not reachable by keyboard: ' + locator);
    }
    async function button(name) {
      const b = page.getByRole('button', { name, exact: true });
      await keyboardFocus(b);
      await page.keyboard.press('Enter');
    }
    async function enter(id, v) {
      const f = page.locator('#f-' + id);
      await keyboardFocus(f);
      if (await f.evaluate((e) => e.tagName === 'SELECT')) {
        // Use the native keyboard to select by the first part of the option.
        await page.keyboard.press('Home');
        await page.keyboard.type(String(v), { delay: 2 });
        await page.keyboard.press('Enter');
      } else {
        await page.keyboard.press('ControlOrMeta+a');
        await page.keyboard.insertText(String(v));
      }
      assert.equal(await f.inputValue(), String(v), 'entered ' + id);
    }
    async function fields(values) {
      for (const [k, v] of Object.entries(values)) await enter(k, v);
    }
    async function start(kind, company, scenario) {
      await page.goto(new URL(kind + '.html', base).href);
      await page.locator('#f-company').waitFor();
      assert.equal(await page.locator('#f-company').inputValue(), '');
      await fields({ company, scenario });
      await button('Open worksheet');
    }
    async function seal() {
      await button('Save prediction and check calculations');
      assert.equal(
        await page.getByRole('heading', { name: 'Check your prediction' }).count(),
        1,
        await page.locator('#status').innerText(),
      );
      await page.reload();
      await page.getByRole('heading', { name: 'Check your prediction' }).waitFor();
    }
    async function finish(needle) {
      assert.ok((await page.locator('#preview').innerText()).includes('Decision and next step'));
      failure = true;
      await button('Ask for coaching');
      const feedbackStatus = (await page.locator('#channelCoachStatus').count())
        ? '#channelCoachStatus'
        : '#status';
      await page.locator(feedbackStatus).filter({ hasText: '503' }).waitFor();
      failure = false;
      const promise = page.waitForEvent('download', { timeout: 5000 });
      await button('Download Markdown');
      const file = await promise,
        md = await fs.readFile(await file.path(), 'utf8');
      assert.ok(md.includes(needle));
      assert.ok(md.includes('Original prediction'));
      assert.ok(md.includes('Revised calculation'));
      assert.ok(!md.includes('workers.dev'));
      assert.ok(!md.includes('undefined'));
      await page.evaluate(
        () =>
          (window.print = () => {
            document.body.dataset.printed = 'yes';
          }),
      );
      await button('Print brief');
      assert.equal(await page.locator('body').getAttribute('data-printed'), 'yes');
      await page.emulateMedia({ media: 'print' });
      assert.equal(await page.locator('#printout').isVisible(), true);
      assert.ok((await page.locator('#printout').innerText()).includes(needle));
      await page.emulateMedia({ media: 'screen' });
      assert.ok(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        'mobile overflow',
      );
    }
    const marginUrl = new URL('margin.html', base).href;
    const initialMargin = await browser.newContext({
      viewport: { width: 360, height: 800 },
      serviceWorkers: 'block',
    });
    // The first row is present even before the worksheet script runs.
    await initialMargin.route('**/venture/ladder.mjs*', (route) => route.abort());
    const initialPage = await initialMargin.newPage();
    await initialPage.goto(marginUrl);
    for (const label of ['What is it?', 'Total spent ($)', 'Sales it brought in']) {
      assert.ok(
        await initialPage.getByLabel(label, { exact: true }).isVisible(),
        label + ' is on the initial page',
      );
    }
    assert.ok(await initialPage.getByRole('button', { name: 'Add another sales cost' }).isDisabled());
    await initialMargin.close();

    const freshLoads = await browser.newContext();
    const freshPage = await freshLoads.newPage();
    await freshPage.goto(marginUrl);
    await freshPage.waitForFunction(() => navigator.serviceWorker.controller, undefined, {
      timeout: 15000,
    });
    const scriptResponse = freshPage.waitForResponse((response) =>
      response.url().includes('/venture/ladder.mjs'),
    );
    const worksheetResponse = await freshPage.reload();
    assert.ok(
      worksheetResponse.fromServiceWorker(),
      'the worksheet navigation goes through the freshness worker',
    );
    assert.match(await worksheetResponse.headerValue('cache-control'), /no-store/);
    const script = await scriptResponse;
    assert.ok(script.fromServiceWorker());
    assert.match(await script.headerValue('cache-control'), /no-store/);
    assert.ok(await freshPage.locator('#addSalesCost').isEnabled());
    const channelsResponse = await freshPage.goto(new URL('channels.html', base).href);
    assert.equal(
      channelsResponse.fromServiceWorker(),
      false,
      'other exercises are outside the worker scope',
    );
    await freshLoads.close();

    await page.goto(marginUrl);
    assert.ok(
      await page.locator('#salesCosts #spend').isVisible(),
      'first row is ready without adding it',
    );
    assert.ok(await page.getByRole('button', { name: 'Add another sales cost' }).isEnabled());
    // Work saved before the upgrade keeps its original channel and figures.
    await page.evaluate(() =>
      localStorage.setItem(
        'venture_margin_ladder_v1',
        JSON.stringify({
          product: 'Coffee beans',
          channel: 'Campus flyers',
          spend: '40',
          units: '20',
        }),
      ),
    );
    await page.reload();
    assert.equal(await page.locator('#channel').inputValue(), 'Campus flyers');
    assert.equal(await page.locator('#spend').inputValue(), '40');
    assert.equal(await page.locator('#units').inputValue(), '20');
    await page.evaluate(() => localStorage.removeItem('venture_margin_ladder_v1'));
    await page.reload();
    await page.locator('#product').fill('One smoothie bowl for students in the library');
    assert.equal(await page.getByRole('spinbutton', { name: /price the customer pays/i }).count(), 1);
    assert.doesNotMatch(
      await page.locator('main').innerText(),
      /current price|proposed price|scenario|baseline/i,
    );
    const fillMargin = async (id, value) => {
      await page.locator('#' + id).fill(String(value));
    };
    await page.locator('#draftTools summary').click();
    await fillMargin('description', 'We also sell workshops at $80 per seat.');
    emptyEstimates = true;
    await button('Suggest estimates');
    await page.locator('#draftStatus').filter({ hasText: 'no figures to suggest' }).waitFor();
    await page.locator('#suggestions').filter({ hasText: 'How many units can you make?' }).waitFor();
    emptyEstimates = false;
    await button('Suggest estimates');
    const suggestion = page
      .locator('#suggestions .ai-card')
      .filter({ hasText: 'Price the customer pays' });
    await suggestion.waitFor();
    await page.locator('#suggestions .ai-card').filter({ hasText: 'Cost to make and deliver' }).waitFor();
    const estimateRequests = requests.filter((request) => request.mode === 'venture_margin_draft');
    assert.deepEqual(
      estimateRequests.at(-1).context.eligible.map((field) => field.id),
      ['cost'],
    );
    assert.ok(
      estimateRequests.every((request) =>
        request.context.eligible.every((field) => !field.label.includes('Sales cost 1')),
      ),
    );
    assert.equal(await page.locator('#price').inputValue(), '');
    await suggestion.getByRole('button').click();
    assert.equal(await page.locator('#price').inputValue(), '80');
    await fillMargin('description', 'A bowl costs $4.30 for fruit, packaging and labor.');
    for (const [k, v] of Object.entries({
      price: 9,
      cost: 4.3,
      channel: 'Campus ads',
      spend: 300,
      units: 400,
      fee: 3,
      other: 0.6,
    })) {
      await fillMargin(k, v);
    }
    assert.match(await page.locator('#cm1').innerText(), /\$4.70/);
    assert.match(await page.locator('#cm2').innerText(), /\$0.75.*\$3.95/);
    // Students try CM3 themselves: a fee taken from CM2 gets a pointed hint, then the right answer passes.
    await fillMargin('cm3Guess', (3.95 - 3.95 * 0.03 - 0.6).toFixed(2));
    await button('Check my answer');
    assert.match(await page.locator('#checkResult').innerText(), /of the price \(\$9.00\), not of CM2/);
    assert.equal(await page.locator('#results').isVisible(), false);
    await fillMargin('cm3Guess', '3.08');
    await button('Check my answer');
    assert.match(await page.locator('#cm3').innerText(), /^Right\. CM3 · .*\$3.08, or 34.2% of the price/);
    await page.reload();
    await page.locator('#ladderTable table').waitFor();
    await fillMargin('reflection', 'I would ask the fruit supplier for a quote.');
    failure = true;
    await button('Ask for feedback');
    await page.locator('#feedback').filter({ hasText: '503' }).waitFor();
    failure = false;
    const filePromise = page.waitForEvent('download');
    await button('Download Markdown');
    const md = await fs.readFile(await (await filePromise).path(), 'utf8');
    assert.match(md, /fruit supplier/);
    assert.match(md, /\*\*CM3:\*\* \$3.95 − \$0.27 fee − \$0.60 other costs = \$3.08/);
    assert.doesNotMatch(md, /comparison|baseline|proposed/i);
    await page.evaluate(
      () =>
        (window.print = () => {
          document.body.dataset.printed = 'yes';
        }),
    );
    await button('Print worksheet');
    assert.equal(await page.locator('body').getAttribute('data-printed'), 'yes');
    await page.emulateMedia({ media: 'print' });
    assert.ok(await page.locator('#printout').isVisible());
    const sheet = await page.locator('#printout').innerText();
    assert.match(sheet, /5 · Your ladder/);
    assert.match(sheet, /fruit supplier/);
    await page.emulateMedia({ media: 'screen' });
    // A campaign and a commission both apply to the same sale.
    await button('Add another sales cost');
    await fillMargin('channel-2', 'Sales commission');
    await page
      .getByRole('combobox', { name: 'How do you pay for it?' })
      .nth(1)
      .selectOption('perUnit');
    await fillMargin('perUnit-2', '.50');
    assert.match(
      await page.locator('#salesCostWorking').innerText(),
      /Campus ads: \$300.00 ÷ 400 sales = \$0.75/,
    );
    assert.match(
      await page.locator('#salesCostWorking').innerText(),
      /Sales commission: \$0.50 per sale/,
    );
    assert.match(await page.locator('#cm2').innerText(), /\$1.25.*\$3.45/);
    await page.reload();
    assert.equal(Number(await page.locator('#perUnit-2').inputValue()), 0.5);
    await button('Show me the answer');
    assert.match(await page.locator('#cm3').innerText(), /\$2.58/);
    const multiExport = page.waitForEvent('download');
    await button('Download Markdown');
    const multiMd = await fs.readFile(await (await multiExport).path(), 'utf8');
    assert.match(multiMd, /Sales commission: \$0.50 per sale/);
    assert.match(multiMd, /Total cost to win one sale: \$1.25/);
    await button('Remove sales cost 2');
    assert.match(await page.locator('#cm2').innerText(), /\$3.95/);
    await fillMargin('spend', 0);
    await fillMargin('units', '');
    await fillMargin('cost', 12);
    await button('Show me the answer');
    assert.match(await page.locator('#interpretation').innerText(), /loses/);
    await fillMargin('cost', '');
    assert.equal(await page.locator('#results').isVisible(), false);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await start('channels', 'We repair bicycles for commuters.', '');
    await fields({ budget: 500, customer: 'A new customer paying for a tune-up', aReach: 3000 });
    failure = true;
    await button('Draft from my description');
    await page.locator('#channelDraftStatus').filter({ hasText: '503' }).waitFor();
    assert.equal(await page.locator('#f-budget').inputValue(), '500');
    failure = false;
    emptyEstimates = true;
    await button('Draft from my description');
    await page.locator('#channelDraftStatus').filter({ hasText: 'no usable figures' }).waitFor();
    emptyEstimates = false;
    await button('Draft from my description');
    await page.locator('#channelDraftStatus').filter({ hasText: 'Review suggested figures' }).waitFor();
    await page.reload();
    assert.equal(await page.locator('#f-budget').inputValue(), '500');
    assert.equal(await page.locator('#proposal-budget').count(), 0);
    assert.equal(await page.locator('#proposal-aRate').count(), 0);
    assert.equal(await page.locator('#proposal-aInitial').count(), 0);
    assert.equal(await page.locator('#proposal-orderValue').count(), 0);
    assert.equal(await page.locator('#proposal-bRate').isVisible(), false);
    assert.equal(await page.locator('#proposal-aWon input').inputValue(), '0');
    assert.deepEqual(
      requests
        .filter((r) => r.mode === 'venture_channels_draft')
        .at(-1)
        .context.eligible.map((f) => f.id),
      ['aWon'],
    );
    for (const id of [
      'aName',
      'aSpend',
      'aWon',
      'aType',
      'bName',
      'bSpend',
      'bReach',
      'bWon',
      'bType',
      'bRate',
    ]) {
      const use = page.locator('#proposal-' + id).getByRole('button', { name: 'Edit and accept' });
      assert.equal(await page.locator('#f-' + id).inputValue(), '');
      await keyboardFocus(use);
      await page.keyboard.press('Enter');
      assert.equal(await page.locator('#proposal-' + id).count(), 0);
    }
    await fields({
      aInitial: 140,
      bInitial: 2,
      orderValue: 50,
      forecast: 'Events should be cheaper. 12/200 is 6%, and 120/12 is $10. Ads won zero.',
    });
    await seal();
    const comparison = await page.locator('#page').innerText();
    assert.match(comparison, /no (?:paying )?customers/i);
    assert.match(comparison, /\$120.00 ÷ 12 = \$10.00/);
    assert.doesNotMatch(comparison, /Lifetime revenue per customer/);
    await fields({ constraint: 'One clinic booking is available.', bCap: 1, bRevised: 1 });
    assert.match(await page.locator('#labOutput').innerText(), /\$240.00/);
    await button('Defend your decision');
    await fields({
      decision: 'Fund one clinic; test the ads separately.',
      testChannel: 'Channel 2',
      cta: 'Book a tune-up',
      testBudget: 60,
      window: 'Next ten days',
      pass: 15,
      next: 'Revisit the location.',
    });
    assert.match(
      await page.locator('#experimentCheck').innerText(),
      /must cover at least one whole booking/,
    );
    await enter('testBudget', 120);
    assert.match(
      await page.locator('#experimentCheck').innerText(),
      /about 12 first-time paying customers/,
    );
    assert.match(await page.locator('#experimentCheck').innerText(), /target is higher/);
    await button('Ask for coaching');
    await page.locator('#coachNote').waitFor();
    const coach = requests.findLast((r) => r.mode === 'venture_channels_coach').context;
    assert.deepEqual(coach.experiment, {
      name: 'Repair clinics',
      spend: 120,
      allocation: 120,
      trialCac: 10,
      forecast: 12,
      target: 15,
      targetCac: 8,
    });
    assert.equal(coach.calculations, undefined);
    await finish('Book a tune-up');
    await button('Worksheet');
    await button('Correct original inputs');
    await enter('aReach', 2500);
    await seal();
    assert.equal(await page.locator('#f-constraint').inputValue(), 'One clinic booking is available.');
    await button('Defend your decision');
    assert.equal(await page.locator('#f-cta').inputValue(), 'Book a tune-up');
    assert.equal(await page.locator('#coachNote').count(), 0);
    await start(
      'funding',
      'We sell refill kits to campus labs.',
      'A hypothetical raise to validate two distributors.',
    );
    await fields({
      status: 'Hypothetical offer',
      investment: 300000,
      pre: 1200000,
      years: 5,
      revenue: 5000000,
      multiple: 2,
      rate: 60,
      target: 20,
      ownership: 20,
      reason: 'The offer is one fifth of the post-money valuation.',
    });
    await seal();
    await enter('counterpre', 900000);
    for (let i = 0; i < 3; i++) {
      const msg = page.locator('#investorMessage');
      await keyboardFocus(msg);
      await page.keyboard.insertText('Our pilot supports revision ' + (i + 1));
      if (i === 0) {
        failure = true;
        await button('Ask for investor reply');
        await page.locator('#status').filter({ hasText: '503' }).waitFor();
        assert.equal(await msg.inputValue(), 'Our pilot supports revision 1');
        assert.equal(await page.getByRole('heading', { name: 'Exchange 1' }).count(), 0);
        failure = false;
      }
      await button('Ask for investor reply');
      await page.getByRole('heading', { name: 'Exchange ' + (i + 1) }).waitFor();
    }
    assert.equal(await page.locator('#investorMessage').count(), 0);
    const turns = requests.filter((r) => r.mode === 'venture_investor');
    assert.equal(turns.length, 4);
    assert.ok(turns[0].context.calculations.join(' ').includes('25%'));
    await button('Defend your decision');
    await fields({
      outcome: 'Make the counteroffer',
      decision: 'Offer 25% and validate the exit forecast using distributor orders.',
      next: 'Obtain signed pilot orders.',
    });
    await finish('25% for $300,000.00');
    assert.deepEqual(errors, []);
    console.log(
      'Passed three independent mobile keyboard workflows, reload, AI review and failures, negotiation, print and Markdown exports.',
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
