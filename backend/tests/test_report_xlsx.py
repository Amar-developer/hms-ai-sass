from io import BytesIO
from xml.etree import ElementTree as ET
from zipfile import ZipFile

from app.modules.reports.services.xlsx import Worksheet, XlsxWorkbook, formula, styled


def test_xlsx_writer_emits_typed_values_formulas_and_report_layout():
    workbook = XlsxWorkbook()
    workbook.add_sheet(
        Worksheet(
            name="Revenue",
            rows=[
                [styled("Monthly Report", "title")],
                [styled("Metric", "header"), styled("Amount", "header")],
                ["Paid", styled(1250.5, "currency")],
                [
                    styled("TOTAL", "total_text"),
                    formula("SUM(B3:B3)", 1250.5, "total_currency"),
                ],
            ],
            widths=[24, 18],
            merges=["A1:B1"],
            freeze_row=3,
            auto_filter="A2:B3",
        )
    )

    content = workbook.to_bytes()

    assert content.startswith(b"PK")
    with ZipFile(BytesIO(content)) as archive:
        assert archive.testzip() is None
        for name in archive.namelist():
            if name.endswith(".xml") or name.endswith(".rels"):
                ET.fromstring(archive.read(name))
        sheet = archive.read("xl/worksheets/sheet1.xml").decode("utf-8")
        assert "SUM(B3:B3)" in sheet
        assert ">1250.5</" in sheet
        assert 'state="frozen"' in sheet
        assert 'autoFilter ref="A2:B3"' in sheet
