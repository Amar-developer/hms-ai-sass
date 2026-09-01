"""Seed demo tenant, users, patients, appointments, billing, lab, and pharmacy data.

Use case:
    Run this after migrations when a local/demo environment needs realistic
    sample data for product review, manual testing, or team onboarding.

Data scope:
    Creates demo tenant data such as users, patients, appointments, queue,
    consultation, billing, lab, pharmacy, notifications, and subscription data.

Run after migrations on a local/dev database:

    python -m database.seed_demo_data
"""

from __future__ import annotations

from scripts.seed_demo import main


if __name__ == "__main__":
    main()
