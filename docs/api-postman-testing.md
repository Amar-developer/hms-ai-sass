# API Export and Postman Testing

This repository includes a generated OpenAPI export and a Postman collection
for testing the MedizinHub HMS backend API.

## Files

- `openapi.json` - FastAPI OpenAPI 3 schema generated from `app.main:app`.
- `docs/medizinhub-hms.postman_collection.json` - Postman collection generated
  from the same OpenAPI schema.

## Import in Postman

1. Open Postman.
2. Select **Import**.
3. Import `docs/medizinhub-hms.postman_collection.json`.
4. Open the imported **MedizinHub HMS API** collection.
5. Set collection variables:
   - `baseUrl`: backend URL, for example `http://localhost:8080`.
   - `authToken`: bearer token returned by the login API.
   - `tenantId`: tenant UUID for tenant-scoped APIs.
   - `branchId`: branch UUID for branch-scoped APIs.

## Common Base URLs

- Local Docker: `http://localhost:8080`
- Local uvicorn: `http://localhost:8000`
- Staging: `http://YOUR_STAGING_EC2_IP:8081`
- Production: use the production backend origin configured for the deployment.

## Suggested Test Flow

1. Start the backend stack.
2. Call `GET /health`.
3. Call `GET /api/v1/health`.
4. Login with a valid user and copy the returned token into `authToken`.
5. Set `tenantId` and `branchId` for tenant APIs.
6. Run folders module by module in Postman.

The collection includes a lightweight test script on every request that fails
on HTTP 5xx responses and responses slower than five seconds. Some endpoints
will still require valid IDs, request bodies, tenant data, permissions, module
entitlements, or uploaded files before they can return successful business
responses.

## Regenerate

Run this from the repository root after backend route changes:

```bash
backend/.venv/bin/python scripts/export_api_docs.py
```
