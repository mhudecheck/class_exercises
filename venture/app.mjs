import {
  assignments,
  active,
  validateFields,
  money,
  fmt,
  channelExperiment,
  experimentNotes,
} from './assignments.mjs?v=4';
import {
  channelDraftFields,
  checkChannelCounts,
  missingChannelDraftFields,
  reviewChannelDraft,
} from './channel-draft.mjs';
import { assist, defaultEndpoint, quoteContainsValue } from './assist.mjs?v=3';
const kind = document.body.dataset.exercise,
  ex = assignments[kind];
const key = 'venture_decision_v1_' + kind;
const $ = (id) => document.getElementById(id);
function read(storageKey) {
  try {
    return JSON.parse(localStorage.getItem(storageKey));
  } catch {
    return null;
  }
}
function fresh() {
  return {
    step: 0,
    max: 0,
    fields: {},
    pending: [],
    questions: [],
    coach: '',
    sealed: false,
  };
}
let s = read(key) || fresh(),
  settings = read('venture_ai_settings') || { endpoint: defaultEndpoint };
let secret = settings.key || '',
  request = null,
  saving = true;
const get = (id) => s.fields[id]?.v ?? '';
const sourceNames = {
  'Student estimate': 'Student estimate',
  Observed: 'Observed',
  'AI estimate': 'Accepted AI estimate',
  'Student statement': 'Confirmed from description',
};
function save() {
  try {
    localStorage.setItem(key, JSON.stringify(s));
    saving = true;
  } catch {
    saving = false;
  }
  $('saved').textContent = saving
    ? 'Saved in this browser'
    : 'Kept in this tab only. Download your brief before closing.';
}
function set(id, v, changed = true) {
  const old = s.fields[id] || { source: 'Student estimate', note: '' };
  s.fields[id] = { ...old, v };
  if (changed && ['AI estimate', 'Student statement'].includes(old.source) && old.v !== v) {
    s.fields[id].source = 'Student estimate';
    s.fields[id].note = 'Revised from ' + sourceNames[old.source] + '. ' + old.note;
  }
  if (changed) s.coach = '';
}
function el(tag, text, cls) {
  const n = document.createElement(tag);
  if (text != null) n.textContent = text;
  if (cls) n.className = cls;
  return n;
}
function button(label, action, secondary = false) {
  const b = el('button', label, secondary ? 'quiet' : '');
  b.type = 'button';
  b.addEventListener('click', () => {
    try {
      action();
    } catch (e) {
      error(e);
    }
  });
  return b;
}
function error(e) {
  const old = $('fieldError');
  if (old) {
    const input = old.closest('.field').querySelector('[aria-invalid=true]');
    input?.removeAttribute('aria-invalid');
    if (input?.dataset.help) input.setAttribute('aria-describedby', input.dataset.help);
    else input?.removeAttribute('aria-describedby');
    old.remove();
  }
  const message = e.message || String(e);
  const field = e.fieldId && $('f-' + e.fieldId);
  if (field && !field.disabled) {
    const feedback = el('p', message, 'note');
    feedback.id = 'fieldError';
    feedback.setAttribute('role', 'alert');
    field.closest('.field').append(feedback);
    field.setAttribute('aria-invalid', 'true');
    field.setAttribute('aria-describedby', [field.dataset.help, feedback.id].filter(Boolean).join(' '));
    $('status').textContent = '';
    field.focus();
  } else {
    $('status').textContent = message;
    $('status').scrollIntoView({ block: 'nearest' });
  }
}
function panel(title) {
  const section = el('section', null, 'panel');
  if (title) section.append(el('h2', title));
  return section;
}
const hint = (t) => el('p', t, 'hint');
function options(select, items, selected, blank = true) {
  if (blank) select.append(new Option('Choose…', ''));
  for (const [key, label] of items) select.append(new Option(label, key));
  select.value = selected;
}
function labeled(text, control) {
  const l = el('label', text);
  l.append(control);
  return l;
}
function fieldView(f, { locked = false, note = true } = {}) {
  const box = el('div', null, 'field' + (f.type === 'textarea' ? ' wide' : ''));
  if (f.when) {
    box.dataset.dep = f.when[0];
    box.dataset.is = f.when[1];
    box.hidden = !active(f, get);
  }
  const ctl = el(f.choices ? 'select' : f.type === 'textarea' ? 'textarea' : 'input');
  ctl.id = 'f-' + f.id;
  ctl.disabled = locked;
  ctl.value = get(f.id);
  if (f.choices)
    options(
      ctl,
      f.choices.map((v, i) => [v, f.id === 'testChannel' ? v + ' · ' + get(i ? 'bName' : 'aName') : v]),
      get(f.id),
    );
  else if (f.type === 'number') {
    ctl.type = 'number';
    ctl.step = f.integer ? '1' : 'any';
    if (f.min !== -Infinity) ctl.min = '0';
    if (f.max != null) ctl.max = String(f.max);
    ctl.value = get(f.id);
  }
  box.append(labeled(f.label, ctl));
  if (f.help) {
    const explanation = hint(f.help);
    explanation.id = 'help-' + f.id;
    ctl.dataset.help = explanation.id;
    ctl.setAttribute('aria-describedby', explanation.id);
    box.append(explanation);
  }
  let sourceTitle, sourceSelect, sourceNote;
  if (f.type === 'number' && note) {
    const d = el('details');
    sourceTitle = el('summary', sourceNames[s.fields[f.id]?.source] || 'Student estimate');
    sourceSelect = el('select');
    const current = s.fields[f.id]?.source || 'Student estimate';
    options(
      sourceSelect,
      [...new Set(['Student estimate', 'Observed', current])].map((v) => [v, sourceNames[v]]),
      current,
      false,
    );
    sourceSelect.disabled = locked;
    sourceNote = el('input');
    sourceNote.value = s.fields[f.id]?.note || '';
    sourceNote.disabled = locked;
    sourceSelect.onchange = () => {
      set(f.id, get(f.id), false);
      s.fields[f.id].source = sourceSelect.value;
      sourceTitle.textContent = sourceNames[sourceSelect.value];
      save();
      if (s.step === 3) updatePreview();
    };
    sourceNote.oninput = () => {
      set(f.id, get(f.id), false);
      s.fields[f.id].note = sourceNote.value;
      save();
      if (s.step === 3) updatePreview();
    };
    const body = el('div', null, 'source');
    body.append(labeled('Number source', sourceSelect), labeled('Source note (optional)', sourceNote));
    d.append(sourceTitle, body);
    box.append(d);
  }
  if (kind === 'channels' && !locked && !get(f.id)) {
    const proposal = s.pending.find((item) => item.id === f.id);
    if (proposal) box.append(proposalView(proposal));
  }
  ctl.addEventListener('input', () => {
    const previous = get(f.id);
    set(f.id, ctl.value);
    if (ctl.hasAttribute('aria-invalid')) box.querySelector('#fieldError')?.remove();
    ctl.removeAttribute('aria-invalid');
    if (ctl.dataset.help) ctl.setAttribute('aria-describedby', ctl.dataset.help);
    else ctl.removeAttribute('aria-describedby');
    if (sourceTitle) {
      sourceTitle.textContent = sourceNames[s.fields[f.id].source];
      sourceSelect.value = s.fields[f.id].source;
      sourceNote.value = s.fields[f.id].note;
    }
    document.querySelectorAll('[data-dep]').forEach((n) => {
      n.hidden = get(n.dataset.dep) !== n.dataset.is;
    });
    if (s.step === 0) {
      s.pending = [];
      s.questions = [];
    }
    if (s.step === 1) {
      s.pending = s.pending.filter((p) => p.id !== f.id);
      document.getElementById('proposal-' + f.id)?.remove();
      if (kind === 'channels') updateChannelDraftAfterEdit(f.id, previous);
    }
    save();
    if (s.step === 2) updateLab();
    if (s.step === 3) {
      $('coachNote')?.remove();
      updateChannelExperiment();
      updatePreview();
    }
  });
  return box;
}
const context = [
  { id: 'company', label: 'What does your company sell, and to whom?', type: 'textarea' },
  { id: 'scenario', label: ex.scenario, type: 'textarea', optional: kind === 'channels' },
];
function allBase() {
  return ex.groups(s, get).flatMap((g) => g.fields);
}
const flatten = (groups) => groups.flatMap((g) => g.fields);
function gridFields(fields, opts = {}) {
  const grid = el('div', null, 'grid');
  fields.forEach((f) => grid.append(fieldView(f, opts)));
  return grid;
}
function actions(...children) {
  const a = el('div', null, 'actions');
  a.append(...children);
  return a;
}
function go(step) {
  s.step = step;
  s.max = Math.max(s.max, step);
  save();
  render();
  $('steps').scrollIntoView({ block: 'start' });
  const heading = $('page').querySelector('h2');
  if (heading) {
    heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
  }
}
function contextPage() {
  const p = panel('Your venture');
  p.append(gridFields(context, { locked: s.sealed }));
  if (kind === 'channels') {
    p.append(
      hint(
        'If you already have ideas for channels, include them above. You can leave that box blank and ask for ideas in the worksheet.',
      ),
    );
  }
  p.append(
    actions(
      button('Open worksheet', () => {
        validateFields(context, get);
        go(1);
      }),
    ),
  );
  return p;
}
function worksheet() {
  const frag = document.createDocumentFragment();
  const start = panel('Build your worksheet');
  start.append(
    hint(
      'Enter your figures in US dollars. Estimates are fine. Select the note below a number to record how you arrived at it.',
    ),
  );
  if (!s.sealed) {
    if (kind === 'channels') {
      start.append(
        hint(
          'For each channel, use spending, reach, and new buyers from the same trial. If you haven’t run it yet, estimate all three for a trial you could do.',
        ),
      );
    }
    const draftButton = button('Draft from my description', () => runAI('draft'), true);
    draftButton.id = 'askDraft';
    start.append(actions(draftButton));
    start.append(
      hint(
        kind === 'channels'
          ? 'AI can suggest two channels and starting figures for their trials. Review each suggestion before using it, then decide how to split the budget.'
          : 'The AI coach uses your description and worksheet. You choose which estimates to use.',
      ),
    );
    if (kind === 'channels') {
      const status = el(
        'p',
        s.pending.length ? 'Review suggested figures beside the worksheet fields below.' : '',
      );
      status.id = 'channelDraftStatus';
      status.setAttribute('role', 'status');
      start.append(status);
      if (s.questions.length) {
        const questions = el('ul', null, 'note');
        questions.id = 'draftQuestions';
        questions.append(...s.questions.map((question) => el('li', question)));
        start.append(questions);
      }
    } else {
      if (s.questions.length) start.append(el('p', s.questions.join(' '), 'note'));
      for (const p of s.pending) if (!get(p.id)) start.append(proposalView(p));
    }
  } else {
    start.append(hint('Your original worksheet and prediction are saved for comparison.'));
    start.append(
      button(
        'Correct original inputs',
        () => {
          s.sealed = false;
          s.max = 1;
          s.coach = '';
          go(1);
        },
        true,
      ),
    );
  }
  frag.append(start);
  for (const g of ex.groups(s, get)) {
    const section = panel(g.title);
    if (kind === 'channels' && g.title.startsWith('Repeat business')) {
      section.append(
        hint(
          'Skip this section unless you want to estimate what a customer is worth over multiple orders. Enter expected orders along with revenue, contribution, or both.',
        ),
      );
    }
    section.append(gridFields(g.fields, { locked: s.sealed }));
    frag.append(section);
  }
  const pred = panel('Make your prediction');
  pred.append(gridFields(ex.predict, { locked: s.sealed, note: false }));
  pred.append(
    actions(
      button(s.sealed ? 'View calculations' : 'Save prediction and check calculations', () => {
        validateFields(context, get);
        validateFields(allBase(), get);
        if (kind === 'channels') {
          for (const prefix of ['a', 'b']) checkChannelCounts(prefix, get);
        }
        validateFields(ex.predict, get);
        ex.result(s, get, false);
        if (!s.sealed) {
          for (const [id, value, origin] of ex.seed(s, get)) {
            if (!Object.hasOwn(s.fields, id)) s.fields[id] = { ...s.fields[origin], v: value };
          }
          s.pending = [];
          s.questions = [];
          s.sealed = true;
        }
        go(2);
      }),
    ),
  );
  frag.append(pred);
  return frag;
}
function draftFields() {
  const fields = allBase().map((f) => ({
    id: f.id,
    label: fieldLabel(f.id, f.label),
    choices: f.choices,
    condition: f.when,
  }));
  return kind === 'channels' ? channelDraftFields(fields, get) : fields.filter((f) => !get(f.id));
}
function updateChannelDraftAfterEdit(id, previous) {
  if (!/^[ab](Name|Type)$/.test(id) || previous === get(id)) return;
  const prefix = id[0];
  if (id.endsWith('Name')) {
    s.pending = s.pending.filter((proposal) => {
      if (!proposal.id.startsWith(prefix) || !/^[ab][A-Z]/.test(proposal.id)) return true;
      $('proposal-' + proposal.id)?.remove();
      return false;
    });
  } else if (previous) {
    // A dollar amount and the same number of bookings represent different plans.
    const allocations = ['Initial', 'Revised', 'Cap'].map((suffix) => prefix + suffix);
    const changedUnits = allocations.some((field) => get(field) !== '');
    for (const field of allocations) {
      delete s.fields[field];
      if ($('f-' + field)) $('f-' + field).value = '';
    }
    if (changedUnits) {
      const status = $('channelDraftStatus');
      if (status)
        status.textContent =
          'Re-enter the allocation for ' +
          (get(prefix + 'Name') || 'this channel') +
          ' in the new units.';
    }
  }
}
function fieldLabel(id, label) {
  if (kind === 'channels' && /^[ab][A-Z]/.test(id)) {
    const prefix = id[0];
    return (get(prefix + 'Name') || 'Channel ' + (prefix === 'a' ? '1' : '2')) + ' · ' + label;
  }
  return label;
}
function proposalView(p) {
  const f = allBase().find((f) => f.id === p.id),
    box = el('div', null, 'ai-card');
  box.id = 'proposal-' + p.id;
  box.append(
    el('strong', fieldLabel(p.id, f.label)),
    el(
      'p',
      (p.origin === 'stated'
        ? 'You wrote “' + p.quote + '” '
        : f.type === 'number' || kind !== 'channels'
          ? 'AI estimate. '
          : 'AI suggestion. ') + p.rationale,
    ),
  );
  const ctl = el(f.choices ? 'select' : 'input');
  if (f.type === 'number' && kind === 'channels') {
    ctl.type = 'number';
    ctl.step = f.integer ? '1' : 'any';
    ctl.min = '0';
  }
  if (f.choices)
    options(
      ctl,
      f.choices.map((v) => [v, v]),
      p.value,
    );
  else ctl.value = p.value;
  box.append(
    labeled(
      kind === 'channels' ? 'Review suggested ' + f.label.toLowerCase() : 'Review suggested value',
      ctl,
    ),
  );
  box.append(
    button('Edit and accept', () => {
      if (get(f.id)) throw Error('This field already contains a confirmed value.');
      if (kind === 'channels' && !active(f, get))
        throw Error('Choose the channel’s payment type first.');
      validateFields([{ ...f, when: null, optional: false }], () => ctl.value);
      if (kind === 'channels' && /^[ab](Reach|Won)$/.test(f.id)) {
        checkChannelCounts(f.id[0], (id) => (id === f.id ? ctl.value : get(id)));
      }
      const revised = ctl.value !== p.value;
      s.fields[f.id] = {
        v: ctl.value,
        source: revised
          ? 'Student estimate'
          : p.origin === 'stated'
            ? 'Student statement'
            : 'AI estimate',
        note:
          (revised ? 'Student revised suggestion. ' : '') +
          (p.quote ? '“' + p.quote + '” ' : '') +
          p.rationale,
      };
      s.pending = s.pending.filter((v) => v !== p);
      if (kind === 'channels') {
        if (revised && f.id.endsWith('Name')) updateChannelDraftAfterEdit(f.id, p.value);
        s.pending = reviewChannelDraft(s.pending, get);
      }
      save();
      render();
      if (kind === 'channels') $('f-' + f.id)?.focus();
    }),
  );
  return box;
}
function resultView(result) {
  const box = el('div');
  for (const t of result.tables) {
    const table = el('table'),
      caption = el('caption', t.title);
    table.append(caption);
    const tr = table.createTHead().insertRow();
    for (const label of t.head) {
      const th = el('th', label);
      th.scope = 'col';
      tr.append(th);
    }
    const body = table.createTBody();
    for (const row of t.rows) {
      const tr = body.insertRow();
      row.forEach((v, i) => {
        const cell = el(i ? 'td' : 'th', v);
        if (!i) cell.scope = 'row';
        tr.append(cell);
      });
    }
    box.append(table);
  }
  for (const note of result.notes) box.append(el('p', note, 'note'));
  return box;
}
function checkedLab() {
  validateFields(flatten(ex.lab(s, get)), get);
  if (kind === 'channels' && !get('aCap') && !get('bCap')) {
    const error = Error('Enter a dollar or booking limit for at least one channel.');
    error.fieldId = 'aCap';
    throw error;
  }
  return ex.result(s, get, true);
}
function updateLab() {
  const dest = $('labOutput');
  if (!dest) return;
  try {
    const revised = checkedLab();
    dest.replaceChildren(
      resultView(kind === 'channels' ? { tables: revised.tables.slice(1), notes: [] } : revised),
    );
  } catch (e) {
    dest.replaceChildren(hint(e.message));
  }
}
function labPage() {
  const frag = document.createDocumentFragment(),
    first = panel('Check your prediction');
  for (const f of ex.predict) first.append(el('p', f.label + ' — ' + get(f.id)));
  first.append(resultView(ex.result(s, get, false)));
  frag.append(first);
  for (const g of ex.lab(s, get)) {
    const p = panel(g.title);
    p.append(gridFields(g.fields));
    frag.append(p);
  }
  const updated = panel('Your revised scenario'),
    out = el('div');
  out.id = 'labOutput';
  updated.append(out);
  frag.append(updated);
  frag.append(
    actions(
      button('Defend your decision', () => {
        checkedLab();
        go(3);
      }),
    ),
  );
  return frag;
}
function validateFinal() {
  checkedLab();
  validateFields(ex.final, get);
  if (kind === 'channels') channelExperiment(get);
}
function updateChannelExperiment() {
  const panel = $('experimentCheck');
  if (!panel) return;
  try {
    panel.replaceChildren(...experimentNotes(channelExperiment(get)).map((text) => el('p', text)));
  } catch (error) {
    panel.replaceChildren(hint(error.message));
  }
  panel.hidden = !panel.childElementCount;
}
function finalPage() {
  const frag = document.createDocumentFragment(),
    p = panel('Defend your decision');
  const fields = ex.final;
  p.append(gridFields(fields));
  if (kind === 'channels') {
    const check = el('div', null, 'note');
    check.id = 'experimentCheck';
    check.hidden = true;
    p.append(check);
  }
  p.append(actions(button('Ask for coaching', () => runAI('coach'), true)));
  if (kind === 'channels') {
    const status = el('p', '');
    status.id = 'channelCoachStatus';
    status.setAttribute('role', 'status');
    p.append(status);
  }
  if (s.coach) {
    const note = el('p', s.coach, 'note');
    note.id = 'coachNote';
    p.append(note);
  }
  frag.append(p);
  const preview = panel('Your decision brief'),
    copy = el('div', null, 'brief');
  copy.id = 'preview';
  preview.append(copy);
  preview.append(
    actions(
      button('Download Markdown', () => {
        validateFinal();
        download();
      }),
      button(
        'Print brief',
        () => {
          validateFinal();
          window.print();
        },
        true,
      ),
    ),
  );
  frag.append(preview);
  return frag;
}
function entries(fields) {
  return fields
    .filter((f) => active(f, get) && get(f.id) !== '')
    .map((f) => {
      const data = s.fields[f.id];
      const src =
        f.type === 'number'
          ? ' [' + (sourceNames[data.source] || data.source) + (data.note ? ' · ' + data.note : '') + ']'
          : '';
      return fieldLabel(f.id, f.label) + ' — ' + get(f.id) + src;
    });
}
function resultLines(result) {
  return result.tables
    .flatMap((t) => [
      t.title,
      ...t.rows.map(
        (r) =>
          r[0] +
          ' — ' +
          r
            .slice(1)
            .map((v, i) => t.head[i + 1] + ': ' + v)
            .join(' / '),
      ),
    ])
    .concat(result.notes);
}
function brief() {
  const sections = [
    ['Your venture', entries(context)],
    ['Original prediction', entries(ex.predict)],
    ['Confirmed worksheet', entries(allBase())],
    ['Original calculation', resultLines(ex.result(s, get, false))],
    ['Revised assumptions', entries(flatten(ex.lab(s, get)))],
    ['Revised calculation', resultLines(checkedLab())],
  ];
  const decision = entries(ex.final);
  if (kind === 'channels' && get('testChannel')) {
    decision.push(
      'Chosen test channel — ' + get((get('testChannel') === 'Channel 1' ? 'a' : 'b') + 'Name'),
    );
    try {
      decision.push(...experimentNotes(channelExperiment(get)));
    } catch {
      // The live experiment panel explains any edits needed before export.
    }
  }
  sections.push(['Decision and next step', decision]);
  if (s.coach) sections.push(['Coaching question', [s.coach]]);
  return sections;
}
function updatePreview() {
  const dest = $('preview');
  if (!dest) return;
  try {
    const sections = brief();
    dest.replaceChildren();
    for (const [title, lines] of sections) {
      const d = el('details');
      d.open = title === 'Decision and next step';
      d.append(el('summary', title), el('pre', lines.join('\n')));
      dest.append(d);
    }
    const print = $('printout') || el('article');
    print.id = 'printout';
    print.hidden = true;
    print.replaceChildren(el('h1', ex.topic + ' decision brief'));
    for (const [title, lines] of sections) print.append(el('h2', title), el('pre', lines.join('\n')));
    document.body.append(print);
  } catch (e) {
    dest.textContent = e.message;
    $('printout')?.remove();
  }
}
function download() {
  const md =
    '# ' +
    ex.topic +
    ' decision brief\n\n' +
    brief()
      .map(([t, lines]) => '## ' + t + '\n\n' + lines.map((v) => '- ' + v).join('\n'))
      .join('\n\n') +
    '\n';
  const url = URL.createObjectURL(new Blob([md], { type: 'text/markdown;charset=utf-8' })),
    a = el('a');
  a.href = url;
  a.download = kind + '-decision-brief.md';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function render() {
  $('status').textContent = '';
  $('notice').replaceChildren();
  $('page').replaceChildren();
  $('steps').replaceChildren(
    ...['Venture', 'Worksheet', 'Compare', 'Decision brief'].map((label, i) => {
      const b = button(label, () => {
        if (i === 3) checkedLab();
        go(i);
      });
      b.disabled = i > s.max || !!request;
      if (i === s.step) b.setAttribute('aria-current', 'step');
      return b;
    }),
  );
  const container = el('fieldset');
  container.disabled = !!request;
  container.append([contextPage, worksheet, labPage, finalPage][s.step]());
  $('page').append(container);
  if (s.step === 2) updateLab();
  if (s.step === 3) {
    updateChannelExperiment();
    updatePreview();
  } else $('printout')?.remove();
  if (request) {
    $('notice').append(
      el('span', 'Waiting for the AI service… '),
      button('Cancel request', () => request?.abort(), true),
    );
  }
  $('reset').disabled = !!request;
  $('settings').disabled = !!request;
}
function readDraft(out, eligible) {
  const allowed = new Map(eligible.map((f) => [f.id, f])),
    seen = new Set(),
    proposals = [],
    clarify = [];
  const description = [get('company'), get('scenario')];
  if (kind === 'channels') description.push(...allBase().map((f) => s.fields[f.id]?.note || ''));
  for (const proposal of out.suggestions) {
    const p = proposal && { ...proposal };
    if (
      !allowed.has(p?.id) ||
      seen.has(p.id) ||
      typeof p.value !== 'string' ||
      !p.value.trim() ||
      typeof p.rationale !== 'string'
    )
      continue;
    if (
      p.origin !== 'estimate' &&
      (p.origin !== 'stated' ||
        typeof p.quote !== 'string' ||
        !p.quote.trim() ||
        !description.some((text) => text.includes(p.quote)))
    )
      continue;
    const f = allBase().find((f) => f.id === p.id);
    p.value = p.value.trim();
    if (
      kind === 'channels' &&
      f.type === 'number' &&
      /^\$?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(p.value)
    ) {
      if (!p.value.startsWith('$') || f.label.endsWith('($)')) p.value = p.value.replace(/[$,]/g, '');
    }
    if (p.origin === 'stated' && f.type === 'number' && !quoteContainsValue(p.quote, p.value)) {
      clarify.push(
        'Please enter ' + fieldLabel(f.id, f.label) + ' directly so your stated figure is preserved.',
      );
      continue;
    }
    try {
      validateFields([{ ...f, when: null, optional: false }], () => p.value);
    } catch {
      continue;
    }
    proposals.push(p);
    seen.add(p.id);
  }
  return {
    proposals: kind === 'channels' ? reviewChannelDraft(proposals, get) : proposals,
    questions: out.questions.filter((q) => typeof q === 'string' && q.trim()).concat(clarify),
  };
}
function channelMessage(mode, message) {
  const status = $(mode === 'draft' ? 'channelDraftStatus' : 'channelCoachStatus');
  if (!status) return;
  status.textContent = message;
  if (message) {
    status.tabIndex = -1;
    status.focus();
  }
}
async function draftChannels(payload, eligible, settings, signal) {
  const send = (fields, confirmed) =>
    assist(
      'channels_draft',
      {
        ...payload,
        eligible: fields,
        confirmed,
      },
      settings,
      signal,
    );
  const first = readDraft(await send(eligible, payload.confirmed), eligible);
  const missing = missingChannelDraftFields(eligible, first.proposals, get);
  if (!missing.length || signal.aborted) return first;
  $('notice').firstElementChild.textContent = 'Estimating the remaining trial figures… ';
  try {
    const seeds = first.proposals.map(({ id, value, origin }) => ({
      id,
      value,
      source: origin + ' in first draft',
    }));
    const second = readDraft(await send(missing, payload.confirmed.concat(seeds)), missing);
    return {
      proposals: reviewChannelDraft([...first.proposals, ...second.proposals], get),
      questions: [...new Set([...first.questions, ...second.questions])],
    };
  } catch (error) {
    if (!first.proposals.length || signal.aborted) throw error;
    return { ...first, partial: true };
  }
}
async function runAI(mode) {
  if (request) return;
  let controller,
    timer,
    timedOut = false;
  const isChannels = kind === 'channels';
  try {
    validateFields(context, get);
    const payload = { assignment: ex.topic, company: get('company'), scenario: get('scenario') };
    const eligible = mode === 'draft' ? draftFields() : [];
    if (mode === 'draft') {
      if (!eligible.length) {
        throw Error(
          isChannels
            ? 'The trial fields are filled in. Use these figures to choose your initial allocation.'
            : 'All worksheet fields already contain values.',
        );
      }
      payload.eligible = eligible;
      payload.confirmed = isChannels
        ? allBase()
            .filter((f) => active(f, get) && get(f.id) !== '')
            .map((f) => ({
              id: f.id,
              value: get(f.id),
              source: s.fields[f.id]?.source,
              note: s.fields[f.id]?.note,
            }))
        : entries(allBase());
    } else {
      const result = checkedLab();
      if (isChannels) {
        payload.experiment = channelExperiment(get);
        payload.limit = get('constraint');
      } else {
        payload.calculations = resultLines(result);
        payload.confirmed = entries([...allBase(), ...flatten(ex.lab(s, get))]);
      }
      if (!isChannels && !get('decision').trim())
        throw Error('Write your decision first so the coach can respond to your reasoning.');
      payload.reasoning = entries(ex.final);
    }
    controller = new AbortController();
    request = controller;
    render();
    if (isChannels) $('notice').querySelector('button')?.focus();
    timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 60000);
    const service = { endpoint: settings.endpoint || defaultEndpoint, key: secret };
    let message;
    if (mode === 'draft') {
      const draft = isChannels
        ? await draftChannels(payload, eligible, service, controller.signal)
        : readDraft(await assist(mode, payload, service, controller.signal), eligible);
      controller.signal.throwIfAborted();
      s.pending = draft.proposals;
      s.questions = isChannels ? draft.questions.slice(0, 3) : draft.questions;
      message = isChannels
        ? s.pending.length
          ? 'Review suggested figures beside the worksheet fields below.' +
            (draft.partial
              ? ' The follow-up request didn’t finish. You can keep these suggestions and fill in the remaining fields.'
              : '')
          : 'The AI returned no usable figures. Describe your product or trial in more detail and try again, or enter your own estimates.'
        : 'Draft ready. Review suggestions above.';
    } else {
      const out = await assist(
        isChannels ? 'channels_coach' : mode,
        payload,
        service,
        controller.signal,
      );
      controller.signal.throwIfAborted();
      s.coach = out.question.trim();
      message = 'Coaching question ready.';
    }
    save();
    request = null;
    render();
    if (isChannels) channelMessage(mode, message);
    else $('status').textContent = message;
  } catch (e) {
    if (controller) {
      request = null;
      render();
      const serviceError = timedOut
        ? 'The AI service took too long to reply.'
        : controller.signal.aborted
          ? 'Request stopped.'
          : e.message;
      const offline =
        mode === 'draft'
          ? isChannels
            ? 'Try again or use a small trial for each channel. Estimate its cost, how many people it reaches, and how many will buy.'
            : 'For your venture, list one observed price or cost. Enter other figures as student estimates and note what you would check.'
          : ex.fallback;
      const message = serviceError + ' Your entries are saved in this tab. ' + offline;
      if (isChannels) channelMessage(mode, message);
      else error(Error(message));
    } else if (isChannels && !e.fieldId) channelMessage(mode, e.message);
    else error(e);
  } finally {
    clearTimeout(timer);
  }
}
$('settings').onclick = () => {
  $('endpoint').value = settings.endpoint;
  $('apiKey').value = secret;
  $('remember').checked = !!settings.key;
  $('config').returnValue = 'cancel';
  $('config').showModal();
};
$('config').onclose = () => {
  if ($('config').returnValue !== 'save') return;
  secret = $('apiKey').value.trim();
  settings = { endpoint: $('endpoint').value.trim() || defaultEndpoint };
  if ($('remember').checked) settings.key = secret;
  try {
    localStorage.setItem('venture_ai_settings', JSON.stringify(settings));
  } catch {
    error(Error('Settings apply to this tab only.'));
  }
};
$('reset').onclick = () => {
  if (confirm('Clear this assignment on this device and start a new venture?')) {
    s = fresh();
    go(0);
  }
};
$('title').textContent = ex.title;
$('intro').textContent = ex.intro;
render();
save();
