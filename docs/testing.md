# Tests

```bash
npm test            # all suites
npx jest parser     # one suite
npx jest --watch    # rerun on change
npm run typecheck   # TypeScript, including the tests
```

Tests use Jest with the `jest-expo` preset and cover the engine in `src/hl7` and the macOS platform layer. The UI is checked by hand and in a browser (see below). All test messages are fictional.

## Suites

| File | Covers | What it proves |
| --- | --- | --- |
| `__tests__/parser.test.ts` | `model.ts`, `delimiters.ts`, `escaping.ts`, `path.ts` | Text becomes the right tree. MSH-1/2 are literal and numbering continues at MSH-3. Repeated segments are numbered. Offsets point back into the source. LF endings, MLLP framing and custom delimiters work. Junk input never throws. Batches split correctly. Escape sequences decode and round-trip. Every path form parses and formats. |
| `__tests__/decoder.test.ts` | `decoder.ts`, `schema.ts`, `datetime.ts`, `readable.ts` | Message titles. Field names, types, tables and meanings. Readable names, addresses and dates. Repetitions and components. Offset-to-node lookup. "Show empty". OBX-5 typed by OBX-2. Forced versions. Z-segments. Every bundled version loads, and withdrawn fields keep their numbers. Version fallback. Shared message structures. Date formatting and rejection of bad dates. |
| `__tests__/validator.test.ts` | `validator.ts` | Each rule fires on a bad message. A valid message has no errors or warnings. Offsets point at the offending text. |
| `__tests__/summary.test.ts` | `summary.ts`, `jsonExport.ts` | Sender, patient and visit sentences. Results under their test, with abnormal ones flagged. ACK errors explained. Lines linked to their segments. JSON contents. Finally, every file in `samples/` goes through decode, validate, summary and export without throwing. |
| `__tests__/platform.macos.test.tsx` | `src/platform/index.macos.tsx` | With a stand-in for the `HL7MacBridge` native module: clipboard reads (an empty pasteboard reads as empty text) and writes, picked files and a cancelled Open panel, and a clear error if the native module is missing. |
| `__tests__/helpers.ts` | — | Shared fixtures: `ADT` (a small valid admit message), `message(type, version, ...segments)` to build one, and `sample(name)` to read `samples/`. |

## Writing a test

Build the smallest message that shows the behaviour with `message()`, and assert on paths:

```ts
import { decodeMessage, findNode, parseMessage } from '../src/hl7';
import { message } from './helpers';

it('describes the patient class', () => {
  const d = decodeMessage(parseMessage(message('ADT^A01', '2.5.1', 'PV1|1|E')));
  expect(findNode(d, 'PV1-2')?.meaning).toBe('Emergency');
});
```

For a validation rule, add one test where it fires and make sure `passes a valid message` still passes. For a new example file, drop it in `samples/` and the end-to-end test picks it up automatically.

## Checking the UI

There are no automated UI tests yet. Before merging UI changes:

1. `npm run web` and load **Samples**.
2. Tap fields in the message and check the details panel and highlight.
3. Go to `OBX[4]-5` on the lab results message and check that the Fields tab scrolls to it.
4. Open the broken message and check the Validation tab and the red dot.
5. Narrow the window below 900px (or use a phone) and repeat.

For changes to `src/` or `src/platform`, also check the macOS app (see [macos.md](macos.md)):

1. `cd macos-app && npm run bundle` to confirm the shared code still bundles for macOS.
2. `npm run macos`, load **Samples** and repeat the steps above.
3. Copy an HL7 message from another app and press **Paste**; open a file from `samples/` with **Open file**; press **Copy JSON** and paste into TextEdit.
