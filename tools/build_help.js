#!/usr/bin/env node
/**
 * Builds the macOS app's Help › HL7 Decoder Help page from docs/user-guide.md.
 *
 *     node tools/build_help.js
 *
 * Writes macos-app/macos/HL7DecoderMac-macOS/Help/index.html and copies the guide's screenshots into
 * Help/images. The app bundles that folder and shows index.html in its help window (HelpWindow.swift).
 * __tests__/help.test.ts fails if the committed page is out of date with the guide, so rerun this after
 * editing the guide.
 *
 * The guide is converted by the small Markdown reader below rather than a library. It handles what the
 * guide uses: headings, paragraphs, bullet and numbered lists, tables, images (Markdown and <img>),
 * links, bold, italics and inline code. A few edits make it read as Mac help (see MAC_EDITS).
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const GUIDE = path.join(ROOT, 'docs/user-guide.md');
const OUT_DIR = path.join(ROOT, 'macos-app/macos/HL7DecoderMac-macOS/Help');
/** Links to other docs open in the browser at the repository on GitHub. */
const DOCS_URL = 'https://github.com/sensware/HL7Decoder/blob/main/docs/';

/** Find-and-replace edits applied to the guide's text so it reads as help inside the Mac app. */
const MAC_EDITS = [
  [/^# HL7 Decoder user guide/, '# HL7 Decoder Help'],
  // The phone layout is replaced by the narrow-window note in the Mac section.
  [/\nOn a phone the same pieces stack[^\n]*\n\n<img src="images\/phone\.png"[^\n]*\n/, '\n'],
  // The Mac section's note about the wording, and how to install, make no sense once the wording is changed
  // and the app is installed.
  [/The Mac app works the same way as the others: click wherever this guide says tap\. /, 'The Mac app works the same way as the others. '],
  [/\nTo install the Mac app, build it from the source as described in \[macos\.md\]\(macos\.md\)\.\n/, '\n'],
  [/\bTapping\b/g, 'Clicking'],
  [/\btapping\b/g, 'clicking'],
  [/\bTap\b/g, 'Click'],
  [/\btap\b/g, 'click'],
  [/press Enter/g, 'press Return'],
];

const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Turns heading text into an id for links within the page ("The tabs" → "the-tabs"). */
const slug = (s) => s.toLowerCase().replace(/<[^>]+>/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function linkUrl(url) {
  if (/^[a-z]+:/i.test(url) || url.startsWith('#')) return url;
  return url.endsWith('.md') || url.includes('.md#') ? DOCS_URL + url : url;
}

/** Inline Markdown: code spans first (their contents are literal), then images, links, bold and italics. */
function inline(text) {
  const codes = [];
  let s = text.replace(/`([^`]+)`/g, (_, code) => {
    codes.push(`<code>${escapeHtml(code)}</code>`);
    return `\u0000${codes.length - 1}\u0000`;
  });
  // Raw <img> tags are kept as written; everything else is escaped.
  const tags = [];
  s = s.replace(/<img [^>]*>/g, (tag) => {
    tags.push(tag);
    return `\u0001${tags.length - 1}\u0001`;
  });
  s = escapeHtml(s)
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, src) => `<img src="${src}" alt="${alt}">`)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) => `<a href="${escapeHtml(linkUrl(url))}">${label}</a>`)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*([^*]+)\*(?!\w)/g, '$1<em>$2</em>');
  return s
    .replace(/\u0001(\d+)\u0001/g, (_, i) => tags[Number(i)])
    .replace(/\u0000(\d+)\u0000/g, (_, i) => codes[Number(i)]);
}

/** Splits a table row on unescaped pipes; `\|` stays as a literal pipe. */
function cells(line) {
  return line.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map((c) => inline(c.trim().replace(/\\\|/g, '|')));
}

/** Converts the guide's Markdown to HTML body content. Returns the HTML and its second-level headings. */
function markdownToHtml(markdown) {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  const sections = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const heading = line.match(/^(#{1,6}) (.*)$/);
    if (!line.trim()) {
      i++;
    } else if (heading) {
      const level = heading[1].length;
      const html = inline(heading[2]);
      const id = slug(heading[2]);
      if (level === 2) sections.push({ id, title: heading[2] });
      out.push(`<h${level} id="${id}">${html}</h${level}>`);
      i++;
    } else if (/^\|/.test(line)) {
      const rows = [];
      while (i < lines.length && /^\|/.test(lines[i])) rows.push(lines[i++]);
      const [head, , ...body] = rows; // the second row is the --- separator
      out.push('<table>');
      out.push(`<thead><tr>${cells(head).map((c) => `<th>${c}</th>`).join('')}</tr></thead>`);
      out.push(`<tbody>${body.map((r) => `<tr>${cells(r).map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody>`);
      out.push('</table>');
    } else if (/^(\d+\.|[-*]) /.test(line)) {
      const ordered = /^\d+\./.test(line);
      const items = [];
      while (i < lines.length && /^(\d+\.|[-*]) /.test(lines[i])) items.push(lines[i++].replace(/^(\d+\.|[-*]) /, ''));
      const tag = ordered ? 'ol' : 'ul';
      out.push(`<${tag}>${items.map((it) => `<li>${inline(it)}</li>`).join('')}</${tag}>`);
    } else {
      const para = [];
      while (i < lines.length && lines[i].trim() && !/^(#{1,6} |\||(\d+\.|[-*]) )/.test(lines[i])) para.push(lines[i++]);
      const html = inline(para.join(' '));
      // An image on its own line is a figure, not a paragraph.
      out.push(/^<img [^>]*>$/.test(html) ? `<figure>${html}</figure>` : `<p>${html}</p>`);
    }
  }
  return { html: out.join('\n'), sections };
}

/** The guide's Markdown with MAC_EDITS applied. */
const macText = (markdown) => MAC_EDITS.reduce((s, [find, replace]) => s.replace(find, replace), markdown);

/** The complete help page for the given guide text. */
function renderHelp(markdown) {
  const { html, sections } = markdownToHtml(macText(markdown));
  const toc = sections.map((s) => `<a href="#${s.id}">${inline(s.title)}</a>`).join('\n');
  // The first heading is the page title; the contents bar goes straight after it.
  const body = html.replace(/(<h1 [^>]*>.*?<\/h1>)/, `$1\n<nav>\n${toc}\n</nav>`);
  return `<!doctype html>
<!-- Generated from docs/user-guide.md by tools/build_help.js. Edit the guide, not this file. -->
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="color-scheme" content="light dark">
<title>HL7 Decoder Help</title>
<style>
:root { --text: #0F172A; --muted: #64748B; --line: #E2E8F0; --panel: #F8FAFC; --bg: #FFFFFF; --accent: #0F766E; --accent-soft: #CCFBF1; }
@media (prefers-color-scheme: dark) {
  :root { --text: #E2E8F0; --muted: #94A3B8; --line: #334155; --panel: #1E293B; --bg: #0F172A; --accent: #2DD4BF; --accent-soft: #134E4A; }
}
body { font: 14px/1.55 -apple-system, BlinkMacSystemFont, sans-serif; color: var(--text); background: var(--bg); margin: 0; }
main { max-width: 760px; margin: 0 auto; padding: 24px 32px 48px; }
h1 { font-size: 26px; margin: 8px 0 12px; }
h2 { font-size: 20px; margin: 32px 0 8px; padding-top: 8px; border-top: 1px solid var(--line); }
h3 { font-size: 16px; margin: 24px 0 6px; }
nav { display: flex; flex-wrap: wrap; gap: 6px; margin: 0 0 20px; }
nav a { font-size: 12px; padding: 3px 10px; border-radius: 12px; background: var(--accent-soft); color: var(--accent); text-decoration: none; }
a { color: var(--accent); }
code { font: 12.5px Menlo, monospace; background: var(--panel); border: 1px solid var(--line); border-radius: 4px; padding: 0 4px; }
table { border-collapse: collapse; width: 100%; margin: 10px 0 16px; }
th, td { text-align: left; vertical-align: top; padding: 6px 10px; border-bottom: 1px solid var(--line); }
th { font-size: 12px; text-transform: uppercase; letter-spacing: 0.4px; color: var(--muted); }
img { max-width: 100%; height: auto; border: 1px solid var(--line); border-radius: 8px; }
figure { margin: 12px 0 20px; }
li { margin: 3px 0; }
</style>
</head>
<body>
<main>
${body}
</main>
</body>
</html>
`;
}

/** The screenshots the help page shows, as paths relative to docs/. */
function imagesIn(markdown) {
  return [...new Set([...macText(markdown).matchAll(/(?:\]\(|src=")(images\/[^)"]+)/g)].map((m) => m[1]))];
}

function main() {
  const markdown = fs.readFileSync(GUIDE, 'utf8');
  // Start from an empty images folder so screenshots the guide no longer uses are not bundled.
  fs.rmSync(path.join(OUT_DIR, 'images'), { recursive: true, force: true });
  fs.mkdirSync(path.join(OUT_DIR, 'images'), { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, 'index.html'), renderHelp(markdown));
  const images = imagesIn(markdown);
  for (const img of images) fs.copyFileSync(path.join(ROOT, 'docs', img), path.join(OUT_DIR, img));
  console.log(`Wrote ${path.relative(ROOT, OUT_DIR)}/index.html and ${images.length} images`);
}

module.exports = { renderHelp, imagesIn, GUIDE, OUT_DIR };

if (require.main === module) main();
