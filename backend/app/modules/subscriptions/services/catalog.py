import json

from app.modules.manifest import MODULES


CORE_HMS_MODULES = [
    "patients",
    "practitioners",
    "scheduling",
    "appointments",
    "queue",
    "consultations",
    "billing_basic",
]

FULL_HMS_MODULES = [
    *CORE_HMS_MODULES,
    "expense",
    "billing_advanced",
    "patient_subscriptions",
    "home_care",
    "lab",
    "pharmacy",
    "notifications",
    "sms",
    "whatsapp",
    "voice",
    "reports",
    "physiotherapy",
    "ip",
    "patient_intelligence",
]

STARTER_HMS_MODULES = [
    *CORE_HMS_MODULES,
    "billing_advanced",
    "patient_subscriptions",
]

GROWTH_HMS_MODULES = [
    *STARTER_HMS_MODULES,
    "expense",
    "home_care",
    "lab",
    "pharmacy",
    "notifications",
    "sms",
    "whatsapp",
    "reports",
    "patient_intelligence",
]

PRO_HMS_MODULES = [
    *GROWTH_HMS_MODULES,
    "voice",
    "physiotherapy",
]


DEFAULT_PLANS = [
    {
        "key": "free_trial",
        "name": "Free Trial",
        "monthly_patient_limit": 50,
        "monthly_whatsapp_message_limit": 0,
        "included_branches": 999,
        "included_doctors": 999,
        "price_inr_monthly": 0,
        "enabled_modules_json": json.dumps(CORE_HMS_MODULES),
    },
    {
        "key": "starter",
        "name": "Starter Clinic",
        "monthly_patient_limit": 300,
        "monthly_whatsapp_message_limit": 0,
        "included_branches": 1,
        "included_doctors": 1,
        "price_inr_monthly": 999,
        "enabled_modules_json": json.dumps(STARTER_HMS_MODULES),
    },
    {
        "key": "growth",
        "name": "Growth Clinic",
        "monthly_patient_limit": 1000,
        "monthly_whatsapp_message_limit": 1000,
        "included_branches": 2,
        "included_doctors": 5,
        "price_inr_monthly": 2999,
        "enabled_modules_json": json.dumps(GROWTH_HMS_MODULES),
    },
    {
        "key": "pro",
        "name": "Pro Clinic",
        "monthly_patient_limit": 5000,
        "monthly_whatsapp_message_limit": 5000,
        "included_branches": 5,
        "included_doctors": 20,
        "price_inr_monthly": 7999,
        "enabled_modules_json": json.dumps(PRO_HMS_MODULES),
    },
    {
        "key": "hospital",
        "name": "Hospital",
        "monthly_patient_limit": 10000,
        "monthly_whatsapp_message_limit": 10000,
        "included_branches": 999,
        "included_doctors": 999,
        "price_inr_monthly": 14999,
        "enabled_modules_json": json.dumps(FULL_HMS_MODULES),
    },
    {
        "key": "monthly_clinic",
        "name": "Monthly Clinic",
        "monthly_patient_limit": 50,
        "monthly_whatsapp_message_limit": 1000,
        "included_branches": 1,
        "included_doctors": 999,
        "price_inr_monthly": 2999,
        "enabled_modules_json": json.dumps(GROWTH_HMS_MODULES),
    },
    {
        "key": "half_yearly_clinic",
        "name": "Half Yearly Clinic",
        "monthly_patient_limit": 300,
        "monthly_whatsapp_message_limit": 5000,
        "included_branches": 999,
        "included_doctors": 999,
        "price_inr_monthly": 15999,
        "enabled_modules_json": json.dumps(PRO_HMS_MODULES),
    },
    {
        "key": "yearly_clinic",
        "name": "Yearly Clinic",
        "monthly_patient_limit": 999999,
        "monthly_whatsapp_message_limit": 999999,
        "included_branches": 999,
        "included_doctors": 999,
        "price_inr_monthly": 29999,
        "enabled_modules_json": json.dumps(FULL_HMS_MODULES),
    },
]

# Home Care was introduced after these built-in plans already existed in some
# installations. Preserve that contractual entitlement without replacing any
# other modules an administrator may have configured.
HOME_CARE_DEFAULT_PLAN_KEYS = {
    "growth",
    "pro",
    "hospital",
    "monthly_clinic",
    "half_yearly_clinic",
    "yearly_clinic",
}

PATIENT_INTELLIGENCE_DEFAULT_PLAN_KEYS = {
    "growth",
    "pro",
    "hospital",
    "monthly_clinic",
    "half_yearly_clinic",
    "yearly_clinic",
}

EXPENSE_DEFAULT_PLAN_KEYS = {
    "growth",
    "pro",
    "hospital",
    "monthly_clinic",
    "half_yearly_clinic",
    "yearly_clinic",
}


def plan_duration_days(plan_key: str | None) -> int | None:
    return {
        "free_trial": 30,
        "starter": 30,
        "monthly_clinic": 30,
        "half_yearly_clinic": 180,
        "yearly_clinic": 365,
    }.get(str(plan_key or ""))


def normalize_enabled_modules(raw_modules: list[str] | None) -> list[str]:
    entitlement_modules = {
        str(module["entitlement_key"]): module
        for module in MODULES
        if module.get("entitlement_key")
    }
    module_by_key = {str(module["key"]): module for module in MODULES}
    selected = {
        str(module).strip() for module in (raw_modules or []) if str(module).strip()
    }
    if not selected:
        selected = set(CORE_HMS_MODULES)

    changed = True
    while changed:
        changed = False
        for module_key in list(selected):
            module = entitlement_modules.get(module_key)
            if not module:
                continue
            for dependency in module.get("dependencies", []):
                dependency_module = module_by_key.get(str(dependency))
                dependency_key = (
                    dependency_module.get("entitlement_key")
                    if dependency_module
                    else dependency
                )
                if dependency_key and dependency_key not in selected:
                    selected.add(str(dependency_key))
                    changed = True

    allowed = set(entitlement_modules)
    return sorted(module for module in selected if module in allowed)
