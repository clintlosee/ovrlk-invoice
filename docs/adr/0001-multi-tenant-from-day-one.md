# Multi-tenant from day one

v1 has a single owner, but the product may open to other businesses. Every row is scoped to a Business and every query is filtered by the signed-in Business, enforced in one data-access layer and proven by cross-tenant isolation tests, so opening sign-ups later is a configuration change rather than a data migration.
