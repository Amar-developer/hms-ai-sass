"""Reset/create the primary tenant super admin.

Use case:
    Run this when a fresh local database needs the first platform admin, or when
    an existing local/support database has a broken/missing super admin login.

Safety:
    This command does not delete business/demo data. It also does not hardcode
    email/password credentials; provide them interactively or with environment
    variables.

Run from the backend container or backend working directory:

    python -m database.reset_super_admin
"""

from __future__ import annotations

from scripts.reset_super_admin import main


if __name__ == "__main__":
    main()
