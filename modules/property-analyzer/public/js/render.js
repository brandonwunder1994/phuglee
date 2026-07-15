// render.js — PDA module (shared PDA.env runtime)
(function (global) {
  const PDA = global.PDA = global.PDA || {};
  if (typeof window !== 'undefined') window.PDA = PDA;
  PDA.env = PDA.env || {};
  const R = PDA.env;
  with (R) {

R.profileField = function profileField(val) {
  const s = String(val == null ? '' : val).trim();
  if (!s || /^n\/?a$/i.test(s) || /^none$/i.test(s) || s === '0' && false) return '';
  return s;
};

R.formatProfileMoney = function formatProfileMoney(val) {
  const s = profileField(val);
  return s || '';
};

R.formatProfileFlagChips = function formatProfileFlagChips(flags) {
  if (!flags || typeof flags !== 'object') return '';
  const labels = {
    absenteeOwner: 'Absentee',
    activeListing: 'Active listing',
    boredInvestor: 'Bored investor',
    cashBuyer: 'Cash buyer',
    delinquentTaxActivity: 'Tax delinquent',
    flipped: 'Flipped',
    foreclosureActivity: 'Foreclosure activity',
    foreclosures: 'Foreclosure',
    freeAndClear: 'Free & clear',
    highEquity: 'High equity',
    longTermOwner: 'Long-term owner',
    lowEquity: 'Low equity',
    potentiallyInherited: 'Inherited?',
    preForeclosure: 'Pre-foreclosure',
    upsideDown: 'Upside down',
    vacancy: 'Vacant',
    zombieProperty: 'Zombie',
    activeInvestorOwned: 'Investor owned'
  };
  const chips = [];
  for (const [key, label] of Object.entries(labels)) {
    const v = flags[key];
    if (v === 1 || v === true || v === '1' || String(v).toLowerCase() === 'true') {
      chips.push(`<span class="profile-flag-chip">${escapeHtml(label)}</span>`);
    }
  }
  return chips.length ? `<div class="profile-flags">${chips.join('')}</div>` : '';
};

R.profileSectionWrap = function profileSectionWrap(id, title, innerHtml) {
  if (!innerHtml) return '';
  return `<section class="profile-dossier-section" id="profile-section-${id}" data-profile-section="${id}">
    <h3 class="profile-dossier-section-title">${escapeHtml(title)}</h3>
    ${innerHtml}
  </section>`;
};

/** Structured dossier parts for cinematic profile (sectioned HTML + presence flags). */
R.buildProfileDossierParts = function buildProfileDossierParts(r) {
  const empty = {
    flags: {
      hasOverview: true,
      hasContact: false,
      hasViolations: false,
      hasValues: false,
      hasProperty: false,
      hasFlags: false
    },
    sectionsHtml: {
      contact: '',
      violations: '',
      values: '',
      property: '',
      flags: ''
    }
  };
  if (!r) return empty;

  const p = r.profile && typeof r.profile === 'object' ? r.profile : {};
  const row = (label, value) => {
    const v = profileField(value);
    if (!v) return '';
    return `<div class="profile-kv"><span class="lbl">${escapeHtml(label)}</span><span class="val">${escapeHtml(v)}</span></div>`;
  };

  const mailingParts = [p.mailingStreet, p.mailingCity, p.mailingState, p.mailingPostal].filter((x) => profileField(x));
  const propParts = [r.street, r.city, r.state, r.postal].filter((x) => profileField(x));
  const mailingLine = mailingParts.join(', ');
  const propLine = propParts.join(', ');
  const showMailing = mailingLine && mailingLine.toLowerCase() !== propLine.toLowerCase();

  const phoneRows = Array.isArray(p.phones)
    ? p.phones.map((ph, i) => {
      const num = profileField(ph && ph.number);
      if (!num) return '';
      const meta = [profileField(ph.type), ph.dnc ? 'DNC' : '', ph.litigator ? 'Litigator' : ''].filter(Boolean).join(' · ');
      return `<div class="contact-chip profile-extra-contact">
        <span class="lbl">Phone ${i + 1}</span>
        <span class="val">${escapeHtml(num)}${meta ? ` <span class="profile-meta">(${escapeHtml(meta)})</span>` : ''}</span>
        <button type="button" class="copy-btn copy-profile-phone" data-phone="${escapeHtml(num)}">Copy</button>
      </div>`;
    }).join('')
    : '';

  const emailRows = Array.isArray(p.emails)
    ? p.emails.map((em, i) => {
      const email = profileField(em);
      if (!email) return '';
      return `<div class="contact-chip profile-extra-contact">
        <span class="lbl">Email ${i + 1}</span>
        <span class="val">${escapeHtml(email)}</span>
        <button type="button" class="copy-btn copy-profile-email" data-email="${escapeHtml(email)}">Copy</button>
      </div>`;
    }).join('')
    : '';

  const name = (typeof contactName === 'function' ? contactName(r) : '') || profileField(p.contactName) || '';
  const hasPrimaryContact = !!(r.phone || r.email || name);
  const hasProfileContact = !!(phoneRows || emailRows || profileField(p.contactName) || profileField(p.contactType) || showMailing);
  const hasContact = hasPrimaryContact || hasProfileContact;

  let contactInner = '';
  if (hasContact) {
    contactInner = `
      <div class="inspector-contacts">
        <div class="contact-chip">
          <span class="lbl">Contact</span>
          <span class="val">${escapeHtml(name || '—')}</span>
        </div>
        <div class="contact-chip">
          <span class="lbl">Phone</span>
          <span class="val">${escapeHtml(r.phone || '—')}</span>
          ${r.phone ? '<button type="button" class="copy-btn copy-phone">Copy</button>' : ''}
        </div>
        <div class="contact-chip">
          <span class="lbl">Email</span>
          <span class="val">${escapeHtml(r.email || '—')}</span>
          ${r.email ? '<button type="button" class="copy-btn copy-email">Copy</button>' : ''}
        </div>
      </div>
      ${row('Contact name', p.contactName)}
      ${row('Contact type', p.contactType)}
      ${phoneRows}${emailRows}
      ${showMailing ? `<div class="profile-kv"><span class="lbl">Mail to</span><span class="val">${escapeHtml(mailingLine)}</span></div>` : ''}
    `;
  }

  const facts = [
    row('Type', p.propertyType),
    row('Beds / Baths', [profileField(p.beds), profileField(p.baths)].filter(Boolean).join(' / ')),
    row('Sq Ft', p.squareFootage),
    row('Lot Sq Ft', p.lotSizeSqFt),
    row('Year built', p.yearBuilt),
    row('Stories', p.stories),
    row('Units', p.units),
    row('Owner type', p.ownerType),
    row('County', p.county),
    row('Last sale', [profileField(p.lastSalesDate), formatProfileMoney(p.lastSalesPrice)].filter(Boolean).join(' · ')),
    row('Price / sqft', p.pricePerSqFt)
  ].join('');

  const money = [
    row('AVM', p.avm),
    row('Market (retail)', p.marketValue),
    row('Wholesale', p.wholesaleValue),
    row('Tax assessed', p.taxAssessedValue),
    row('Tax amount', p.taxAmount),
    row('LTV', p.ltv),
    row('Mortgage bal.', p.estimatedMortgageBalance),
    row('Est. payment', p.estimatedMortgagePayment),
    row('Interest rate', p.mortgageInterestRate),
    row('Lender', p.lenderName),
    row('Loan type', p.loanType),
    row('Loans', p.numberOfLoans ? `${p.numberOfLoans}${profileField(p.totalLoans) ? ` · ${p.totalLoans}` : ''}` : '')
  ].join('');

  const amenities = [
    row('Heating', [profileField(p.heating), profileField(p.heatingFuel)].filter(Boolean).join(' · ')),
    row('A/C', p.airConditioning),
    row('Fireplace', p.fireplace),
    row('Roof', [profileField(p.roof), profileField(p.roofShape)].filter(Boolean).join(' · ')),
    row('Walls', p.interiorWalls),
    row('Basement', p.basement),
    row('Water', p.water),
    row('Sewer', p.sewer),
    row('Garage', p.garage),
    row('Patio', p.patio),
    row('Pool', p.pool),
    row('Porch', p.porch),
    row('HOA', p.hoa),
    row('HOA name', p.hoaName),
    row('HOA fee', [profileField(p.hoaFee), profileField(p.hoaFeeFrequency)].filter(Boolean).join(' / '))
  ].join('');

  const distressExtra = [
    row('Auction date', p.auctionDate),
    row('Last notice', p.lastNoticeDate)
  ].join('');

  const flagHtml = formatProfileFlagChips(p.flags);

  // Code violation history (Filter SCAN HISTORY cross-ref + top-level fields)
  const violList = Array.isArray(p.violations) && p.violations.length
    ? p.violations
    : (Array.isArray(r.violations) ? r.violations : []);
  const primaryCat = profileField(p.codeCategory) || profileField(r.codeCategory);
  const primaryType = profileField(p.codeType) || profileField(r.codeType);
  const primaryDesc = profileField(p.violationDescription) || profileField(r.violationDescription);
  const primaryDate = profileField(p.violationDate) || profileField(r.violationDate);
  let violationHtml = '';
  if (violList.length) {
    const items = violList.slice(0, 8).map((v) => {
      const cat = profileField(v.category) || profileField(v.codeType);
      const desc = profileField(v.violationDescription) || profileField(v.codeType);
      const date = profileField(v.violationDate);
      const bits = [cat || desc, date].filter(Boolean).join(' · ');
      if (!bits) return '';
      return `<div class="profile-kv profile-violation-row"><span class="lbl">${escapeHtml(date || 'Violation')}</span><span class="val">${escapeHtml(cat || desc || '—')}${desc && cat && desc !== cat ? `<div class="profile-meta">${escapeHtml(desc)}</div>` : ''}</span></div>`;
    }).join('');
    violationHtml = items;
  } else if (primaryCat || primaryType || primaryDesc || primaryDate) {
    violationHtml = [
      row('Code type / category', primaryCat || primaryType),
      row('Violation description', primaryDesc),
      row('Violation date', primaryDate)
    ].join('');
  }

  let violationsInner = '';
  if (violationHtml) {
    const count = violList.length || (primaryCat || primaryDesc ? 1 : 0);
    violationsInner = `
      <div class="profile-grid">${violationHtml}</div>
      <div class="profile-meta" style="margin-top:0.35rem;">From Filter SCAN HISTORY${count > 1 ? ` · ${count} records` : ''}</div>
    `;
  }

  let propertyInner = '';
  if (facts || amenities) {
    propertyInner = `
      ${facts ? `<div class="profile-grid">${facts}</div>` : ''}
      ${amenities ? `${facts ? '<div class="profile-subsection-title" style="margin-top:0.75rem;font-weight:600;">Features &amp; HOA</div>' : ''}<div class="profile-grid">${amenities}</div>` : ''}
    `;
  }

  const hasViolations = !!violationsInner;
  const hasValues = !!money;
  const hasProperty = !!propertyInner;
  const hasFlags = !!(flagHtml || distressExtra);

  return {
    flags: {
      hasOverview: true,
      hasContact,
      hasViolations,
      hasValues,
      hasProperty,
      hasFlags
    },
    sectionsHtml: {
      contact: profileSectionWrap('contact', 'Contact', contactInner),
      violations: profileSectionWrap('violations', 'Violations', violationsInner),
      values: profileSectionWrap('values', 'Values', money ? `<div class="profile-grid">${money}</div>` : ''),
      property: profileSectionWrap('property', 'Property', propertyInner),
      flags: profileSectionWrap('flags', 'Flags', (flagHtml || distressExtra) ? `${flagHtml || ''}${distressExtra || ''}` : '')
    }
  };
};

/** Legacy join of dossier sections (kept for any external callers). */
R.formatPropertyProfileHtml = function formatPropertyProfileHtml(r) {
  const parts = buildProfileDossierParts(r);
  const html = [
    parts.sectionsHtml.contact,
    parts.sectionsHtml.violations,
    parts.sectionsHtml.values,
    parts.sectionsHtml.property,
    parts.sectionsHtml.flags
  ].filter(Boolean).join('');
  return html;
};

R.wireCardThumb = function wireCardThumb(card, result) {
  const img = card.querySelector('.card-thumb img');
  const fallbackEl = card.querySelector('.card-thumb-fallback');
  const labelEl = card.querySelector('.card-thumb-source');
  if (!img) return;
  const { primary, fallback, label, needsCache } = getCardThumbUrls(result);
  if (!primary) {
    img.style.display = 'none';
    img.removeAttribute('src');
    fallbackEl?.classList.add('visible');
    if (labelEl) {
      labelEl.textContent = '';
      labelEl.style.display = 'none';
    }
    if (!hasImageryKey()) {
      fallbackEl.textContent = 'No photo — check API key in settings';
    } else {
      // Always try live proxy + background disk cache — never tell operators to run migrate-imagery
      fallbackEl.textContent = 'Loading photo…';
      fallbackEl?.classList.add('thumb-loading');
      scheduleImageryCacheForCard(result, card);
      const liveNow = buildLiveThumbUrl(result, { thumb: true });
      if (liveNow) {
        img.style.display = 'block';
        fallbackEl?.classList.remove('visible');
        scheduleThumbImageLoad(img, resolveImageryPublicUrl(liveNow), card);
      }
    }
    return;
  }
  img.style.display = 'block';
  img.classList.remove('loaded');
  fallbackEl?.classList.remove('visible', 'thumb-loading');
  fallbackEl.textContent = 'Loading photo…';
  if (labelEl) {
    labelEl.textContent = label || '';
    labelEl.style.display = label ? '' : 'none';
  }
  const cachedEl = card.querySelector('[data-cached-label]');
  if (cachedEl) {
    cachedEl.textContent = label && /cached/i.test(label) ? 'CACHED' : '';
  }
  const resolvedPrimary = resolveImageryPublicUrl(primary);
  const resolvedFallback = fallback ? resolveImageryPublicUrl(fallback) : '';
  if (resolvedFallback) img.dataset.fallback = resolvedFallback;
  else delete img.dataset.fallback;

  // Always stash a live Street View / satellite URL for error recovery
  const liveForced = hasImageryKey() && result?.address
    ? buildLiveThumbUrl(result, { thumb: true })
    : '';
  const livePrimary = liveForced ? resolveImageryPublicUrl(liveForced) : '';
  if (livePrimary && livePrimary !== resolvedPrimary && livePrimary !== resolvedFallback) {
    img.dataset.liveFallback = livePrimary;
  } else {
    delete img.dataset.liveFallback;
  }
  // One more satellite-only recovery if SV is marked unavailable
  if (hasImageryKey() && result?.address) {
    const satOnly = buildSatelliteThumbUrl(
      result.address,
      getApiKeyForImagery(),
      CARD_SAT_THUMB_SIZE,
      result.viewMeta || null
    );
    if (satOnly) img.dataset.satFallback = resolveImageryPublicUrl(satOnly);
  } else {
    delete img.dataset.satFallback;
  }

  img.onload = () => {
    img.classList.add('loaded');
    fallbackEl?.classList.remove('visible', 'thumb-loading');
  };
  img.onerror = () => {
    const setSrc = (next) => {
      if (!next) return false;
      const resolved = resolveImageryPublicUrl(next);
      if (!resolved || img.getAttribute('src') === resolved) return false;
      img.style.display = 'block';
      fallbackEl?.classList.remove('visible');
      fallbackEl?.classList.add('thumb-loading');
      // Use queue for remote so recovery doesn't stampede Maps either
      scheduleThumbImageLoad(img, resolved, card);
      return true;
    };

    // 1) Live proxy fallback (most common when disk cache 404s)
    if (img.dataset.liveFallback && setSrc(img.dataset.liveFallback)) {
      delete img.dataset.liveFallback;
      if (labelEl) labelEl.textContent = '';
      return;
    }
    // 2) Explicit live Street View rebuild (handles prefix / key timing)
    if (hasImageryKey() && result?.address) {
      const proxyUrl = buildStreetViewThumbUrl(
        result.address,
        getApiKeyForImagery(),
        CARD_THUMB_SIZE,
        result.viewMeta || null
      );
      if (proxyUrl && setSrc(proxyUrl)) {
        if (labelEl) labelEl.textContent = '';
        return;
      }
    }
    // 3) Dataset satellite / satellite rebuild
    if (img.dataset.fallback && setSrc(img.dataset.fallback)) {
      delete img.dataset.fallback;
      if (labelEl) labelEl.textContent = 'Satellite';
      return;
    }
    if (img.dataset.satFallback && setSrc(img.dataset.satFallback)) {
      delete img.dataset.satFallback;
      if (labelEl) labelEl.textContent = 'Satellite';
      return;
    }
    // 4) Background disk-cache attempt, then soft message (never migrate-imagery)
    if (hasImageryKey() && result?.address) {
      scheduleImageryCacheForCard(result, card);
      img.style.display = 'none';
      fallbackEl?.classList.add('visible', 'thumb-loading');
      if (labelEl) labelEl.textContent = '';
      if (fallbackEl) fallbackEl.textContent = 'Loading photo…';
      // Retry live once more after a short delay (rate-limit recovery)
      const retryKey = `thumbRetry:${recordKey(result)}`;
      if (!img.dataset.thumbRetried) {
        img.dataset.thumbRetried = '1';
        setTimeout(() => {
          if (!img.isConnected || thumbImageComplete(img)) return;
          const again = buildLiveThumbUrl(result, { thumb: true });
          if (again) setSrc(again);
        }, 1200);
      } else if (fallbackEl) {
        fallbackEl.classList.remove('thumb-loading');
        fallbackEl.textContent = 'Photo unavailable';
      }
      return;
    }
    img.style.display = 'none';
    fallbackEl?.classList.add('visible');
    fallbackEl?.classList.remove('thumb-loading');
    if (labelEl) labelEl.textContent = '';
    if (fallbackEl) {
      fallbackEl.textContent = hasImageryKey()
        ? 'Photo unavailable'
        : 'No photo — check API key in settings';
    }
  };
  if (img.getAttribute('src') === resolvedPrimary && img.complete && img.naturalWidth) {
    img.classList.add('loaded');
    img.dataset.thumbSrc = resolvedPrimary;
    img.dataset.thumbLoaded = '1';
    return;
  }
  scheduleThumbImageLoad(img, resolvedPrimary, card);
}

R.setPreviewImages = function setPreviewImages({ streetView = null, satellite = null } = {}, target = 'property') {
  // Property cinematic profile: Street View only in hero.
  // Satellite is offered via action button + lightbox, not dual pane.
  if (target === 'property') {
    const imagesEl = previewImages;
    const satWrap = previewSatWrap;
    const satImg = previewSatImg;
    const mainImg = previewImg;
    const placeholder = previewPlaceholder;
    const wrap = previewWrap;
    const paneLabel = previewPaneLabel;
    const mainReticle = previewMainReticle;
    if (!imagesEl) return;

    imagesEl.classList.remove('dual');
    if (satWrap) satWrap.hidden = true;

    const setPreviewImg = typeof setReviewImgSrc === 'function' ? setReviewImgSrc : setImgSrc;
    // Prefer Street View for hero; do not put satellite in main hero
    if (streetView) {
      setPreviewImg(mainImg, streetView);
      if (satImg) {
        satImg.style.display = 'none';
        // stash sat URL for lightbox button if provided
        if (satellite) satImg.dataset.satSrc = satellite;
        else delete satImg.dataset.satSrc;
      }
      if (placeholder) placeholder.style.display = 'none';
      if (wrap) wrap.classList.remove('satellite-target');
      if (paneLabel) paneLabel.textContent = 'Street View';
      if (mainReticle) {
        mainReticle.style.display = 'none';
        mainReticle.hidden = true;
        mainReticle.setAttribute('aria-hidden', 'true');
      }
    } else {
      // No SV: calm empty (even if sat exists — sat is button/lightbox only)
      if (mainImg) {
        mainImg.style.display = 'none';
        mainImg.removeAttribute('src');
      }
      if (satImg) {
        satImg.style.display = 'none';
        if (satellite) satImg.dataset.satSrc = satellite;
        else delete satImg.dataset.satSrc;
      }
      if (placeholder) {
        placeholder.style.display = 'flex';
        const titleEl = placeholder.querySelector('.preview-placeholder-title');
        if (titleEl) titleEl.textContent = 'No Street View for this address';
      }
      if (wrap) wrap.classList.remove('satellite-target');
      if (paneLabel) paneLabel.textContent = 'Street View';
      if (mainReticle) {
        mainReticle.style.display = 'none';
        mainReticle.hidden = true;
        mainReticle.setAttribute('aria-hidden', 'true');
      }
    }
    return;
  }

  // existing dual logic for target === 'scan' unchanged below
  const imagesEl = target === 'scan' ? scanFeedImages : previewImages;
  const satWrap = target === 'scan' ? scanFeedSatWrap : previewSatWrap;
  const satImg = target === 'scan' ? scanFeedSatImg : previewSatImg;
  const mainImg = target === 'scan' ? scanFeedImg : previewImg;
  const placeholder = target === 'scan' ? scanFeedPlaceholder : previewPlaceholder;
  const wrap = target === 'scan' ? scanFeedWrap : previewWrap;
  const paneLabel = target === 'scan' ? scanFeedPaneLabel : previewPaneLabel;
  const mainReticle = target === 'scan' ? scanFeedMainReticle : previewMainReticle;
  if (!imagesEl) return;

  const dual = !!(streetView && satellite);
  imagesEl.classList.toggle('dual', dual);
  if (satWrap) satWrap.hidden = !dual;

  const setPreviewImg = typeof setReviewImgSrc === 'function' ? setReviewImgSrc : setImgSrc;
  if (dual) {
    setPreviewImg(satImg, satellite);
    setPreviewImg(mainImg, streetView);
    placeholder.style.display = 'none';
    wrap.classList.remove('satellite-target');
    paneLabel.textContent = 'Street View';
    mainReticle.style.display = 'none';
  } else if (streetView) {
    setPreviewImg(mainImg, streetView);
    if (satImg) satImg.style.display = 'none';
    placeholder.style.display = 'none';
    wrap.classList.remove('satellite-target');
    paneLabel.textContent = 'Street View';
    mainReticle.style.display = 'none';
  } else if (satellite) {
    setPreviewImg(mainImg, satellite);
    if (satImg) satImg.style.display = 'none';
    placeholder.style.display = 'none';
    wrap.classList.add('satellite-target');
    paneLabel.textContent = 'Satellite';
    mainReticle.style.display = 'block';
  } else {
    mainImg.style.display = 'none';
    if (satImg) satImg.style.display = 'none';
    placeholder.style.display = 'block';
    mainImg.removeAttribute('src');
    if (satImg) satImg.removeAttribute('src');
    wrap.classList.remove('satellite-target');
    mainReticle.style.display = 'none';
  }
}

R.prefersProfileReducedMotion = function prefersProfileReducedMotion() {
  try {
    return typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (_) {
    return false;
  }
};

R.setProfileActiveSection = function setProfileActiveSection(sectionId) {
  if (!profileSectionNav || !inspectorBody || !sectionId) return;
  const sections = inspectorBody.querySelectorAll('.profile-dossier-section[data-profile-section]');
  sections.forEach((sec) => {
    const id = sec.getAttribute('data-profile-section');
    const active = id === sectionId;
    sec.classList.toggle('is-active', active);
    sec.hidden = !active;
    sec.setAttribute('aria-hidden', active ? 'false' : 'true');
  });
  profileSectionNav.querySelectorAll('[data-profile-section]').forEach((chip) => {
    const id = chip.getAttribute('data-profile-section');
    const selected = id === sectionId;
    chip.setAttribute('aria-selected', selected ? 'true' : 'false');
    chip.tabIndex = selected ? 0 : -1;
  });
  state._profileActiveSection = sectionId;
  if (profileDossierScroll) profileDossierScroll.scrollTop = 0;
};

R.wireProfileTabPanels = function wireProfileTabPanels(sectionIds, activeSectionId) {
  if (state._profileSpy) {
    state._profileSpy.disconnect();
    state._profileSpy = null;
  }
  if (!profileSectionNav || !inspectorBody) return;
  const ids = Array.isArray(sectionIds) ? sectionIds : [];
  const fallback = ids[0] || 'overview';
  const active = activeSectionId && ids.includes(activeSectionId) ? activeSectionId : fallback;
  profileSectionNav.setAttribute('role', 'tablist');
  inspectorBody.querySelectorAll('.profile-dossier-section[data-profile-section]').forEach((sec) => {
    const id = sec.getAttribute('data-profile-section');
    sec.setAttribute('role', 'tabpanel');
    sec.setAttribute('aria-labelledby', `profile-tab-${id}`);
  });
  setProfileActiveSection(active);

  const onKeydown = (e) => {
    const chips = [...profileSectionNav.querySelectorAll('[data-profile-section]')];
    if (!chips.length) return;
    const idx = chips.findIndex((c) => c.getAttribute('aria-selected') === 'true');
    let next = idx;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      next = (idx + 1) % chips.length;
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      next = (idx - 1 + chips.length) % chips.length;
    } else if (e.key === 'Home') {
      e.preventDefault();
      next = 0;
    } else if (e.key === 'End') {
      e.preventDefault();
      next = chips.length - 1;
    } else {
      return;
    }
    const id = chips[next]?.getAttribute('data-profile-section');
    if (id) {
      setProfileActiveSection(id);
      chips[next]?.focus();
    }
  };

  if (state._profileTabKeyHandler) {
    profileSectionNav.removeEventListener('keydown', state._profileTabKeyHandler);
  }
  state._profileTabKeyHandler = onKeydown;
  profileSectionNav.addEventListener('keydown', onKeydown);
  state._profileSpy = {
    disconnect() {
      profileSectionNav.removeEventListener('keydown', onKeydown);
      if (state._profileTabKeyHandler === onKeydown) state._profileTabKeyHandler = null;
    }
  };
};

R.updateScanPinUi = function updateScanPinUi() {
  updateAppNav();
}

R.pinProperty = function pinProperty(r) {
  if (!r) return;
  state.pinnedKey = recordKey(r);
  state.pinnedLiveAddress = null;
  updateScanPinUi();
  showInspector(r, { scrollFeed: false, scrollList: false });
}

R.pinLiveScan = function pinLiveScan() {
  if (!state.running || state.pinnedKey) return;
  state.pinnedKey = '__live__';
  state.pinnedLiveAddress = state.scanLiveSnapshot?.address || null;
  updateScanPinUi();
  if (scanFeedStatus) scanFeedStatus.textContent = 'Paused — viewing live feed';
}

R.backToScan = function backToScan() {
  closePropertyModal({ save: false });
  state.pinnedKey = null;
  state.pinnedLiveAddress = null;
  state.appView = 'dashboard';
  updateScanPinUi();
  updateScanFeedUi();
  renderResults();
  updateAppNav();
  saveSession();
}

R.syncResultSelectionDom = function syncResultSelectionDom(prevKey, nextKey) {
  if (prevKey && prevKey !== nextKey) {
    cardsGrid?.querySelector(`.prop-card[data-key="${CSS.escape(prevKey)}"]`)?.classList.remove('selected');
    resultsBody?.querySelector(`tr[data-key="${CSS.escape(prevKey)}"]`)?.classList.remove('row-selected');
  }
  if (nextKey) {
    cardsGrid?.querySelector(`.prop-card[data-key="${CSS.escape(nextKey)}"]`)?.classList.add('selected');
    resultsBody?.querySelector(`tr[data-key="${CSS.escape(nextKey)}"]`)?.classList.add('row-selected');
  }
}

R.prefetchInspectorNeighbors = function prefetchInspectorNeighbors(list, idx) {
  if (!list?.length || idx < 0) return;
  const prefetchRecord = (r) => {
    if (!r?.address) return;
    const urls = getPropertyImageUrls(r.address, r);
    const url = urls.preferSatellite ? (urls.satellite || urls.streetView) : (urls.streetView || urls.satellite);
    if (url && typeof preloadReviewImageUrl === 'function') preloadReviewImageUrl(url);
  };
  if (idx > 0) prefetchRecord(list[idx - 1]);
  if (idx < list.length - 1) prefetchRecord(list[idx + 1]);
}

R.showInspector = function showInspector(r, opts = {}) {
  if (!r) {
    closePropertyModal({ save: false });
    return;
  }

  // Phase 2: list pages omit nested profile — fetch once when opening the property.
  if (r.profileDeferred && !opts.profileLoaded && typeof ensureResultProfile === 'function') {
    const pendingKey = recordKey(r);
    state.selectedKey = pendingKey;
    if (previewHeaderTitle) previewHeaderTitle.textContent = propertyLocationTitle(r);
    openPropertyModal();
    if (inspectorBody) {
      inspectorBody.className = 'inspector-body inspector-body-calm property-profile-body';
      inspectorBody.innerHTML = '<p class="profile-loading" style="padding:1.25rem;opacity:.75">Loading property details…</p>';
    }
    ensureResultProfile(r).then((full) => {
      if (state.selectedKey !== pendingKey) return;
      showInspector(full || r, { ...opts, profileLoaded: true });
    }).catch(() => {
      if (state.selectedKey !== pendingKey) return;
      showInspector(r, { ...opts, profileLoaded: true });
    });
    return;
  }

  const prevSelectedKey = state.selectedKey;
  const list = getFilteredResults();
  const idx = list.findIndex(x => recordKey(x) === recordKey(r));
  const cat = resultCategory(r);
  const tier = resultLeadTier(r);
  const score = resultScore(r);

  const dossierApi = (typeof PDA !== 'undefined' && PDA.lib && PDA.lib.propertyProfileDossier) || {};
  const propertyHasSatelliteMedia = dossierApi.propertyHasSatelliteMedia || (() => false);
  const getPresentProfileSections = dossierApi.getPresentProfileSections || (() => ['overview']);
  const buildProfileSectionNavHtml = dossierApi.buildProfileSectionNavHtml || (() => '');

  state.selectedKey = recordKey(r);
  if (state.scoreEditKey && state.scoreEditKey !== recordKey(r)) state.scoreEditKey = null;
  if (previewHeaderTitle) previewHeaderTitle.textContent = propertyLocationTitle(r);
  if (propertyModalTierPill) {
    propertyModalTierPill.hidden = false;
    propertyModalTierPill.className = 'property-modal-tier-pill tier-badge ' + tierBadgeClassForRecord(r);
    propertyModalTierPill.textContent = tierBadgeLabelForRecord(r);
  }

  const urls = getPropertyImageUrls(r.address, r);
  const { streetView, preferSatellite } = urls;
  // Hero: Street View only — never preferSatellite hero swap
  setPreviewImages({ streetView: urls.streetView, satellite: urls.satellite }, 'property');
  if (!urls.fromCache && USE_PROXY && r.address) {
    cachePropertyImageryBackground(r, {
      includeSatellite: preferSatellite || r.usedSatellite || r.skippedStreetView
    });
  }

  const cached = typeof getCachedImageryUrls === 'function' ? getCachedImageryUrls(r) : {};
  const satAvailable = propertyHasSatelliteMedia({
    hasSatelliteUrl: !!(urls.satellite || cached.satellite),
    hasCachedSatellite: !!cached.satellite,
    usedSatellite: !!r.usedSatellite,
    skippedStreetView: !!r.skippedStreetView,
    preferSatellite: !!urls.preferSatellite
  });
  const satUrl = cached.satellite || urls.satellite || '';

  // Action strip — phone is the primary contact heat when present
  if (profileCopyPhoneBtn) {
    const hasPhone = !!r.phone;
    profileCopyPhoneBtn.hidden = !hasPhone;
    profileCopyPhoneBtn.classList.toggle('profile-action-primary', hasPhone);
    profileCopyPhoneBtn.onclick = (e) => {
      e.stopPropagation();
      if (r.phone) copyText(r.phone, profileCopyPhoneBtn);
    };
  }
  if (profileCopyEmailBtn) {
    profileCopyEmailBtn.hidden = !r.email;
    profileCopyEmailBtn.onclick = (e) => {
      e.stopPropagation();
      if (r.email) copyText(r.email, profileCopyEmailBtn);
    };
  }
  if (profileGoogleLink) {
    const gUrl = typeof getGoogleSearchUrl === 'function' ? getGoogleSearchUrl(r.address) : '';
    if (gUrl) {
      profileGoogleLink.hidden = false;
      profileGoogleLink.href = gUrl;
      profileGoogleLink.onclick = (e) => e.stopPropagation();
    } else {
      profileGoogleLink.hidden = true;
      profileGoogleLink.removeAttribute('href');
    }
  }
  if (profileChangeLevelBtn) {
    profileChangeLevelBtn.hidden = cat !== 'property';
    profileChangeLevelBtn.onclick = (e) => {
      e.stopPropagation();
      if (cat !== 'property') return;
      state.scoreEditKey = recordKey(r);
      showInspector(r, { scrollList: false, scrollFeed: false, keepDossierScroll: true });
    };
  }
  if (profileSatelliteBtn) {
    profileSatelliteBtn.hidden = !satAvailable;
    profileSatelliteBtn.onclick = (e) => {
      e.stopPropagation();
      const url = satUrl || (previewSatImg && previewSatImg.dataset.satSrc) || '';
      if (url && typeof openLightbox === 'function') {
        openLightbox(url, `Satellite — ${propertyLocationTitle(r)}`);
      }
    };
  }

  updateGauge(cat === 'property' ? score : null, opts.animateGauge !== false, 'property', {
    category: cat,
    leadTier: tier
  });
  liveDot.classList.add('idle');
  previewWrap.classList.remove('scanning');
  // Property cinematic: never show REC badge / reticle HUD cosplay
  if (recBadge) {
    recBadge.classList.add('idle');
    recBadge.hidden = true;
    recBadge.setAttribute('aria-hidden', 'true');
    recBadge.style.display = 'none';
  }
  if (previewMainReticle) {
    previewMainReticle.hidden = true;
    previewMainReticle.setAttribute('aria-hidden', 'true');
    previewMainReticle.style.display = 'none';
  }

  const parts = buildProfileDossierParts(r);
  const sectionFlags = {
    ...parts.flags,
    hasOverview: true,
    hasContact: parts.flags.hasContact || !!(r.phone || r.email || contactName(r))
  };
  // If contact flag is true but parts lacked section HTML (edge case), rebuild contact via parts only —
  // buildProfileDossierParts already includes r.phone/email. Ensure contact section exists when flagged.
  if (sectionFlags.hasContact && !parts.sectionsHtml.contact) {
    parts.sectionsHtml.contact = profileSectionWrap(
      'contact',
      'Contact',
      `<div class="inspector-contacts">
        <div class="contact-chip"><span class="lbl">Contact</span><span class="val">${escapeHtml(contactName(r) || '—')}</span></div>
        <div class="contact-chip"><span class="lbl">Phone</span><span class="val">${escapeHtml(r.phone || '—')}</span>${r.phone ? '<button type="button" class="copy-btn copy-phone">Copy</button>' : ''}</div>
        <div class="contact-chip"><span class="lbl">Email</span><span class="val">${escapeHtml(r.email || '—')}</span>${r.email ? '<button type="button" class="copy-btn copy-email">Copy</button>' : ''}</div>
      </div>`
    );
  }
  const sectionIds = getPresentProfileSections(sectionFlags);

  inspectorBody.className = 'inspector-body inspector-body-calm property-profile-body';
  inspectorBody.innerHTML = `
    <section class="profile-dossier-section" id="profile-section-overview" data-profile-section="overview">
      <h3 class="profile-dossier-section-title">Overview</h3>
      <div class="profile-badge-row inspector-badges">
        <span class="category-badge ${categoryBadgeClass(cat)}">${categoryLabel(cat)}</span>
        ${leadTypeBadgeHtml(r)}
        ${r.usedSatellite && streetView ? '<span class="category-badge property">Satellite + Street View</span>' : ''}
        ${r.skippedStreetView ? '<span class="category-badge vacant">No Street View at address</span>' : ''}
        ${r.manualScore ? '<span class="score-corrected-badge">Level adjusted by you</span>' : ''}
        ${r.manualOverride ? '<span class="category-corrected-badge">Category changed by you</span>' : ''}
        ${manuallyReviewedBadgeHtml(r)}
        ${exportedBadgeHtml(r)}
      </div>
      ${leadUploadedHtml(r, 'detail')}
      ${cat === 'property' ? (state.scoreEditKey === recordKey(r) ? `
      <div class="score-adjust-panel">
        <div class="score-adjust-title">Set distress level</div>
        ${r.aiScore != null && r.aiScore !== r.score ? `<div class="score-ai-note">AI picked <strong>${leadTierLabel(tierFromScore(r.aiScore, 'property'))}</strong> — current <strong>${leadTierLabel(tier)}</strong></div>` : r.aiScore != null ? `<div class="score-ai-note">AI picked <strong>${leadTierLabel(tierFromScore(r.aiScore, 'property'))}</strong></div>` : ''}
        <div class="tier-picker" id="inspectorTierPicker">${buildTierPickerHtml(tier, 'inspectorPick')}</div>
        <div class="score-adjust-actions">
          <button type="button" class="score-save-btn" id="saveScoreBtn">Save Level</button>
          <button type="button" class="score-cancel-btn" id="cancelScoreBtn">Cancel</button>
        </div>
        <div class="score-adjust-hint">${scoreCorrections.length ? `${scoreCorrections.length} past level picks saved — future scans calibrate from these.` : 'Your level picks save locally and help calibrate future scans.'}</div>
      </div>` : `
      <div class="score-display-row">
        <div class="score-display-current">
          <span class="score-display-label">Distress level</span>
          <span class="score-display-val score-display-tier">${escapeHtml(leadTierLabel(tier))}</span>
          ${r.aiScore != null && r.aiScore !== r.score ? `<span class="score-ai-note" style="margin:0;">AI: ${escapeHtml(leadTierLabel(tierFromScore(r.aiScore, 'property')))}</span>` : ''}
        </div>
        <button type="button" class="score-change-btn" id="changeScoreBtn">Change Level</button>
      </div>`) : ''}
      ${formatSimpleAnalysisHtml(r)}
      ${computeNeedsReview(r) ? `<div class="review-queue-panel" style="margin-bottom:0.5rem;">
        <div class="review-queue-title">Needs your review</div>
        <p class="review-queue-hint">Use Change category below to fix this classification.</p>
      </div>` : ''}
      ${formatCategoryChangeHtml(r)}
    </section>
    ${parts.sectionsHtml.contact || ''}
    ${parts.sectionsHtml.violations || ''}
    ${parts.sectionsHtml.values || ''}
    ${parts.sectionsHtml.property || ''}
    ${parts.sectionsHtml.flags || ''}
  `;

  const preferredSection = opts.keepDossierScroll && state._profileActiveSection
    ? state._profileActiveSection
    : (state._profileActiveSection && sectionIds.includes(state._profileActiveSection)
      ? state._profileActiveSection
      : 'overview');
  const initialSection = sectionIds.includes(preferredSection) ? preferredSection : sectionIds[0];

  if (profileSectionNav) {
    profileSectionNav.innerHTML = buildProfileSectionNavHtml(sectionIds, initialSection);
    profileSectionNav.querySelectorAll('[data-profile-section]').forEach((chip) => {
      chip.addEventListener('click', () => {
        const id = chip.getAttribute('data-profile-section');
        if (id) setProfileActiveSection(id);
      });
    });
  }

  const phoneBtn = inspectorBody.querySelector('.copy-phone');
  const emailBtn = inspectorBody.querySelector('.copy-email');
  if (phoneBtn) phoneBtn.addEventListener('click', (e) => { e.stopPropagation(); copyText(r.phone, phoneBtn); });
  if (emailBtn) emailBtn.addEventListener('click', (e) => { e.stopPropagation(); copyText(r.email, emailBtn); });
  inspectorBody.querySelectorAll('.copy-profile-phone').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      copyText(btn.getAttribute('data-phone') || '', btn);
    });
  });
  inspectorBody.querySelectorAll('.copy-profile-email').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      copyText(btn.getAttribute('data-email') || '', btn);
    });
  });
  inspectorBody.querySelectorAll('[data-change-cat]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!btn.disabled) changeCategory(r, btn.dataset.changeCat);
    });
  });
  inspectorBody.querySelectorAll('[data-mark-satellite-only]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!btn.disabled) markResultSatelliteOnly(r);
    });
  });

  const changeScoreBtn = inspectorBody.querySelector('#changeScoreBtn');
  changeScoreBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    state.scoreEditKey = recordKey(r);
    showInspector(r, { scrollList: false, scrollFeed: false, keepDossierScroll: true });
  });

  let inspectorSelectedTier = tier;
  const inspectorTierPicker = inspectorBody.querySelector('#inspectorTierPicker');
  wireTierPicker(inspectorTierPicker, (t) => { inspectorSelectedTier = t; });
  const saveScoreBtn = inspectorBody.querySelector('#saveScoreBtn');
  const cancelScoreBtn = inspectorBody.querySelector('#cancelScoreBtn');
  saveScoreBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    applyScoreCorrection(r, inspectorSelectedTier);
  });
  cancelScoreBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    state.scoreEditKey = null;
    showInspector(r, { scrollList: false, scrollFeed: false, keepDossierScroll: true });
  });

  wireProfileTabPanels(sectionIds, initialSection);
  if (profileDossierScroll) profileDossierScroll.scrollTop = 0;

  const pos = idx >= 0 ? idx + 1 : '?';
  inspectorPos.textContent = list.length ? `${pos} / ${list.length}` : '—';
  prevPropBtn.disabled = idx <= 0;
  nextPropBtn.disabled = idx < 0 || idx >= list.length - 1;

  const navOnly = opts.navOnly === true;
  if (navOnly) syncResultSelectionDom(prevSelectedKey, state.selectedKey);
  else renderResults();
  if (opts.scrollList === true) scrollToSelectedCard();
  openPropertyModal();
  prefetchInspectorNeighbors(list, idx);
  if (!navOnly) scheduleSaveSession('inspector-open');
}

