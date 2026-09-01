"""Small dependency-free OOXML writer for generated financial reports.

The application only needs a constrained, deterministic XLSX surface: typed
cells, formulas with cached values, styles, merged title rows, filters, frozen
headers, print settings, and multiple worksheets. Keeping this writer narrow
avoids shipping HTML under an Excel extension and avoids a large runtime
dependency in the report worker.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime
from io import BytesIO
from typing import Any
from xml.etree import ElementTree as ET
from zipfile import ZIP_DEFLATED, ZipFile


MAIN_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PKG_REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships"
CONTENT_NS = "http://schemas.openxmlformats.org/package/2006/content-types"
XML_NS = "http://www.w3.org/XML/1998/namespace"

ET.register_namespace("", MAIN_NS)
ET.register_namespace("r", REL_NS)


@dataclass(frozen=True)
class Formula:
    expression: str
    cached_value: int | float = 0
    style: str = "currency"


@dataclass(frozen=True)
class Cell:
    value: Any = None
    style: str = "text"


@dataclass
class Worksheet:
    name: str
    rows: list[list[Any]]
    widths: list[float]
    merges: list[str] = field(default_factory=list)
    freeze_row: int | None = None
    auto_filter: str | None = None
    landscape: bool = True


STYLE_IDS = {
    "text": 0,
    "title": 1,
    "subtitle": 2,
    "section": 3,
    "header": 4,
    "integer": 5,
    "currency": 6,
    "percent": 7,
    "date": 8,
    "total_text": 9,
    "total_integer": 10,
    "total_currency": 11,
    "total_percent": 12,
    "pass": 13,
    "fail": 14,
    "note": 15,
    "kpi_label": 16,
    "kpi_currency": 17,
    "kpi_integer": 18,
}


def column_name(index: int) -> str:
    value = index
    letters = ""
    while value:
        value, remainder = divmod(value - 1, 26)
        letters = chr(65 + remainder) + letters
    return letters


def cell_reference(row: int, column: int) -> str:
    return f"{column_name(column)}{row}"


def excel_date(value: date | datetime) -> float:
    day = value.date() if isinstance(value, datetime) else value
    serial = float((day - date(1899, 12, 30)).days)
    if isinstance(value, datetime):
        serial += (value.hour * 3600 + value.minute * 60 + value.second) / 86400
    return serial


def formula(expression: str, cached_value: int | float, style: str) -> Formula:
    return Formula(expression.removeprefix("="), cached_value, style)


def styled(value: Any, style: str) -> Cell:
    return Cell(value=value, style=style)


class XlsxWorkbook:
    def __init__(self) -> None:
        self.sheets: list[Worksheet] = []

    def add_sheet(self, sheet: Worksheet) -> None:
        if not sheet.name or len(sheet.name) > 31:
            raise ValueError("Worksheet names must contain 1 to 31 characters")
        if any(existing.name == sheet.name for existing in self.sheets):
            raise ValueError(f"Duplicate worksheet name: {sheet.name}")
        self.sheets.append(sheet)

    def to_bytes(self) -> bytes:
        if not self.sheets:
            raise ValueError("Workbook requires at least one worksheet")
        output = BytesIO()
        with ZipFile(output, "w", ZIP_DEFLATED) as archive:
            archive.writestr("[Content_Types].xml", _content_types(len(self.sheets)))
            archive.writestr("_rels/.rels", _package_relationships())
            archive.writestr("docProps/core.xml", _core_properties())
            archive.writestr("docProps/app.xml", _app_properties(self.sheets))
            archive.writestr("xl/workbook.xml", _workbook_xml(self.sheets))
            archive.writestr(
                "xl/_rels/workbook.xml.rels", _workbook_relationships(self.sheets)
            )
            archive.writestr("xl/styles.xml", _styles_xml())
            for index, sheet in enumerate(self.sheets, start=1):
                archive.writestr(
                    f"xl/worksheets/sheet{index}.xml", _worksheet_xml(sheet)
                )
        return output.getvalue()


def _xml(element: ET.Element) -> bytes:
    return ET.tostring(element, encoding="utf-8", xml_declaration=True)


def _content_types(sheet_count: int) -> bytes:
    root = ET.Element(f"{{{CONTENT_NS}}}Types")
    ET.SubElement(
        root,
        f"{{{CONTENT_NS}}}Default",
        Extension="rels",
        ContentType="application/vnd.openxmlformats-package.relationships+xml",
    )
    ET.SubElement(
        root,
        f"{{{CONTENT_NS}}}Default",
        Extension="xml",
        ContentType="application/xml",
    )
    for part, content_type in (
        (
            "/xl/workbook.xml",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml",
        ),
        (
            "/xl/styles.xml",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml",
        ),
        (
            "/docProps/core.xml",
            "application/vnd.openxmlformats-package.core-properties+xml",
        ),
        (
            "/docProps/app.xml",
            "application/vnd.openxmlformats-officedocument.extended-properties+xml",
        ),
    ):
        ET.SubElement(
            root,
            f"{{{CONTENT_NS}}}Override",
            PartName=part,
            ContentType=content_type,
        )
    for index in range(1, sheet_count + 1):
        ET.SubElement(
            root,
            f"{{{CONTENT_NS}}}Override",
            PartName=f"/xl/worksheets/sheet{index}.xml",
            ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml",
        )
    return _xml(root)


def _package_relationships() -> bytes:
    root = ET.Element(f"{{{PKG_REL_NS}}}Relationships")
    for identifier, relationship_type, target in (
        (
            "rId1",
            "http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument",
            "xl/workbook.xml",
        ),
        (
            "rId2",
            "http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties",
            "docProps/core.xml",
        ),
        (
            "rId3",
            "http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties",
            "docProps/app.xml",
        ),
    ):
        ET.SubElement(
            root,
            f"{{{PKG_REL_NS}}}Relationship",
            Id=identifier,
            Type=relationship_type,
            Target=target,
        )
    return _xml(root)


def _core_properties() -> bytes:
    cp = "http://schemas.openxmlformats.org/package/2006/metadata/core-properties"
    dc = "http://purl.org/dc/elements/1.1/"
    dcterms = "http://purl.org/dc/terms/"
    xsi = "http://www.w3.org/2001/XMLSchema-instance"
    ET.register_namespace("cp", cp)
    ET.register_namespace("dc", dc)
    ET.register_namespace("dcterms", dcterms)
    ET.register_namespace("xsi", xsi)
    root = ET.Element(f"{{{cp}}}coreProperties")
    ET.SubElement(root, f"{{{dc}}}creator").text = "MedizinHub HMS"
    ET.SubElement(root, f"{{{cp}}}lastModifiedBy").text = "MedizinHub HMS"
    created = ET.SubElement(
        root, f"{{{dcterms}}}created", {f"{{{xsi}}}type": "dcterms:W3CDTF"}
    )
    created.text = datetime.utcnow().replace(microsecond=0).isoformat() + "Z"
    return _xml(root)


def _app_properties(sheets: list[Worksheet]) -> bytes:
    ns = "http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"
    vt = "http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"
    ET.register_namespace("", ns)
    ET.register_namespace("vt", vt)
    root = ET.Element(f"{{{ns}}}Properties")
    ET.SubElement(root, f"{{{ns}}}Application").text = "MedizinHub HMS"
    ET.SubElement(root, f"{{{ns}}}AppVersion").text = "1.0"
    titles = ET.SubElement(root, f"{{{ns}}}TitlesOfParts")
    vector = ET.SubElement(
        titles,
        f"{{{vt}}}vector",
        size=str(len(sheets)),
        baseType="lpstr",
    )
    for sheet in sheets:
        ET.SubElement(vector, f"{{{vt}}}lpstr").text = sheet.name
    return _xml(root)


def _workbook_xml(sheets: list[Worksheet]) -> bytes:
    root = ET.Element(f"{{{MAIN_NS}}}workbook")
    views = ET.SubElement(root, f"{{{MAIN_NS}}}bookViews")
    ET.SubElement(views, f"{{{MAIN_NS}}}workbookView", activeTab="0")
    rows = ET.SubElement(root, f"{{{MAIN_NS}}}sheets")
    for index, sheet in enumerate(sheets, start=1):
        ET.SubElement(
            rows,
            f"{{{MAIN_NS}}}sheet",
            name=sheet.name,
            sheetId=str(index),
            attrib={f"{{{REL_NS}}}id": f"rId{index}"},
        )
    ET.SubElement(
        root,
        f"{{{MAIN_NS}}}calcPr",
        calcId="191029",
        fullCalcOnLoad="1",
        forceFullCalc="1",
    )
    return _xml(root)


def _workbook_relationships(sheets: list[Worksheet]) -> bytes:
    root = ET.Element(f"{{{PKG_REL_NS}}}Relationships")
    for index, _sheet in enumerate(sheets, start=1):
        ET.SubElement(
            root,
            f"{{{PKG_REL_NS}}}Relationship",
            Id=f"rId{index}",
            Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet",
            Target=f"worksheets/sheet{index}.xml",
        )
    ET.SubElement(
        root,
        f"{{{PKG_REL_NS}}}Relationship",
        Id=f"rId{len(sheets) + 1}",
        Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles",
        Target="styles.xml",
    )
    return _xml(root)


def _styles_xml() -> bytes:
    root = ET.Element(f"{{{MAIN_NS}}}styleSheet")
    num_formats = ET.SubElement(root, f"{{{MAIN_NS}}}numFmts", count="4")
    for identifier, code in (
        (164, '"₹"#,##0;[Red]("₹"#,##0);-'),
        (165, "0.0%"),
        (166, "yyyy-mm-dd"),
        (167, "#,##0"),
    ):
        ET.SubElement(
            num_formats,
            f"{{{MAIN_NS}}}numFmt",
            numFmtId=str(identifier),
            formatCode=code,
        )

    fonts = ET.SubElement(root, f"{{{MAIN_NS}}}fonts", count="7")
    for size, bold, color in (
        (10, False, "FF1F2937"),
        (20, True, "FFFFFFFF"),
        (11, True, "FFFFFFFF"),
        (12, True, "FF0F5132"),
        (10, True, "FF0F172A"),
        (10, True, "FF166534"),
        (10, True, "FF991B1B"),
    ):
        font = ET.SubElement(fonts, f"{{{MAIN_NS}}}font")
        if bold:
            ET.SubElement(font, f"{{{MAIN_NS}}}b")
        ET.SubElement(font, f"{{{MAIN_NS}}}sz", val=str(size))
        ET.SubElement(font, f"{{{MAIN_NS}}}color", rgb=color)
        ET.SubElement(font, f"{{{MAIN_NS}}}name", val="Aptos")

    fills = ET.SubElement(root, f"{{{MAIN_NS}}}fills", count="8")
    for pattern, color in (
        ("none", None),
        ("gray125", None),
        ("solid", "FF0F6B50"),
        ("solid", "FF15866B"),
        ("solid", "FFE8F5EF"),
        ("solid", "FFF1F5F9"),
        ("solid", "FFFEE2E2"),
        ("solid", "FFDCFCE7"),
    ):
        fill = ET.SubElement(fills, f"{{{MAIN_NS}}}fill")
        pattern_fill = ET.SubElement(
            fill, f"{{{MAIN_NS}}}patternFill", patternType=pattern
        )
        if color:
            ET.SubElement(pattern_fill, f"{{{MAIN_NS}}}fgColor", rgb=color)
            ET.SubElement(pattern_fill, f"{{{MAIN_NS}}}bgColor", indexed="64")

    borders = ET.SubElement(root, f"{{{MAIN_NS}}}borders", count="3")
    for style in (None, "thin", "medium"):
        border = ET.SubElement(borders, f"{{{MAIN_NS}}}border")
        for edge in ("left", "right", "top", "bottom"):
            node = ET.SubElement(
                border, f"{{{MAIN_NS}}}{edge}", **({"style": style} if style else {})
            )
            if style:
                ET.SubElement(node, f"{{{MAIN_NS}}}color", rgb="FFD6E2DC")
        ET.SubElement(border, f"{{{MAIN_NS}}}diagonal")

    cell_style_xfs = ET.SubElement(root, f"{{{MAIN_NS}}}cellStyleXfs", count="1")
    ET.SubElement(
        cell_style_xfs,
        f"{{{MAIN_NS}}}xf",
        numFmtId="0",
        fontId="0",
        fillId="0",
        borderId="0",
    )
    cell_xfs = ET.SubElement(root, f"{{{MAIN_NS}}}cellXfs", count="19")
    specs = (
        (0, 0, 0, 0, "left"),
        (1, 2, 0, 0, "left"),
        (0, 0, 0, 0, "left"),
        (3, 4, 0, 0, "left"),
        (2, 3, 1, 0, "center"),
        (0, 0, 1, 167, "right"),
        (0, 0, 1, 164, "right"),
        (0, 0, 1, 165, "right"),
        (0, 0, 1, 166, "center"),
        (4, 4, 2, 0, "left"),
        (4, 4, 2, 167, "right"),
        (4, 4, 2, 164, "right"),
        (4, 4, 2, 165, "right"),
        (5, 7, 1, 0, "center"),
        (6, 6, 1, 0, "center"),
        (0, 5, 0, 0, "left"),
        (4, 4, 1, 0, "left"),
        (4, 4, 1, 164, "right"),
        (4, 4, 1, 167, "right"),
    )
    for font_id, fill_id, border_id, num_fmt_id, alignment in specs:
        xf = ET.SubElement(
            cell_xfs,
            f"{{{MAIN_NS}}}xf",
            numFmtId=str(num_fmt_id),
            fontId=str(font_id),
            fillId=str(fill_id),
            borderId=str(border_id),
            xfId="0",
            applyAlignment="1",
            applyNumberFormat="1" if num_fmt_id else "0",
        )
        ET.SubElement(
            xf,
            f"{{{MAIN_NS}}}alignment",
            horizontal=alignment,
            vertical="center",
            wrapText="1",
        )
    cell_styles = ET.SubElement(root, f"{{{MAIN_NS}}}cellStyles", count="1")
    ET.SubElement(
        cell_styles, f"{{{MAIN_NS}}}cellStyle", name="Normal", xfId="0", builtinId="0"
    )
    return _xml(root)


def _worksheet_xml(sheet: Worksheet) -> bytes:
    root = ET.Element(f"{{{MAIN_NS}}}worksheet")
    max_columns = max((len(row) for row in sheet.rows), default=1)
    max_rows = max(len(sheet.rows), 1)
    ET.SubElement(
        root,
        f"{{{MAIN_NS}}}dimension",
        ref=f"A1:{cell_reference(max_rows, max_columns)}",
    )
    views = ET.SubElement(root, f"{{{MAIN_NS}}}sheetViews")
    view = ET.SubElement(
        views, f"{{{MAIN_NS}}}sheetView", workbookViewId="0", showGridLines="0"
    )
    if sheet.freeze_row and sheet.freeze_row > 1:
        ET.SubElement(
            view,
            f"{{{MAIN_NS}}}pane",
            ySplit=str(sheet.freeze_row - 1),
            topLeftCell=f"A{sheet.freeze_row}",
            activePane="bottomLeft",
            state="frozen",
        )
    ET.SubElement(root, f"{{{MAIN_NS}}}sheetFormatPr", defaultRowHeight="18")
    columns = ET.SubElement(root, f"{{{MAIN_NS}}}cols")
    for index, width in enumerate(sheet.widths, start=1):
        ET.SubElement(
            columns,
            f"{{{MAIN_NS}}}col",
            min=str(index),
            max=str(index),
            width=str(min(max(width, 8), 42)),
            customWidth="1",
        )
    data = ET.SubElement(root, f"{{{MAIN_NS}}}sheetData")
    for row_index, row in enumerate(sheet.rows, start=1):
        row_node = ET.SubElement(data, f"{{{MAIN_NS}}}row", r=str(row_index))
        if row_index == 1:
            row_node.set("ht", "30")
            row_node.set("customHeight", "1")
        for column_index, raw in enumerate(row, start=1):
            _write_cell(row_node, raw, row_index, column_index)
    if sheet.auto_filter:
        ET.SubElement(root, f"{{{MAIN_NS}}}autoFilter", ref=sheet.auto_filter)
    if sheet.merges:
        merges = ET.SubElement(
            root, f"{{{MAIN_NS}}}mergeCells", count=str(len(sheet.merges))
        )
        for reference in sheet.merges:
            ET.SubElement(merges, f"{{{MAIN_NS}}}mergeCell", ref=reference)
    ET.SubElement(
        root,
        f"{{{MAIN_NS}}}pageMargins",
        left="0.25",
        right="0.25",
        top="0.5",
        bottom="0.5",
        header="0.2",
        footer="0.2",
    )
    ET.SubElement(
        root,
        f"{{{MAIN_NS}}}pageSetup",
        orientation="landscape" if sheet.landscape else "portrait",
        fitToWidth="1",
        fitToHeight="0",
        paperSize="9",
    )
    return _xml(root)


def _write_cell(parent: ET.Element, raw: Any, row: int, column: int) -> None:
    style_name = "text"
    value = raw
    if isinstance(raw, Cell):
        style_name = raw.style
        value = raw.value
    elif isinstance(raw, Formula):
        style_name = raw.style
    if value is None:
        return
    node = ET.SubElement(
        parent,
        f"{{{MAIN_NS}}}c",
        r=cell_reference(row, column),
        s=str(STYLE_IDS.get(style_name, 0)),
    )
    if isinstance(raw, Formula):
        ET.SubElement(node, f"{{{MAIN_NS}}}f").text = raw.expression
        ET.SubElement(node, f"{{{MAIN_NS}}}v").text = str(raw.cached_value)
        return
    if isinstance(value, bool):
        node.set("t", "b")
        ET.SubElement(node, f"{{{MAIN_NS}}}v").text = "1" if value else "0"
    elif isinstance(value, date):
        ET.SubElement(node, f"{{{MAIN_NS}}}v").text = str(excel_date(value))
    elif isinstance(value, int | float):
        ET.SubElement(node, f"{{{MAIN_NS}}}v").text = str(value)
    else:
        node.set("t", "inlineStr")
        inline = ET.SubElement(node, f"{{{MAIN_NS}}}is")
        text = ET.SubElement(inline, f"{{{MAIN_NS}}}t")
        text.set(f"{{{XML_NS}}}space", "preserve")
        text.text = str(value)
