# Agent notes

Use the words in [GLOSSARY.md](./GLOSSARY.md). The tenant is a Business. The person who signs in is the Owner. A Member has a role; v1 only writes `owner`. A Client does not sign in. Do not say Organization, workspace, customer, or company in code.

Every tenant read and write goes through `forBusiness` in `src/server/tenancy.ts`. The Business id comes from the signed-in Owner's membership, never from the request body. The one lookup outside that helper resolves that membership from the session user id.

Money is integer cents (`cents()` in `src/lib/money.ts`). v1 currency is USD. Do not store floats, bank numbers, or card numbers.

Do not commit secrets. `.env.example` lists names only. Real values live in the Render environment.

Keep pull requests small. The owner reviews them. Do not merge without that review.

Sign-up stays closed unless `ALLOW_SIGN_UP=true`, and the server rejects it when the flag is off. Public Invoice Link routes, when they exist, must call `consumePublicRateLimit` and live under `/p/` so the request middleware limits them.

Package manager is pnpm 10.33.4. Commit `pnpm-lock.yaml`. Do not add `package-lock.json` or `yarn.lock`. Runtime is Node 24 LTS. `minimumReleaseAge` in `pnpm-workspace.yaml` is 1440 minutes, so a package version has to be a day old before it can be installed. CI and Render install with `--frozen-lockfile`.
