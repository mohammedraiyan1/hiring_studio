import { auditEvents } from '../store/index.js';
import { ORGANIZATION_ID } from '../middleware/access.js';

export async function recordAuditEvent({ actor, action, resourceType, resourceId = null, metadata = {} }) {
  await auditEvents.insert({
    organizationId: ORGANIZATION_ID,
    actorId: actor.id,
    actorEmail: actor.email,
    action,
    resourceType,
    resourceId,
    metadata,
    createdAt: new Date().toISOString(),
  });
}
