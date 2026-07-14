'use strict';

/**
 * Deep links to provider billing / usage consoles for Operating Costs cards.
 */
function billingLinks({ railwayProjectId } = {}) {
  const railwayUsage = railwayProjectId
    ? `https://railway.com/project/${encodeURIComponent(railwayProjectId)}`
    : 'https://railway.com/workspace/usage';

  return {
    railway: {
      label: 'Open Railway usage',
      href: railwayUsage,
      secondary: { label: 'Railway billing', href: 'https://railway.com/workspace/billing' }
    },
    ghl: {
      label: 'Open HighLevel',
      href: 'https://app.gohighlevel.com/',
      secondary: { label: 'Agency billing', href: 'https://agency.gohighlevel.com/' }
    },
    signnow: {
      label: 'Open SignNow',
      href: 'https://app.signnow.com/',
      secondary: { label: 'SignNow account', href: 'https://www.signnow.com/login' }
    },
    maps: {
      label: 'Google Cloud billing',
      href: 'https://console.cloud.google.com/billing',
      secondary: {
        label: 'Billing credits',
        href: 'https://console.cloud.google.com/billing'
      }
    },
    gemini: {
      // Gemini API / AI Studio is billed separately from Cloud Billing promo credits.
      label: 'Google AI Studio usage',
      href: 'https://aistudio.google.com/',
      secondary: {
        label: 'Gemini API pricing',
        href: 'https://ai.google.dev/pricing'
      }
    }
  };
}

module.exports = { billingLinks };
