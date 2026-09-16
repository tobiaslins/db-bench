import { schema as s } from "jazz-tools";

export const jazzSchema = {
  benchItems: s
    .table({
      runId: s.string(),
      ordinal: s.int(),
      value: s.string(),
      createdAt: s.int(),
    })
    .indexOnly(["runId", "ordinal"]),
  demoRows: s
    .table({
      ownerId: s.string(),
      ownerIssuer: s.string(),
      ownerSubject: s.string(),
      ownerIndex: s.int(),
      ordinal: s.int(),
      payload: s.string(),
      createdAt: s.int(),
    })
    .indexOnly(["ownerId", "createdAt"]),
};

export type JazzBenchSchema = s.Schema<typeof jazzSchema>;

export const jazzApp: s.App<JazzBenchSchema> = s.defineApp(jazzSchema);

export const jazzPermissions = s.definePermissions(jazzApp, ({ policy, session }) => [
  policy.benchItems.allowRead.always(),
  policy.benchItems.allowInsert.always(),
  policy.benchItems.allowUpdate.always(),
  policy.benchItems.allowDelete.always(),
  policy.demoRows.allowRead.where({ ownerIssuer: session.user.identity.issuer, ownerSubject: session.user.identity.subject }),
  policy.demoRows.allowInsert.where({ ownerIssuer: session.user.identity.issuer, ownerSubject: session.user.identity.subject }),
  policy.demoRows.allowUpdate
    .whereOld({ ownerIssuer: session.user.identity.issuer, ownerSubject: session.user.identity.subject })
    .whereNew({ ownerIssuer: session.user.identity.issuer, ownerSubject: session.user.identity.subject }),
  policy.demoRows.allowDelete.where({ ownerIssuer: session.user.identity.issuer, ownerSubject: session.user.identity.subject }),
]);
