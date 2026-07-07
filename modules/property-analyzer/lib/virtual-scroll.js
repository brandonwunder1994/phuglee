(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PDA = root.PDA || {};
    root.PDA.lib = root.PDA.lib || {};
    root.PDA.lib.virtualScroll = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function virtualScrollFactory() {
  const DEFAULTS = {
    rowHeight: 340,
    cardMinWidth: 280,
    cardGap: 20,
    overscanRows: 5
  };

  function getColumnCount(containerWidth, opts = {}) {
    const gap = opts.cardGap ?? DEFAULTS.cardGap;
    const minW = opts.cardMinWidth ?? DEFAULTS.cardMinWidth;
    const w = Math.max(0, Number(containerWidth) || 0);
    if (w <= 0) return 1;
    return Math.max(1, Math.floor((w + gap) / (minW + gap)));
  }

  function getRowCount(itemCount, cols) {
    const total = Math.max(0, Number(itemCount) || 0);
    const columns = Math.max(1, Number(cols) || 1);
    return total ? Math.ceil(total / columns) : 0;
  }

  function getSpacerHeight(itemCount, containerWidth, opts = {}) {
    const rowHeight = opts.rowHeight ?? DEFAULTS.rowHeight;
    const cols = getColumnCount(containerWidth, opts);
    return getRowCount(itemCount, cols) * rowHeight;
  }

  function getVisibleSlice(itemCount, scrollTop, viewHeight, containerWidth, opts = {}) {
    const rowHeight = opts.rowHeight ?? DEFAULTS.rowHeight;
    const overscan = opts.overscanRows ?? DEFAULTS.overscanRows;
    const total = Math.max(0, Number(itemCount) || 0);
    if (!total) {
      return { cols: 1, totalRows: 0, firstRow: 0, startIndex: 0, endIndex: 0, offsetY: 0 };
    }

    const cols = getColumnCount(containerWidth, opts);
    const totalRows = getRowCount(total, cols);
    const viewH = Math.max(0, Number(viewHeight) || 0);
    const scroll = Math.max(0, Number(scrollTop) || 0);

    const firstRow = Math.max(0, Math.floor(scroll / rowHeight) - overscan);
    const visibleRows = Math.ceil(viewH / rowHeight) + (overscan * 2);
    const lastRow = Math.min(totalRows, firstRow + visibleRows);

    const startIndex = firstRow * cols;
    const endIndex = Math.min(total, lastRow * cols);

    return {
      cols,
      totalRows,
      firstRow,
      startIndex,
      endIndex,
      offsetY: firstRow * rowHeight
    };
  }

  return {
    DEFAULTS,
    getColumnCount,
    getRowCount,
    getSpacerHeight,
    getVisibleSlice
  };
});