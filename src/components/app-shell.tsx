import { Link, useRouterState } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Building2,
  ChevronRight,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Percent,
  Receipt,
  Settings,
  Shield,
  Users,
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { NavHighlight, Scrim } from "@/components/motion";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import {
  activeSection,
  invoiceGroupOpen,
  settingsGroupOpen,
  sidebarIdentity,
} from "@/lib/nav";
import { cn } from "@/lib/utils";

function itemClass(active: boolean) {
  return cn(
    "relative flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors duration-300",
    active ? "font-medium text-primary-foreground" : "hover:bg-accent",
  );
}

function Item({
  icon: Icon,
  children,
}: {
  icon: LucideIcon;
  children: ReactNode;
}) {
  return (
    <>
      <Icon aria-hidden className="relative z-10 size-4 shrink-0" />
      <span className="relative z-10 truncate">{children}</span>
    </>
  );
}

function NavGroup({
  id,
  open,
  children,
}: {
  id: string;
  open: boolean;
  children: ReactNode;
}) {
  return (
    <div
      id={id}
      inert={!open}
      className={cn(
        "grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none",
        open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
      )}
    >
      <div
        className={cn(
          "overflow-hidden transition-opacity duration-200 ease-out motion-reduce:transition-none",
          open ? "opacity-100" : "opacity-0",
        )}
      >
        <div className="flex flex-col gap-1 pt-1">{children}</div>
      </div>
    </div>
  );
}

