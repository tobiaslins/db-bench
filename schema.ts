import { schema as s } from "jazz-tools";

export const schema = s.defineSchema({
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
});

const { definePermissions, session } = schema;
const ownsDemoRow = { ownerSubject: session.identity.subject };

export const permissions = definePermissions({
  benchItems: { read: true, insert: true, update: true, delete: true },
  demoRows: {
    read: ownsDemoRow,
    insert: ownsDemoRow,
    update: ownsDemoRow,
    delete: ownsDemoRow,
  },
});
