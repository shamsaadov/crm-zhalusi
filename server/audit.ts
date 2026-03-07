import { storage } from "./storage";

export async function logAudit(params: {
  userId: string;
  action: string;
  entityType: string;
  entityId: string;
  before?: object | null;
  after?: object | null;
  metadata?: object;
}): Promise<void> {
  try {
    const changes =
      params.before || params.after
        ? JSON.stringify({ before: params.before || null, after: params.after || null })
        : null;

    await storage.createAuditLog({
      userId: params.userId,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      changes,
      metadata: params.metadata ? JSON.stringify(params.metadata) : null,
    });
  } catch (error) {
    console.error("Audit log error:", error);
  }
}
