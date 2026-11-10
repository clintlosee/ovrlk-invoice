import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

export const landingCopy = {
  eyebrow: "OVRLK Labs",
  product: "Invoicer",
  headline: "Invoices, expenses, and the books.",
  lede: "For the Business you run. A Client opens a private link and never signs in. The next Business stays on its own books.",
  featuresTitle: "The work, in one place.",
  featuresSub: "Invoices, expenses, and reports share one set of books.",
  features: [
    {
      title: "Invoices",
      body: "A numbered invoice. Locked once you send it. Corrected by voiding and sending another.",
      place: "wide",
    },
    {
      title: "Invoice link",
      body: "A long private link. The Client can view it and pay. They never sign in.",
      place: "navy",
    },
    {
      title: "Expenses",
      body: "Money the Business spent, with a category and a receipt when you have one.",
      place: "quarter",
    },
    {
      title: "Reports",
      body: "Cash-basis profit, what is still outstanding, and who has paid.",
      place: "chart",
    },
    {
      title: "Items",
      body: "Saved prices and tax rates, ready for the next invoice.",
      place: "solar",
    },
  ],
  wayLead: "Your books",
  wayAccent: "simplified.",
  ways: [
    {
      title: "Your Business",
      body: "You sign in. You send the invoices, record the expenses, and get your reports.",
    },
    {
      title: "Your Clients",
      body: "Private links. No accounts, and nothing else to remember. Just pay and go.",
    },
    {
      title: "Kept simple",
      body: "The invoice, the expense, and the report. Nothing else to set up.",
    },
  ],
  signedOut: { label: "Sign in", to: "/sign-in" },
  signedIn: { label: "Open the Business", to: "/app" },
  signInArt: "The books, kept here.",
} as const;

const featureSpan = {
  wide: "bg-secondary md:col-span-7",
  navy: "bg-primary text-primary-foreground md:col-span-5",
  quarter: "bg-card md:col-span-4",
  chart: "bg-card md:col-span-5",
  solar: "bg-solar/15 md:col-span-3",
} as const;