export function AppShell({
  businessName,
  children,
}: {
  businessName: string | null;
  children: ReactNode;
}) {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const [open, setOpen] = useState(false);
  const [openOn, setOpenOn] = useState(pathname);
  const [settingsChoice, setSettingsChoice] = useState<boolean | null>(null);
  const [invoicesChoice, setInvoicesChoice] = useState<boolean | null>(null);
  const [groupsOn, setGroupsOn] = useState(pathname);
  const [mobile, setMobile] = useState(false);
  if (open && openOn !== pathname) {
    setOpen(false);
    setOpenOn(pathname);
  }
  if (groupsOn !== pathname) {
    setGroupsOn(pathname);
    setSettingsChoice(null);
    setInvoicesChoice(null);
  }
  const identity = sidebarIdentity(businessName);
  const current = activeSection(pathname);
  const settingsOpen = settingsGroupOpen(pathname, settingsChoice);
  const invoicesOpen = invoiceGroupOpen(pathname, invoicesChoice);

  function openMenu() {
    setOpenOn(pathname);
    setOpen(true);
  }

  useEffect(() => {
    const query = window.matchMedia("(max-width: 767px)");
    const sync = () => setMobile(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  function signOut() {
    void authClient.signOut().then(() => {
      window.location.href = "/";
    });
  }

  return (
    <div className="flex h-dvh overflow-hidden">
      <Scrim show={open} onClose={() => setOpen(false)} />
      <aside
        id="app-sidebar"
        inert={mobile && !open ? true : undefined}
        className={cn(
          "flex h-full w-60 shrink-0 flex-col border-r border-border bg-card",
          "max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:z-40 max-md:transition-transform max-md:duration-200 max-md:ease-out motion-reduce:max-md:transition-none",
          open ? "max-md:translate-x-0" : "max-md:-translate-x-full",
        )}
      >
        <div className="h-1.5 bg-solar" aria-hidden />
        <div className="px-6 py-5">
          <p
            className={cn(
              "font-serif",
              identity.showOwner ? "truncate" : "text-sm leading-snug",
            )}
            title={identity.showOwner ? identity.title : undefined}
          >
            {identity.title}
          </p>
          {identity.showOwner ? (
            <p className="text-sm text-muted-foreground">Owner</p>
          ) : null}
        </div>
        <nav
          aria-label="App"
          className="flex flex-1 flex-col gap-1 overflow-y-auto px-3"
        >
          <Link
            to="/app"
            onClick={() => setOpen(false)}
            className={itemClass(current === "/app")}
            aria-current={current === "/app" ? "page" : undefined}
          >
            {current === "/app" ? <NavHighlight /> : null}
            <Item icon={LayoutDashboard}>Dashboard</Item>
          </Link>
          <Link
            to="/app/clients"
            onClick={() => setOpen(false)}
            className={itemClass(current === "/app/clients")}
            aria-current={current === "/app/clients" ? "page" : undefined}
          >
            {current === "/app/clients" ? <NavHighlight /> : null}
            <Item icon={Users}>Clients</Item>
          </Link>
          <div>
            <div
              className={cn(
                "relative flex items-center rounded-md transition-colors duration-300",
                current === "/app/invoices"
                  ? "font-medium text-primary-foreground"
                  : "hover:bg-accent",
              )}
            >
              {current === "/app/invoices" ? <NavHighlight /> : null}
              <Link
                to="/app/invoices"
                onClick={() => setOpen(false)}
                className="relative z-10 flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-sm"
                aria-current={current === "/app/invoices" ? "page" : undefined}
              >
                <Item icon={FileText}>Invoices</Item>
              </Link>
              <button
                type="button"
                className={cn(
                  "relative z-10 rounded-md px-3 py-2",
                  current === "/app/invoices"
                    ? "hover:bg-primary-foreground/15"
                    : "hover:bg-foreground/10",
                )}
                aria-expanded={invoicesOpen}
                aria-controls="app-invoice-links"
                aria-label="Items and Tax Rates"
                onClick={() => setInvoicesChoice(!invoicesOpen)}
              >
                <ChevronRight
                  aria-hidden
                  className={cn(
                    "size-4 shrink-0 transition-transform duration-200 ease-out motion-reduce:transition-none",
                    invoicesOpen && "rotate-90",
                  )}
                />
              </button>
            </div>
            <NavGroup id="app-invoice-links" open={invoicesOpen}>
              <Link
                to="/app/items"
                onClick={() => setOpen(false)}
                className={cn(itemClass(current === "/app/items"), "pl-9")}
                aria-current={current === "/app/items" ? "page" : undefined}
              >
                {current === "/app/items" ? <NavHighlight /> : null}
                <Item icon={Package}>Items</Item>
              </Link>
              <Link
                to="/app/tax-rates"
                onClick={() => setOpen(false)}
                className={cn(itemClass(current === "/app/tax-rates"), "pl-9")}
                aria-current={current === "/app/tax-rates" ? "page" : undefined}
              >
                {current === "/app/tax-rates" ? <NavHighlight /> : null}
                <Item icon={Percent}>Tax Rates</Item>
              </Link>
            </NavGroup>
          </div>
          <Link
            to="/app/expenses"
            search={{ from: "", to: "", category: "" }}
            onClick={() => setOpen(false)}
            className={itemClass(current === "/app/expenses")}
            aria-current={current === "/app/expenses" ? "page" : undefined}
          >
            {current === "/app/expenses" ? <NavHighlight /> : null}
            <Item icon={Receipt}>Expenses</Item>
          </Link>
          <Link
            to="/app/reports"
            search={{ preset: "this_month", basis: "cash", from: "", to: "" }}
            onClick={() => setOpen(false)}
            className={itemClass(current === "/app/reports")}
            aria-current={current === "/app/reports" ? "page" : undefined}
          >
            {current === "/app/reports" ? <NavHighlight /> : null}
            <Item icon={BarChart3}>Reports</Item>
          </Link>
          <hr className="my-2 border-solar" />
          <div>
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-accent"
              aria-expanded={settingsOpen}
              aria-controls="app-settings"
              onClick={() => setSettingsChoice(!settingsOpen)}
            >
              <Settings aria-hidden className="size-4 shrink-0" />
              <span className="flex-1 truncate">Settings</span>
              <ChevronRight
                aria-hidden
                className={cn(
                  "size-4 shrink-0 transition-transform duration-200 ease-out motion-reduce:transition-none",
                  settingsOpen && "rotate-90",
                )}
              />
            </button>
            <NavGroup id="app-settings" open={settingsOpen}>
              <Link
                to="/app/settings"
                search={{ stripe: undefined }}
                onClick={() => setOpen(false)}
                className={cn(itemClass(current === "/app/settings"), "pl-9")}
                aria-current={current === "/app/settings" ? "page" : undefined}
              >
                {current === "/app/settings" ? <NavHighlight /> : null}
                <Item icon={Building2}>Business</Item>
              </Link>
              <Link
                to="/app/security"
                onClick={() => setOpen(false)}
                className={cn(itemClass(current === "/app/security"), "pl-9")}
                aria-current={current === "/app/security" ? "page" : undefined}
              >
                {current === "/app/security" ? <NavHighlight /> : null}
                <Item icon={Shield}>Security</Item>
              </Link>
            </NavGroup>
          </div>
        </nav>
        <div className="mt-auto space-y-2 border-t border-border p-3">
          <ThemeToggle />
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-accent"
            onClick={signOut}
          >
            <LogOut aria-hidden className="size-4 shrink-0" />
            Sign out
          </button>
        </div>
      </aside>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="z-20 flex shrink-0 items-center border-b-2 border-solar bg-background px-4 py-3 md:hidden">
          <Button
            variant="ghost"
            size="sm"
            aria-label="Menu"
            aria-expanded={open}
            aria-controls="app-sidebar"
            onClick={openMenu}
          >
            <Menu aria-hidden className="size-4" />
          </Button>
        </div>
        <main
          data-scroll-restoration-id="app-main"
          className="app-main min-h-0 flex-1 overflow-y-auto px-6 py-8"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
