# HL7 Decoder

A React Native (Expo) app for reading HL7 v2 messages. Paste or open a message and it shows every segment, field, component and subcomponent with its name, datatype and meaning, a plain-English summary, and validation against the HL7 definitions for the message's version.

![HL7 Decoder on web](docs/images/overview.png)

It runs on iOS, Android, the web and macOS from one codebase. The macOS app is a native app built with React Native for macOS. Its behaviour is modelled on HL7 Soup's message editor.

## Documentation

- [User guide](docs/user-guide.md): how to use the app
- [Code guide](docs/architecture.md): how the engine and UI fit together, and how to extend them
- [Tests](docs/testing.md): what each test suite covers and how to add tests
- [macOS app](docs/macos.md): building and running the native macOS app
- [Reverse engineering notes](docs/reverse-engineering.md): what was learned from HL7 Soup

## Features

- **Tap to inspect.** The raw message is coloured by delimiter. Tap a segment ID or field to see its path (`PID-5`), name, type, value, table meaning and components.
- **Fields view.** Collapsible segments listing every field, repetition, component and subcomponent with names and meanings (dates formatted, coded values looked up in 534 HL7 tables, names and addresses rendered readably). "Show empty" also lists defined fields that have no value.
- **Summary.** The message in sentences: who sent it, the patient, visit, orders, results (abnormal flags highlighted), allergies, diagnoses, appointments, insurance, ACK errors.
- **Validation.** Missing required fields and segments, segments not in the message structure, malformed numbers/dates/times, non-repeating fields that repeat, unknown segments, and codes missing from HL7 tables.
- **Paths.** Go to any path: `PID-5.1`, `OBX[2]-5`, `PID-3[2].4.1`, `MSH.9.2`.
- **Many messages.** Paste or open files with several messages (including batch `FHS`/`BHS` wrappers and MLLP framing); the list shows which ones have problems.
- **Versions.** Definitions for v2.1, 2.2, 2.3, 2.3.1, 2.4, 2.5, 2.5.1, 2.7.1, 2.8, 2.8.2 and 2.9, picked from MSH-12 (2.6 falls back to 2.5.1) or forced from the version menu.
- **JSON export** of the decoded tree.

## Running it

```bash
npm install
npm run web        # browser
npm run ios        # iOS simulator / Expo Go
npm run android    # Android emulator / Expo Go
npm test           # engine and platform tests (67)
npm run typecheck
```

The macOS app needs Xcode and CocoaPods and is built from its own folder:

```bash
cd macos-app
npm install
npm run pods
npm run macos
```

See [docs/macos.md](docs/macos.md) for details.

## Layout

| Path | What it is |
| --- | --- |
| `App.tsx` | Expo entry: wraps the screen in the safe-area provider and status bar |
| `src/Decoder.tsx` | The screen: message list, raw view, details, tabs (shared by every platform) |
| `src/platform/` | Clipboard, file picking and the screen wrapper, with a `.macos.tsx` version for macOS |
| `macos-app/` | Native macOS host (react-native-macos) with its Xcode project |
| `src/ui/` | View components |
| `src/hl7/` | The decoding engine (no React dependency): parser, paths, schema, decoder, validator, summary, JSON export |
| `src/hl7/schema/*.json` | HL7 definitions per version, plus `tables.json` |
| `tools/build_schema.py` | Regenerates the JSON from HL7 v2.xml XSDs and table CSVs |
| `samples/` | Fictional test messages |

Using the engine on its own:

```ts
import { parseMessage, decodeMessage, findNode, validate, summaryText } from './src/hl7';

const msg = parseMessage(text);
const decoded = decodeMessage(msg);              // or { version: '2.4', includeEmpty: true }
findNode(decoded, 'PID-8');                       // { name: 'Administrative Sex', value: 'M', meaning: 'Male', ... }
validate(decoded);                                // [{ severity: 'error', path: 'PID-3', message: ... }]
summaryText(msg);                                 // "ADT message: Admit/visit notification ..."
```

## Data sources

Segment, field, datatype and message-structure definitions come from HL7 International's v2.xml XML schemas (© Health Level Seven International), and code-table values from HL7 v2 tables. Both were taken from the HL7 Soup installer's resources by `tools/build_schema.py`. Check HL7's licence terms before redistributing the app outside your organisation.