export function Landing({ signedIn }: { signedIn: boolean }) {
  const action = signedIn ? landingCopy.signedIn : landingCopy.signedOut;
  return (
    <div className="bg-background text-foreground">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex h-18 w-[min(72rem,calc(100%-3rem))] items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5 font-semibold">
            <Mark />
            <span>
              {landingCopy.product}
              <small className="block text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
                {landingCopy.eyebrow}
              </small>
            </span>
          </Link>
          <Button asChild variant="outline">
            <Link to={action.to}>{action.label}</Link>
          </Button>
        </div>
      </header>

      <section className="bg-[radial-gradient(880px_460px_at_88%_8%,var(--secondary),transparent_68%)]">
        <div className="mx-auto grid w-[min(72rem,calc(100%-3rem))] items-center gap-10 py-16 lg:grid-cols-2 lg:py-24">
          <div>
            <p className="text-xs font-semibold tracking-[0.16em] text-solar-ink uppercase">
              {landingCopy.eyebrow}
            </p>
            <h1 className="mt-3 font-serif text-5xl tracking-tight sm:text-6xl">
              {landingCopy.headline}
            </h1>
            <p className="mt-5 max-w-md text-lg text-muted-foreground">
              {landingCopy.lede}
            </p>
            <Button asChild className="mt-7">
              <Link to={action.to}>{action.label}</Link>
            </Button>
          </div>
          <HeroCluster />
        </div>
      </section>

      <section className="mx-auto w-[min(72rem,calc(100%-3rem))] pb-24">
        <h2 className="text-center font-serif text-4xl tracking-tight sm:text-5xl">
          {landingCopy.featuresTitle}
        </h2>
        <div className="mx-auto mt-4 h-0.5 w-16 bg-solar" />
        <p className="mx-auto mt-4 max-w-md text-center text-muted-foreground">
          {landingCopy.featuresSub}
        </p>
        <div className="mt-8 grid gap-3.5 md:grid-cols-12">
          {landingCopy.features.map((feature) => (
            <article
              key={feature.title}
              className={`flex min-h-52 flex-col rounded-2xl border border-card-line p-6 ${featureSpan[feature.place]}`}
            >
              {feature.place === "wide" ? (
                <div className="grid items-center gap-4 lg:grid-cols-2">
                  <FeatureText feature={feature} />
                  <SampleInvoice />
                </div>
              ) : (
                <FeatureText feature={feature} />
              )}
              {feature.place === "navy" ? (
                <p className="mt-auto rounded-lg bg-primary-foreground/15 px-3 py-2.5 text-sm">
                  /p/ · · · · · · · ·
                </p>
              ) : null}
              {feature.place === "chart" ? <ReportBars /> : null}
            </article>
          ))}
        </div>
      </section>

      <section className="bg-secondary pb-20">
        <div className="grid bg-background lg:min-h-128 lg:grid-cols-[0.85fr_1.15fr]">
          <div className="flex items-end px-6 pt-16 pb-10 lg:px-[max(1.5rem,calc((100vw-72rem)/2))] lg:pt-20 lg:pb-36">
            <h2 className="font-serif text-6xl tracking-tight sm:text-7xl">
              {landingCopy.wayLead}
              <br />
              <span className="text-solar">{landingCopy.wayAccent}</span>
            </h2>
          </div>
          <div className="relative min-h-80 lg:min-h-full">
            <img
              src="/studio-prints.jpg"
              alt="Photographic prints, a brass ruler, and gloves on a studio table"
              className="absolute inset-0 size-full object-cover object-[center_62%]"
            />
          </div>
        </div>
        <div className="relative z-10 mx-auto -mt-8 w-[min(72rem,calc(100%-3rem))] lg:-mt-24">
          <div className="grid divide-y divide-primary-foreground/20 overflow-hidden rounded-2xl bg-primary-hover text-primary-foreground md:grid-cols-3 md:divide-x md:divide-y-0">
            {landingCopy.ways.map((way) => (
              <article key={way.title} className="px-7 py-8">
                <h3 className="font-serif text-2xl">{way.title}</h3>
                <p className="mt-2 text-sm text-primary-foreground/80">
                  {way.body}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <footer className="mx-auto flex w-[min(72rem,calc(100%-3rem))] gap-4 py-10 text-sm text-muted-foreground">
        <Link to="/terms">Terms</Link>
        <Link to="/privacy">Privacy</Link>
      </footer>
    </div>
  );
}

function Mark() {
  return (
    <span className="grid size-8 place-items-center rounded-lg bg-solar font-serif text-xl leading-none text-solar-foreground">
      I
    </span>
  );
}

function FeatureText({
  feature,
}: {
  feature: (typeof landingCopy.features)[number];
}) {
  const onNavy = feature.place === "navy";
  return (
    <div>
      <h3 className="font-serif text-3xl">{feature.title}</h3>
      <p
        className={`mt-2 text-sm ${onNavy ? "text-primary-foreground/80" : "text-muted-foreground"}`}
      >
        {feature.body}
      </p>
    </div>
  );
}

function SampleInvoice() {
  return (
    <div className="rounded-xl border border-card-line bg-card p-4 shadow-card">
      <div className="flex items-baseline justify-between font-serif text-lg">
        <span>Invoice</span>
        <span className="font-sans text-xs tracking-wide text-solar-ink">
          0000572
        </span>
      </div>
      <p className="text-xs text-muted-foreground">North Studio</p>
      <div className="my-3 h-0.5 bg-solar" />
      <InvoiceRow label="Framed print" amount="240.00" />
      <InvoiceRow label="Tax" amount="17.16" />
      <InvoiceRow label="Due" amount="$257.16" strong />
    </div>
  );
}

function InvoiceRow({
  label,
  amount,
  strong = false,
}: {
  label: string;
  amount: string;
  strong?: boolean;
}) {
  return (
    <div
      className={`mt-1.5 flex justify-between text-sm ${strong ? "font-semibold text-foreground" : "text-muted-foreground"}`}
    >
      <span>{label}</span>
      <span>{amount}</span>
    </div>
  );
}

function ReportBars() {
  const heights = ["h-[40%]", "h-[62%]", "h-[48%]", "h-[84%]", "h-[70%]"];
  return (
    <div className="mt-auto flex h-20 items-end gap-2 pt-6" aria-hidden>
      {heights.map((height, index) => (
        <i
          key={height}
          className={`block w-4 rounded-t ${index === 3 ? "bg-solar" : "bg-primary"} ${height}`}
        />
      ))}
    </div>
  );
}

function HeroCluster() {
  return (
    <div aria-hidden>
      <div className="sm:hidden">
        <SampleInvoice />
      </div>
      <div className="relative hidden h-112 overflow-hidden sm:block">
        <div className="absolute top-16 left-1 w-44 -rotate-6 rounded-xl border border-border bg-card p-4 shadow-card sm:top-20 sm:left-2 sm:w-48">
          <p className="text-[11px] tracking-[0.12em] text-muted-foreground uppercase">
            Expense
          </p>
          <p className="mt-2 font-serif text-3xl">$48.00</p>
          <p className="text-sm text-muted-foreground">
            Paper and ink · Printing
          </p>
        </div>
        <div className="absolute top-4 right-2 w-56 rounded-xl border border-card-line bg-card p-4 shadow-card sm:top-6 sm:right-8 sm:w-72">
          <div className="flex items-baseline justify-between font-serif text-lg">
            <span>Invoice</span>
            <span className="font-sans text-xs tracking-wide text-solar-ink">
              0000571
            </span>
          </div>
          <div className="my-3 h-0.5 bg-solar" />
          <InvoiceRow label="Large print, 24×36" amount="180.00" />
          <InvoiceRow label="Shipping" amount="18.00" />
          <div className="my-3 h-0.5 bg-solar" />
          <InvoiceRow label="Total" amount="$198.00" strong />
          <span className="mt-3 inline-block rounded-full bg-status-sent-bg px-2.5 py-1 text-xs font-semibold text-status-sent-foreground">
            Sent
          </span>
        </div>
        <div className="absolute right-0 bottom-2 w-36 rounded-xl bg-primary p-3.5 text-primary-foreground shadow-card sm:bottom-6 sm:w-40">
          <p className="text-sm">Kept this quarter</p>
          <div className="mt-3 flex h-16 items-end gap-1.5">
            <i className="block h-[42%] flex-1 rounded-t bg-primary-foreground/80" />
            <i className="block h-[68%] flex-1 rounded-t bg-primary-foreground/80" />
            <i className="block h-[54%] flex-1 rounded-t bg-primary-foreground/80" />
            <i className="block h-[86%] flex-1 rounded-t bg-solar" />
          </div>
        </div>
      </div>
    </div>
  );
}
