# ovrlk-invoice

Invoicing, expense tracking, and reporting for small businesses, starting with one owner (a photography print business) and built to host many businesses later.

Terms used in this project are defined in [GLOSSARY.md](./GLOSSARY.md). Architecture decisions are recorded in [docs/adr](./docs/adr).

This repository is the first slice: the TanStack Start app, Owner sign-in, Business tenancy, and the security baseline. Clients, invoices, Stripe, expenses, and reports come in later pull requests.

## Local setup

Requires Node 24 LTS and [pnpm](https://pnpm.io/) 10.33.4 (`packageManager` in `package.json`, `engines` and `.node-version`). Do not use npm or Yarn. pnpm will not install a package version published less than a day ago (`minimumReleaseAge: 1440` in `pnpm-workspace.yaml`).

```sh
pnpm install
cp .env.example .env
```

Fill in `.env`. `BETTER_AUTH_SECRET` must be at least 32 characters (`openssl rand -base64 32`). Leave `RESEND_API_KEY` empty locally and the sign-in code is printed in the server log. Real values for production live in the Render service environment, not in git.

```sh
pnpm db:migrate
pnpm dev
```

The app is at http://localhost:3333. The dev database is the libSQL file in `DATABASE_URL` (default `file:local.db`).

## Create the first Owner

Sign-up stays closed unless `ALLOW_SIGN_UP=true`. The server rejects registration either way the flag is set; the page only mirrors it. Create the first Owner and Business from a trusted machine:

```sh
SEED_OWNER_EMAIL=you@example.com \
SEED_OWNER_PASSWORD='a long password' \
SEED_OWNER_NAME='Your Name' \
SEED_BUSINESS_NAME='Your Business' \
SEED_BUSINESS_TIMEZONE=America/Denver \
pnpm seed
```

The script reads those variables from the environment or from `.env`. It does not print the password. Running it again for the same email does nothing. Point `DATABASE_URL` and `TURSO_AUTH_TOKEN` at Turso when the Owner should be created in production. There is no public URL that creates an account while sign-up is closed.

Sign-in is email and password, then a one-time code. An authenticator app or passkey can be added under Security. Email codes stay on.

## Tests

```sh
pnpm lint
pnpm typecheck
pnpm test
```

Tests use a throwaway libSQL file under `data/` and do not send email.

## Environment variables

| Name                     | Purpose                                             |
| ------------------------ | --------------------------------------------------- |
| `DATABASE_URL`           | `file:local.db` locally, `libsql://...` on Turso    |
| `TURSO_AUTH_TOKEN`       | Turso token. Empty for a local file                 |
| `BETTER_AUTH_SECRET`     | Session signing secret, 32+ characters              |
| `BETTER_AUTH_URL`        | Public origin, no trailing slash                    |
| `RESEND_API_KEY`         | Resend API key for sign-in codes                    |
| `EMAIL_FROM`             | From address Resend will accept                     |
| `ALLOW_SIGN_UP`          | `true` opens registration. Anything else rejects it |
| `SEED_OWNER_EMAIL`       | First Owner email. Seed script only                 |
| `SEED_OWNER_PASSWORD`    | First Owner password. Seed script only              |
| `SEED_OWNER_NAME`        | First Owner name. Seed script only                  |
| `SEED_BUSINESS_NAME`     | First Business name. Seed script only               |
| `SEED_BUSINESS_TIMEZONE` | IANA time zone. Defaults to `America/Denver`        |

## Render

`render.yaml` builds with `pnpm install --frozen-lockfile` and starts with `pnpm start` on Node 24 (`NODE_VERSION`). Set the secret env vars in the Render dashboard (`sync: false` in the blueprint). `ALLOW_SIGN_UP` is `false`. The service runs migrations on boot. Cloudflare R2 is not wired up yet.
