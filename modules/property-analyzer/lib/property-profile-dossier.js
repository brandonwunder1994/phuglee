// modules/property-analyzer/lib/property-profile-dossier.js
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PDA = root.PDA || {};
    root.PDA.lib = root.PDA.lib || {};
    root.PDA.lib.propertyProfileDossier = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function propertyProfileDossierFactory() {
  const PROFILE_SECTION_ORDER = ['overview', 'contact', 'violations', 'values', 'property', 'flags'];
  const PROFILE_SECTION_LABELS = {
    overview: 'Overview',
    contact: 'Contact',
    violations: 'Violations',
    values: 'Values',
    property: 'Property',
    flags: 'Flags'
  };

  function propertyHasSatelliteMedia(input) {
    if (!input || !input.hasSatelliteUrl) return false;
    return !!(
      input.hasCachedSatellite ||
      input.usedSatellite ||
      input.skippedStreetView ||
      input.preferSatellite
    );
  }

  function getPresentProfileSections(flags) {
    const f = flags || {};
    const present = [];
    for (const id of PROFILE_SECTION_ORDER) {
      const key = 'has' + id.charAt(0).toUpperCase() + id.slice(1);
      // overview uses hasOverview
      if (f[key]) present.push(id);
    }
    return present;
  }

  function escapeAttr(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;');
  }

  function buildProfileSectionNavHtml(sectionIds, activeId) {
    const ids = Array.isArray(sectionIds) ? sectionIds : [];
    const active = activeId && ids.includes(activeId) ? activeId : ids[0];
    return ids.map((id) => {
      const label = PROFILE_SECTION_LABELS[id] || id;
      const selected = id === active;
      return `<button type="button" role="tab" class="profile-section-chip" id="profile-tab-${escapeAttr(id)}" data-profile-section="${escapeAttr(id)}" aria-controls="profile-section-${escapeAttr(id)}" aria-selected="${selected ? 'true' : 'false'}" tabindex="${selected ? '0' : '-1'}">${escapeAttr(label)}</button>`;
    }).join('');
  }

  return {
    PROFILE_SECTION_ORDER,
    PROFILE_SECTION_LABELS,
    propertyHasSatelliteMedia,
    getPresentProfileSections,
    buildProfileSectionNavHtml
  };
});
