#!/usr/bin/env python3
"""Builds the decoder's compact schema bundles from HL7 v2.xml XSD files and HL7 table CSVs.

Usage: build_schema.py <xsd_dir> <tables_dir> <out_dir>

<xsd_dir> holds files named like '*.Xsd._2._5._1.fields.xsd' (as found in the Legacy HL7 Decoder
install resources) or a plain '<version>/fields.xsd' layout. Output: one JSON file per version (v2.5.1.json ...) plus tables.json, loaded by src/hl7/schema.ts.
"""
import csv, json, os, re, sys
import xml.etree.ElementTree as ET

XS = "{http://www.w3.org/2001/XMLSchema}"
HL7_NS = ("{urn:com.sun:encoder-hl7-1.0}", "{urn:hl7-org:v2xml}")


def find_versions(xsd_dir):
    found = {}
    for name in os.listdir(xsd_dir):
        m = re.search(r"Xsd\.((?:_\d+\.?)+)\.(fields|segments|datatypes)\.xsd$", name)
        if m:
            ver = m.group(1).replace("_", "").rstrip(".")
            found.setdefault(ver, {})[m.group(2)] = os.path.join(xsd_dir, name)
    return {v: f for v, f in found.items() if len(f) == 3}


def structure_files(xsd_dir, ver):
    tag = "Xsd._" + "._".join(ver.split(".")) + "."
    for name in os.listdir(xsd_dir):
        if tag in name:
            rest = name.split(tag, 1)[1]
            if re.fullmatch(r"[A-Z0-9]{3}(_[A-Za-z0-9]{2,3})?\.xsd", rest):
                yield rest[:-4], os.path.join(xsd_dir, name)


def annotated(root):
    """Map element-content type name -> (LongName, Type, Table)."""
    out = {}
    for ct in root.iter(XS + "complexType"):
        app = ct.find(f"{XS}annotation/{XS}appinfo")
        if app is None:
            continue
        def get(k):
            for ns in HL7_NS:
                v = app.findtext(ns + k)
                if v:
                    return v.strip()
            return ""
        long_name = get("LongName")
        if long_name.startswith("HL7") and len(long_name) > 3 and long_name[3] != " " and not long_name[3].isdigit():
            long_name = long_name[3:]  # v2.8 XSDs prefix every name with "HL7"
        ty = get("Type")
        if "." in ty:
            ty = ""  # v2.7+ datatype XSDs put the parent path here, not the component type
        out[ct.get("name")] = (long_name, ty, get("Table"))
    return out


def sequences(root):
    """Map complexType name -> list of (ref, min, max)."""
    out = {}
    for ct in root.findall(XS + "complexType"):
        seq = ct.find(XS + "sequence")
        if seq is None:
            continue
        items = []
        for el in seq.findall(XS + "element"):
            mx = el.get("maxOccurs", "1")
            items.append((el.get("ref"), int(el.get("minOccurs", "1")), -1 if mx == "unbounded" else int(mx)))
        out[ct.get("name")] = items
    return out


def table_id(t):
    return t[3:] if t.upper().startswith("HL7") else t


def place(items, ref, item):
    """Later XSDs drop withdrawn fields, so position by the ref's number and backfill the gaps."""
    m = re.search(r"\.(\d+)$", ref)
    pos = int(m.group(1)) if m else len(items) + 1
    while len(items) < pos - 1:
        items.append({"n": "Withdrawn", "t": "", "w": 1})
    if len(items) >= pos:
        items[pos - 1] = item
    else:
        items.append(item)


