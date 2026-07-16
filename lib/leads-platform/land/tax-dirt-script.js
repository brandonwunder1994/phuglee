'use strict';

/**
 * Tax Dirt outreach snippet (Wholesale Brain land doctrine).
 * Copy-only helper for Land Vault — not a dialer.
 */

const TAX_DIRT_SCRIPT = Object.freeze({
  id: 'tax-dirt',
  title: 'Tax Dirt script',
  frame: 'Frame unused land as an expense (tax bill), not an investment.',
  lines: Object.freeze([
    'You’re still paying property taxes on that dirt every year, right?',
    'Would it help if I just took that off your hands so you don’t have to keep paying for something you’re not using?'
  ]),
  notes: Object.freeze([
    'Pause after the first question — let them answer.',
    'Don’t insult the land. Don’t say it’s worthless. Change the lens: asset → tax-bill dirt.',
    'Pairs with silence after questions, then LAO after numbers.'
  ]),
  source: 'brain/land/tax-dirt-script.md'
});

function getTaxDirtScript() {
  return {
    id: TAX_DIRT_SCRIPT.id,
    title: TAX_DIRT_SCRIPT.title,
    frame: TAX_DIRT_SCRIPT.frame,
    lines: [...TAX_DIRT_SCRIPT.lines],
    notes: [...TAX_DIRT_SCRIPT.notes],
    source: TAX_DIRT_SCRIPT.source
  };
}

function leadHasTaxDirtSignal(lead = {}) {
  const blob = [
    ...(Array.isArray(lead.signalTags) ? lead.signalTags : []),
    lead.topSignal,
    lead.teardown?.reason,
    lead.leadType
  ].map((s) => String(s || '').toLowerCase()).join(' ');
  return /\btax\b/.test(blob) || blob.includes('auction') || blob.includes('delinquent');
}

module.exports = {
  TAX_DIRT_SCRIPT,
  getTaxDirtScript,
  leadHasTaxDirtSignal
};