R.navigateProperty = function navigateProperty(delta) {
  const list = getFilteredResults();
  if (!list.length) return;
  let idx = getSelectedIndex(list);
  if (idx < 0) idx = delta > 0 ? -1 : list.length;
  const next = idx + delta;
  if (next >= 0 && next < list.length) {
    if (state.running && state.pinnedKey) pinProperty(list[next]);
    else showInspector(list[next], { scrollList: true, navOnly: true, animateGauge: false });
  }
}

R.scrollToSelectedCard = function scrollToSelectedCard() {
  if (!state.selectedKey) return;
  requestAnimationFrame(() => {
    const card = cardsGrid.querySelector(`[data-key="${CSS.escape(state.selectedKey)}"]`);
    if (card) card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    const row = resultsBody.querySelector(`[data-key="${CSS.escape(state.selectedKey)}"]`);
    if (row) row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
}

R.collapseSetup = function collapseSetup(collapsed) {
  state.setupCollapsed = collapsed;
}

R.openFilePicker = function openFilePicker() {
  if (state.running) {
    alert('Stop the scan before uploading a new file.');
    return;
  }
  if (!fileInput) {
    alert('Upload control failed to load. Refresh the page (Ctrl+F5).');
    return;
  }
  openUploadModal();
  fileInput.click();
}

R.updateUploadCollapsedBar = function updateUploadCollapsedBar() {
  uploadCollapsedBar?.classList.toggle('visible', state.setupCollapsed);
}

R.enterReviewMode = function enterReviewMode() {
  if (!state.results.length) return;
  progressSection.classList.add('review-minimal');
  state.resultsWorkbenchOpen = true;
  applyAnalyzeVisibility?.();
  const reviewQueue = getReviewQueue();
  if (reviewQueue.length) {
    state.filter = 'review';
    document.querySelectorAll('.filter-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.filter === 'review');
    });
    log(`${reviewQueue.length} need review — filter set to Needs Review`, 'success');
  }
  if (state.appView === 'scan' || state.appView === 'setup') {
    setAppView('dashboard');
  } else {
    renderResults();
    updateAppNav();
    saveSession();
  }
}

R.updateExportSidebarHint = function updateExportSidebarHint() {
  let hint = 'Run a scan to export';
  if (state.results.length) {
    if (state.running) {
      hint = 'Wait until scan finishes';
    } else {
      const total = state.results.length;
      const list = getFilteredResults();
      hint = `Excel exports all ${total.toLocaleString()} leads · CSV uses current list (${list.length.toLocaleString()})`;
    }
  }
  if (sidebarExportHint) sidebarExportHint.textContent = hint;
}

R.syncResultsExportButtons = function syncResultsExportButtons() {
  const hasResults = state.results.length > 0;
  const picked = !!state.locationFilter;
  const canExportFiltered = hasResults && !state.running && picked && getFilteredResults().length > 0;
  const canExportAll = hasResults && !state.running && picked;
  if (resultsExportCsvBtn) resultsExportCsvBtn.disabled = !canExportFiltered;
  if (resultsExportExcelBtn) resultsExportExcelBtn.disabled = !canExportAll;
};

R.updateExportButtons = function updateExportButtons() {
  const hasResults = state.results.length > 0;
  const canExportFiltered = hasResults && !state.running && getFilteredResults().length > 0;
  const canExportAll = hasResults && !state.running;
  if (exportBtn) exportBtn.disabled = !canExportAll;
  for (const btn of EXPORT_MENU_BTNS) {
    if (!btn) continue;
    if (btn === sidebarExportAllBtn || btn === sidebarExportExcelBtn || btn === resultsExportExcelBtn) btn.disabled = !canExportAll;
    else btn.disabled = !canExportFiltered;
  }
  if (bulkSelectToggleBtn) bulkSelectToggleBtn.disabled = !hasResults;
  for (const btn of REVIEW_ENTRY_BTNS) {
    if (btn) btn.disabled = !hasResults;
  }
  if (reviewLeadsBtn) reviewLeadsBtn.disabled = !hasResults;
  syncResultsExportButtons();
  updateExportSidebarHint();
}

R.exportFilterSlug = function exportFilterSlug() {
  const f = state.filter || 'all';
  if (state.searchQuery.trim()) return 'search';
  return String(f).replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'all';
}

R.buildDialReadyExportDeps = function buildDialReadyExportDeps(origin = '') {
  const schema = (typeof PDA !== 'undefined' && PDA.lib?.exportSchema) || null;
  if (!schema) return null;
  return {
    resolveImageryForResult: typeof resolveImageryForResult === 'function' ? resolveImageryForResult : (r) => r,
    getCachedImageryUrls: typeof getCachedImageryUrls === 'function' ? getCachedImageryUrls : () => ({ streetView: null }),
    leadTypeLabel,
    resultLeadType,
    resultLeadTier,
    resultCategory,
    origin: origin || (typeof window !== 'undefined' ? window.location.origin : ''),
    schema
  };
}

R.buildDialReadyExportRows = function buildDialReadyExportRows(records = null, opts = {}) {
  const deps = R.buildDialReadyExportDeps(opts.origin);
  if (!deps?.schema) return [];
  const source = records || state.results;
  return deps.schema.buildDialReadyRows(source, deps);
}

R.buildExportRows = function buildExportRows(records = null, opts = {}) {
  const profile = opts.profile || 'full';
  if (profile === 'dial_ready') {
    return R.buildDialReadyExportRows(records, opts);
  }
  const source = records || state.results;
  return [...source]
    .sort((a, b) => b.score - a.score)
    .map(r => {
      const cat = resultCategory(r);
      const tier = resultLeadTier(r);
      const inds = normalizeIndicators(r.indicators).map(k => INDICATOR_LABELS[k] || k);
      const flags = (r.qualityFlags || []).map(f => QUALITY_FLAG_LABELS[f] || f);
      return {
        'First Name': r.firstName,
        'Last Name': r.lastName,
        Phone: r.phone,
        Email: r.email,
        'Street Address': r.street,
        City: r.city,
        State: r.state,
        'Postal Code': r.postal,
        'Lead Type': leadTypeLabel(resultLeadType(r)),
        'Lead Tier': leadTierLabel(tier),
        Category: categoryLabel(cat),
        'Category Changed By You': r.manualOverride ? 'Yes' : 'No',
        'Distress Score': cat === 'property' ? resultScore(r) : 0,
        'AI Original Score': r.aiScore != null ? r.aiScore : (cat === 'property' ? r.score : ''),
        'Score Adjusted By You': r.manualScore ? 'Yes' : 'No',
        'Manually Reviewed': isManuallyReviewed(r) ? 'Yes' : 'No',
        'AI Confidence': r.confidence != null ? r.confidence : '',
        'Needs Review': computeNeedsReview(r) ? 'Yes' : 'No',
        'Needs Review Later': r.needsReviewLater ? 'Yes' : 'No',
        'Satellite Check': r.satelliteClassification?.category
          ? categoryLabel(normalizeCategory(r.satelliteClassification.category))
          : (r.usedSatellite ? 'Yes' : 'No'),
        'Satellite Roof': r.satelliteClassification?.roofCondition
          ? (CONDITION_LABELS[r.satelliteClassification.roofCondition] || r.satelliteClassification.roofCondition)
          : '',
        'Satellite Yard': r.satelliteClassification?.yardCondition
          ? (CONDITION_LABELS[r.satelliteClassification.yardCondition] || r.satelliteClassification.yardCondition)
          : '',
        'Aerial Distress Score': r.satelliteClassification?.aerialDistressScore ?? '',
        'Street View Skipped': r.skippedStreetView ? 'Yes' : 'No',
        'Quality Flags': flags.join(', '),
        'D4D Indicators': inds.join(', '),
        'Why This Tier': r.tierRationale || buildTierRationale(r),
        Reason: r.reason,
        Tags: leadTags(r).join(', '),
        'Exported At': formatExportedAt(r)
      };
    });
}

R.prepareDialReadyExport = async function prepareDialReadyExport(records) {
  if (typeof fetchImageryIndexMap === 'function') {
    try { await fetchImageryIndexMap(); } catch (_) { /* use cache */ }
  }
  if (typeof hydrateImageryFromServerIndex === 'function') {
    try { await hydrateImageryFromServerIndex(); } catch (_) { /* proceed */ }
  }
  for (const r of records) {
    if (typeof resolveImageryForResult === 'function') resolveImageryForResult(r);
  }
}

R.exportResults = async function exportResults(format = 'xlsx', opts = {}) {
  const useAll = opts.scope === 'all';
  const profile = opts.profile || (useAll ? 'dial_ready' : 'full');
  const records = useAll ? state.results : getFilteredResults();
  if (!state.results.length) {
    alert('No results to export yet — run a scan first.');
    return;
  }
  if (!records.length) {
    alert('No leads in the current list to export — try a different filter or clear search.');
    return;
  }
  try {
    await ensureSheetJs();
  } catch (e) {
    alert(e?.message || 'Spreadsheet library failed to load. Check your internet connection and refresh the page.');
    return;
  }
  if (typeof XLSX === 'undefined') {
    alert('Spreadsheet library failed to load. Check your internet connection and refresh the page.');
    return;
  }
  if (profile === 'dial_ready') {
    await R.prepareDialReadyExport(records);
  }
  const exportedAt = new Date().toISOString();
  const exportKeys = new Set(records.map((r) => recordKey(r)));
  markLeadsExported(records, exportedAt);
  const exportRecords = state.results.filter((r) => exportKeys.has(recordKey(r)));
  const exportData = buildExportRows(exportRecords, {
    profile,
    origin: typeof window !== 'undefined' ? window.location.origin : ''
  });
  const date = exportedAt.slice(0, 10);
  const slug = profile === 'dial_ready' ? 'database' : (useAll ? 'all' : exportFilterSlug());
  const baseName = `property-distress-${slug}-${date}`;

  if (format === 'csv') {
    const ws = XLSX.utils.json_to_sheet(exportData);
    const csv = XLSX.utils.sheet_to_csv(ws);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${baseName}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  } else {
    const ws = XLSX.utils.json_to_sheet(exportData);
    ws['!cols'] = profile === 'dial_ready'
      ? [
        { wch: 12 }, { wch: 30 }, { wch: 16 }, { wch: 8 }, { wch: 10 },
        { wch: 48 }, { wch: 48 }, { wch: 16 }, { wch: 16 }, { wch: 12 },
        { wch: 22 }, { wch: 16 }, { wch: 28 }
      ]
      : [
        { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 28 },
        { wch: 30 }, { wch: 16 }, { wch: 8 }, { wch: 10 },
        { wch: 14 }, { wch: 16 }, { wch: 10 }, { wch: 8 },
        { wch: 40 }, { wch: 50 }
      ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, profile === 'dial_ready' ? 'Lead Database' : 'Distress Results');
    XLSX.writeFile(wb, `${baseName}.xlsx`);
  }
  const listLabel = profile === 'dial_ready'
    ? 'full database'
    : (useAll ? 'all leads' : (state.searchQuery.trim() ? `search (${exportData.length})` : (FILTER_LABELS[state.filter] || state.filter).toLowerCase()));
  log(`Exported ${exportData.length} ${listLabel} to ${format.toUpperCase()} · tagged as exported`, 'success');
  showUiToast?.(`Exported ${exportData.length.toLocaleString()} leads (${format.toUpperCase()})`);
  saveSession('export');
  if (state.selectedKey) {
    const selected = state.results.find((r) => recordKey(r) === state.selectedKey);
    if (selected) showInspector(selected, { scrollList: false, scrollFeed: false, animateGauge: false });
  }
  renderResults({ force: true });
}

R.thumbUrl = function thumbUrl(address, result) {
  const urls = getCardThumbUrls(result || { address });
  return urls.primary || urls.fallback || '';
}

R.showResultInPreview = function showResultInPreview(r) {
  state.selectedKey = recordKey(r);
  if (state.running) pinProperty(r);
  else showInspector(r, { scrollList: true });
}

R.preservePageScroll = function preservePageScroll(fn) {
  if (!shouldLockScroll()) {
    fn();
    return;
  }
  const y = window.scrollY;
  const x = window.scrollX;
  fn();
  requestAnimationFrame(() => {
    if (!userIsScrolling() && (window.scrollY !== y || window.scrollX !== x)) {
      window.scrollTo({ left: x, top: y, behavior: 'instant' });
    }
  });
}

R.log = function log(msg, type = '') {
  const write = () => {
    const entry = document.createElement('div');
    entry.className = 'log-entry' + (type ? ` log-${type}` : '');
    entry.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
    logPanel.appendChild(entry);
    while (logPanel.children.length > 100) logPanel.firstChild.remove();
    logPanel.scrollTop = logPanel.scrollHeight;
  };
  if (state.running) preservePageScroll(write);
  else write();
}

R._importProfileLib = function _importProfileLib() {
  return (typeof PDA !== 'undefined' && PDA.lib && PDA.lib.importProfile) || null;
};

/** Normalize header labels so PropertyAddress / property_address / Property Address all match. */
R.headerKey = function headerKey(h) {
  const lib = _importProfileLib();
  if (lib?.headerKey) return lib.headerKey(h);
  return String(h || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

R.findColumn = function findColumn(headers, names) {
  const map = new Map();
  for (const h of headers || []) {
    const key = headerKey(h);
    if (key && !map.has(key)) map.set(key, h);
  }
  for (const name of names || []) {
    const hit = map.get(headerKey(name));
    if (hit) return hit;
  }
  return null;
}

R.buildFullAddress = function buildFullAddress(street, city, stateName, postal) {
  if (!street) return '';
  const cityState = [city, stateName].filter(Boolean).join(', ');
  const parts = [street];
  if (cityState) parts.push(cityState);
  if (postal) parts[parts.length - 1] = `${parts[parts.length - 1]} ${postal}`.trim();
  return parts.join(', ');
}

R.cellStr = function cellStr(row, col) {
  if (!col) return '';
  return String(row[col] ?? '').trim();
}

R.flag01 = function flag01(v) {
  const lib = _importProfileLib();
  if (lib?.flag01) return lib.flag01(v);
  const s = String(v ?? '').trim().toLowerCase();
  if (!s) return 0;
  if (s === '1' || s === 'true' || s === 'yes' || s === 'y') return 1;
  if (s === '0' || s === 'false' || s === 'no' || s === 'n') return 0;
  const n = Number(s);
  return Number.isFinite(n) && n !== 0 ? 1 : 0;
}

/** Build full property profile from skip-trace / New Analyzer Leads / Filter-style columns. */
R.buildImportProfile = function buildImportProfile(row, cols) {
  const lib = _importProfileLib();
  if (lib?.buildImportProfile) {
    return lib.buildImportProfile(row, { byLower: cols?._byLower });
  }
  return null;
}

/** Lazy-load SheetJS only when importing/exporting (keeps analyzer first paint fast). */
R.ensureSheetJs = function ensureSheetJs() {
  if (typeof XLSX !== 'undefined') return Promise.resolve();
  if (R._sheetJsPromise) return R._sheetJsPromise;
  R._sheetJsPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-sheetjs]');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Spreadsheet library failed to load')));
      return;
    }
    const s = document.createElement('script');
    s.src = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
    s.async = true;
    s.dataset.sheetjs = '1';
    s.onload = () => resolve();
    s.onerror = () => {
      R._sheetJsPromise = null;
      reject(new Error('Spreadsheet library failed to load. Check your network and try again.'));
    };
    document.head.appendChild(s);
  });
  return R._sheetJsPromise;
};

