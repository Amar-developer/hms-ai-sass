from datetime import date


def setup_lab_pharmacy_tenant(client):
    tenant = client.post("/api/v1/tenants", json={"name": "Diagnostics Pharmacy Clinic"}).json()
    branch = client.post(
        f"/api/v1/tenants/{tenant['id']}/branches",
        json={"name": "Main Branch", "code": "MAIN"},
    ).json()
    patient = client.post(
        "/api/v1/patients",
        headers={"X-Tenant-ID": tenant["id"]},
        json={"full_name": "Lab Pharmacy Patient", "mobile": "9876500001"},
    ).json()
    plan = client.post(
        "/api/v1/subscription-plans",
        json={
            "key": f"lab_pharmacy_{tenant['id'][-6:]}",
            "name": "Lab Pharmacy Plan",
            "monthly_patient_limit": 1000,
            "included_branches": 2,
            "included_doctors": 5,
            "price_inr_monthly": 2499,
            "enabled_modules": [
                "patients",
                "appointments",
                "queue",
                "consultations",
                "billing_basic",
                "billing_advanced",
                "lab",
                "pharmacy",
                "sms",
                "whatsapp",
            ],
        },
    ).json()
    client.post(
        "/api/v1/subscription-plans/tenant-subscriptions",
        headers={"X-Tenant-ID": tenant["id"]},
        json={"plan_id": plan["id"], "starts_on": date.today().isoformat(), "is_trial": False},
    )
    return tenant, branch, patient


def enable_lab_report_notifications(client, tenant_id, branch_id):
    client.put(
        "/api/v1/settings",
        headers={"X-Tenant-ID": tenant_id},
        json={
            "scope": "branch",
            "scope_id": branch_id,
            "module": "communication",
            "key": "communication.providers_enabled",
            "value": ["sms", "whatsapp"],
            "actor_user_id": "admin",
        },
    )


def setup_signed_consultation(client):
    tenant, branch, patient = setup_lab_pharmacy_tenant(client)
    booking = client.post(
        "/api/v1/appointments",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "branch_id": branch["id"],
            "patient_id": patient["id"],
            "appointment_type": "op",
            "appointment_date": date.today().isoformat(),
            "practitioner_id": "doctor_demo",
        },
    ).json()
    consultation = client.post(
        "/api/v1/consultations",
        headers={"X-Tenant-ID": tenant["id"]},
        json={"appointment_id": booking["appointment"]["id"]},
    ).json()
    updated = client.patch(
        f"/api/v1/consultations/{consultation['id']}",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "diagnosis": "Fever",
            "prescription_text": "Paracetamol 500mg twice daily for 3 days",
            "lab_referral_text": "CBC, FBS",
        },
    ).json()
    client.post(
        f"/api/v1/consultations/{consultation['id']}/sign",
        headers={"X-Tenant-ID": tenant["id"]},
        json={"signed_by_user_id": "doctor_demo"},
    )
    return tenant, branch, patient, updated


def test_trial_plan_blocks_lab_and_pharmacy_modules(client):
    tenant = client.post("/api/v1/tenants", json={"name": "Trial Lab Pharmacy Clinic"}).json()

    lab_response = client.get("/api/v1/lab/orders", headers={"X-Tenant-ID": tenant["id"]})
    pharmacy_response = client.get("/api/v1/pharmacy/issues", headers={"X-Tenant-ID": tenant["id"]})

    assert lab_response.status_code == 403
    assert lab_response.json()["detail"] == "Module lab is not enabled for plan Free Trial"
    assert pharmacy_response.status_code == 403
    assert pharmacy_response.json()["detail"] == "Module pharmacy is not enabled for plan Free Trial"


