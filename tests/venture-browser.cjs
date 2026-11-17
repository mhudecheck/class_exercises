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
    });
    const page = await ctx.newPage(),
      errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    let failure = false,
      requests = [];
    await ctx.route('**/v1/responses', async (route) => {
      const body = route.request().postDataJSON(),
        name = body.text.format.name;
      requests.push({ mode: name, context: JSON.parse(body.input) });
      if (failure)
        return route.fulfill({
          status: 503,
          body: 'Unavailable',
          headers: { 'Access-Control-Allow-Origin': '*' },
        });
      const output =
        name === 'venture_draft'
          ? {
              questions: ['Does the stated price apply to a seat?'],
              suggestions: [
                {
                  id: 'newVolume',
                  value: '30',
                  origin: 'estimate',
                  quote: '',
                  rationale: 'A provisional enrollment target. Check room capacity.',
                },
                {
                  id: 'basePrice',
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
      await page.locator('#status').filter({ hasText: '503' }).waitFor();
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
    await start(
      'margin',
      'We teach darkroom workshops at $80 per seat.',
      'Should we buy ads to increase enrollment?',
    );
    await button('Draft from my description');
    await page.locator('#proposal-newVolume').waitFor();
    assert.equal(await page.locator('#f-newVolume').inputValue(), '');
    const accept = page.locator('#proposal-basePrice').getByRole('button');
    await keyboardFocus(accept);
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#f-basePrice').inputValue(), '80');
    await fields({
      unit: 'seat',
      newPrice: 80,
      baseVolume: 20,
      newVolume: 22,
      capacity: 21,
      baseCost0: 10,
      newCost0: 10,
      baseCost1: 100,
      newCost1: 300,
      baseCost2: 0,
      newCost2: 0,
      baseCost3: 500,
      newCost3: 500,
      perUnit: 'Fall',
      perMonth: 'Fall',
    });
    await seal();
    assert.match(await page.locator('#page').innerText(), /exceeds your capacity of 21/);
    await enter('trialVolume', 24);
    await button('Defend your decision');
    await fields({
      decision: 'Keep the smaller campaign until another room is available.',
      trigger: '23 seats',
      next: 'Check room availability.',
    });
    await finish('Check room availability.');
    await start('channels', 'We repair bicycles for commuters.', 'Should we buy events or social ads?');
    await fields({
      budget: 500,
      customer: 'A new customer paying for a tune-up',
      aName: 'Social ads',
      aSpend: 300,
      aReach: 3000,
      aWon: 0,
      aType: 'Flexible dollars',
      aLimitText: 'Local audience size',
      aInitial: 140,
      bName: 'Repair clinics',
      bSpend: 120,
      bReach: 200,
      bWon: 12,
      bType: 'Whole bookings',
      bRate: 120,
      bLimitText: 'One booking next week',
      bInitial: 2,
      orderValue: 50,
      orders: 3,
      orderMargin: 10,
      forecast: 'Events should be cheaper. 12/200 is 6%, and 120/12 is $10. Ads won zero.',
    });
    await seal();
    assert.match(await page.locator('#page').innerText(), /no customers/i);
    await fields({ constraint: 'One clinic booking is available.', bCap: 1, bRevised: 1 });
    assert.match(await page.locator('#labOutput').innerText(), /\$240.00/);
    await button('Defend your decision');
    await fields({
      decision: 'Fund one clinic; test the ads separately.',
      testChannel: 'Channel 2',
      cta: 'Book a tune-up',
      testBudget: 120,
      window: 'Next ten days',
      pass: 9,
      next: 'Revisit the location.',
    });
    await finish('Book a tune-up');
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
