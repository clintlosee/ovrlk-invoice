export const NO_BUSINESS_LABEL = "You are not an Owner of a Business.";

const SECTIONS = [
  "/app/clients",
  "/app/invoices",
  "/app/expenses",
  "/app/reports",
  "/app/items",
  "/app/tax-rates",
  "/app/settings",
  "/app/security",
] as const;

function normalize(pathname: string) {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

export function activeSection(pathname: string) {
  const path = normalize(pathname);
  if (path === "/app") return "/app";
  for (const href of SECTIONS) {
    if (path === href || path.startsWith(`${href}/`)) return href;
  }
  return null;
}

export function settingsGroupOpen(pathname: string, choice: boolean | null) {
  if (choice !== null) return choice;
  const section = activeSection(pathname);
  return section === "/app/settings" || section === "/app/security";
}

export function invoiceGroupOpen(pathname: string, choice: boolean | null) {
  if (choice !== null) return choice;
  const section = activeSection(pathname);
  return section === "/app/items" || section === "/app/tax-rates";
}

export function sidebarIdentity(businessName: string | null) {
  const name = businessName?.trim() ?? "";
  if (!name) return { title: NO_BUSINESS_LABEL, showOwner: false };
  return { title: name, showOwner: true };
}
