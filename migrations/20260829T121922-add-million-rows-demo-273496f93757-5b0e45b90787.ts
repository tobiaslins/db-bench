import { schema as s } from "jazz-tools";

export default s.defineMigration({
  createTables: {
    "demoRows": true,
  },
  fromHash: "273496f93757",
  toHash: "5b0e45b90787",
  from: {},
  to: {
    "demoRows": s.table({
      "ownerId": s.string(),
      "ownerIssuer": s.string(),
      "ownerSubject": s.string(),
      "ownerIndex": s.int(),
      "ordinal": s.int(),
      "payload": s.string(),
      "createdAt": s.int(),
    }),
  },
});