def test_create_lab_order_from_consultation_and_release_result(client):
    tenant, _branch, _patient, consultation = setup_signed_consultation(client)

    order = client.post(
        f"/api/v1/lab/orders/from-consultation/{consultation['id']}",
        headers={"X-Tenant-ID": tenant["id"]},
        json={"amount": 650, "priority": "urgent", "ordered_by_user_id": "doctor_demo"},
    )
    result = client.post(
        f"/api/v1/lab/orders/{order.json()['id']}/results",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "result_summary": "CBC normal. FBS mildly elevated.",
            "abnormal_flag": True,
            "released_by_user_id": "lab_user",
        },
    )
    listed = client.get("/api/v1/lab/orders", headers={"X-Tenant-ID": tenant["id"]}).json()

    assert order.status_code == 201
    assert order.json()["source"] == "consultation"
    assert order.json()["tests"] == "CBC, FBS"
    assert result.status_code == 201
    assert result.json()["order"]["status"] == "result_ready"
    assert result.json()["results"][0]["abnormal_flag"] is True
    assert len(listed) == 1


def test_create_direct_op_and_external_lab_orders(client):
    tenant, branch, patient = setup_lab_pharmacy_tenant(client)

    direct = client.post(
        "/api/v1/lab/orders",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "branch_id": branch["id"],
            "patient_id": patient["id"],
            "source": "op_direct",
            "tests": "HbA1c",
            "amount": 450,
        },
    )
    external = client.post(
        "/api/v1/lab/orders",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "branch_id": branch["id"],
            "patient_id": patient["id"],
            "source": "external_referral",
            "tests": "Thyroid Profile",
            "external_referrer": "Outside Clinic",
            "amount": 700,
        },
    )
    status_update = client.patch(
        f"/api/v1/lab/orders/{direct.json()['id']}/status",
        headers={"X-Tenant-ID": tenant["id"]},
        json={"status": "sample_collected", "actor_user_id": "lab_user"},
    )

    assert direct.status_code == 201
    assert external.status_code == 201
    assert external.json()["external_referrer"] == "Outside Clinic"
    assert status_update.json()["status"] == "sample_collected"


def test_lab_catalog_package_order_items_sample_template_report_and_consultation_visibility(client):
    tenant, branch, patient, consultation = setup_signed_consultation(client)
    enable_lab_report_notifications(client, tenant["id"], branch["id"])

    cbc = client.post(
        "/api/v1/lab/catalog/tests",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "branch_id": branch["id"],
            "code": "CBC",
            "name": "Complete Blood Count",
            "sample_type": "Blood",
            "default_price": 350,
        },
    ).json()
    fbs = client.post(
        "/api/v1/lab/catalog/tests",
        headers={"X-Tenant-ID": tenant["id"]},
        json={"code": "FBS", "name": "Fasting Blood Sugar", "sample_type": "Blood", "default_price": 120},
    ).json()
    package = client.post(
        "/api/v1/lab/catalog/packages",
        headers={"X-Tenant-ID": tenant["id"]},
        json={"code": "FEVER", "name": "Fever Panel", "package_price": 400, "test_ids": [cbc["id"], fbs["id"]]},
    )
    template = client.post(
        "/api/v1/lab/result-templates",
        headers={"X-Tenant-ID": tenant["id"]},
        json={"test_id": cbc["id"], "name": "CBC Template", "content": {"fields": ["Hb", "WBC"]}},
    )
    order = client.post(
        "/api/v1/lab/orders",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "branch_id": branch["id"],
            "patient_id": patient["id"],
            "source": "op_direct",
            "tests": "Manual fallback",
            "package_ids": [package.json()["id"]],
            "ordered_by_user_id": "lab_user",
        },
    )
    detail = client.post(
        f"/api/v1/lab/orders/{order.json()['id']}/samples",
        headers={"X-Tenant-ID": tenant["id"]},
        json={"barcode": "LAB-001", "sample_type": "Blood", "collected_by_user_id": "lab_user"},
    )
    result = client.post(
        f"/api/v1/lab/orders/{order.json()['id']}/results",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "template_id": template.json()["id"],
            "result_summary": "Hb 13.2, WBC normal",
            "report_url": "https://reports.local/lab-001.pdf",
            "report_file_name": "lab-001.pdf",
            "released_by_user_id": "lab_user",
        },
    )
    report = client.get(
        f"/api/v1/lab/orders/{order.json()['id']}/report.pdf",
        headers={"X-Tenant-ID": tenant["id"]},
    )
    notifications = client.get("/api/v1/notifications", headers={"X-Tenant-ID": tenant["id"]}).json()

    referral_order = client.post(
        f"/api/v1/lab/orders/from-consultation/{consultation['id']}",
        headers={"X-Tenant-ID": tenant["id"]},
        json={"ordered_by_user_id": "doctor_demo"},
    ).json()
    consultation_detail = client.get(
        f"/api/v1/consultations/{consultation['id']}",
        headers={"X-Tenant-ID": tenant["id"]},
    ).json()

    assert package.status_code == 201
    assert template.status_code == 201
    assert order.status_code == 201
    assert order.json()["tests"] == "Complete Blood Count, Fasting Blood Sugar"
    assert order.json()["amount"] == 400
    assert detail.json()["samples"][0]["barcode"] == "LAB-001"
    assert len(detail.json()["items"]) == 2
    assert result.json()["results"][0]["template_id"] == template.json()["id"]
    assert result.json()["results"][0]["report_file_name"] == "lab-001.pdf"
    assert report.status_code == 200
    assert report.headers["content-type"] == "application/pdf"
    assert {row["provider"] for row in notifications if row["event_type"] == "lab_report_ready"} == {
        "sms",
        "whatsapp",
    }
    assert any(row["id"] == referral_order["id"] for row in consultation_detail["lab_orders"])


