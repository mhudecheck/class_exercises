const estimateIds = new Set([
  'budget',
  'customer',
  'aName',
  'aSpend',
  'aReach',
  'aWon',
  'aType',
  'aRate',
  'bName',
  'bSpend',
  'bReach',
  'bWon',
  'bType',
  'bRate',
]);

export function channelDraftFields(fields, get) {
  return fields.filter(
    (field) =>
      estimateIds.has(field.id) &&
      !get(field.id) &&
      (!field.condition || !get(field.condition[0]) || get(field.condition[0]) === field.condition[1]),
  );
}

function reviewValue(proposals, get) {
  return (id) => get(id) || proposals.get(id)?.value || '';
}

export function reviewChannelDraft(suggestions, get) {
  const proposals = new Map(suggestions.map((proposal) => [proposal.id, proposal]));
  const value = reviewValue(proposals, get);
  for (const prefix of ['a', 'b']) {
    const rate = prefix + 'Rate';
    const type = value(prefix + 'Type');
    if (type && type !== 'Whole bookings') proposals.delete(rate);

    const reach = prefix + 'Reach',
      won = prefix + 'Won';
    if (value(reach) === '' || value(won) === '' || Number(value(won)) <= Number(value(reach))) continue;
    const reachProposal = proposals.get(reach);
    const wonProposal = proposals.get(won);
    if (
      reachProposal &&
      (!wonProposal || (wonProposal.origin === 'stated' && reachProposal.origin !== 'stated'))
    ) {
      proposals.delete(reach);
    } else {
      proposals.delete(won);
    }
  }
  return [...proposals.values()];
}

export function missingChannelDraftFields(eligible, suggestions, get) {
  const proposals = new Map(suggestions.map((proposal) => [proposal.id, proposal]));
  const value = reviewValue(proposals, get);
  return eligible.filter(
    (field) =>
      !value(field.id) && (!field.condition || value(field.condition[0]) === field.condition[1]),
  );
}

export function checkChannelCounts(prefix, get) {
  const reach = get(prefix + 'Reach');
  const won = get(prefix + 'Won');
  if (reach === '' || won === '' || Number(won) <= Number(reach)) return;
  const error = Error(
    (get(prefix + 'Name') || (prefix === 'a' ? 'Channel 1' : 'Channel 2')) +
      ' cannot have more first-time buyers than people it reached. Check both counts for the same trial.',
  );
  error.fieldId = prefix + 'Won';
  throw error;
}
