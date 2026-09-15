import {
  createSession, createBootstrapSession, digest, emptyStore, exchangeBootstrapFromStore, exchangeFromStore,
  normalizePairingCode, publicSession,
  type CreateDevicePairingInput, type DeviceAuthStore, type DeviceBootstrapSession, type DeviceCredential,
  type DevicePairingRegistry, type DevicePairingSession, type ExchangeDevicePairingInput
} from "./device-pairing.js";
import { gatewayOwnerKey, PgGatewayDatabase } from "./postgres-database.js";

/** Reuses the established authentication rules on an indexed, bounded set of rows. */
export class PgDevicePairingRegistry implements DevicePairingRegistry {
  constructor(private readonly database: PgGatewayDatabase, private readonly now: () => Date = () => new Date()) {}

  private async savePairing(session: DevicePairingSession): Promise<void> {
    await this.database.query(`INSERT INTO recruiting_gateway.pairing_sessions (pairing_id,tenant_id,user_id,code_hash,consumed_at,data)
      VALUES ($1,$2,$3,$4,$5,$6::jsonb) ON CONFLICT (pairing_id) DO UPDATE SET consumed_at=EXCLUDED.consumed_at,data=EXCLUDED.data`,
      [session.pairingId, session.tenantId, session.userId, session.codeHash, session.consumedAt, JSON.stringify(session)]);
  }

  private async saveBootstrap(session: DeviceBootstrapSession): Promise<void> {
    await this.database.query(`INSERT INTO recruiting_gateway.bootstrap_sessions (bootstrap_id,tenant_id,user_id,token_hash,consumed_at,data)
      VALUES ($1,$2,$3,$4,$5,$6::jsonb) ON CONFLICT (bootstrap_id) DO UPDATE SET consumed_at=EXCLUDED.consumed_at,data=EXCLUDED.data`,
      [session.bootstrapId, session.tenantId, session.userId, session.tokenHash, session.consumedAt, JSON.stringify(session)]);
  }

  private async saveCredential(credential: DeviceCredential): Promise<void> {
    await this.database.query(`INSERT INTO recruiting_gateway.credentials (credential_id,tenant_id,user_id,device_id,token_hash,revoked_at,data)
      VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb) ON CONFLICT (tenant_id,device_id) DO UPDATE SET
      credential_id=EXCLUDED.credential_id,user_id=EXCLUDED.user_id,token_hash=EXCLUDED.token_hash,revoked_at=EXCLUDED.revoked_at,data=EXCLUDED.data`,
      [credential.credentialId, credential.tenantId, credential.userId, credential.deviceId, credential.tokenHash, credential.revokedAt, JSON.stringify(credential)]);
  }

  async importAuthStore(store: DeviceAuthStore): Promise<void> {
    for (const session of store.sessions) await this.savePairing(session);
    for (const session of store.bootstrapSessions ?? []) await this.saveBootstrap(session);
    for (const credential of store.credentials) await this.saveCredential(credential);
  }

  async create(input: CreateDevicePairingInput) {
    const created = createSession(input, this.now());
    await this.database.transaction(gatewayOwnerKey(created.session.tenantId, created.session.userId), () => this.savePairing(created.session));
    return { session: publicSession(created.session), pairingCode: created.pairingCode };
  }

  async createBootstrap(input: Pick<CreateDevicePairingInput, "tenantId" | "userId" | "expiresInSeconds">) {
    const created = createBootstrapSession(input, this.now());
    await this.database.transaction(gatewayOwnerKey(created.session.tenantId, created.session.userId), () => this.saveBootstrap(created.session));
    const { tokenHash: _tokenHash, ...session } = created.session;
    return { session, bootstrapToken: created.bootstrapToken };
  }

  private async deviceLocks<T>(tenantId: string, deviceIds: string[], work: () => Promise<T>): Promise<T> {
    const ids = [...new Set(deviceIds.filter(Boolean))].sort();
    const next = (index: number): Promise<T> => index === ids.length ? work()
      : this.database.transaction(`pairing-device:${JSON.stringify([tenantId, ids[index]])}`, () => next(index + 1));
    return next(0);
  }

