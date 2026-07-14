'use strict';

/**
 * Hardwired Contract Tracker team contacts for SMS/email alerts.
 */

const TEAM = Object.freeze({
  admin: {
    key: 'admin',
    username: 'admin',
    name: 'Brandon Wunder',
    phone: '6028158040',
    email: 'brandon@wunderhausgroup.com'
  },
  brad: {
    key: 'brad',
    username: 'brad',
    name: 'Brad Lewis',
    phone: '6822738445',
    email: 'buyhomes995@gmail.com'
  }
});

function normalizeTeamUser(username) {
  const u = String(username || '').trim().toLowerCase();
  if (u === 'admin') return 'admin';
  if (u === 'brad') return 'brad';
  return '';
}

function getTeamMember(key) {
  const k = normalizeTeamUser(key);
  return k ? TEAM[k] : null;
}

function otherTeamMember(key) {
  const k = normalizeTeamUser(key);
  if (k === 'admin') return TEAM.brad;
  if (k === 'brad') return TEAM.admin;
  return null;
}

function allTeamMembers() {
  return [TEAM.admin, TEAM.brad];
}

function digitPhone(phone) {
  return String(phone || '').replace(/\D/g, '');
}

module.exports = {
  TEAM,
  normalizeTeamUser,
  getTeamMember,
  otherTeamMember,
  allTeamMembers,
  digitPhone
};
