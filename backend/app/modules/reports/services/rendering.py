from html import escape


def money(value: int | float) -> str:
    return f"Rs. {int(value or 0):,}"


def table(title: str, headers: list[str], rows: list[list[object]]) -> str:
    header_style = (
        "background-color:#2f6b52;color:#ffffff;font-family:Roboto,Arial,sans-serif;"
        "font-size:13px;font-weight:bold;border:1px solid #b7c5bd;padding:9px 10px;"
        "text-align:left;white-space:nowrap;"
    )
    text_style = (
        "font-family:Roboto,Arial,sans-serif;font-size:13px;color:#1f2937;"
        "border:1px solid #d9e2dd;padding:8px 10px;text-align:left;"
    )
    number_style = (
        "font-family:Roboto,Arial,sans-serif;font-size:13px;color:#1f2937;"
        "border:1px solid #d9e2dd;padding:8px 10px;text-align:right;"
    )
    empty_style = (
        "font-family:Roboto,Arial,sans-serif;font-size:13px;color:#64748b;"
        "border:1px solid #d9e2dd;padding:12px 10px;text-align:left;"
    )
    title_style = (
        "font-family:Roboto,Arial,sans-serif;font-size:16px;font-weight:bold;"
        "color:#0f172a;background-color:#eef6f1;border:1px solid #b7c5bd;"
        "padding:10px 12px;text-align:left;"
    )

    def td(cell: object, row_index: int) -> str:
        is_total = rows[row_index][0] == "Total" if rows[row_index] else False
        base_style = (
            number_style
            if isinstance(cell, int | float) and not isinstance(cell, bool)
            else text_style
        )
        background = (
            "#e6f2ec" if is_total else "#f8faf9" if row_index % 2 else "#ffffff"
        )
        if is_total:
            base_style += "font-weight:bold;"
        return f"<td style='{base_style}background-color:{background};'>{escape(str(cell))}</td>"

    body = "".join(
        "<tr>" + "".join(td(cell, index) for cell in row) + "</tr>"
        for index, row in enumerate(rows)
    )
    if not rows:
        body = (
            f"<tr><td colspan='{len(headers)}' style='{empty_style}'>No rows</td></tr>"
        )
    return (
        "<table style='border-collapse:collapse;width:100%;margin-bottom:22px;'>"
        f"<thead><tr><th colspan='{len(headers)}' style='{title_style}'>{escape(title)}</th></tr><tr>"
        + "".join(
            f"<th style='{header_style}'>{escape(header)}</th>" for header in headers
        )
        + f"</tr></thead><tbody>{body}</tbody></table>"
    )


def xls_document(title: str, period: str, sections: list[str]) -> bytes:
    html = f"""
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          body {{ font-family: Roboto, Arial, sans-serif; color: #1f2937; font-size: 13px; }}
          h1 {{ margin: 0 0 6px; font-size: 22px; color: #0f172a; }}
          p {{ margin: 0 0 18px; color: #475569; font-size: 13px; }}
          table {{ border-collapse: collapse; width: 100%; font-size: 10px;}}
        </style>
      </head>
      <body>
        <h1 style="font-family:Roboto,Arial,sans-serif;font-size:22px;font-weight:bold;color:#0f172a;margin:0 0 6px;">{escape(title)}</h1>
        <p style="font-family:Roboto,Arial,sans-serif;font-size:13px;color:#475569;margin:0 0 18px;">{escape(period)}</p>
        {"".join(sections)}
      </body>
    </html>
    """
    return html.encode("utf-8")
