import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { openPublicInvoice } from "./public-invoice";

export const loadPublicInvoice = createServerFn({ method: "GET" })
  .validator((data: { token: string }) => {
    if (!data || typeof data.token !== "string") {
      throw new Error("Missing Invoice Link");
    }
    return data;
  })
  .handler(async ({ data }) =>
    openPublicInvoice(getRequest(), data.token, { recordView: true }),
  );
