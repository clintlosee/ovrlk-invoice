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

Fill in `.env`. `BETTER_AUTH_SECRET` must be at least 32 characters (`openssl rand -base64 32`). Leave `RESEND_API_KEY` empty locally and the sign-in code, and any Invoice or receipt email, is printed in the server log. Real values for production live in the Render service environment, not in git.

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

| Name                       | Needed                          | Purpose                                                                                                               |
| -------------------------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`             | Default `file:local.db`         | libSQL URL. `file:local.db` locally, `libsql://...` on Turso                                                          |
| `TURSO_AUTH_TOKEN`         | Optional                        | Turso token. Leave empty for a local file. Set it for hosted Turso                                                    |
| `BETTER_AUTH_SECRET`       | Required                        | Session signing secret. The server throws when this is missing or shorter than 32 characters                          |
| `BETTER_AUTH_URL`          | Default `http://localhost:3333` | Public origin, no trailing slash. Use `http://localhost:3333` locally so links match `pnpm dev`                       |
| `RESEND_API_KEY`           | Required in production          | Resend API key. Empty locally logs sign-in codes and Invoice and receipt emails. Production throws when this is unset |
| `EMAIL_FROM`               | Required with Resend            | From address on a domain Resend has verified. Throws when a key is set and this is empty                              |
| `ALLOW_SIGN_UP`            | Default closed                  | The string `true` opens registration. Anything else, including unset, rejects it                                      |
| `STRIPE_SECRET_KEY`        | Optional                        | Platform secret key. Empty hides card Payments                                                                        |
| `STRIPE_WEBHOOK_SECRET`    | Optional                        | Signing secret for `/api/stripe/webhook`. When unset, that route returns 503                                          |
| `STRIPE_CONNECT_CLIENT_ID` | Optional                        | Connect OAuth client id. Must match `ca_...`, or linking an existing account stays hidden                             |
| `R2_ACCOUNT_ID`            | Optional                        | Cloudflare account id. Receipts and the logo stay off when any R2 variable is unset                                   |
| `R2_ACCESS_KEY_ID`         | Optional                        | R2 API token access key id                                                                                            |
| `R2_SECRET_ACCESS_KEY`     | Optional                        | R2 API token secret                                                                                                   |
| `R2_BUCKET`                | Optional                        | Private R2 bucket name                                                                                                |
| `SEED_OWNER_EMAIL`         | Required for seed               | First Owner email. Read only by `pnpm seed`                                                                           |
| `SEED_OWNER_PASSWORD`      | Required for seed               | First Owner password, at least 12 characters. Read only by `pnpm seed`                                                |
| `SEED_OWNER_NAME`          | Required for seed               | First Owner name. Read only by `pnpm seed`                                                                            |
| `SEED_BUSINESS_NAME`       | Required for seed               | First Business name. Read only by `pnpm seed`                                                                         |
| `SEED_BUSINESS_TIMEZONE`   | Default `America/Denver`        | IANA time zone. Read only by `pnpm seed`. An invalid name throws                                                      |

## Third-party setup

### Stripe

Use an `sk_test_` secret key locally. Forward webhooks and copy the printed `whsec_` value into `STRIPE_WEBHOOK_SECRET`:

```sh
stripe listen \
  --forward-to localhost:3333/api/stripe/webhook \
  --forward-connect-to localhost:3333/api/stripe/webhook
```

The CLI prints one signing secret for both forwards. `--forward-connect-to` sends Connect events to that path. Leaving the flag off still forwards Connect events to the `--forward-to` URL. The handler needs those events. Checkout is created with the `Stripe-Account` header set to the Business's Connected Account, and a Payment, refund, account update, or deauthorization is recorded only when the event includes `account`. Without `STRIPE_WEBHOOK_SECRET`, `/api/stripe/webhook` returns 503 and a card Payment never marks the Invoice paid.

