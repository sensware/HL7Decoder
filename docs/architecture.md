# Code guide

How the app is put together, for anyone changing it.

```
App.tsx                 the screen: state, layout, toolbar, message list, tabs
src/ui/                 view components (no HL7 logic)
src/hl7/                the decoding engine (no React)
src/hl7/schema/*.json   HL7 definitions, generated
src/samples.ts          example messages shown on first launch
tools/build_schema.py   regenerates src/hl7/schema/*.json
__tests__/              Jest tests for the engine
samples/                the same example messages as files, used by tests
```

## The engine (`src/hl7`)

Each stage is a plain function, and `src/hl7/index.ts` re-exports all of them.

```
text ──splitMessages──▶ string[] ──parseMessage──▶ Message ──decodeMessage──▶ DecodedMessage
                                                     │                          │
                                                     └──summarize               ├──validate
                                                                                └──toJson
```

| File | Responsibility |
| --- | --- |
| `delimiters.ts` | Reads the five separator characters from MSH-1/MSH-2. |
| `escaping.ts` | `\F\`, `\S\`, `\X0D\`, `\.br\` … to text and back. |
| `model.ts` | **Parser.** Builds `Message → Segment → Field → Repetition → Component → SubComponent`. Every node keeps `raw` (as written), `value` (escapes decoded) and `start` (offset into the original text). Also `splitMessages`, `segmentValue` and `getValue`. |
| `path.ts` | Parses and formats paths like `OBX[2]-5.1` and reads values by path. |
| `schema.ts` | **Definitions.** `Schema.for(version)` gives segment fields, datatype components and message structures for one version. `lookupTable` reads code tables. Picks the nearest version with `resolveVersion`. |
| `segmentNames.ts` | Plain-English segment names (PID → Patient Identification). |
| `decoder.ts` | **Labelling.** Walks a parsed message with the schema and returns `DecodedNode`s with name, datatype, table, flags and a `meaning`. Also `findNode` (by path) and `nodeAt` (by text offset). |
| `datetime.ts` | Validates and formats DT/TM/DTM/TS values. |
| `readable.ts` | One-line renderings of names, addresses, phones and locations. |
| `validator.ts` | Rules that produce `ValidationIssue`s (see the user guide for the list). |
| `summary.ts` | Per-segment sentences (`SummaryLine`s) for the Summary tab. |
| `jsonExport.ts` | JSON for the JSON tab. |

### Design decisions

- **Offsets everywhere.** Tap-to-inspect works by finding the node whose `start..start+length` contains the tapped character (`nodeAt`). The raw view instead builds one pressable `<Text>` per field and passes its path directly. Either way, paths are the common currency between views.
- **Parser never throws.** Bad input still produces a tree; problems are reported by the validator. That keeps the UI usable while someone is typing.
- **MSH-1 and MSH-2 are literal.** They contain the delimiters, so they are not split. Field numbering then continues at MSH-3, as HL7 defines.
- **"varies" fields.** `OBX-5` (and `MFE-4`) take their datatype from `OBX-2` (`MFE-5`) at decode time.
- **Version borrowing.** Newer versions renamed some datatypes (TS→DTM, CE→CWE). When a datatype isn't in the chosen version, `Schema.dataType` borrows it from the nearest version that has it.
- **Lazy loading.** Each version's JSON is `require`d (so Metro bundles it) but only parsed the first time `Schema.for` asks for it.

### Schema JSON format

Written by `tools/build_schema.py`. Keys are kept short to keep the bundle small.

```jsonc
// v2.5.1.json
{
  "version": "2.5.1",
  "segments":  { "PID": [ { "n": "Patient Name", "t": "XPN", "tb": "0200", "r": 1, "rp": 1 }, ... ] },
  "datatypes": { "XPN": [ { "n": "Family Name", "t": "FN" }, ... ] },
  "structures": { "ADT_A01": [ { "s": "MSH", "min": 1, "max": 1 }, { "g": "PROCEDURE", "min": 0, "max": -1, "items": [...] } ] }
}
// n = name, t = datatype, tb = table, r = required, rp = repeating, w = withdrawn, max -1 = unbounded
// tables.json: { "0001": { "n": "Administrative Sex", "v": { "F": "Female", ... } } }
```

To regenerate the JSON, extract the HL7 Soup installer (see [reverse-engineering.md](reverse-engineering.md)), then run:

```bash
python3 tools/build_schema.py <dir with *.Xsd._2._5._1.fields.xsd etc.> <DataTables/HL7 dir> src/hl7/schema
```

## The UI (`App.tsx`, `src/ui`)

`App.tsx` owns all state:

| State | Purpose |
| --- | --- |
| `messages` | The text of each loaded message |
| `index` | Which message is open |
| `selectedPath` | The selected part; drives highlighting everywhere |
| `tab` | The active tab: `fields`, `summary`, `issues` or `json` |
| `version` | `auto`, or a forced version |
| `showEmpty` | The `includeEmpty` decode option |
| `editing` | Whether the message is shown as a text box |

Every message is decoded with `useMemo` whenever the list or the options change. That is fine for typical message sizes and lets the list show a status dot per message.

| Component | Shows |
| --- | --- |
| `RawView` | The coloured message; tapping a segment ID or field calls `onSelect(path)` |
| `NodeDetails` | The selected node and its children |
| `FieldsView` | Collapsible segments with rows; scrolls the selected segment into view on wide layouts |
| `SummaryView` | Summary lines, tappable to their segment |
| `IssuesView` | Validation issues, tappable to their path |
| `Button` | Shared button |
| `theme.ts` | Colours (including the delimiter colours) and fonts |

The layout switches at 900px window width: three columns when wider, one stacked column when narrower.

## Adding things

- **A summary sentence for another segment:** add a `case` in `summarize` (`src/hl7/summary.ts`) and a test in `__tests__/summary.test.ts`.
- **A validation rule:** add it to `validate` or one of its helpers in `src/hl7/validator.ts`, give it a severity, and add a test showing it firing and staying quiet.
- **A readable rendering for another datatype:** add a `case` in `compose` (`src/hl7/readable.ts`).
- **Another HL7 version:** add its XSDs to the generator's input, rerun it, and add a `LOADERS` entry in `schema.ts`.
