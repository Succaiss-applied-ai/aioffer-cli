import { PgGatewayDatabase } from "./postgres-database.js";
import { PgAutoApplyBatchRepository, PgApplicationRunRepository, PgDeviceRegistry, PgOwnerFenceRepository } from "./postgres-repositories.js";
import { PgDeviceCommandQueue } from "./postgres-device-command-queue.js";
import { PgDevicePairingRegistry } from "./postgres-device-pairing.js";
import { PgVisionSessionRepository } from "./postgres-vision-sessions.js";
import { PgCallbackOutboxRepository } from "./postgres-callback-outbox.js";

export { PgGatewayDatabase } from "./postgres-database.js";
export { PgAutoApplyBatchRepository, PgApplicationRunRepository, PgDeviceRegistry, PgOwnerFenceRepository } from "./postgres-repositories.js";
export { PgDeviceCommandQueue } from "./postgres-device-command-queue.js";
export { PgDevicePairingRegistry } from "./postgres-device-pairing.js";
export { PgCallbackOutboxRepository } from "./postgres-callback-outbox.js";

export { PgVisionSessionRepository } from "./postgres-vision-sessions.js";

export function createPostgresGatewayRepositories(database: PgGatewayDatabase) {
  return {
    batches: new PgAutoApplyBatchRepository(database), queue: new PgDeviceCommandQueue(database),
    devices: new PgDeviceRegistry(database), pairings: new PgDevicePairingRegistry(database),
    runs: new PgApplicationRunRepository(database), ownerFence: new PgOwnerFenceRepository(database),
    callbackOutbox: new PgCallbackOutboxRepository(database), visionSessions: new PgVisionSessionRepository(database)
  };
}
