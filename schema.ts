import { schema as s } from "jazz-tools";
import { migrations } from "./migrations";

export const schema = {
  benchItems: s
    .table({
      runId: s.string(),
      ordinal: s.int(),
      value: s.string(),
      createdAt: s.int(),
    }, {})
    .indexOnly(["runId", "ordinal"])
    .compositeIndex(["runId", "ordinal"]),
  demoRows: s
    .table({
      ownerId: s.string(),
      ownerIssuer: s.string(),
      ownerSubject: s.string(),
      ownerIndex: s.int(),
      ordinal: s.int(),
      payload: s.string(),
      createdAt: s.int(),
    }, {})
    .indexOnly(["ownerId", "createdAt"]),
};

export type JazzBenchSchema = s.Schema<typeof schema>;

export const app: s.App<JazzBenchSchema> = s.defineApp(schema, { migrations });
