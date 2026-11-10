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
    "flex items-center gap-2 rounded-md px-3 py-2 text-sm",
    active
      ? "bg-primary font-medium text-primary-foreground"
      : "hover:bg-accent",
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
      <Icon aria-hidden className="size-4 shrink-0" />
      <span className="truncate">{children}</span>
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
    <div className="flex min-h-screen">
      {open ? (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-foreground/40 md:hidden"
          aria-label="Close menu"
          onClick={() => setOpen(false)}
        />
      ) : null}
      <aside
        id="app-sidebar"
        className={cn(
          "w-60 shrink-0 flex-col border-r border-border bg-card",
          "md:sticky md:top-0 md:flex md:h-screen",
          open
            ? "flex max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:z-40"
            : "hidden",
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
            <Item icon={LayoutDashboard}>Dashboard</Item>
          </Link>
          <Link
            to="/app/clients"
            onClick={() => setOpen(false)}
            className={itemClass(current === "/app/clients")}
            aria-current={current === "/app/clients" ? "page" : undefined}
          >
            <Item icon={Users}>Clients</Item>
          </Link>
          <div>
            <div
              className={cn(
                "flex items-center rounded-md",
                current === "/app/invoices"
                  ? "bg-primary font-medium text-primary-foreground"
                  : "hover:bg-accent",
              )}
            >
              <Link
                to="/app/invoices"
                onClick={() => setOpen(false)}
                className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-sm"
                aria-current={current === "/app/invoices" ? "page" : undefined}
              >
                <Item icon={FileText}>Invoices</Item>
              </Link>
              <button
                type="button"
                className={cn(
                  "rounded-md px-3 py-2",
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
                <Item icon={Package}>Items</Item>
              </Link>
              <Link
                to="/app/tax-rates"
                onClick={() => setOpen(false)}
                className={cn(itemClass(current === "/app/tax-rates"), "pl-9")}
                aria-current={current === "/app/tax-rates" ? "page" : undefined}
              >
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
            <Item icon={Receipt}>Expenses</Item>
          </Link>
          <Link
            to="/app/reports"
            search={{ preset: "this_month", basis: "cash", from: "", to: "" }}
            onClick={() => setOpen(false)}
            className={itemClass(current === "/app/reports")}
            aria-current={current === "/app/reports" ? "page" : undefined}
          >
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
                <Item icon={Building2}>Business</Item>
              </Link>
              <Link
                to="/app/security"
                onClick={() => setOpen(false)}
                className={cn(itemClass(current === "/app/security"), "pl-9")}
                aria-current={current === "/app/security" ? "page" : undefined}
              >
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
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="sticky top-0 z-20 flex items-center border-b-2 border-solar bg-background px-4 py-3 md:hidden">
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
        <main className="flex-1 px-6 py-8">{children}</main>
      </div>
    </div>
  );
}
