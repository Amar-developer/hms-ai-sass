from typing import Annotated

from pydantic import Field


Identifier = Annotated[
    str,
    Field(
        min_length=3,
        max_length=80,
        pattern=r"^[A-Za-z][A-Za-z0-9_-]{1,79}$",
    ),
]

TenantId = Identifier
BranchId = Identifier
PatientId = Identifier
AppointmentId = Identifier
ConsultationId = Identifier
InvoiceId = Identifier
LabOrderId = Identifier
PharmacyIssueId = Identifier
PlanId = Identifier
PractitionerId = Identifier
DepartmentId = Identifier
UserId = Identifier
FileId = Identifier
