import test from 'node:test';
import assert from 'node:assert/strict';
import {
  margin,
  matchingVolume,
  channel,
  allocation,
  funding,
  number,
  dealTerms,
  vcMethod,
  revenueForShare,
  preForShare,
} from '../venture/math.mjs';
import { assignments } from '../venture/assignments.mjs';
const near = (actual, expected) =>
  assert.ok(Math.abs(actual - expected) < 1e-6, actual + ' ≠ ' + expected);
const item = (amount, layer, basis) => ({ amount, layer, basis, label: layer });
const bowls = (qty, ads) =>
  margin(9, qty, [
    item(4.3, 'fulfillment', 'unit'),
    item(ads, 'acquisition', 'month'),
    item(3, 'operating', 'percent'),
    item(0.6, 'operating', 'unit'),
  ]);
test('Campus Bowls uses full precision and finds the first whole volume that matches baseline', () => {
  const base = bowls(400, 300),
    next = bowls(500, 600);
  near(base.cm1, 4.7);
  near(base.cm2, 3.95);
  near(base.cm3, 3.08);
  near(next.cm3, 2.63);
  near(base.monthly, 1232);
  near(next.monthly, 1315);
  assert.equal(matchingVolume(base.monthly, next), 479);
  assert.ok(bowls(478, 600).monthly < base.monthly && bowls(479, 600).monthly >= base.monthly);
});
test('monthly rent is fixed across volume changes, including zero-volume threshold', () => {
  const costs = [item(100, 'operating', 'month'), item(5, 'operating', 'unit')];
  const a = margin(15, 10, costs),
    b = margin(15, 20, costs);
  near(a.monthly, 0);
  near(b.monthly, 100);
  near(b.fixed, 100);
  assert.equal(matchingVolume(a.monthly, b), 10);
  assert.equal(matchingVolume(-125, b), 0);
  assert.equal(matchingVolume(1, margin(4, 2, costs)), null);
});
const insta = channel(300, 3000, 15),
  booth = channel(120, 200, 12);
const direct = (quantity) => ({ type: 'dollars', quantity, name: 'Ads' });
const dates = (quantity, cap) => ({ type: 'bookings', quantity, cap, rate: 120, name: 'Events' });
test('SnackBox conversions, CAC, whole bookings, caps and remaining budget', () => {
  near(insta.conversion, 0.5);
  near(insta.cac, 20);
  near(booth.conversion, 6);
  near(booth.cac, 10);
  const r = allocation(500, [insta, booth], [direct(240), dates(1, 1)]);
  assert.equal(r.unspent, 140);
  assert.deepEqual(
    r.lines.map((l) => l.customers),
    [12, 12],
  );
  assert.throws(() => allocation(500, [insta, booth], [direct(0), dates(2, 1)]), /limit/);
  assert.throws(() => allocation(500, [insta, booth], [direct(0), dates(0.5, 1)]), /whole/);
  assert.throws(() => allocation(500, [insta, booth], [direct(400), dates(1, 1)]), /exceeds/);
});
test('unknown and zero CAC do not promise customers from paid spend', () => {
  for (const c of [channel(0, 100, 10), channel(40, 100, 0), channel(0, 0, 0)]) {
    assert.equal(allocation(500, [c], [direct(100)]).lines[0].customers, null);
    assert.equal(allocation(500, [c], [direct(0)]).lines[0].customers, 0);
  }
  assert.throws(() => channel(50, 10, 11));
});
const green = {
  investment: 300000,
  pre: 1200000,
  revenue: 5000000,
  multiple: 2,
  years: 5,
  rate: 60,
  target: 20,
};
test('GreenPrint offer, reverse calculation and impossible target return', () => {
  const r = funding(green);
  near(r.post, 1500000);
  near(r.offered, 20);
  near(r.required, 31.45728);
  near(r.targetRevenue, 7864320);
  near(funding({ ...green, pre: 900000 }).offered, 25);
  assert.ok(funding({ ...green, revenue: 500 }).required > 100);
  assert.equal(funding({ ...green, revenue: 0 }).required, null);
  assert.throws(() => funding({ ...green, target: 0 }));
  assert.throws(() => funding({ ...green, years: 10000 }));
});
test('empty inputs are distinct from explicit zeroes and open ranges preserve negative contribution', () => {
  assert.throws(() => number(' ', 'price'));
  assert.equal(number('0', 'expense'), 0);
  assert.equal(number(-2, 'margin', { min: -Infinity }), -2);
});
test('channel report separates lifetime revenue and lifetime contribution', () => {
  const values = {
    budget: '500',
    aName: 'ads',
    bName: 'booth',
    aType: 'Flexible dollars',
    bType: 'Whole bookings',
    bRate: '120',
    aInitial: '300',
    bInitial: '1',
    aSpend: 300,
    aWon: 15,
    aReach: 3000,
    bSpend: 120,
    bWon: 12,
    bReach: 200,
    orderValue: '15',
    orders: '12',
    orderMargin: '3',
  };
  const { notes } = assignments.channels.result({}, (k) => values[k] ?? '', false);
  assert.match(notes.join(' '), /revenue per customer = \$180.00/);
  assert.match(notes.join(' '), /contribution before acquisition = \$36.00/);
});
test('deal terms agree whether set by share or by valuation', () => {
  const byValue = dealTerms({ investment: 300000, basis: 'valuation', pre: 1200000 });
  near(byValue.share, 20);
  near(byValue.post, 1500000);
  const byShare = dealTerms({ investment: 300000, basis: 'share', share: 25 });
  near(byShare.pre, 900000);
  near(byShare.post, 1200000);
  near(dealTerms({ investment: 300000, basis: 'valuation', pre: byShare.pre }).share, 25);
  assert.throws(() => dealTerms({ investment: 300000, basis: 'valuation', pre: 0 }));
  assert.throws(() => dealTerms({ investment: 300000, basis: 'share', share: 100 }));
  assert.throws(() => dealTerms({ investment: 0, basis: 'share', share: 10 }));
});
test('venture capital method and what would close the gap', () => {
  const assumptions = { investment: 300000, multiple: 2, years: 5, rate: 60 };
  const vc = vcMethod({ ...assumptions, revenue: 5000000 });
  near(vc.exit, 10000000);
  near(vc.needed, 31.45728);
  near(revenueForShare(20, assumptions), 7864320);
  // At the needed share, the offer meets the investor's return exactly.
  const pre = preForShare(vc.needed, 300000);
  near(dealTerms({ investment: 300000, basis: 'valuation', pre }).share, vc.needed);
  assert.equal(preForShare(120, 300000), null);
  assert.equal(vcMethod({ ...assumptions, revenue: 0 }).needed, null);
});