  private async deviceCredentials(tenantId: string, deviceIds: string[]): Promise<DeviceCredential[]> {
    return (await this.database.query<{ data: DeviceCredential }>("SELECT data FROM recruiting_gateway.credentials WHERE tenant_id=$1 AND device_id=ANY($2::text[])", [tenantId, deviceIds])).rows.map((row) => row.data);
  }

  async exchange(input: ExchangeDevicePairingInput) {
    const codeHash = digest(normalizePairingCode(input.pairingCode));
    const select = async () => (await this.database.query<{ data: DevicePairingSession }>("SELECT data FROM recruiting_gateway.pairing_sessions WHERE code_hash=$1", [codeHash])).rows[0]?.data;
    const initial = await select();
    if (!initial) throw new Error("配对码无效");
    return this.database.transaction(gatewayOwnerKey(initial.tenantId, initial.userId), () =>
      this.deviceLocks(initial.tenantId, [input.deviceId.trim()], async () => {
        const session = await select();
        if (!session) throw new Error("配对码无效");
        const store = emptyStore();
        store.sessions = [session];
        store.credentials = await this.deviceCredentials(session.tenantId, [input.deviceId.trim()]);
        const result = exchangeFromStore(store, input, this.now());
        await this.savePairing(session);
        for (const credential of store.credentials) await this.saveCredential(credential);
        return result;
      }));
  }

  async exchangeBootstrap(input: { bootstrapToken: string; deviceId: string; previousDeviceId?: string; deviceName?: string }) {
    const tokenHash = digest(input.bootstrapToken.trim());
    const select = async () => (await this.database.query<{ data: DeviceBootstrapSession }>("SELECT data FROM recruiting_gateway.bootstrap_sessions WHERE token_hash=$1", [tokenHash])).rows[0]?.data;
    const initial = await select();
    if (!initial) throw new Error("设备绑定凭证无效");
    return this.database.transaction(gatewayOwnerKey(initial.tenantId, initial.userId), () =>
      this.deviceLocks(initial.tenantId, [input.deviceId.trim(), input.previousDeviceId?.trim() ?? ""], async () => {
        const session = await select();
        if (!session) throw new Error("设备绑定凭证无效");
        const store = emptyStore();
        store.bootstrapSessions = [session];
        store.credentials = await this.deviceCredentials(session.tenantId, [input.deviceId.trim(), input.previousDeviceId?.trim() ?? ""]);
        const result = exchangeBootstrapFromStore(store, input, this.now());
        await this.saveBootstrap(session);
        for (const credential of store.credentials) await this.saveCredential(credential);
        return result;
      }));
  }

  async authenticate(deviceToken: string): Promise<DeviceCredential | null> {
    if (!deviceToken.trim()) return null;
    return (await this.database.query<{ data: DeviceCredential }>(
      "SELECT data FROM recruiting_gateway.credentials WHERE token_hash=$1 AND revoked_at IS NULL", [digest(deviceToken.trim())])).rows[0]?.data ?? null;
  }

  async terminateOwner(tenantId: string, userId: string) {
    return this.database.transaction(gatewayOwnerKey(tenantId, userId), async () => {
      const timestamp = this.now().toISOString();
      const credentials = await this.database.query(`UPDATE recruiting_gateway.credentials SET revoked_at=($3::text)::timestamptz,
        data=jsonb_set(data,'{revokedAt}',to_jsonb($3::text)) WHERE tenant_id=$1 AND user_id=$2 AND revoked_at IS NULL`, [tenantId, userId, timestamp]);
      const pairings = await this.database.query("DELETE FROM recruiting_gateway.pairing_sessions WHERE tenant_id=$1 AND user_id=$2 AND consumed_at IS NULL", [tenantId, userId]);
      const bootstraps = await this.database.query("DELETE FROM recruiting_gateway.bootstrap_sessions WHERE tenant_id=$1 AND user_id=$2 AND consumed_at IS NULL", [tenantId, userId]);
      return { credentials: credentials.rowCount ?? 0, pairingSessions: pairings.rowCount ?? 0, bootstrapSessions: bootstraps.rowCount ?? 0 };
    });
  }
}
