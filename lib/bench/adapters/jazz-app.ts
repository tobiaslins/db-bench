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
  policy.demoRows.allowRead.where({ ownerId: session.user }),
  policy.demoRows.allowInsert.where({ ownerId: session.user }),
  policy.demoRows.allowUpdate.whereOld({ ownerId: session.user }).whereNew({ ownerId: session.user }),
  policy.demoRows.allowDelete.where({ ownerId: session.user }),
]);
