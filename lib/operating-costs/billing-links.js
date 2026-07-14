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
        label: 'Maps Platform metrics',
        href: 'https://console.cloud.google.com/google/maps-apis/metrics'
      }
    },
    gemini: {
      label: 'Google Cloud billing',
      href: 'https://console.cloud.google.com/billing',
      secondary: {
        label: 'AI Studio / API keys',
        href: 'https://aistudio.google.com/apikey'
      }
    }
  };
}

module.exports = { billingLinks };
