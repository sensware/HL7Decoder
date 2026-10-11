# What we learned from HL7 Soup

The reference app was the `HL7 Soup 4.0` installer (`hl7 soup.msi`, Popokey Limited, built with WiX 5).

## How it was taken apart

1. `msiextract` unpacked the MSI: `Program Files/Popokey/HL7 Soup/` (the app), `Simple Code Editor Soup/`, and `DataTables/` (CSV code tables and fake-patient data used by its message generator).
2. The main binaries are .NET Framework 4.8 WPF assemblies: `HL7Soup.exe` (UI, 323 types) and `HL7SoupWorkflow.dll` (engine, 318 types). They were listed and decompiled with ILSpy (`ilspycmd`) to study structure and behaviour only; no HL7 Soup code is copied into this app.
3. `HL7SoupWorkflow.dll` embeds its HL7 definitions as resources: HL7's own v2.xml XSDs (`fields.xsd`, `segments.xsd`, `datatypes.xsd`, and one file per message structure) for v2.1 to v2.9.

## Architecture worth copying

- **Message → Segment → Field → (repeat) → Component → SubComponent** tree, each node remembering its offset in the text so the editor caret maps to a path and back (`BasePart`, `PathSplitter`, `SetCurrentLocation`). This app does the same (`src/hl7/model.ts`, `nodeAt`).
- **Paths** like `PID-5.1` and `OBX[2]-5` address any part of a message, used for navigation, highlighting and transforms.
- **Description manager** loads the XSDs for the version in MSH-12 and labels every part with its long name, datatype and table. `OBX-5` takes its datatype from `OBX-2`.
- **Code tables** (`DataTables/HL7/*.csv`, `index.txt`) turn coded values into descriptions; there are UK-specific variants too.
- **Message "story"** (`StoryBuilder`) summarises PID, PV1, SCH, ORC, OBR, AIS/AIL/AIP/AIG, ROL, IN1 and similar segments in plain English. Our `summary.ts` covers the same ground with its own wording.
- **Highlighters and validation** mark invalid messages in the message list and editor.
- UI: message list on the left, syntax-coloured editor (AvalonEdit) in the centre, and a grid of the current segment's fields with names, values and descriptions underneath, plus "Hide empty", "Copy path" and "Get statistics".

## Quirks found in the definition data (handled in `tools/build_schema.py`)

- v2.7.1+ XSDs omit withdrawn fields from segment sequences (PID-2 is missing in v2.8), so fields are placed by the number in their reference, with "Withdrawn" placeholders, rather than by position.
- v2.7.1+ datatype XSDs record the parent type instead of each component's datatype; component types are borrowed from the newest earlier version.
- v2.8 prefixes every field name with "HL7" ("HL7Patient Name"); the prefix is stripped.
- A few table CSVs were saved with a broken encoding (`<` and `>` in table 0078 became `<�`); replacement characters are removed.

## Deliberately left out

HL7 Soup is also an integration engine (MLLP/HTTP/database senders and receivers, workflows, transformers, anonymiser, message generator, AI assistant, Mirth conversion). This app is the decoder part only.
