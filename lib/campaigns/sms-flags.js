'use strict';

function envTruthy(name) {
  const v = String(process.env[name] || '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

/** Live SMS sends. Default false — never send without explicit env. */
function isSmsCampaignsLive() {
  return envTruthy('SMS_CAMPAIGNS_LIVE');
}

/** Auto sequence tick. Only meaningful when LIVE is also true. */
function isSmsCampaignsAuto() {
  return envTruthy('SMS_CAMPAIGNS_AUTO');
}

module.exports = {
  isSmsCampaignsLive,
  isSmsCampaignsAuto
};
