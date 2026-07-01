## Summary

-

## Change Type

- [ ] Feature
- [ ] Bug fix
- [ ] Refactor
- [ ] Documentation
- [ ] Database migration

## Healthcare Safety Checklist

- [ ] Tenant isolation checked
- [ ] Branch scope checked where applicable
- [ ] RBAC permission checked
- [ ] Module entitlement checked
- [ ] Audit log added for sensitive create/update/delete/view/export
- [ ] No raw internal IDs shown in user-facing UI
- [ ] Patient/clinical/revenue data behavior reviewed

## Database Checklist

- [ ] SQLModel model updated
- [ ] Pydantic schema updated
- [ ] Alembic migration added, if needed
- [ ] Seed/demo data updated, if needed
- [ ] Backward compatibility and nullable/default values reviewed

## Verification

Paste command results:

```bash
backend/.venv/bin/ruff check backend/app backend/tests
backend/.venv/bin/pytest backend/tests -q
npm test
npm run build
```

## Screenshots

Add screenshots for UI changes, especially tablet/mobile views.
