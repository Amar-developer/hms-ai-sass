from __future__ import annotations

from app.core.list_filters import (
    ListField,
    ListSpec,
    standard_audit_list_fields,
    standard_audit_sort_fields,
)
from app.modules.expenses.models import Expense, ExpenseCategory, ExpenseStatus


EXPENSE_LIST_SPEC = ListSpec(
    fields={
        **standard_audit_list_fields(Expense),
        "branch_id": ListField(Expense.branch_id, "select"),
        "category": ListField(Expense.category, "select", enum_type=ExpenseCategory),
        "subcategory": ListField(Expense.subcategory, "text"),
        "amount": ListField(Expense.amount, "number"),
        "currency": ListField(Expense.currency, "select"),
        "incurred_on": ListField(Expense.incurred_on, "date"),
        "description": ListField(Expense.description, "text"),
        "status": ListField(Expense.status, "select", enum_type=ExpenseStatus),
        "submitted_by": ListField(Expense.submitted_by, "select"),
        "approved_by": ListField(Expense.approved_by, "select"),
    },
    sort_fields={
        **standard_audit_sort_fields(Expense),
        "branch_id": Expense.branch_id,
        "category": Expense.category,
        "subcategory": Expense.subcategory,
        "amount": Expense.amount,
        "incurred_on": Expense.incurred_on,
        "status": Expense.status,
        "submitted_by": Expense.submitted_by,
        "approved_by": Expense.approved_by,
    },
)
