# ovrlk-invoice

Invoicing, expense tracking, and reporting for small businesses, starting with one owner (a photography print business) and built to host many businesses later.

Terms used in this project are defined in [GLOSSARY.md](./GLOSSARY.md). Architecture decisions are recorded in [docs/adr](./docs/adr).

This repository includes Owner sign-in, Business tenancy, Clients, Items, Tax Rates, Invoices (PDF, email, and a public Invoice Link), Stripe Connect Payments, Expenses, and Reports. The home page is a cash-basis dashboard. Profit and Loss, Expenses by category, and Revenue by client are under Reports.

## Local setup

Requires Node 24 LTS and [pnpm](https://pnpm.io/) 10.33.4 (`packageManager` in `package.json`, `engines` and `.node-version`). Do not use npm or Yarn. pnpm will not install a package version published less than a day ago (`minimumReleaseAge: 1440` in `pnpm-workspace.yaml`).

```sh
pnpm install
cp .env.example .env
```

Fill in `.env`. `BETTER_AUTH_SECRET` must be at least 32 characters (`openssl rand -base64 32`). Leave `RESEND_API_KEY` empty locally and the sign-in code, and any Invoice email, is printed in the server log. Real values for production live in the Render service environment, not in git.

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

| Name                       | Purpose                                                                      |
| -------------------------- | ---------------------------------------------------------------------------- |
| `DATABASE_URL`             | `file:local.db` locally, `libsql://...` on Turso                             |
| `TURSO_AUTH_TOKEN`         | Turso token. Empty for a local file                                          |
| `BETTER_AUTH_SECRET`       | Session signing secret, 32+ characters                                       |
| `BETTER_AUTH_URL`          | Public origin, no trailing slash                                             |
| `RESEND_API_KEY`           | Resend API key for sign-in codes                                             |
| `EMAIL_FROM`               | From address Resend will accept                                              |
| `ALLOW_SIGN_UP`            | `true` opens registration. Anything else rejects it                          |
| `STRIPE_SECRET_KEY`        | Platform secret key. Empty hides card Payments                               |
| `STRIPE_WEBHOOK_SECRET`    | Signing secret for `/api/stripe/webhook`                                     |
| `STRIPE_CONNECT_CLIENT_ID` | Connect OAuth client id (`ca_...`). Empty hides linking an existing account  |
| `R2_ACCOUNT_ID`            | Cloudflare account id. Receipts and the logo stay off if any R2 var is unset |
| `R2_ACCESS_KEY_ID`         | R2 API token access key id                                                   |
| `R2_SECRET_ACCESS_KEY`     | R2 API token secret                                                          |
| `R2_BUCKET`                | Private R2 bucket name                                                       |
| `SEED_OWNER_EMAIL`         | First Owner email. Seed script only                                          |
| `SEED_OWNER_PASSWORD`      | First Owner password. Seed script only                                       |
| `SEED_OWNER_NAME`          | First Owner name. Seed script only                                           |
| `SEED_BUSINESS_NAME`       | First Business name. Seed script only                                        |
| `SEED_BUSINESS_TIMEZONE`   | IANA time zone. Defaults to `America/Denver`                                 |

## Render

`render.yaml` builds with `pnpm install --frozen-lockfile --prod=false` and starts with `pnpm start` on Node 24 (`NODE_VERSION`). `--prod=false` installs devDependencies, including `drizzle-kit`, and the build leaves that `node_modules` in place. Set the secret env vars in the Render dashboard (`sync: false` in the blueprint, no values in git). Pre-deploy uses the same service environment, so `DATABASE_URL` and `TURSO_AUTH_TOKEN` are set for `drizzle.config.ts`. `ALLOW_SIGN_UP` is `false`. Leave the R2 variables unset and the app still boots; Receipt and logo upload stay hidden.

The pre-deploy command is `pnpm db:migrate` (`drizzle-kit migrate`). Render runs it for this paid web service (`plan: starter`) after the build finishes and before the new instance starts. `drizzle.config.ts` and the `drizzle/` folder are in the repo, so they are on that filesystem. The first request still calls `migrateDb()`. After pre-deploy, that call finds nothing left to apply. It also sets the connection pragmas, and it is what migrates `pnpm dev` and any deploy that does not run the pre-deploy command.

Changes in `render.yaml` apply when the service is Blueprint-managed. Otherwise set Pre-Deploy Command to `pnpm db:migrate` in the service's Settings in the Render dashboard.

If the pre-deploy command fails or times out (30 minutes), the deploy fails before the new instance starts. The service keeps serving its most recent successful deploy. A migration that committed before the failure stays in the database.

Card Payments use Stripe Connect Standard and a direct charge on the Business's Connected Account. Account Links create a new Standard account. OAuth links an existing one when `STRIPE_CONNECT_CLIENT_ID` is set. Leave `STRIPE_SECRET_KEY` empty and the pay button stays hidden. A card Payment with `fee_cents` creates one Merchant Fee Expense. A later event with the same fee does not create another. Refunds reduce the Payment and move the Invoice back to Partially Paid or Sent. The Merchant Fee amount follows the net balance-transaction fee, which usually stays put because Stripe keeps the original processing fee. A Payment above the Invoice total is kept and the Invoice shows Overpaid. Void is blocked while any Payment still has an unrefunded balance.
