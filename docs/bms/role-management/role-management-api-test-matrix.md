# Role Management API Test Matrix

| TC ID             | User Story                       | Endpoint                                          | Priority | Expected status         | Notes                                                  |
| ----------------- | -------------------------------- | ------------------------------------------------- | -------- | ----------------------- | ------------------------------------------------------ |
| TC-RM-001..008    | US-ROLE-01 Create role           | `POST /api/v0/roles/`                             | P0       | 200/400/403/401         | duplicate and no-token status are `TODO_CONFIRM`       |
| TC-RM-009..016    | US-ROLE-02 List roles            | `GET /api/v0/roles/`                              | P0       | 200/400/403/401         | `limit>100` and no-token status are `TODO_CONFIRM`     |
| TC-RM-017..025    | US-ROLE-03 Update role           | `PATCH /api/v0/roles/:roleId`                     | P0       | 200/400/404/403/401     | duplicate and no-token status are `TODO_CONFIRM`       |
| TC-RM-026..031    | US-ROLE-04 Delete role           | `DELETE /api/v0/roles/:roleId`                    | P0       | 200/400/403/404/409/401 | assigned/system/no-token status are `TODO_CONFIRM`     |
| TC-RM-032..040    | US-ROLE-05 Assign role           | `POST /api/v0/roles/:roleId/assignments`          | P0       | 200/400/403/404         | requires fixed user IDs                                |
| TC-PM-001..011    | US-POLICY-01 Create policy       | `POST /api/v0/policies/`                          | P0       | 200/400/403/404         | `actions=0` is `TODO_CONFIRM`                          |
| TC-PM-012..017    | US-POLICY-02 List policy         | `GET /api/v0/policies/?role_id=<uuid>`            | P0       | 200/400/403/404         | fake role behavior is `TODO_CONFIRM`                   |
| TC-PM-018..024    | US-POLICY-03 Update policy       | `PATCH /api/v0/policies/:id`                      | P0       | 200/400/403/404         | strict invalid enum/action tests                       |
| TC-PM-025..028    | US-POLICY-04 Delete policy       | `DELETE /api/v0/policies/:id`                     | P0       | 200/403/404             | mapped-resource cascade is `TODO_CONFIRM`              |
| TC-PR-001..008    | US-POLICY-05/06 Resource mapping | `POST/DELETE /api/v0/policies/:id/resources`      | P0       | 200/400/403/404/409     | duplicate/missing/all-scope are `TODO_CONFIRM`         |
| TC-BR-001..007    | US-POLICY-07 Bulk mapping        | `POST/DELETE /api/v0/policies/:id/resources/bulk` | P0       | 200/400/403/404/409     | duplicate/partial rollback are `TODO_CONFIRM`          |
| TC-PT-001..007    | US-PERM-01 Permission tree       | `GET /api/v0/permissions/tree`                    | P0       | 200/400/401/403         | disabled/no-permission/no-token are `TODO_CONFIRM`     |
| TC-AUTHZ-001..006 | US-AUTHZ-01 PBAC authorization   | env-provided business endpoints                   | P0       | 200/403                 | skipped as `insufficient_context` without endpoint env |

## TODO_CONFIRM Rules

- `actions=0` policy create.
- Duplicate resource create.
- Bulk add rollback vs partial success.
- Add nonexistent resource.
- Delete assigned role status/error.
- Disabled role permission tree behavior.
- Allow/deny conflict precedence.
- Permission update effective immediately vs token refresh.
- Add resource to `resource_scope=all`.
- Standard error response shape.
- No-token response status: remote currently returns `400` for some endpoints,
  while SPEC expects `401`.
