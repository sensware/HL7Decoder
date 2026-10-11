/**
 * The macOS app's Help › HL7 Decoder Help page (tools/build_help.js): it must match the user guide,
 * bundle exactly the screenshots it shows, and read as Mac help.
 */
import * as fs from 'fs';
import * as path from 'path';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { renderHelp, imagesIn, GUIDE, OUT_DIR } = require('../tools/build_help.js') as {
  renderHelp: (markdown: string) => string; imagesIn: (markdown: string) => string[]; GUIDE: string; OUT_DIR: string;
};

const guide = fs.readFileSync(GUIDE, 'utf8');
const page = fs.readFileSync(path.join(OUT_DIR, 'index.html'), 'utf8');

describe('help page', () => {
  it('is up to date with docs/user-guide.md (run `node tools/build_help.js` if this fails)', () => {
    expect(page).toBe(renderHelp(guide));
  });

  it('bundles exactly the screenshots it shows', () => {
    const shown = imagesIn(guide).map((p) => path.basename(p)).sort();
    expect(shown.length).toBeGreaterThan(0);
    expect(fs.readdirSync(path.join(OUT_DIR, 'images')).sort()).toEqual(shown);
    for (const src of page.matchAll(/<img src="([^"]+)"/g)) expect(fs.existsSync(path.join(OUT_DIR, src[1]))).toBe(true);
  });

  it('reads as Mac help', () => {
    const text = page.replace(/<[^>]+>/g, ' ');
    expect(page).toContain('<title>HL7 Decoder Help</title>');
    expect(page).toContain('<h1 id="hl7-decoder-help">HL7 Decoder Help</h1>');
    expect(text).not.toMatch(/\btap(s|ping)?\b/i);
    expect(text).toContain('Click any field');
    expect(text).not.toContain('build it from the source');
    expect(page).not.toContain('images/phone.png');
  });

  it('has a contents bar linking to every section', () => {
    for (const title of ['Getting messages in', 'Reading a message', 'The tabs', 'HL7 versions', 'Editing', 'Tips']) {
      const id = title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      expect(page).toContain(`<a href="#${id}">${title}</a>`);
      expect(page).toContain(`<h2 id="${id}">`);
    }
  });
});

describe('Markdown reader', () => {
  it('renders tables, keeping escaped pipes and code literal', () => {
    const html = renderHelp('| Colour | Character |\n| --- | --- |\n| Blue | `\\|` |\n| Teal | `<b>` & **bold** |');
    expect(html).toContain('<th>Colour</th><th>Character</th>');
    expect(html).toContain('<td>Blue</td><td><code>|</code></td>');
    expect(html).toContain('<td>Teal</td><td><code>&lt;b&gt;</code> &amp; <strong>bold</strong></td>');
  });

  it('renders lists, emphasis, images and links', () => {
    const html = renderHelp('1. **One**\n2. Two\n\n- *it* here\n\n![Alt](images/x.png)\n\nSee [docs](architecture.md) or [web](https://example.com).');
    expect(html).toContain('<ol><li><strong>One</strong></li><li>Two</li></ol>');
    expect(html).toContain('<ul><li><em>it</em> here</li></ul>');
    expect(html).toContain('<figure><img src="images/x.png" alt="Alt"></figure>');
    expect(html).toContain('<a href="https://github.com/sensware/HL7Decoder/blob/main/docs/architecture.md">docs</a>');
    expect(html).toContain('<a href="https://example.com">web</a>');
  });
});
