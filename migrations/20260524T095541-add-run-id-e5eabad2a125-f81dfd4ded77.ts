import { schema as s } from "jazz-tools";

export default s.defineMigration({
  migrate: {
    "benchItems": {
      "runId": s.add.string({ default: "legacy" }),
    },
  },
  fromHash: "e5eabad2a125",
  toHash: "f81dfd4ded77",
  from: {
  "benchItems": s.table({
    "ordinal": s.int(),
    "value": s.string(),
    "createdAt": s.int(),
  })
},
  to: {
  "benchItems": s.table({
    "runId": s.string(),
    "ordinal": s.int(),
    "value": s.string(),
    "createdAt": s.int(),
  })
},
});
