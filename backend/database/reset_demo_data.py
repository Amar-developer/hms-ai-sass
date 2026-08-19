"""Delete local/dev data and recreate only the fresh SaaS setup.

Use case:
    Run this only for local/dev when the database must be cleaned and returned
    to the minimum SaaS setup before adding fresh demo data.

Safety:
    This command deletes all rows from the configured database. It requires
    MEDIZINHUB_RESET_CONFIRM=RESET_MEDIZINHUB_DEV and collects super admin
    credentials before deleting data.

Requires MEDIZINHUB_RESET_CONFIRM=RESET_MEDIZINHUB_DEV.

Run from the backend container or backend working directory:

    MEDIZINHUB_RESET_CONFIRM=RESET_MEDIZINHUB_DEV python -m database.reset_demo_data
"""

from __future__ import annotations

from scripts.reset_demo_data import main


if __name__ == "__main__":
    main()
