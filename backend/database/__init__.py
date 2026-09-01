"""Database lifecycle helpers for local/staging setup.

This package provides stable entry points for schema inspection, safe resets,
and demo data seeding. The implementation delegates to the existing scripts so
older commands continue to work.

Use case:
    Keep all project database commands in one discoverable package:
    ``python -m database.<command>``.

Branch/schema note:
    This folder is maintained for the current stable main-line database schema.
"""