R.parseSpreadsheet = async function parseSpreadsheet(file, leadType = DEFAULT_LEAD_TYPE) {
  const importLeadType = normalizeLeadType(leadType || 'code_violation');
  await ensureSheetJs();
  return new Promise((resolve, reject) => {
    if (typeof XLSX === 'undefined') {
      reject(new Error('Spreadsheet library failed to load. Hard-refresh the page (Ctrl+Shift+R) and try again.'));
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array', cellDates: true });
        if (!workbook.SheetNames?.length) {
          reject(new Error('Workbook has no sheets'));
          return;
        }
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        // raw:false keeps phones/zips as text (avoids 8.608e9 style numbers)
        const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });

        if (!rows.length) {
          reject(new Error('Spreadsheet is empty'));
          return;
        }

        const headers = Object.keys(rows[0]);
        const byKey = new Map(headers.map((h) => [headerKey(h), h]));
        const pick = (...names) => {
          for (const n of names) {
            const hit = byKey.get(headerKey(n));
            if (hit) return hit;
          }
          return null;
        };

        const cols = {
          firstName: pick('FirstName', 'First Name', 'first', 'Owner First Name', 'OwnerFirstName'),
          lastName: pick('LastName', 'Last Name', 'last', 'Owner Last Name', 'OwnerLastName'),
          phone: pick(
            'Contact1Phone_1', 'Contact1 Phone 1', 'Phone', 'Phone Number', 'Mobile', 'Cell',
            'Primary Phone', 'Owner Phone'
          ),
          email: pick(
            'Contact1Email_1', 'Contact1 Email 1', 'Email', 'Email Address', 'E-mail', 'Primary Email'
          ),
          street: pick(
            'PropertyAddress', 'Property Address', 'Street Address', 'Street', 'Address',
            'Site Address', 'Full Address', 'Situs Address', 'Situs Street'
          ),
          city: pick('PropertyCity', 'Property City', 'City', 'Situs City'),
          state: pick('PropertyState', 'Property State', 'State', 'ST', 'Situs State'),
          postal: pick(
            'PropertyPostalCode', 'Property Postal Code', 'Property Zip', 'Postal Code',
            'Zip Code', 'Zip', 'Postal', 'Situs Zip'
          ),
          // for buildImportProfile lookups
          _byLower: byKey
        };

        // Only street/address is required
        if (!cols.street) {
          const preview = headers.slice(0, 12).join(', ');
          reject(new Error(
            'Could not find an address column.\n\n' +
            'Need one of: PropertyAddress, Street Address, Address, Street.\n\n' +
            `Columns found: ${preview}${headers.length > 12 ? '…' : ''}`
          ));
          return;
        }

        const importedAt = Date.now();
        const records = [];
        let skippedBlank = 0;

        for (const r of rows) {
          const street = cellStr(r, cols.street);
          if (!street) {
            skippedBlank += 1;
            continue;
          }
          const city = cellStr(r, cols.city);
          const stateName = cellStr(r, cols.state);
          // Zip may come in as "85140" or "85140.0"
          let postal = cellStr(r, cols.postal).replace(/\.0$/, '');
          if (/^\d+\.0+$/.test(postal)) postal = postal.replace(/\.0+$/, '');

          const firstName = cellStr(r, cols.firstName);
          const lastName = cellStr(r, cols.lastName);
          let phone = cellStr(r, cols.phone);
          let email = cellStr(r, cols.email);
          if (!phone) {
            phone = cellStr(r, pick('Contact1Phone_2', 'Contact1 Phone 2'));
          }
          if (!email) {
            email = cellStr(r, pick('Contact1Email_2', 'Contact1 Email 2'));
          }
          // Normalize phone to digits when it was a float-ish string
          if (phone && /^\d+(\.\d+)?e\+/i.test(phone)) {
            const n = Number(phone);
            if (Number.isFinite(n)) phone = String(Math.round(n));
          }
          phone = phone.replace(/\.0$/, '');

          const profile = buildImportProfile(r, { ...cols, _byLower: byKey });
          const rec = {
            firstName,
            lastName,
            phone,
            email,
            street,
            city,
            state: stateName,
            postal,
            address: buildFullAddress(street, city, stateName, postal),
            leadType: importLeadType,
            importedAt,
            sourceFile: file.name || ''
          };

          // Light geo if present
          const lat = cellStr(r, pick('Latitude', 'Lat'));
          const lng = cellStr(r, pick('Longitude', 'Lng', 'Lon', 'Long'));
          if (lat) rec.latitude = lat;
          if (lng) rec.longitude = lng;

          if (profile) {
            // Keep the full mapped profile so Property Profile dossier slots fill in.
            const lib = _importProfileLib();
            rec.profile = lib?.profileForImportRecord
              ? lib.profileForImportRecord(profile)
              : { ...profile, _shaped: true };
            if (profile.marketValue) rec.marketValue = profile.marketValue;
            if (profile.avm) rec.avm = profile.avm;
            if (profile.wholesaleValue) rec.wholesaleValue = profile.wholesaleValue;
            if (profile.ownerType) rec.ownerType = profile.ownerType;
            if (profile.county) rec.county = profile.county;
            if (profile.contactName) rec.ownerName = profile.contactName;
            if (profile.codeCategory) rec.codeCategory = profile.codeCategory;
            if (profile.codeType) rec.codeType = profile.codeType;
            if (profile.violationDescription) rec.violationDescription = profile.violationDescription;
            if (profile.violationDate) rec.violationDate = profile.violationDate;
          }
          records.push(rec);
        }

        if (!records.length) {
          reject(new Error(
            `No valid address rows found (${skippedBlank} blank). ` +
            `Check the address column in ${file.name || 'your file'}.`
          ));
          return;
        }

        resolve(records);
      } catch (err) {
        reject(new Error(err?.message || String(err) || 'Failed to parse spreadsheet'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file from disk'));
    reader.readAsArrayBuffer(file);
  });
}

R.fileDropDepth = 0;

R.isSpreadsheetFile = function isSpreadsheetFile(file) {
  if (!file) return false;
  const name = (file.name || '').toLowerCase();
  if (/\.(xlsx|xls|xlsm|csv)$/i.test(name)) return true;
  const type = (file.type || '').toLowerCase();
  return /spreadsheet|excel|csv|sheet|ms-excel|officedocument/.test(type);
}

R.fileFromDataTransfer = function fileFromDataTransfer(dt) {
  if (!dt) return null;
  const files = dt.files ? [...dt.files] : [];
  return files.find(isSpreadsheetFile) || files[0] || null;
}

R.hasFileDrag = function hasFileDrag(dt) {
  if (!dt) return false;
  if (dt.files?.length) return true;
  if (!dt.types?.length) return false;
  const types = [...dt.types];
  return types.includes('Files')
    || types.includes('application/x-moz-file')
    || types.some(t => /excel|spreadsheet|csv|sheet|ms-excel|officedocument/i.test(String(t)));
}

R.setFileDropActive = function setFileDropActive(active) {
  fileDrop?.classList.toggle('dragover', active);
  if (!active) fileDropDepth = 0;
}

R.preventFileDropDefaults = function preventFileDropDefaults(e) {
  e.preventDefault();
  e.stopPropagation();
}

R.acceptDroppedFile = async function acceptDroppedFile(file, source = 'drop') {
  if (!file) {
    log('No file detected — try Browse for Excel File', 'error');
    return;
  }
  if (!isSpreadsheetFile(file)) {
    alert(`Unsupported file: ${file.name || 'unknown'}\n\nUse .xlsx, .xls, or .csv`);
    return;
  }
  openUploadModal();
  await handleFile(file);
  if (source === 'drop') log(`Loaded via drag & drop: ${file.name}`, 'success');
}

if (!fileInput || !fileDrop) {
  console.error('Upload controls missing from page');
  showFatalError('Upload controls failed to initialize. Hard refresh the page (Ctrl+F5) or restart launch-analyzer.bat.');
} else {
  fileInput.addEventListener('click', (e) => {
    if (state.running) {
      e.preventDefault();
      alert('Stop the scan before uploading a new file.');
    }
  });

  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    fileInput.value = '';
    if (!file) return;
    await acceptDroppedFile(file, 'browse');
  });

  fileDrop.addEventListener('dragenter', (e) => {
    preventFileDropDefaults(e);
    if (state.running) return;
    fileDropDepth++;
    setFileDropActive(true);
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  });

  fileDrop.addEventListener('dragover', (e) => {
    preventFileDropDefaults(e);
    if (state.running) return;
    setFileDropActive(true);
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  });

  fileDrop.addEventListener('dragleave', (e) => {
    preventFileDropDefaults(e);
    fileDropDepth = Math.max(0, fileDropDepth - 1);
    if (fileDropDepth === 0) setFileDropActive(false);
  });

  fileDrop.addEventListener('drop', async (e) => {
    preventFileDropDefaults(e);
    setFileDropActive(false);
    if (state.running) {
      log('Stop the scan before uploading a new file', 'error');
      return;
    }
    await acceptDroppedFile(fileFromDataTransfer(e.dataTransfer), 'drop');
  });

}

