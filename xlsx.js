// Writes a one-sheet .xlsx file (opens in Excel, Google Sheets and Numbers)
// without a library: the sheet's XML files packed in an uncompressed zip.
// Exposed as window.KRainXlsx.build({ sheet, rows, widths, filterRows }) -> Blob.
//   rows: arrays of cells; a cell is a string, a number, null, or { v, f, s }
//         (value, formula, style: 'bold' | 'num' | 'boldNum')
//   widths: column widths in characters
//   filterRows: how many leading rows (header included) get filter buttons
// The first row is frozen.
(function (root) {
  const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
  const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const PKG = 'http://schemas.openxmlformats.org/package/2006/relationships';
  const MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const STYLE = { bold: 1, num: 2, boldNum: 3 };

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

  function sheetXml({ rows, widths = [], filter }) {
    const data = rows.map((r, i) => `<row r="${i + 1}">${r.map((c, j) => cell(c, col(j) + (i + 1))).join('')}</row>`).join('');
    const cols = widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('');
    return XML + `<worksheet xmlns="${NS}">` +
      '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
      (cols ? `<cols>${cols}</cols>` : '') +
      `<sheetData>${data}</sheetData>` +
      (filter ? `<autoFilter ref="${filter}"/>` : '') +
      '</worksheet>';
  }

  const STYLES = XML + `<styleSheet xmlns="${NS}">` +
    '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
    '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="4">' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
    '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
    '<xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
    '<xf numFmtId="4" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>' +
    '</cellXfs>' +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
    '</styleSheet>';

  function files({ sheet = 'Sheet1', rows, widths, filterRows }) {
    const width = Math.max(1, ...rows.map(r => r.length));
    const filter = filterRows > 1 ? `A1:${col(width - 1)}${filterRows}` : null;
    const name = esc(sheet.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31));
    const filterName = filter ? `<definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">'${name}'!$${filter.replace(/:/, ':$').replace(/(\d+)/g, '$$$1')}</definedName></definedNames>` : '';
    return [
      { name: '[Content_Types].xml', text: XML + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        '</Types>' },
      { name: '_rels/.rels', text: XML + `<Relationships xmlns="${PKG}">` +
        `<Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
      { name: 'xl/workbook.xml', text: XML + `<workbook xmlns="${NS}" xmlns:r="${REL}">` +
        `<sheets><sheet name="${name}" sheetId="1" r:id="rId1"/></sheets>${filterName}<calcPr fullCalcOnLoad="1"/></workbook>` },
      { name: 'xl/_rels/workbook.xml.rels', text: XML + `<Relationships xmlns="${PKG}">` +
        `<Relationship Id="rId1" Type="${REL}/worksheet" Target="worksheets/sheet1.xml"/>` +
        `<Relationship Id="rId2" Type="${REL}/styles" Target="styles.xml"/></Relationships>` },
      { name: 'xl/styles.xml', text: STYLES },
      { name: 'xl/worksheets/sheet1.xml', text: sheetXml({ rows, widths, filter }) },
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

  root.KRainXlsx = { build: opts => zip(files(opts)) };
})(typeof window !== 'undefined' ? window : globalThis);
