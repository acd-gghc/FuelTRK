export function extractFlightMeta(fileName) {
  const m = fileName.match(/log_(\d{2})(\d{2})(\d{2})_(\d{2})(\d{2})\d{2}_?(.*)\.csv/i);
  if (m) {
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const month = months[parseInt(m[2], 10) - 1] || m[2];
    const day = parseInt(m[3], 10);
    const hour = m[4];
    const min = m[5];
    let ident = m[6] || '';
    if (ident.startsWith('_') || ident === '') ident = '';
    const name = ident
      ? `${month} ${day} ${ident}`
      : `${month} ${day} ${hour}:${min}`;
    return { name, ident };
  }
  return { name: fileName.replace(/\.csv$/i, ''), ident: '' };
}

export function parseGarminCSV(text) {
  const lines = text.split('\n');

  let headerLine = null;
  let dataStartIdx = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line.startsWith('#') && line.includes('Lcl Date')) {
      headerLine = i;
      dataStartIdx = i + 1;
      break;
    }
  }

  if (headerLine === null) return { rows: [], headers: [] };

  const rawHeaders = lines[headerLine].split(',').map((h) => h.trim());

  const skipCols = new Set(['Lcl Date', 'Lcl Time', 'UTCOfst', 'AtvWpt', 'HSIS', 'AfcsOn', 'RollM', 'PitchM', 'GPSfix']);
  const numericHeaders = rawHeaders.filter((h) => h && !skipCols.has(h));

  const rows = [];
  for (let i = dataStartIdx; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith('#')) continue;

    const vals = line.split(',').map((v) => v.trim());
    if (vals.length < rawHeaders.length) continue;

    const row = { _time: `${vals[0]} ${vals[1]}`.trim() };
    for (let j = 0; j < rawHeaders.length; j++) {
      const h = rawHeaders[j];
      if (skipCols.has(h) || !h) continue;
      const v = vals[j];
      if (v === '' || v === undefined) {
        row[h] = null;
      } else {
        const n = parseFloat(v);
        row[h] = isNaN(n) ? null : n;
      }
    }
    rows.push(row);
  }

  if (rows.length > 0) {
    const parseTime = (t) => {
      const parts = t.split(/[\s,]+/);
      const timePart = parts.find((p) => /^\d{1,2}:\d{2}(:\d{2})?$/.test(p));
      if (!timePart) return null;
      const [h, m, s] = timePart.split(':').map(Number);
      return h * 3600 + m * 60 + (s || 0);
    };
    // Find first row with a valid timestamp to use as t0
    let t0 = null;
    for (const row of rows) {
      const t = parseTime(row._time);
      if (t !== null) { t0 = t; break; }
    }
    if (t0 === null) t0 = 0;
    for (const row of rows) {
      const t = parseTime(row._time);
      row._elapsed = t !== null ? t - t0 : null;
    }
  }

  const headers = numericHeaders.filter((h) => {
    if (h === 'Lcl Date' || h === 'Lcl Time') return false;
    return rows.some((r) => r[h] !== null && r[h] !== undefined);
  });

  return { rows, headers };
}
