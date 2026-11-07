import "server-only";

import { jazz } from "../jazz.server";
import { DEMO_USER_HEADER, demoOwnerSubject } from "./million-rows-demo";

const accountPreparations = new Map<string, Promise<void>>();

export async function ensureDemoOwnerAccount(ownerIndex: number) {
  const userId = demoOwnerSubject(ownerIndex);
  let preparation = accountPreparations.get(userId);

  if (!preparation) {
    preparation = jazz.createAccountFor(userId).then(() => undefined);
    accountPreparations.set(userId, preparation);
    preparation.catch(() => accountPreparations.delete(userId));
  }

  await preparation;
}

export async function getDemoOwnerDb(request: Request, ownerIndex: number) {
  const userId = demoOwnerSubject(ownerIndex);
  await ensureDemoOwnerAccount(ownerIndex);

  const headers = new Headers(request.headers);
  headers.set(DEMO_USER_HEADER, userId);

  return jazz.forReqUser(new Request(request, { headers }));
}