browseFileLabel?.addEventListener('click', (e) => {
  if (state.running) {
    e.preventDefault();
    alert('Stop the scan before uploading a new file.');
  }
});
uploadCollapsedBtn?.addEventListener('click', (e) => {
  e.preventDefault();
  openFilePicker();
});
document.addEventListener('dragenter', (e) => {
  if (!hasFileDrag(e.dataTransfer)) return;
  e.preventDefault();
  openUploadModal();
});

document.addEventListener('dragover', (e) => {
  if (!hasFileDrag(e.dataTransfer)) return;
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
});

document.addEventListener('drop', async (e) => {
  if (!hasFileDrag(e.dataTransfer)) return;
  preventFileDropDefaults(e);
  setFileDropActive(false);
  if (state.running) {
    log('Stop the scan before uploading a new file', 'error');
    return;
  }
  await acceptDroppedFile(fileFromDataTransfer(e.dataTransfer), 'drop');
});

R.handleFile = async function handleFile(file, opts = {}) {
  if (!isSpreadsheetFile(file)) {
    alert(`Unsupported file type: ${file.name}\n\nPlease use an Excel file (.xlsx, .xls) or .csv`);
    return;
  }
  const statusEl = $('scanImportStatus');
  const setStatus = (msg, show = true) => {
    if (!statusEl) return;
    statusEl.hidden = !show;
    statusEl.textContent = msg || '';
  };
  try {
    setStatus(`Reading ${file.name}…`);
    const leadType = normalizeLeadType(
      $('importLeadTypeSelect')?.value
      || state.importLeadType
      || 'code_violation'
    );
    state.importLeadType = leadType;
    const records = await parseSpreadsheet(file, leadType);
    // Always keep prior AI results unless caller explicitly opts out
    const keepResults = opts.keepResults !== false;

    const importedAt = Date.now();
    const batchId = `batch_upload_${importedAt}`;

    // Simple contract: unique addresses in THIS file = the scan queue = the number we show.
    // forceRescan so Start Scan actually runs EVERY row (don't silently shrink to
    // "not already in session" — that caused 2089 at the top vs ~702 on Start).
    let skippedDupInFile = 0;
    const seenInFile = new Set();
    const stamped = [];
    for (const r of records) {
      const row = {
        ...r,
        importedAt: r.importedAt || importedAt,
        importBatchId: batchId,
        sourceFile: file.name,
        forceRescan: true
      };
      const k = typeof addressMatchKey === 'function' ? addressMatchKey(row) : '';
      if (k) {
        if (seenInFile.has(k)) {
          skippedDupInFile += 1;
          continue;
        }
        seenInFile.add(k);
      }
      stamped.push(row);
    }

    if (!stamped.length) {
      setStatus(`No address rows found in ${file.name}.`);
      alert(`No address rows found in ${file.name}.`);
      updateStartButton();
      updateScanReadyUi?.();
      return;
    }

    abortSessionBackgroundLoad();
    sessionLoadState = {
      complete: true,
      loading: false,
      loaded: keepResults ? (state.results || []).length : 0,
      total: keepResults ? (state.results || []).length : 0,
      serverCanonical: keepResults ? (state.results || []).length : 0
    };
    delete state._tierCountsFromServer;

    // Scan queue = this file. Prior AI results stay in the database.
    state.records = stamped;
    if (!keepResults) {
      state.results = [];
      state.processed = 0;
      state.succeeded = 0;
      state.skipped = 0;
      state.failStreetView = 0;
      state.failGemini = 0;
      summarySection?.classList.remove('visible');
      if (cardsGrid) {
        cardsGrid.innerHTML = '<div class="empty-state" style="grid-column:1/-1;"><div class="empty-state-icon">▶</div>Ready — hit Start Scan</div>';
      }
      if (resultsBody) {
        resultsBody.innerHTML = '<tr><td colspan="13" class="empty-state">Ready — hit Start Scan</td></tr>';
      }
      if ($('resultCount')) $('resultCount').textContent = '';
    }

    state.fileName = file.name;
    state.selectedKey = null;
    state._pendingUnscanned = stamped.length;
    state._serverPendingUnscanned = stamped.length;
    state._expectedRecords = stamped.length;
    state._recordsLoadComplete = true;
    state._freshImportAt = importedAt;
    state.importBatches = [
      ...(Array.isArray(state.importBatches) ? state.importBatches : []),
      {
        id: batchId,
        city: '',
        state: '',
        sourceFile: file.name,
        leadCount: stamped.length,
        importedAt
      }
    ];

    const toScanLabel = `${stamped.length.toLocaleString()} to scan`;
    $('failStats')?.classList.remove('visible');
    fileInfo.textContent = `✓ ${file.name} — ${toScanLabel}`;
    fileInfo.classList.add('visible');
    if (heroCount) heroCount.textContent = stamped.length.toLocaleString();
    setStatus(`✓ ${toScanLabel} — click Start Scan.`);

    updateExportButtons();
    updateGauge(null);

    // Lean persist: queue + batches only (never re-POST full results).
    try {
      if (typeof pushScanQueueToServer === 'function' && typeof USE_PROXY !== 'undefined' && USE_PROXY) {
        const q = await pushScanQueueToServer({ reason: 'file-upload' });
        if (!q?.ok) {
          console.warn('[import] scan-queue save failed', q?.error);
          const errText = String(q?.error?.message || q?.error || q?.data?.error || '');
          const authBlocked = /AUTH_REQUIRED|Authentication required|401/i.test(errText)
            || Number(q?.data?.status) === 401;
          if (authBlocked) {
            log('Queue NOT saved — log in, hard-refresh, then drop the file again.', 'error');
            alert(
              'Could not save the scan queue (login required).\n\n' +
              'Stay logged in, hard-refresh (Ctrl+Shift+R), drop the file again, then Start Scan.'
            );
            updateStartButton();
            updateScanReadyUi?.();
            return;
          }
          log('Queue saved in browser — server sync may retry when you Start Scan.', 'warn');
        } else if (typeof q?.data?.records === 'number') {
          // Keep UI locked to what we queued (server must not silently shrink replace-queue).
          state._pendingUnscanned = stamped.length;
          state._serverPendingUnscanned = stamped.length;
        }
      } else if (typeof saveSession === 'function') {
        saveSession('file-upload');
      }
    } catch (saveErr) {
      console.warn('[import] scan-queue save warning', saveErr);
      log('File loaded — server queue sync may retry in the background.', 'warn');
    }

    log(
      `Loaded ${toScanLabel} from ${file.name}` +
      (skippedDupInFile ? ` · ${skippedDupInFile.toLocaleString()} duplicate rows in file ignored` : ''),
      'success'
    );
    state.appView = 'dashboard';
    collapseSetup(true);
    updateCommandBar();
    closeToolModal(uploadModal);
    updateStartButton();
    document.getElementById('scanImportDrop')?.classList.add('has-file');
    updateScanReadyUi?.();
    setStatus(`✓ ${toScanLabel} — click Start Scan.`);
  } catch (err) {
    const msg = err?.message || String(err) || 'Import failed';
    setStatus(msg);
    fileInfo.textContent = '';
    fileInfo.classList.remove('visible');
    if (heroCount) heroCount.textContent = '—';
    log(msg, 'error');
    alert(msg);
    updateStartButton();
    updateScanReadyUi?.();
  }
}

