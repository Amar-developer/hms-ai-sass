from app.modules.pharmacy.dosing import (
    daily_administration_quantity,
    duration_days,
    prescription_quantity,
)


def test_prescription_quantity_uses_countable_dose_frequency_and_duration():
    assert prescription_quantity("1 tab", "1-0-1", "3 days") == 6
    assert prescription_quantity("2 tablets", "BD", "5 days") == 20
    assert prescription_quantity("1 capsule", "TDS", "1 week") == 21
    assert prescription_quantity("1/2 tab", "QID", "2 days") == 4


def test_prescription_quantity_does_not_treat_strength_as_quantity():
    assert prescription_quantity("500mg", "1-0-1", "3 days") == 6
    assert prescription_quantity("1g", "once daily", "1 week") == 7


def test_frequency_and_duration_free_text_variants():
    assert prescription_quantity(None, "q8h", "2 days") == 6
    assert prescription_quantity(None, "3 times a day", "2 weeks") == 42
    assert duration_days("1 month") == 30


def test_ip_daily_administration_quantity_uses_only_todays_frequency():
    assert daily_administration_quantity("1 tab", "1-0-1") == 2
    assert daily_administration_quantity("2 tab", "BD") == 4
