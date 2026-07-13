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

  function buildProfileSectionNavHtml(sectionIds) {
    const ids = Array.isArray(sectionIds) ? sectionIds : [];
    return ids.map((id, i) => {
      const label = PROFILE_SECTION_LABELS[id] || id;
      const current = i === 0 ? ' aria-current="true"' : '';
      return `<button type="button" class="profile-section-chip" data-profile-section="${escapeAttr(id)}"${current}>${escapeAttr(label)}</button>`;
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