In production, add one endpoint at `<BETTER_AUTH_URL>/api/stripe/webhook` and choose "Listen to events on Connected accounts". Subscribe to `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `payment_intent.succeeded`, `account.updated`, `account.application.deauthorized`, `charge.refunded`, and `refund.created`. `account.application.deauthorized` is handled on that same endpoint, and only when `account` is set. Put that endpoint's signing secret in `STRIPE_WEBHOOK_SECRET`. The server verifies that one secret. Requests signed with a different secret fail the signature check. Event types outside this list are acknowledged and ignored.

Enable OAuth for Standard accounts in the Connect settings to link an existing account. Register `http://localhost:3333/app/stripe/oauth` and `<BETTER_AUTH_URL>/app/stripe/oauth`, with no trailing slash. Test mode and live mode each have their own `ca_` client id. A new Standard account uses Account Links and only needs `STRIPE_SECRET_KEY`.

### Cloudflare R2

Create a private bucket. Use a separate bucket for development. Create an R2 API token with Object Read & Write scoped to that bucket.

`R2_ACCOUNT_ID` is the Cloudflare account id shown on the R2 overview and in the dashboard URL. The server calls `https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com`. `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY` are the access key id and secret shown when the token is created. The secret is shown once. `R2_BUCKET` is the bucket name.

The browser posts a Receipt to `/app/expenses/<id>/receipt` and a logo to `/app/logo`. The server writes the object. Logos are served by the app at `/app/logo` and `/p/<token>/logo`. A Receipt opens in the browser as a signed GET link that lasts five minutes. The bucket needs no CORS rule.

### Resend

Verify the sending domain in Resend, and set `EMAIL_FROM` to an address on that domain. With `RESEND_API_KEY` empty, local dev prints the sign-in code, and the subject and text of Invoice and receipt emails, in the server log. In production (`NODE_ENV=production`) a missing key throws and the email is not sent. Once the key is set, a missing `EMAIL_FROM` throws.

## Render

`render.yaml` builds with `pnpm install --frozen-lockfile --prod=false` and starts with `pnpm start` on Node 24 (`NODE_VERSION`). `--prod=false` installs devDependencies, including `drizzle-kit`, and the build leaves that `node_modules` in place. Set the secret env vars in the Render dashboard (`sync: false` in the blueprint, no values in git). Pre-deploy uses the same service environment, so `DATABASE_URL` and `TURSO_AUTH_TOKEN` are set for `drizzle.config.ts`. `ALLOW_SIGN_UP` is `false`. Leave the R2 variables unset and the app still boots; Receipt and logo upload stay hidden.

The pre-deploy command is `pnpm db:migrate` (`drizzle-kit migrate`). Render runs it for this paid web service (`plan: starter`) after the build finishes and before the new instance starts. `drizzle.config.ts` and the `drizzle/` folder are in the repo, so they are on that filesystem. The first request still calls `migrateDb()`. After pre-deploy, that call finds nothing left to apply. It also sets the connection pragmas, and it is what migrates `pnpm dev` and any deploy that does not run the pre-deploy command.

Changes in `render.yaml` apply when the service is Blueprint-managed. Otherwise set Pre-Deploy Command to `pnpm db:migrate` in the service's Settings in the Render dashboard.

If the pre-deploy command fails or times out (30 minutes), the deploy fails before the new instance starts. The service keeps serving its most recent successful deploy. A migration that committed before the failure stays in the database.

Card Payments use Stripe Connect Standard and a direct charge on the Business's Connected Account. Account Links create a new Standard account. OAuth links an existing one when `STRIPE_CONNECT_CLIENT_ID` is set. Leave `STRIPE_SECRET_KEY` empty and the pay button stays hidden. A card Payment with `fee_cents` creates one Merchant Fee Expense. A later event with the same fee does not create another. Refunds reduce the Payment and move the Invoice back to Partially Paid or Sent. The Merchant Fee amount follows the net balance-transaction fee, which usually stays put because Stripe keeps the original processing fee. A Payment above the Invoice total is kept and the Invoice shows Overpaid. Void is blocked while any Payment still has an unrefunded balance.