R.scoreClass = function scoreClass(score, category) {
  if (category === 'vacant_lot') return 'score-vacant';
  if (category === 'unavailable') return 'score-moderate';
  if (score >= DISTRESSED_MIN_SCORE) return 'score-distressed';
  return 'score-low';
}

R.scoreDisplay = function scoreDisplay(score, category) {
  if (category === 'vacant_lot') return '🏜️';
  if (category === 'unavailable') return '—';
  return tierEmoji(tierFromScore(score, category));
}

R.renderVirtualCards = function renderVirtualCards() {
  if (!shouldUseVirtualScroll()) {
    if (virtualScroll.initialized) resetVirtualScrollDom();
    renderResultsInner();
    return;
  }
  if (!virtualScroll.initialized) initVirtualScroll();
  if (!cardsVirtualWindow) return;
  if (state.viewMode !== 'cards' || state.running) return;
  const sorted = getFilteredResults();
  const total = sorted.length;
  if (!total) {
    cardsVirtualWindow.replaceChildren();
    cardsVirtualWindow.innerHTML = '<div class="empty-state" style="grid-column:1/-1;"><div class="empty-state-icon">◎</div>Results appear here — newest uploads at the top</div>';
    updateVirtualSpacerHeight(0);
    return;
  }

  const scrollTop = cardsGrid?.scrollTop ?? virtualScroll.scrollTop;
  virtualScroll.scrollTop = scrollTop;
  const viewH = cardsGrid?.clientHeight || virtualScroll.containerHeight;
  const metrics = getVirtualScrollMetrics();
  const range = metrics.slice(total, scrollTop, viewH);
  const slice = sorted.slice(range.startIndex, range.endIndex);

  updateVirtualSpacerHeight(total);
  cardsVirtualWindow.style.transform = `translateY(${range.offsetY}px)`;

  const rankMap = buildDistressedRankMap();
  const nextKeys = new Set(slice.map(r => recordKey(r)));
  const frag = document.createDocumentFragment();

  for (const r of slice) {
    const key = recordKey(r);
    let card = virtualScroll.mountedKeys.get(key);
    if (card && card.isConnected) {
      syncPropCardSelection(card, r, rankMap);
    } else {
      card = buildPropCard(r, rankMap);
      virtualScroll.mountedKeys.set(key, card);
    }
    frag.appendChild(card);
  }
  const indicator = cardsVirtualWindow.querySelector('.session-load-indicator');
  cardsVirtualWindow.replaceChildren(frag);
  if (indicator) cardsVirtualWindow.appendChild(indicator);

  for (const [key] of virtualScroll.mountedKeys) {
    if (!nextKeys.has(key)) virtualScroll.mountedKeys.delete(key);
  }

  updateResultCountLabel();
  if (resultsLoadMore) resultsLoadMore.hidden = true;
  if (typeof refreshAllCardThumbs === 'function') refreshAllCardThumbs();
}

