/**
 * Map spreadsheet columns → Analyzer property profile fields.
 * Keep aliases broad so BatchLead / PropStream / New Analyzer Leads / Filter exports land in the dossier.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PDA = root.PDA || {};
    root.PDA.lib = root.PDA.lib || {};
    root.PDA.lib.importProfile = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function importProfileFactory() {
  function headerKey(h) {
    return String(h || '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
  }

  function flag01(v) {
    const s = String(v ?? '').trim().toLowerCase();
    if (!s) return 0;
    if (s === '1' || s === 'true' || s === 'yes' || s === 'y') return 1;
    if (s === '0' || s === 'false' || s === 'no' || s === 'n') return 0;
    const n = Number(s);
    return Number.isFinite(n) && n !== 0 ? 1 : 0;
  }

  function buildHeaderMap(headers) {
    const map = new Map();
    for (const h of headers || []) {
      const key = headerKey(h);
      if (key && !map.has(key)) map.set(key, h);
    }
    return map;
  }

  function cellFromAliases(row, byLower, names) {
    for (const n of names || []) {
      const c = byLower.get(headerKey(n));
      if (c != null && String(row[c] ?? '').trim()) return String(row[c]).trim();
    }
    return '';
  }

  /**
   * Build a full property profile from one spreadsheet row.
   * @param {object} row - SheetJS row object (header → cell)
   * @param {object} [opts]
   * @param {Map<string,string>} [opts.byLower] - headerKey → original header
   * @param {string[]} [opts.headers]
   */
  function buildImportProfile(row, opts = {}) {
    const byLower = opts.byLower instanceof Map
      ? opts.byLower
      : buildHeaderMap(opts.headers || Object.keys(row || {}));
    const g = (names) => cellFromAliases(row, byLower, names);

    const phones = [];
    const p1 = g([
      'contact1phone_1', 'contact1phone1', 'phone', 'phone number', 'mobile', 'cell',
      'primary phone', 'owner phone', 'phone1', 'mobile phone'
    ]);
    if (p1) {
      phones.push({
        number: p1,
        type: g(['contact1phone_1_type', 'contact1phone1type', 'phone type', 'phone1 type']),
        dnc: /true|1|yes/i.test(g(['contact1phone_1_dnc', 'contact1phone1dnc', 'dnc', 'do not call'])),
        litigator: /true|1|yes/i.test(g(['contact1phone_1_litigator', 'litigator']))
      });
    }
    const p2 = g(['contact1phone_2', 'contact1phone2', 'phone2', 'secondary phone', 'alt phone']);
    if (p2) {
      phones.push({
        number: p2,
        type: g(['contact1phone_2_type', 'phone2 type']),
        dnc: /true|1|yes/i.test(g(['contact1phone_2_dnc'])),
        litigator: /true|1|yes/i.test(g(['contact1phone_2_litigator']))
      });
    }
    const p3 = g(['contact1phone_3', 'contact1phone3', 'phone3']);
    if (p3) {
      phones.push({
        number: p3,
        type: g(['contact1phone_3_type']),
        dnc: /true|1|yes/i.test(g(['contact1phone_3_dnc'])),
        litigator: /true|1|yes/i.test(g(['contact1phone_3_litigator']))
      });
    }

    const emails = [];
    const e1 = g(['contact1email_1', 'contact1email1', 'email', 'email address', 'e-mail', 'primary email']);
    const e2 = g(['contact1email_2', 'contact1email2', 'email2', 'secondary email', 'alt email']);
    if (e1) emails.push(e1);
    if (e2) emails.push(e2);

    const hoaRaw = g(['hoa', 'hoa yn', 'hoa y/n', 'in hoa']);
    const hoaYes = flag01(hoaRaw) || /yes|y|true|1/i.test(hoaRaw);

    const profile = {
      _shaped: true,
      propertyType: g(['propertytype', 'property type', 'prop type', 'land use', 'property use', 'dwelling type']),
      beds: g(['beds', 'bedrooms', 'bed', 'br', '# bedrooms', 'number of bedrooms']),
      baths: g(['baths', 'bathrooms', 'bath', 'ba', '# bathrooms', 'number of bathrooms']),
      squareFootage: g([
        'squarefootage', 'sqft', 'sq ft', 'living area', 'living sqft', 'building sqft',
        'gla', 'gross living area', 'finished sqft'
      ]),
      lotSizeSqFt: g(['lotsizesqft', 'lot size', 'lot sqft', 'lot size sqft', 'lotarea', 'parcel size']),
      yearBuilt: g(['yearbuilt', 'year built', 'yr built', 'built', 'yearconstructed']),
      stories: g(['stories', 'story', 'floors', '# stories', 'number of stories']),
      units: g(['units', 'unit count', '# units', 'number of units']),
      ownerType: g(['ownertype', 'owner type', 'ownership type', 'owner occupancy']),
      county: g(['county', 'property county', 'situs county']),
      lastSalesDate: g(['lastsalesdate', 'last sale date', 'sale date', 'last sold date', 'sold date']),
      lastSalesPrice: g(['lastsalesprice', 'last sale price', 'sale price', 'last sold price', 'sold price']),
      pricePerSqFt: g(['pricepersqft', 'price per sqft', 'price/sqft', 'ppsf', '$/sqft']),
      avm: g(['avm', 'estimated value', 'est value', 'estimated market value', 'value estimate']),
      marketValue: g(['marketvalue', 'market value', 'retail value', 'estimated retail value', 'arv']),
      wholesaleValue: g(['wholesalevalue', 'wholesale value', 'mao', 'max allowable offer']),
      taxAssessedValue: g(['taxassessedvalue', 'assessed value', 'tax assessment', 'assessedval']),
      taxAmount: g(['taxamount', 'tax amount', 'annual tax', 'property tax', 'taxes']),
      ltv: g(['ltv', 'loan to value', 'loan-to-value']),
      estimatedMortgageBalance: g([
        'estimatedmortgagebalance', 'mortgage balance', 'est mortgage balance',
        'open mortgage balance', 'remaining balance', 'loan balance'
      ]),
      estimatedMortgagePayment: g([
        'estimatedmortgagepayment', 'mortgage payment', 'est payment', 'monthly payment', 'payment'
      ]),
      mortgageInterestRate: g(['mortgageinterestrate', 'interest rate', 'rate', 'mortgage rate']),
      lenderName: g(['lendername', 'lender', 'mortgage lender', 'servicer']),
      loanType: g(['loantype', 'loan type', 'mortgage type']),
      numberOfLoans: g(['numberofloans', 'loans', '# loans', 'loan count']),
      totalLoans: g(['totalloans', 'total loan amount', 'total loans']),
      loanAmount: g(['loanamount', 'loan amount', 'original loan amount', 'mortgage amount']),
      mailingStreet: g([
        'recipientaddress', 'mailing address', 'mail street', 'mail address',
        'owner mailing address', 'mailing street', 'owner address'
      ]),
      mailingCity: g(['recipientcity', 'mail city', 'mailing city', 'owner city']),
      mailingState: g(['recipientstate', 'mail state', 'mailing state', 'owner state']),
      mailingPostal: g([
        'recipientpostalcode', 'mail zip', 'mail postal', 'mailing zip',
        'mailing postal', 'owner zip', 'owner postal'
      ]),
      contactName: g([
        'contact1name', 'contact name', 'owner name', 'full name', 'name',
        'property owner', 'owner full name'
      ]),
      contactType: g(['contact1type', 'contact type', 'owner contact type']),
      phones,
      emails,
      heating: g(['heating', 'heat type', 'heating type', 'heating system']),
      heatingFuel: g(['heatingfuel', 'heating fuel', 'fuel type', 'heat fuel']),
      airConditioning: g(['airconditioning', 'ac', 'a/c', 'air conditioning', 'cooling']),
      fireplace: g(['fireplace', 'fireplaces', '# fireplaces']),
      garage: g(['garage', 'garage type', 'parking', 'garage spaces']),
      roof: g(['roof', 'roof type', 'roofing', 'roof material']),
      roofShape: g(['roofshape', 'roof shape', 'roof style']),
      interiorWalls: g(['interiorwalls', 'interior walls', 'wall type', 'walls']),
      basement: g(['basement', 'basement type']),
      water: g(['water', 'water source', 'water type']),
      sewer: g(['sewer', 'sewer type', 'septic']),
      pool: g(['pool', 'swimming pool', 'pool yn']),
      porch: g(['porch', 'porch type']),
      patio: g(['patio', 'patio type', 'deck']),
      hoa: hoaYes ? 'Yes' : (hoaRaw && /no|n|false|0/i.test(hoaRaw) ? 'No' : ''),
      hoaName: g(['hoaname', 'hoa name', 'hoa association', 'association name']),
      hoaFee: g(['hoafee', 'hoa fee', 'hoa dues', 'hoa amount', 'association fee']),
      hoaFeeFrequency: g(['hoafeefrequency', 'hoa fee frequency', 'hoa frequency', 'dues frequency']),
      auctionDate: g(['auctiondate', 'auction date', 'sale auction date']),
      lastNoticeDate: g(['lastnoticedate', 'last notice date', 'notice date', 'lis pendens date']),
      codeCategory: g(['codecategory', 'code category', 'violation category', 'category']),
      codeType: g(['codetype', 'code type', 'violation type', 'case type']),
      violationDescription: g([
        'violationdescription', 'violation description', 'violation', 'description',
        'code description', 'offense'
      ]),
      violationDate: g(['violationdate', 'violation date', 'case date', 'open date', 'filed date']),
      flags: {
        absenteeOwner: flag01(g(['absenteeowner', 'absentee owner', 'absentee', 'out of state owner'])),
        activeListing: flag01(g(['activelisting', 'active listing', 'listed', 'mls active'])),
        highEquity: flag01(g(['highequity', 'high equity'])),
        preForeclosure: flag01(g(['preforeclosure', 'pre foreclosure', 'pre-foreclosure', 'nod', 'lis pendens'])),
        vacancy: flag01(g(['vacancy', 'vacant', 'vacant property', 'is vacant'])),
        freeAndClear: flag01(g(['freeandclear', 'free and clear', 'free & clear'])),
        longTermOwner: flag01(g(['longtermowner', 'long term owner', 'long-term owner'])),
        potentiallyInherited: flag01(g(['potentiallyinherited', 'inherited', 'probate', 'estate'])),
        delinquentTaxActivity: flag01(g(['delinquenttaxactivity', 'tax delinquent', 'delinquent taxes'])),
        zombieProperty: flag01(g(['zombieproperty', 'zombie', 'zombie property'])),
        cashBuyer: flag01(g(['cashbuyer', 'cash buyer'])),
        flipped: flag01(g(['flipped', 'flip', 'recent flip'])),
        foreclosureActivity: flag01(g(['foreclosureactivity', 'foreclosure activity', 'foreclosure'])),
        boredInvestor: flag01(g(['boredinvestor', 'bored investor']))
      }
    };

    const hasAny = Object.entries(profile).some(([key, v]) => {
      if (key === '_shaped') return false;
      if (v && typeof v === 'object') {
        if (Array.isArray(v)) return v.length > 0;
        return Object.values(v).some((x) => x === 1 || (typeof x === 'string' && x));
      }
      return !!v && v !== true;
    });
    return hasAny ? profile : null;
  }

  /** Persist every mapped profile field (do not strip for a "lean" subset). */
  function profileForImportRecord(profile) {
    if (!profile || typeof profile !== 'object') return null;
    return { ...profile, _shaped: true };
  }

  return {
    headerKey,
    flag01,
    buildHeaderMap,
    buildImportProfile,
    profileForImportRecord
  };
});
