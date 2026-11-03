import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { signUpsOpen } from "../lib/config";
import { clientIp } from "./rate-limit";
import { type RegisterInput, registerOwner } from "./register-owner";

export type { RegisterInput, RegisterResult } from "./register-owner";

export const getSignUpOpen = createServerFn({ method: "GET" }).handler(() => {
  return { open: signUpsOpen() };
});

export const registerOwnerFn = createServerFn({ method: "POST" })
  .validator((data: RegisterInput) => data)
  .handler(async ({ data }) => {
    const request = getRequest();
    return registerOwner(data, request.headers, clientIp(request));
  });
