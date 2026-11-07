import { schema as s } from "jazz-tools";
import { app } from "./schema";

export const permissions = s.definePermissions(app, ({ policy, session }) => [
  policy.benchItems.allowRead.always(),
  policy.benchItems.allowInsert.always(),
  policy.benchItems.allowUpdate.always(),
  policy.benchItems.allowDelete.always(),
  policy.demoRows.allowRead.where({ ownerSubject: session.identity.subject }),
  policy.demoRows.allowInsert.where({ ownerSubject: session.identity.subject }),
  policy.demoRows.allowUpdate
    .whereOld({ ownerSubject: session.identity.subject })
    .whereNew({ ownerSubject: session.identity.subject }),
  policy.demoRows.allowDelete.where({ ownerSubject: session.identity.subject }),
]);

export default permissions;