def test_create_pharmacy_issue_from_consultation_and_dispense(client):
    tenant, _branch, _patient, consultation = setup_signed_consultation(client)

    issue = client.post(
        f"/api/v1/pharmacy/issues/from-consultation/{consultation['id']}",
        headers={"X-Tenant-ID": tenant["id"]},
        json={"amount": 180, "issued_by_user_id": "pharmacy_user"},
    )
    dispensed = client.patch(
        f"/api/v1/pharmacy/issues/{issue.json()['id']}/status",
        headers={"X-Tenant-ID": tenant["id"]},
        json={"status": "dispensed", "actor_user_id": "pharmacy_user"},
    )

    assert issue.status_code == 201
    assert issue.json()["medicine_text"] == "Paracetamol 500mg twice daily for 3 days"
    assert dispensed.status_code == 200
    assert dispensed.json()["status"] == "dispensed"
    assert dispensed.json()["dispensed_at"] is not None


def test_consultation_invoice_refresh_includes_lab_and_pharmacy_charges(client):
    tenant, branch, patient = setup_lab_pharmacy_tenant(client)
    client.post(
        "/api/v1/billing/doctor-fee-rules",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "appointment_type": "op",
            "fee_amount": 600,
            "share_type": "percentage",
            "doctor_share_percentage": 60,
            "practitioner_id": "doctor_demo",
        },
    )
    client.post(
        "/api/v1/lab/catalog/tests",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "branch_id": branch["id"],
            "code": "CBC",
            "name": "Complete Blood Count",
            "sample_type": "Blood",
            "default_price": 350,
        },
    )
    client.post(
        "/api/v1/pharmacy/medicines",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "branch_id": branch["id"],
            "code": "PCM500",
            "name": "Paracetamol 500mg",
            "generic_name": "Paracetamol",
            "default_sale_price": 5,
        },
    )
    booking = client.post(
        "/api/v1/appointments",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "branch_id": branch["id"],
            "patient_id": patient["id"],
            "appointment_type": "op",
            "appointment_date": date.today().isoformat(),
            "practitioner_id": "doctor_demo",
        },
    ).json()
    consultation = client.post(
        "/api/v1/consultations",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "appointment_id": booking["appointment"]["id"],
            "prescription_text": "Paracetamol 500mg 1-0-1 for 3 days",
            "lab_referral_text": "Complete Blood Count",
            "medicines": [
                {
                    "medicine_name": "Paracetamol 500mg",
                    "dosage": "500mg",
                    "frequency": "1-0-1",
                    "duration": "3 days",
                    "instructions": "After food",
                }
            ],
            "referrals": [
                {
                    "referral_type": "lab",
                    "item_name": "Complete Blood Count",
                    "priority": "routine",
                    "instructions": "Fever workup",
                }
            ],
        },
    ).json()
    signed = client.post(
        f"/api/v1/consultations/{consultation['id']}/sign",
        headers={"X-Tenant-ID": tenant["id"]},
        json={"signed_by_user_id": "doctor_demo"},
    ).json()

    first_invoice = client.post(
        "/api/v1/billing/invoices/from-consultation",
        headers={"X-Tenant-ID": tenant["id"]},
        json={"consultation_id": signed["id"]},
    ).json()
    lab_order = client.post(
        f"/api/v1/lab/orders/from-consultation/{signed['id']}",
        headers={"X-Tenant-ID": tenant["id"]},
        json={"ordered_by_user_id": "doctor_demo"},
    )
    pharmacy_issue = client.post(
        f"/api/v1/pharmacy/issues/from-consultation/{signed['id']}",
        headers={"X-Tenant-ID": tenant["id"]},
        json={"issued_by_user_id": "pharmacy_user"},
    )
    refreshed = client.post(
        "/api/v1/billing/invoices/from-consultation",
        headers={"X-Tenant-ID": tenant["id"]},
        json={"consultation_id": signed["id"]},
    )

    assert lab_order.status_code == 201
    assert pharmacy_issue.status_code == 201
    assert pharmacy_issue.json()["amount"] == 30
    assert refreshed.status_code == 201
    detail = refreshed.json()
    assert detail["invoice"]["id"] == first_invoice["invoice"]["id"]
    assert detail["invoice"]["subtotal_amount"] == 980
    assert detail["invoice"]["total_amount"] == 980
    assert detail["invoice"]["doctor_share_amount"] == 360
    assert {item["item_type"] for item in detail["items"]} == {"consultation", "lab", "pharmacy"}