R.renderResults = function renderResults(opts = {}) {
  if (state.running && state.appView === 'dashboard' && !opts.force) {
    updateSummaryStats();
    updateResultCountLabel();
    return;
  }
  if (state.running) {
    preservePageScroll(() => renderResultsInner());
    return;
  }
  renderResultsInner();
}

R.buildPropCard = function buildPropCard(r, rankMap) {
  const key = recordKey(r);
  const bulkOn = isBulkSelected(key);
  const tierClass = tierBadgeClassForRecord(r);
  const card = document.createElement('div');
  card.className = `prop-card card-ops ${heatClassForRecord(r)}${computeNeedsReview(r) ? ' needs-review' : ''}${state.selectedKey === key ? ' selected' : ''}${bulkOn ? ' bulk-selected' : ''}`;
  card.dataset.key = key;
  card.innerHTML = `
    <div class="card-thumb">
      <span class="card-badge-overlay tier-badge ${tierClass}">${tierBadgeLabelForRecord(r)}</span>
      <span class="card-score-pill">${escapeHtml(scoreDisplayForRecord(r))}</span>
      <label class="bulk-check-wrap" onclick="event.stopPropagation()"><input type="checkbox" class="bulk-row-check" aria-label="Select property"${bulkOn ? ' checked' : ''}></label>
      <img alt="" loading="lazy" decoding="async" style="display:none">
      <div class="card-thumb-gradient"></div>
      <div class="card-thumb-overlay">
        <div class="card-address">${escapeHtml(propertyStreetLine(r))}</div>
        <div class="card-location">${propertyTitleHtml(r)}</div>
      </div>
      <span class="card-thumb-source"></span>
      <div class="card-thumb-fallback">No photo — open property for imagery</div>
    </div>
    <div class="card-footer">
      ${isLeadExported(r) ? '<span class="card-exported-tag">Exported</span>' : ''}
      <span class="card-timestamp">${escapeHtml(formatLeadUploadedAt(r))}</span>
    </div>`;
  wireBulkCheckbox(card, key);
  wireCardThumb(card, r);
  return card;
}

