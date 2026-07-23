'use strict';

// DRAFT — human approve every line before SMS_CAMPAIGNS_LIVE=true

const TEMPLATES = [
  {
    id: 'cv-touch-01',
    body: "Hey {first}, my name is Brandon. I'm looking to buy in the area — would you sell {street}?"
  },
  {
    id: 'cv-touch-02',
    body: 'Hey {first}, Brandon again. Still buying near {city}. Open to an offer on {street}?'
  },
  {
    id: 'cv-touch-03',
    body: 'Hi {first} — is this still the best number for the owner of {street}? If so, would you consider selling?'
  },
  {
    id: 'cv-touch-04',
    body: '{first}, we buy houses as-is in {city}. No repairs, no agents. Worth a quick chat about {street}?'
  },
  {
    id: 'cv-touch-05',
    body: "Hey {first}, just checking back on {street}. Any interest in a cash offer, even if timing's later?"
  },
  {
    id: 'cv-touch-06',
    body: 'Brandon here — still interested in {street} if you would ever sell. Reply YES or NO either way?'
  },
  {
    id: 'cv-touch-07',
    body: 'Hi {first}, local buyer for {street}. Want me to send a no-obligation number?'
  },
  {
    id: 'cv-touch-08',
    body: 'Quick one — still own {street}? If yes, open to offers this year?'
  },
  {
    id: 'cv-touch-09',
    body: "{first}, checking in on {street}. If now's not the time, totally fine — want me to stop texting?"
  },
  {
    id: 'cv-touch-10',
    body: 'Still buying in {city}. {street} still on your radar to sell?'
  },
  {
    id: 'cv-touch-11',
    body: 'Hey {first}, last few check-ins on {street}. Happy to chat if anything changed.'
  },
  {
    id: 'cv-touch-12',
    body: 'Final check-in for now on {street}. Reply stop if you want off the list — otherwise I am here if you want an offer.'
  }
];

function getMessageTemplate(touch1to12) {
  const n = Number(touch1to12);
  if (!Number.isInteger(n) || n < 1 || n > 12) {
    const err = new Error(`touch must be 1-12, got ${touch1to12}`);
    err.code = 'INVALID_TOUCH';
    throw err;
  }
  return { ...TEMPLATES[n - 1] };
}

function renderMessage(touch, { firstName = '', street = '', city = '' } = {}) {
  const tpl = getMessageTemplate(touch);
  const first = String(firstName || '').trim() || 'there';
  const st = String(street || '').trim() || 'your property';
  const c = String(city || '').trim() || 'the area';
  let body = tpl.body
    .replace(/\{first\}/g, first)
    .replace(/\{street\}/g, st)
    .replace(/\{city\}/g, c);
  if (body.length > 160) {
    body = body.slice(0, 157).trimEnd() + '…';
  }
  return body;
}

module.exports = {
  TEMPLATES,
  getMessageTemplate,
  renderMessage
};
