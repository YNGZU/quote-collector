// Export logic for the popup, kept in its own file since it's a
// distinct concern from rendering/search/filtering.
//
// JSON and TXT are simple string-building. DOCX is the interesting
// one: a .docx file is really just a ZIP archive containing a few
// XML files (the OOXML WordprocessingML format). Rather than pull in
// an external library just for this, everything below — including a
// small CRC-32 implementation and a minimal ZIP writer — is written
// from scratch. It only needs the "stored" (uncompressed) ZIP entry
// type, which keeps it simple: no DEFLATE implementation required.

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function dateStamp() {
  return new Date().toISOString().slice(0, 10);
}

// ---------------------------------------------------------
// JSON
// ---------------------------------------------------------

function exportAsJson(quotes) {
  const blob = new Blob([JSON.stringify(quotes, null, 2)], { type: 'application/json' });
  downloadBlob(blob, `quotes-export-${dateStamp()}.json`);
}

// ---------------------------------------------------------
// TXT
// ---------------------------------------------------------

function exportAsTxt(quotes) {
  const lines = ['Quote Collector — My Library', '='.repeat(30), ''];

  quotes.forEach((q) => {
    lines.push(`"${q.text}"`);
    if (q.note) lines.push(q.note);
    lines.push(`${q.source.title || q.source.url} · ${new Date(q.createdAt).toLocaleDateString()}`);
    if (q.tags.length) lines.push(`Tags: ${q.tags.join(', ')}`);
    lines.push('', '-'.repeat(30), '');
  });

  const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
  downloadBlob(blob, `quotes-export-${dateStamp()}.txt`);
}

// ---------------------------------------------------------
// DOCX — minimal ZIP writer + minimal OOXML document
// ---------------------------------------------------------

function crc32(bytes) {
  if (!crc32.table) {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      table[n] = c >>> 0;
    }
    crc32.table = table;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = crc32.table[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// files: [{ name: 'word/document.xml', data: Uint8Array }, ...]
// Every entry is stored uncompressed (compression method 0), which is
// perfectly valid per the ZIP spec and avoids needing a DEFLATE
// implementation just to write a few KB of XML.
function createZip(files) {
  const encoder = new TextEncoder();
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = encoder.encode(file.name);
    const data = file.data;
    const crc = crc32(data);
    const size = data.length;

    const localHeader = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(localHeader.buffer);
    lv.setUint32(0, 0x04034b50, true); // local file header signature
    lv.setUint16(4, 20, true); // version needed to extract
    lv.setUint16(6, 0, true); // general purpose flag
    lv.setUint16(8, 0, true); // compression method: 0 = stored
    lv.setUint16(10, 0, true); // mod time
    lv.setUint16(12, 0x21, true); // mod date
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true); // compressed size
    lv.setUint32(22, size, true); // uncompressed size
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true); // extra field length
    localHeader.set(nameBytes, 30);
    localParts.push(localHeader, data);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(centralHeader.buffer);
    cv.setUint32(0, 0x02014b50, true); // central directory signature
    cv.setUint16(4, 20, true); // version made by
    cv.setUint16(6, 20, true); // version needed
    cv.setUint16(8, 0, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, 0, true);
    cv.setUint16(14, 0x21, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, offset, true); // offset of this entry's local header
    centralHeader.set(nameBytes, 46);
    centralParts.push(centralHeader);

    offset += localHeader.length + data.length;
  }

  const centralDirOffset = offset;
  const centralDirSize = centralParts.reduce((sum, p) => sum + p.length, 0);

  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true); // end of central directory signature
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralDirSize, true);
  ev.setUint32(16, centralDirOffset, true);

  return new Blob([...localParts, ...centralParts, eocd], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
}

function escapeXml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildDocumentXml(quotes) {
  const paragraphs = [
    `<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="32"/></w:rPr><w:t>Quote Collector — My Library</w:t></w:r></w:p>`,
    `<w:p/>`,
  ];

  quotes.forEach((q) => {
    paragraphs.push(
      `<w:p><w:pPr><w:ind w:left="360"/></w:pPr><w:r><w:rPr><w:i/></w:rPr><w:t xml:space="preserve">${escapeXml(
        '\u201C' + q.text + '\u201D'
      )}</w:t></w:r></w:p>`
    );
    if (q.note) {
      paragraphs.push(
        `<w:p><w:pPr><w:ind w:left="360"/></w:pPr><w:r><w:t xml:space="preserve">${escapeXml(q.note)}</w:t></w:r></w:p>`
      );
    }
    const meta = `${q.source.title || q.source.url} \u00B7 ${new Date(q.createdAt).toLocaleDateString()}${
      q.tags.length ? ' \u00B7 ' + q.tags.join(', ') : ''
    }`;
    paragraphs.push(
      `<w:p><w:pPr><w:ind w:left="360"/></w:pPr><w:r><w:rPr><w:color w:val="888888"/><w:sz w:val="18"/></w:rPr><w:t xml:space="preserve">${escapeXml(
        meta
      )}</w:t></w:r></w:p>`
    );
    paragraphs.push(`<w:p/>`);
  });

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${paragraphs.join('\n    ')}
    <w:sectPr/>
  </w:body>
</w:document>`;
}

function exportAsDocx(quotes) {
  const encoder = new TextEncoder();

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

  const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

  const zipBlob = createZip([
    { name: '[Content_Types].xml', data: encoder.encode(contentTypesXml) },
    { name: '_rels/.rels', data: encoder.encode(relsXml) },
    { name: 'word/document.xml', data: encoder.encode(buildDocumentXml(quotes)) },
  ]);

  downloadBlob(zipBlob, `quotes-export-${dateStamp()}.docx`);
}