R.buildResultRow = function buildResultRow(r) {
  const cat = resultCategory(r);
  const tier = resultLeadTier(r);
  const key = recordKey(r);
  const bulkOn = isBulkSelected(key);
  const tr = document.createElement('tr');
  tr.dataset.key = key;
  tr.className = `${state.selectedKey === key ? 'row-selected' : ''}${bulkOn ? ' bulk-selected' : ''}`.trim();
  tr.style.cursor = 'pointer';
  tr.innerHTML = `
    <td class="col-bulk"><input type="checkbox" class="bulk-row-check" aria-label="Select row"${bulkOn ? ' checked' : ''}></td>
    <td class="col-score"><span class="score-badge ${scoreClassForRecord(r)}">${scoreDisplayForRecord(r)}</span></td>
    <td class="col-uploaded">${leadUploadedHtml(r, 'table')}${isLeadExported(r) ? `<div class="table-exported-at">${escapeHtml(formatExportedAt(r))}</div>` : ''}</td>
    <td><span class="tier-badge ${tierBadgeClassForRecord(r)}">${tierBadgeLabelForRecord(r)}</span>${exportedBadgeHtml(r)}</td>
    <td><span class="category-badge ${categoryBadgeClass(cat)}">${categoryLabel(cat)}</span></td>
    <td>${leadTypeBadgeHtml(r)}</td>
    <td class="col-location">${propertyTitleHtml(r)}</td>
    <td class="col-name">${escapeHtml(r.firstName)}</td>
    <td class="col-name">${escapeHtml(r.lastName)}</td>
    <td class="col-contact">${escapeHtml(r.phone)}</td>
    <td class="col-contact">${escapeHtml(r.email)}</td>
    <td class="col-address">${escapeHtml(propertyStreetLine(r))}</td>
    <td class="reason-cell">${escapeHtml(buildOneLineSummary(r))}</td>
  `;
  wireBulkCheckbox(tr, key);
  wireScoreEditClick(tr.querySelector('.score-badge'), r);
  return tr;
}

R.syncPropCardSelection = function syncPropCardSelection(card, r, rankMap) {
  const key = recordKey(r);
  const bulkOn = isBulkSelected(key);
  card.className = `prop-card card-ops ${heatClassForRecord(r)}${computeNeedsReview(r) ? ' needs-review' : ''}${state.selectedKey === key ? ' selected' : ''}${bulkOn ? ' bulk-selected' : ''}`;
  const addressEl = card.querySelector('.card-address');
  if (addressEl) addressEl.textContent = propertyStreetLine(r);
  const locationEl = card.querySelector('.card-location');
  if (locationEl) locationEl.innerHTML = propertyTitleHtml(r);
  const timestampEl = card.querySelector('.card-timestamp');
  if (timestampEl) timestampEl.textContent = formatLeadUploadedAt(r);
  const scoreEl = card.querySelector('.card-score-pill');
  if (scoreEl) scoreEl.textContent = scoreDisplayForRecord(r);
  const tierEl = card.querySelector('.card-badge-overlay');
  if (tierEl) {
    tierEl.className = `card-badge-overlay tier-badge ${tierBadgeClassForRecord(r)}`;
    tierEl.textContent = tierBadgeLabelForRecord(r);
  }
  const footer = card.querySelector('.card-footer');
  if (footer) {
    const exported = isLeadExported(r);
    let tag = footer.querySelector('.card-exported-tag');
    if (exported) {
      if (!tag) {
        tag = document.createElement('span');
        tag.className = 'card-exported-tag';
        tag.textContent = 'Exported';
        footer.insertBefore(tag, footer.firstChild);
      }
    } else if (tag) {
      tag.remove();
    }
  }
  card.classList.toggle('bulk-selected', bulkOn);
  const cb = card.querySelector('.bulk-row-check');
  if (cb) cb.checked = bulkOn;
  wireCardThumb(card, r);
}

R.renderResultsIncremental = function renderResultsIncremental(sorted, rankMap) {
  const sortedKeys = new Set(sorted.map(r => recordKey(r)));
  const showCards = state.viewMode === 'cards';

  if (showCards) {
    const existingCards = new Map(
      [...cardsGrid.querySelectorAll('.prop-card[data-key]')].map(el => [el.dataset.key, el])
    );
    const cardFrag = document.createDocumentFragment();
    for (const r of sorted) {
      const key = recordKey(r);
      let card = existingCards.get(key);
      if (card) {
        syncPropCardSelection(card, r, rankMap);
      } else {
        card = buildPropCard(r, rankMap);
      }
      cardFrag.appendChild(card);
    }
    cardsGrid.replaceChildren(cardFrag);
    for (const [key, card] of existingCards) {
      if (!sortedKeys.has(key)) card.remove();
    }
  } else {
    const existingRows = new Map(
      [...resultsBody.querySelectorAll('tr[data-key]')].map(el => [el.dataset.key, el])
    );
    const tableFrag = document.createDocumentFragment();
    for (const r of sorted) {
      const key = recordKey(r);
      let row = existingRows.get(key);
      if (row) {
        const tier = resultLeadTier(r);
        row.className = state.selectedKey === key ? 'row-selected' : '';
        const uploadedCell = row.querySelector('.col-uploaded .lead-uploaded-val');
        if (uploadedCell) {
          uploadedCell.textContent = formatLeadUploadedAt(r);
          uploadedCell.setAttribute('datetime', leadUploadedIso(r));
        }
        const scoreBadge = row.querySelector('.score-badge');
        if (scoreBadge) {
          scoreBadge.className = `score-badge ${scoreClassForRecord(r)}`;
          scoreBadge.textContent = scoreDisplayForRecord(r);
        }
        const tierBadge = row.querySelector('.tier-badge');
        if (tierBadge) {
          tierBadge.className = `tier-badge ${tierBadgeClassForRecord(r)}`;
          tierBadge.textContent = tierBadgeLabelForRecord(r);
        }
        const catBadge = row.querySelector('.category-badge');
        if (catBadge) {
          catBadge.className = `category-badge ${categoryBadgeClass(cat)}`;
          catBadge.textContent = categoryLabel(cat);
        }
        const bulkOn = isBulkSelected(key);
        row.classList.toggle('bulk-selected', bulkOn);
        row.classList.toggle('row-selected', state.selectedKey === key);
        const cb = row.querySelector('.bulk-row-check');
        if (cb) cb.checked = bulkOn;
      } else {
        row = buildResultRow(r);
      }
      tableFrag.appendChild(row);
    }
    resultsBody.replaceChildren(tableFrag);
    for (const [key, row] of existingRows) {
      if (!sortedKeys.has(key)) row.remove();
    }
  }
  updateBulkEditUi();
}

R.INITIAL_RENDER_CHUNK = 32;
R.RENDER_CHUNK_SIZE = 48;

R.renderResultsProgressive = async function renderResultsProgressive() {
  if (state.running) {
    renderResultsInner();
    return;
  }
  const sorted = getFilteredResults();
  const total = state.results.length;
  if (state.viewMode === 'cards' && shouldUseVirtualScroll(total)) {
    renderVirtualCards();
    resultsUiRendered = true;
    return;
  }
  const cap = getDisplayCap();
  const toRender = sorted.slice(0, cap);
  if (!total || !sorted.length || state.viewMode !== 'cards' || toRender.length <= 48) {
    renderResultsInner();
    return;
  }

  const rankMap = buildDistressedRankMap();
  updateSummaryStats({ full: true });
  updateExportButtons();
  resetThumbLoadQueue();
  cardsGrid.replaceChildren();

  let shown = 0;
  while (shown < toRender.length) {
    const chunkSize = shown === 0 ? INITIAL_RENDER_CHUNK : RENDER_CHUNK_SIZE;
    const frag = document.createDocumentFragment();
    const end = Math.min(shown + chunkSize, toRender.length);
    for (let i = shown; i < end; i++) {
      frag.appendChild(buildPropCard(toRender[i], rankMap));
    }
    cardsGrid.appendChild(frag);
    shown = end;
    $('resultCount').textContent = shown < toRender.length
      ? `· Loading ${shown.toLocaleString()} of ${toRender.length.toLocaleString()}…`
      : `· ${toRender.length.toLocaleString()} shown${sorted.length !== total ? ` (${sorted.length.toLocaleString()} filtered)` : ''}`;
    if (shown < toRender.length) await yieldToMain();
  }
  updateLoadMoreBar(sorted.length, toRender.length);
  updateBulkEditUi();
  resultsUiRendered = true;
}

R.renderResultsInner = function renderResultsInner() {
  const sorted = getFilteredResults();
  const total = getTotalScannedCount();
  const loaded = state.results.length;
  const cap = getDisplayCap();
  const toRender = sorted.slice(0, cap);

  $('resultCount').textContent = total
    ? (toRender.length < sorted.length
      ? `· ${toRender.length.toLocaleString()} shown of ${sorted.length.toLocaleString()}${sorted.length !== total ? ` (${total.toLocaleString()} total)` : ''}`
      : (loaded < total && state.filter === 'all' && !state.searchQuery.trim()
        ? `· ${sorted.length.toLocaleString()} loaded · ${total.toLocaleString()} scanned`
        : `· ${sorted.length.toLocaleString()}${sorted.length !== total ? ` of ${total.toLocaleString()}` : ''} properties`))
    : '';
  updateScannedCountUi?.();

  if (!total) {
    if (virtualScroll.initialized && cardsVirtualWindow) {
      cardsVirtualWindow.innerHTML = '<div class="empty-state" style="grid-column:1/-1;"><div class="empty-state-icon">◎</div>Results appear here — newest uploads at the top</div>';
      updateVirtualSpacerHeight(0);
    } else {
      cardsGrid.innerHTML = '<div class="empty-state" style="grid-column:1/-1;"><div class="empty-state-icon">◎</div>Results appear here — newest uploads at the top</div>';
    }
    resultsBody.innerHTML = '<tr><td colspan="13" class="empty-state">No results yet</td></tr>';
    updateLoadMoreBar(0, 0);
    updateSummaryStats();
    return;
  }

  if (!sorted.length) {
    if (virtualScroll.initialized && cardsVirtualWindow) {
      cardsVirtualWindow.innerHTML = '<div class="empty-state" style="grid-column:1/-1;">No properties match this filter</div>';
      updateVirtualSpacerHeight(0);
    } else {
      cardsGrid.innerHTML = '<div class="empty-state" style="grid-column:1/-1;">No properties match this filter</div>';
    }
    resultsBody.innerHTML = '<tr><td colspan="13" class="empty-state">No properties match this filter</td></tr>';
    updateLoadMoreBar(0, 0);
    return;
  }

  const rankMap = buildDistressedRankMap();
  cardsGrid?.classList.toggle('no-card-anim', isAnalyzeLayout() || toRender.length > 24);

  if (state.running) {
    resetThumbLoadQueue();
    renderResultsIncremental(toRender, rankMap);
  } else if (state.viewMode === 'cards' && shouldUseVirtualScroll(sorted.length)) {
    renderVirtualCards();
    if (resultsLoadMore) resultsLoadMore.hidden = true;
  } else if (state.viewMode === 'cards') {
    resetVirtualScrollDom();
    resetThumbLoadQueue();
    const cardFrag = document.createDocumentFragment();
    for (const r of toRender) cardFrag.appendChild(buildPropCard(r, rankMap));
    cardsGrid.replaceChildren(cardFrag);
    updateLoadMoreBar(sorted.length, toRender.length);
    if (isAnalyzeLayout()) preloadAnalyzeCardThumbs?.();
  } else {
    const tableFrag = document.createDocumentFragment();
    for (const r of toRender) tableFrag.appendChild(buildResultRow(r));
    resultsBody.replaceChildren(tableFrag);
    updateLoadMoreBar(sorted.length, toRender.length);
  }

  updateSummaryStats({ full: true });
  updateExportButtons();
  resultsUiRendered = true;
  updateLocationHubUi?.();
}

R.escapeHtml = function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

