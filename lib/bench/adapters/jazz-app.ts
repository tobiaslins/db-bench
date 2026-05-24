import { schema as s } from "jazz-tools";

export const jazzSchema = {
  benchItems: s
    .table({
      ordinal: s.int(),
      value: s.string(),
      createdAt: s.int(),
    })
    .indexOnly(["ordinal"]),
};

export type JazzBenchSchema = s.Schema<typeof jazzSchema>;

export const jazzApp: s.App<JazzBenchSchema> = s.defineApp(jazzSchema);

export const jazzPermissions = s.definePermissions(jazzApp, ({ policy }) => [
  policy.benchItems.allowRead.always(),
  policy.benchItems.allowInsert.always(),
  policy.benchItems.allowUpdate.always(),
  policy.benchItems.allowDelete.always(),
]);