def build_version(files):
    fields_root = ET.parse(files["fields"]).getroot()
    seg_root = ET.parse(files["segments"]).getroot()
    dt_root = ET.parse(files["datatypes"]).getroot()

    field_info = annotated(fields_root)
    segments = {}
    for name, items in sequences(seg_root).items():
        if not name.endswith(".CONTENT"):
            continue
        seg = name[:-8]
        fields = []
        for ref, mn, mx in items:
            if not ref:
                continue
            ln, ty, tb = field_info.get(ref + ".CONTENT", ("", "", ""))
            f = {"n": ln, "t": ty}
            if tb: f["tb"] = table_id(tb)
            if mn > 0: f["r"] = 1
            if mx != 1: f["rp"] = 1
            place(fields, ref, f)
        segments[seg] = fields

    comp_info = annotated(dt_root)
    datatypes = {}
    for ct in dt_root.findall(XS + "complexType"):
        name = ct.get("name")
        seq = ct.find(XS + "sequence")
        if seq is None or "." in name:
            continue
        comps = []
        for el in seq.findall(XS + "element"):
            if not el.get("ref"):
                continue
            ln, ty, tb = comp_info.get(el.get("ref") + ".CONTENT", ("", "", ""))
            c = {"n": ln, "t": ty}
            if tb: c["tb"] = table_id(tb)
            place(comps, el.get("ref"), c)
        datatypes[name] = comps
    return segments, datatypes


def build_structures(xsd_dir, ver):
    structures = {}
    for struct, path in structure_files(xsd_dir, ver):
        seqs = sequences(ET.parse(path).getroot())
        top = struct + ".CONTENT"
        if top not in seqs:
            continue

        def expand(ctname):
            out = []
            for ref, mn, mx in seqs.get(ctname, []):
                if ref is None:
                    continue
                if ref + ".CONTENT" in seqs and "." in ref:
                    out.append({"g": ref.split(".", 1)[1], "min": mn, "max": mx, "items": expand(ref + ".CONTENT")})
                else:
                    out.append({"s": ref, "min": mn, "max": mx})
            return out
        structures[struct] = expand(top)
    return structures


def build_tables(tables_dir):
    names = {}
    idx = os.path.join(tables_dir, "index.txt")
    if os.path.exists(idx):
        for row in csv.reader(open(idx, encoding="utf-8-sig")):
            if len(row) >= 2:
                names[row[0].strip()] = row[1].strip()
    tables = {}
    for fn in sorted(os.listdir(tables_dir)):
        if not fn.endswith(".csv"):
            continue
        tid = fn[:-4]
        values = {}
        data = open(os.path.join(tables_dir, fn), "rb").read()
        try:
            text = data.decode("utf-8-sig")
        except UnicodeDecodeError:
            text = data.decode("cp1252", errors="replace")
        rows = list(csv.reader(text.splitlines()))
        for row in rows[1:]:
            if row and row[0].strip():
                values[row[0].replace("\ufffd", "").strip()] = (row[1] if len(row) > 1 else "").strip()
        tables[tid] = {"n": names.get(tid, ""), "v": values}
    for tid, n in names.items():
        tables.setdefault(tid, {"n": n, "v": {}})
    return tables


def write(path, obj):
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(obj, fh, separators=(",", ":"), ensure_ascii=False)


def vkey(v):
    return tuple(int(p) for p in v.split("."))


def fill_component_types(datatypes, earlier):
    """Later XSDs omit component datatypes; borrow them from the newest earlier version."""
    for name, comps in datatypes.items():
        for i, c in enumerate(comps):
            if c["t"]:
                continue
            for prev in earlier:
                pc = prev.get(name)
                if pc and i < len(pc) and pc[i]["t"]:
                    c["t"] = pc[i]["t"]
                    break


def main():
    xsd_dir, tables_dir, out_dir = sys.argv[1:4]
    os.makedirs(out_dir, exist_ok=True)
    earlier = []
    for ver, files in sorted(find_versions(xsd_dir).items(), key=lambda kv: vkey(kv[0])):
        segments, datatypes = build_version(files)
        fill_component_types(datatypes, earlier)
        earlier.insert(0, datatypes)
        structures = build_structures(xsd_dir, ver)
        write(os.path.join(out_dir, f"v{ver}.json"),
              {"version": ver, "segments": segments, "datatypes": datatypes, "structures": structures})
        print(f"v{ver}: {len(segments)} segments, {len(datatypes)} datatypes, {len(structures)} structures")
    tables = build_tables(tables_dir)
    write(os.path.join(out_dir, "tables.json"), tables)
    print(f"tables: {len(tables)}")


if __name__ == "__main__":
    main()