R.updateProgress = function updateProgress() {
  const write = () => {
    const batchTotal = Number(state.scanBatchTotal) || 0;
    const batchDone = Number(state.scanBatchDone) || 0;
    const sessionTotal = (state.results || []).length || Number(state.processed) || 0;
    // Prefer this-list progress during a run; fall back to session/records only when idle
    const total = batchTotal > 0
      ? batchTotal
      : (state.records.length || sessionTotal);
    const done = batchTotal > 0 ? batchDone : sessionTotal;
    const pct = total ? Math.min(100, (done / total) * 100) : 0;
    if (progressBar) progressBar.style.width = `${pct}%`;
    if (liveScanProgress) {
      if (batchTotal > 0) {
        liveScanProgress.textContent =
          `${batchDone.toLocaleString()} / ${batchTotal.toLocaleString()} this list` +
          (sessionTotal ? ` · ${sessionTotal.toLocaleString()} saved total` : '');
      } else {
        liveScanProgress.textContent = `${sessionTotal.toLocaleString()} saved`;
      }
    }
    updateLiveScanSectionUi?.();
    const hudInstant = { instant: true };
    animateStatNumber($('progressPct'), Math.round(pct), { ...hudInstant, suffix: '%' });
    const remaining = Math.max(0, total - done);
    animateStatNumber($('statDone'), done, hudInstant);
    animateStatNumber($('statRemaining'), remaining, hudInstant);
    if ($('statTotal')) $('statTotal').textContent = total.toLocaleString();
    if ($('statSuccess')) $('statSuccess').textContent = state.succeeded.toLocaleString();
    if ($('statSkipped')) $('statSkipped').textContent = state.skipped.toLocaleString();
    updateLiveScanDock();
    updateCommandBar();
  };
  if (state.running) preservePageScroll(write);
  else write();
}

R.setHudStatus = function setHudStatus(_text, _active = false) {};

R.showPreview = function showPreview(address, status, streetViewUrl = null, satelliteUrl = null, score = null, animateGauge = true) {
  state.scanLiveSnapshot = { address, status, streetViewUrl, satelliteUrl, score, animateGauge };
  updateLiveScanDock();
  if (!state.running) return;
  const isActive = !!(status && !/complete|stopped|done|failed/i.test(status));
  setHudStatus(isActive ? 'SCANNING' : 'ACTIVE', isActive);
}

R.streetViewMetadata = function streetViewMetadata(address, apiKey) {
  return new Promise((resolve, reject) => {
    const cb = 'svMeta_' + Date.now() + '_' + Math.random().toString(36).slice(2);
    const script = document.createElement('script');
    const cleanup = () => {
      delete window[cb];
      if (script.parentNode) script.parentNode.removeChild(script);
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Street View metadata timed out'));
    }, 15000);

    window[cb] = (data) => {
      clearTimeout(timer);
      cleanup();
      resolve(data);
    };

    script.onerror = () => {
      clearTimeout(timer);
      cleanup();
      reject(new Error('Street View metadata blocked — check API key & enable Street View Static API'));
    };

    script.src = `https://maps.googleapis.com/maps/api/streetview/metadata?location=${encodeURIComponent(address)}&key=${encodeURIComponent(apiKey)}&callback=${cb}`;
    document.head.appendChild(script);
  });
}

R.checkStreetViewAvailable = async function checkStreetViewAvailable(address, apiKey) {
  const data = await streetViewMetadata(address, apiKey);
  if (data.status === 'OK') return data;

  const msg = data.error_message || data.status || 'Unknown error';
  if (data.status === 'ZERO_RESULTS') {
    throw new Error('No Street View imagery at this address');
  }
  if (data.status === 'REQUEST_DENIED' || data.status === 'INVALID_REQUEST') {
    throw new Error(`Street View API: ${msg}`);
  }
  throw new Error(`Street View: ${msg}`);
}

R.getStreetViewUrl = function getStreetViewUrl(address, apiKey, size = STREET_VIEW_SIZE) {
  const key = normalizeApiKey(apiKey);
  if (!address) return '';
  if (USE_PROXY && !key && !serverHasMapsKey) return '';
  if (!USE_PROXY && !key) return '';
  if (USE_PROXY) {
    const q = new URLSearchParams({ address, size });
    appendMapsKeyParam(q, apiKey);
    return resolveImageryPublicUrl(`/api/sv-image?${q.toString()}`);
  }
  return `https://maps.googleapis.com/maps/api/streetview?size=${size}&location=${encodeURIComponent(address)}&key=${encodeURIComponent(key)}&return_error_code=true`;
}

R.getSatelliteUrl = function getSatelliteUrl(address, apiKey, size = null) {
  const key = normalizeApiKey(apiKey);
  if (!address) return '';
  if (USE_PROXY && !key && !serverHasMapsKey) return '';
  if (!USE_PROXY && !key) return '';
  if (USE_PROXY) {
    const q = new URLSearchParams({ address });
    appendMapsKeyParam(q, apiKey);
    if (size) q.set('size', size);
    return resolveImageryPublicUrl(`/api/satellite-image?${q.toString()}`);
  }
  return '';
}

R.proxyFetchUrl = function proxyFetchUrl(path, params, apiKey) {
  const q = new URLSearchParams(params);
  appendMapsKeyParam(q, apiKey);
  return `${path}?${q.toString()}`;
}

/** Throw a hard-quota Error the scan loop always recognizes (never Needs Review). */
R.throwHardQuotaIfNeeded = function throwHardQuotaIfNeeded(data, provider, fallback) {
  if (!data || data.ok || !data.hardQuota) return;
  const who = provider === 'maps' ? 'MAPS' : 'GEMINI';
  const detail = String(data.error || data.rawGoogleError || fallback || 'credits / quota exhausted').slice(0, 280);
  const err = new Error(`[${who}] QUOTA/CREDITS EXHAUSTED — ${detail}`);
  err.hardQuota = true;
  err.status = data.httpStatus || data.status || 429;
  throw err;
}

R.fetchSatelliteBase64 = async function fetchSatelliteBase64(address, apiKey) {
  if (!USE_PROXY) throw new Error('Open via launch-analyzer.bat (http://distressos.local:3456)');
  const res = await fetch(proxyFetchUrl('/api/satellite-base64', { address }, apiKey));
  const data = await res.json();
  throwHardQuotaIfNeeded(data, 'maps', 'Satellite billing/quota');
  if (!data.ok) throw new Error(data.error || 'Satellite failed');
  return {
    base64: data.base64,
    mimeType: data.mimeType || 'image/png',
    geocoded: data.geocoded || null
  };
}

R.fetchPropertyImagery = async function fetchPropertyImagery(address, apiKey) {
  if (!USE_PROXY) throw new Error('Open via launch-analyzer.bat (http://distressos.local:3456)');
  let res;
  try {
    res = await fetch(proxyFetchUrl('/api/property-imagery', { address }, apiKey));
  } catch (e) {
    const detail = String(e?.message || e || 'network error').trim();
    throw new Error(`Imagery request failed (${detail}). If this keeps happening, check that launch-analyzer.bat is still running.`);
  }
  const data = await res.json();
  throwHardQuotaIfNeeded(data, 'maps', 'Imagery billing/quota');
  if (data?.streetView?.hardQuota) throwHardQuotaIfNeeded(data.streetView, 'maps', 'Street View billing/quota');
  if (data?.satellite?.hardQuota) throwHardQuotaIfNeeded(data.satellite, 'maps', 'Satellite billing/quota');
  if (!data.ok) throw new Error(data.error || 'Imagery failed');
  return data;
}

R.fetchStreetViewImagery = async function fetchStreetViewImagery(address, apiKey, opts = {}) {
  if (!USE_PROXY) throw new Error('Open via launch-analyzer.bat (http://distressos.local:3456)');
  const params = { address };
  if (opts.refresh) params.refresh = '1';
  let res;
  try {
    res = await fetch(proxyFetchUrl('/api/sv-base64', params, apiKey));
  } catch (e) {
    const detail = String(e?.message || e || 'network error').trim();
    throw new Error(`Street View request failed (${detail}). If this keeps happening, check that launch-analyzer.bat is still running.`);
  }
  return res.json();
}

R.fetchSatelliteImagery = async function fetchSatelliteImagery(address, apiKey) {
  if (!USE_PROXY) throw new Error('Open via launch-analyzer.bat (http://distressos.local:3456)');
  let res;
  try {
    res = await fetch(proxyFetchUrl('/api/satellite-base64', { address }, apiKey));
  } catch (e) {
    const detail = String(e?.message || e || 'network error').trim();
    throw new Error(`Satellite request failed (${detail}). If this keeps happening, check that launch-analyzer.bat is still running.`);
  }
  return res.json();
}

R.fetchStreetViewBase64 = async function fetchStreetViewBase64(address, apiKey) {
  if (USE_PROXY) {
    const data = await fetchStreetViewImagery(address, apiKey);
    throwHardQuotaIfNeeded(data, 'maps', 'Street View billing/quota');
    if (!data.ok) throw new Error(data.error || 'Street View failed');
    return {
      base64: data.base64,
      mimeType: data.mimeType || 'image/jpeg',
      view: data.view ? { ...data.view, qualityFlags: data.view.qualityFlags || [] } : null
    };
  }
  const imageUrl = `https://maps.googleapis.com/maps/api/streetview?size=${STREET_VIEW_SIZE}&location=${encodeURIComponent(address)}&key=${encodeURIComponent(apiKey)}&return_error_code=true`;
  await verifyImageLoads(imageUrl);
  throw new Error('Open via launch-analyzer.bat (http://distressos.local:3456) — direct HTML mode cannot fetch images');
}

R.showFatalError = function showFatalError(msg) {
  errorBanner.innerHTML = `<strong>⚠ Fix this to stop skips</strong>${escapeHtml(msg)}`;
  errorBanner.classList.add('visible');
  if (!state.haltAlertShown) {
    notifyScanIssue('fatal', msg, { title: 'Action required', dedupeKey: `fatal-banner-${String(msg).slice(0, 40)}` });
  }
}

R.flagError = function flagError(err) {
  if (!firstErrorShown) {
    firstErrorShown = true;
    const m = err.message || String(err);
    if (m.includes('REQUEST_DENIED') || m.includes('API key') || m.includes('403')) {
      showFatalError('Street View API key rejected. Enable Street View Static API + billing in Google Cloud. Set key restrictions to None for testing.');
    } else if (m.includes('Gemini')) {
      showFatalError('Gemini API error. Check your Gemini key at aistudio.google.com/apikey — use a separate key from Street View.');
    }
  }
}

R.verifyImageLoads = async function verifyImageLoads(imageUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const timer = setTimeout(() => reject(new Error('Street View timed out')), 20000);
    img.onload = () => { clearTimeout(timer); resolve(); };
    img.onerror = () => {
      clearTimeout(timer);
      reject(new Error('No Street View photo for this address'));
    };
    img.src = imageUrl;
  });
}

R.sleep = async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

R.callGeminiVision = async function callGeminiVision(base64, mimeType, apiKey, prompt, maxOutputTokens = 1024, images = null, meta = {}) {
  if (!USE_PROXY) throw new Error('Open via launch-analyzer.bat (http://distressos.local:3456)');
  if (!serverConfig.hasGeminiKey) throw new Error('GEMINI_API_KEY not configured in .env');
  const payload = {
    prompt,
    maxOutputTokens,
    address: meta.address || null,
    scanType: meta.scanType || null
  };
  if (Array.isArray(images) && images.length) {
    payload.images = images.map(img => ({
      base64: img.base64,
      mimeType: img.mimeType || 'image/jpeg'
    }));
  } else if (base64) {
    payload.base64 = base64;
    payload.mimeType = mimeType;
  }
  const res = await apiFetch('/api/gemini-vision', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if (!data.ok) {
    throwHardQuotaIfNeeded(data, 'gemini', 'Gemini billing/quota');
    // Also treat server hardQuota flag when throw helper no-ops on missing shape
    if (data.hardQuota) {
      const err = new Error(`[GEMINI] QUOTA/CREDITS EXHAUSTED — ${data.error || 'credits / quota exhausted'}`);
      err.hardQuota = true;
      err.status = data.httpStatus || data.status || 429;
      throw err;
    }
    throw new Error(data.error || 'Gemini vision failed');
  }
  return data.text;
}

  }
  PDA.render = {
    get initVirtualScroll() { return R.initVirtualScroll; },
    get renderResultsProgressive() { return R.renderResultsProgressive; },
    get renderResults() { return R.renderResults; },
    get renderVirtualCards() { return R.renderVirtualCards; },
    get updateSummaryStats() { return R.updateSummaryStats; },
    get updateCommandBar() { return R.updateCommandBar; },
    get setFilter() { return R.setFilter; },
    get openPropertyModal() { return R.openPropertyModal; },
    get closePropertyModal() { return R.closePropertyModal; },
    get exportResults() { return R.exportResults; },
    get getFilteredResults() { return R.getFilteredResults; },
    get updateSummaryPipeline() { return R.updateSummaryPipeline; },
    get showInspector() { return R.showInspector; },
    get escapeHtml() { return R.escapeHtml; }
  };
})(window);