def test_create_external_pharmacy_issue(client):
    tenant, branch, patient = setup_lab_pharmacy_tenant(client)

    issue = client.post(
        "/api/v1/pharmacy/issues",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "branch_id": branch["id"],
            "patient_id": patient["id"],
            "source": "external_prescription",
            "medicine_text": "Metformin 500mg once daily",
            "external_prescriber": "Outside Diabetology Clinic",
            "amount": 220,
        },
    )

    assert issue.status_code == 201
    assert issue.json()["source"] == "external_prescription"
    assert issue.json()["external_prescriber"] == "Outside Diabetology Clinic"


def test_pharmacy_catalog_purchase_stock_dispense_substitute_low_stock_and_billing_link(client):
    tenant, branch, patient = setup_lab_pharmacy_tenant(client)

    paracetamol = client.post(
        "/api/v1/pharmacy/medicines",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "branch_id": branch["id"],
            "code": "PCM500",
            "name": "Paracetamol 500mg",
            "generic_name": "Paracetamol",
            "form": "Tablet",
            "default_sale_price": 5,
            "reorder_level": 9,
        },
    ).json()
    substitute = client.post(
        "/api/v1/pharmacy/medicines",
        headers={"X-Tenant-ID": tenant["id"]},
        json={"code": "ACET500", "name": "Acetaminophen 500mg", "generic_name": "Paracetamol", "default_sale_price": 6},
    ).json()
    supplier = client.post(
        "/api/v1/pharmacy/suppliers",
        headers={"X-Tenant-ID": tenant["id"]},
        json={"name": "Demo Pharma Supplier", "phone": "9000000000"},
    ).json()
    purchase = client.post(
        "/api/v1/pharmacy/purchases",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "branch_id": branch["id"],
            "supplier_id": supplier["id"],
            "purchase_order_id": "PO-001",
            "invoice_number": "PINV-001",
            "discount_percentage": 10,
            "items": [
                {
                    "medicine_id": paracetamol["id"],
                    "batch_number": "BATCH-PCM",
                    "quantity": 10,
                    "cost_price": 2,
                    "sale_price": 5,
                    "discount_percentage": 5,
                    "cgst_percentage": 6,
                    "sgst_percentage": 6,
                },
                {
                    "medicine_id": substitute["id"],
                    "batch_number": "BATCH-ACET",
                    "quantity": 2,
                    "cost_price": 3,
                    "sale_price": 6,
                }
            ],
            "purchased_by_user_id": "pharmacy_user",
        },
    )
    batch_id = purchase.json()["batches"][0]["id"]
    issue = client.post(
        "/api/v1/pharmacy/issues",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "branch_id": branch["id"],
            "patient_id": patient["id"],
            "source": "op_direct",
            "medicine_text": "Paracetamol",
            "items": [
                {
                    "medicine_id": paracetamol["id"],
                    "batch_id": batch_id,
                    "medicine_name": "Paracetamol 500mg",
                    "quantity": 2,
                    "unit_price": 5,
                },
                {
                    "medicine_id": substitute["id"],
                    "substitute_for_medicine_id": paracetamol["id"],
                    "medicine_name": "Acetaminophen 500mg",
                    "quantity": 1,
                    "unit_price": 6,
                },
            ],
            "issued_by_user_id": "pharmacy_user",
        },
    )
    dispensed = client.patch(
        f"/api/v1/pharmacy/issues/{issue.json()['id']}/status",
        headers={"X-Tenant-ID": tenant["id"]},
        json={"status": "dispensed", "actor_user_id": "pharmacy_user"},
    )
    linked = client.post(
        f"/api/v1/pharmacy/issues/{issue.json()['id']}/billing-link",
        headers={"X-Tenant-ID": tenant["id"]},
        json={"billing_invoice_id": "INV-PHARM-001", "actor_user_id": "billing_user"},
    )
    returned = client.post(
        "/api/v1/pharmacy/returns",
        headers={"X-Tenant-ID": tenant["id"]},
        json={
            "branch_id": branch["id"],
            "supplier_id": supplier["id"],
            "purchase_id": purchase.json()["id"],
            "reason": "Expired medicine returned to supplier",
            "items": [{"medicine_id": paracetamol["id"], "batch_id": batch_id, "quantity": 1, "amount": 2}],
            "returned_by_user_id": "pharmacy_user",
        },
    )
    ledger = client.get("/api/v1/pharmacy/stock-ledger", headers={"X-Tenant-ID": tenant["id"]}).json()
    low_stock = client.get(
        f"/api/v1/pharmacy/low-stock?branch_id={branch['id']}",
        headers={"X-Tenant-ID": tenant["id"]},
    ).json()
    detail = client.get(
        f"/api/v1/pharmacy/issues/{issue.json()['id']}",
        headers={"X-Tenant-ID": tenant["id"]},
    ).json()

    assert purchase.status_code == 201
    assert purchase.json()["purchase_order_id"] == "PO-001"
    assert purchase.json()["discount_amount"] == 3
    assert purchase.json()["gst_amount"] == 2
    assert purchase.json()["total_amount"] == 25
    assert issue.status_code == 201
    assert issue.json()["amount"] == 16
    assert dispensed.status_code == 200
    assert dispensed.json()["status"] == "dispensed"
    assert linked.json()["billing_invoice_id"] == "INV-PHARM-001"
    assert returned.status_code == 201
    assert returned.json()["total_amount"] == 2
    assert any(row["movement_type"] == "purchase" for row in ledger)
    assert any(row["movement_type"] == "dispense" for row in ledger)
    assert any(row["movement_type"] == "return" for row in client.get("/api/v1/pharmacy/stock-ledger", headers={"X-Tenant-ID": tenant["id"]}).json())
    assert any(row["medicine_id"] == paracetamol["id"] and row["quantity_on_hand"] == 7 for row in low_stock)
    assert detail["items"][1]["substitute_for_medicine_id"] == paracetamol["id"]
