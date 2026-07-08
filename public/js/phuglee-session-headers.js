(function () {
  'use strict';

  var STORAGE_USERS = 'phuglee_users';
  var SESSION_KEY = 'phuglee_session';

  function getSessionUser() {
    try {
      if (window.PhugleeAuth && typeof window.PhugleeAuth.getSessionUser === 'function') {
        return window.PhugleeAuth.getSessionUser() || '';
      }
      return sessionStorage.getItem(SESSION_KEY) || '';
    } catch (_) {
      return '';
    }
  }

  function getSessionPlan() {
    try {
      var user = getSessionUser();
      if (!user) return '';
      var users = JSON.parse(localStorage.getItem(STORAGE_USERS) || '{}');
      var record = users[user];
      if (user === 'admin') return (record && record.plan) || 'pro';
      return (record && record.plan) || 'lite';
    } catch (_) {
      return '';
    }
  }

  function phugleeSessionHeaders(extra) {
    var headers = Object.assign({}, extra || {});
    var user = getSessionUser();
    var plan = getSessionPlan();
    if (user) headers['X-Phuglee-User'] = user;
    if (plan) headers['X-Phuglee-Plan'] = plan;
    return headers;
  }

  window.PhugleeSessionHeaders = {
    getSessionUser: getSessionUser,
    getSessionPlan: getSessionPlan,
    phugleeSessionHeaders: phugleeSessionHeaders
  };
})();