// Writes a one-sheet .xlsx file (opens in Excel, Google Sheets and Numbers)
// without a library: the sheet's XML files packed in an uncompressed zip.
// Exposed as window.KRainXlsx.build([{ name, rows, widths, freezeRows }]) -> Blob,
// one entry per sheet:
//   rows: arrays of cells; a cell is a string, a number, null, or { v, f, s }
//         (value, formula, style: 'bold' | 'num' | 'boldNum' | 'rain' | 'noRain')
//   widths: column widths in characters
//   freezeRows: how many top rows stay in place while scrolling
(function (root) {
  const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
  const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const PKG = 'http://schemas.openxmlformats.org/package/2006/relationships';
  const MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const STYLE = { bold: 1, num: 2, boldNum: 3, rain: 4, noRain: 5 };

  const esc = s => String(s)
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const col = i => (i >= 26 ? col(Math.floor(i / 26) - 1) : '') + String.fromCharCode(65 + i % 26);

  function cell(c, ref) {
    if (c == null || c === '') return '';
    const { v, f, s } = typeof c === 'object' ? c : { v: c };
    const st = s ? ` s="${STYLE[s]}"` : '';
    if (f) return `<c r="${ref}"${st}><f>${esc(f)}</f>${typeof v === 'number' ? `<v>${v}</v>` : ''}</c>`;
    if (typeof v === 'number') return Number.isFinite(v) ? `<c r="${ref}"${st}><v>${v}</v></c>` : '';
    return `<c r="${ref}"${st} t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
  }

  function sheetXml({ rows, widths = [], freezeRows = 0 }) {
    const data = rows.map((r, i) => `<row r="${i + 1}">${(r || []).map((c, j) => cell(c, col(j) + (i + 1))).join('')}</row>`).join('');
    const cols = widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('');
    const pane = freezeRows ? `<pane ySplit="${freezeRows}" topLeftCell="A${freezeRows + 1}" activePane="bottomLeft" state="frozen"/>` : '';
    return XML + `<worksheet xmlns="${NS}">` +
      `<sheetViews><sheetView workbookViewId="0">${pane}</sheetView></sheetViews>` +
      (cols ? `<cols>${cols}</cols>` : '') +
      `<sheetData>${data}</sheetData>` +
      '</worksheet>';
  }

  const STYLES = XML + `<styleSheet xmlns="${NS}">` +
    '<fonts count="4"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font>' +
    '<font><b/><sz val="12"/><color rgb="FF1677B8"/><name val="Calibri"/></font><font><b/><sz val="12"/><color rgb="FF6F7D00"/><name val="Calibri"/></font></fonts>' +
    '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="6">' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
    '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
    '<xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
    '<xf numFmtId="4" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>' +
    '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
    '<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
    '</cellXfs>' +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
    '</styleSheet>';

  // Sheet names: at most 31 characters, none of \ / ? * [ ] :, unique ignoring case.
  function sheetNames(sheets) {
    const used = new Set();
    return sheets.map((sh, i) => {
      const base = String(sh.name || `Sheet${i + 1}`).replace(/[\\/?*[\]:]/g, ' ').replace(/^'|'$/g, '').trim().slice(0, 28) || `Sheet${i + 1}`;
      let name = base;
      for (let n = 2; used.has(name.toLowerCase()); n++) name = `${base} (${n})`;
      used.add(name.toLowerCase());
      return name;
    });
  }

  function files(sheets) {
    const names = sheetNames(sheets);
    const ids = sheets.map((_, i) => i + 1);
    return [
      { name: '[Content_Types].xml', text: XML + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        ids.map(n => `<Override PartName="/xl/worksheets/sheet${n}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        '</Types>' },
      { name: '_rels/.rels', text: XML + `<Relationships xmlns="${PKG}">` +
        `<Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
      { name: 'xl/workbook.xml', text: XML + `<workbook xmlns="${NS}" xmlns:r="${REL}"><sheets>` +
        ids.map(n => `<sheet name="${esc(names[n - 1])}" sheetId="${n}" r:id="rId${n}"/>`).join('') +
        '</sheets><calcPr fullCalcOnLoad="1"/></workbook>' },
      { name: 'xl/_rels/workbook.xml.rels', text: XML + `<Relationships xmlns="${PKG}">` +
        ids.map(n => `<Relationship Id="rId${n}" Type="${REL}/worksheet" Target="worksheets/sheet${n}.xml"/>`).join('') +
        `<Relationship Id="rId${ids.length + 1}" Type="${REL}/styles" Target="styles.xml"/></Relationships>` },
      { name: 'xl/styles.xml', text: STYLES },
      ...sheets.map((sh, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, text: sheetXml(sh) })),
    ];
  }

  const CRC = new Uint32Array(256).map((_, n) => {
    for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
    return n;
  });
  const crc32 = bytes => {
    let c = ~0;
    for (const b of bytes) c = CRC[(c ^ b) & 255] ^ (c >>> 8);
    return ~c >>> 0;
  };

  // Zip with every file stored as is (method 0): no compression code needed.
  function zip(list) {
    const enc = new TextEncoder();
    const d = new Date();
    const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    const parts = [], central = [];
    let offset = 0;
    for (const f of list) {
      const name = enc.encode(f.name), data = enc.encode(f.text), crc = crc32(data);
      const local = new DataView(new ArrayBuffer(30));
      local.setUint32(0, 0x04034b50, true);
      local.setUint16(4, 20, true);
      local.setUint16(10, time, true);
      local.setUint16(12, date, true);
      local.setUint32(14, crc, true);
      local.setUint32(18, data.length, true);
      local.setUint32(22, data.length, true);
      local.setUint16(26, name.length, true);
      const entry = new DataView(new ArrayBuffer(46));
      entry.setUint32(0, 0x02014b50, true);
      entry.setUint16(4, 20, true);
      entry.setUint16(6, 20, true);
      entry.setUint16(12, time, true);
      entry.setUint16(14, date, true);
      entry.setUint32(16, crc, true);
      entry.setUint32(20, data.length, true);
      entry.setUint32(24, data.length, true);
      entry.setUint16(28, name.length, true);
      entry.setUint32(42, offset, true);
      parts.push(local, name, data);
      central.push(entry, name);
      offset += 30 + name.length + data.length;
    }
    const size = central.reduce((a, p) => a + p.byteLength, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, list.length, true);
    end.setUint16(10, list.length, true);
    end.setUint32(12, size, true);
    end.setUint32(16, offset, true);
    return new Blob([...parts, ...central, end], { type: MIME });
  }

  root.KRainXlsx = { build: sheets => zip(files(sheets.length ? sheets : [{ rows: [] }])) };
})(typeof window !== 'undefined' ? window : globalThis);
