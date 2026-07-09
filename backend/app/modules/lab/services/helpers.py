from app.modules.lab.services.catalog import (
    _catalog_key,  # noqa: F401
    _find_lab_package,  # noqa: F401
    _find_lab_test,  # noqa: F401
    _local_lab_price,  # noqa: F401
    _normalize_local_lab_package,  # noqa: F401
    _normalize_local_lab_test,  # noqa: F401
    _price_payload,  # noqa: F401
    _resolve_lab_price,  # noqa: F401
)
from app.modules.lab.services.catalog_service import (
    create_lab_package_record,  # noqa: F401
    create_lab_test_record,  # noqa: F401
    create_result_template_record,  # noqa: F401
    delete_lab_package_record,  # noqa: F401
    delete_lab_test_record,  # noqa: F401
    update_lab_package_record,  # noqa: F401
    update_lab_test_record,  # noqa: F401
)
from app.modules.lab.services.detail_builder import read_order_detail  # noqa: F401
from app.modules.lab.services.order_service import (
    create_lab_order_from_consultation_record,  # noqa: F401
    create_lab_order_record,  # noqa: F401
    get_lab_order_detail,  # noqa: F401
    list_lab_orders_records,  # noqa: F401
    update_lab_order_status_record,  # noqa: F401
)
from app.modules.lab.services.pricing import (
    add_order_items as _add_order_items,  # noqa: F401
    add_priced_order_items_from_names as _add_priced_order_items_from_names,  # noqa: F401
    reprice_zero_order_items as _reprice_zero_order_items,  # noqa: F401
)
from app.modules.lab.services.read_models import (
    _package_read,  # noqa: F401
    _template_read,  # noqa: F401
)
from app.modules.lab.services.referrals import (
    _fallback_lab_referrals,  # noqa: F401
    build_lab_consultation_referral_reads,  # noqa: F401
)
from app.modules.lab.services.report_service import render_lab_report_pdf  # noqa: F401
from app.modules.lab.services.result_service import add_lab_result_record  # noqa: F401
from app.modules.lab.services.sample_service import (
    collect_lab_sample_record,  # noqa: F401
)
from app.modules.lab.services.validation import (
    _get_order_or_404,  # noqa: F401
    _validate_patient_branch,  # noqa: F401
)

_read_detail = read_order_detail
