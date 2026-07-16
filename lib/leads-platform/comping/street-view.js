/**
 * Google Maps Street View deep links for comping reports.
 */

function streetViewUrl({ lat, lng, address } = {}) {
  const base = 'https://www.google.com/maps/@?api=1&map_action=pano';
  const latNum = Number(lat);
  const lngNum = Number(lng);
  if (Number.isFinite(latNum) && Number.isFinite(lngNum)) {
    return `${base}&viewpoint=${latNum},${lngNum}`;
  }
  const addr = String(address || '').trim();
  if (addr) {
    return `${base}&query=${encodeURIComponent(addr)}`;
  }
  return base;
}

module.exports = { streetViewUrl };
