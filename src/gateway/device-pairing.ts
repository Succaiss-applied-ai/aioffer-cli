import { createHash, randomBytes, randomInt, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const PAIRING_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

export interface DevicePairingSession {
  schemaVersion: "device-pairing-session.v1";
  pairingId: string;
  tenantId: string;
  userId: string;
  deviceName: string | null;
  codeHash: string;
  createdAt: string;
  expiresAt: string;
  consumedAt: string | null;
  pairedDeviceId: string | null;
}

export interface DeviceCredential {
  schemaVersion: "device-credential.v1";
  credentialId: string;
  tenantId: string;
  userId: string;
  deviceId: string;
  tokenHash: string;
  createdAt: string;
  revokedAt: string | null;
}

export interface DeviceBootstrapSession {
  schemaVersion: "device-bootstrap-session.v1";
  bootstrapId: string;
  tenantId: string;
  userId: string;
  tokenHash: string;
  createdAt: string;
  expiresAt: string;
  consumedAt: string | null;
  pairedDeviceId: string | null;
}

export interface CreateDevicePairingInput {
  tenantId: string;
  userId: string;
  deviceName?: string;
  expiresInSeconds?: number;
}

export interface DevicePairingCreation {
  session: Omit<DevicePairingSession, "codeHash">;
  pairingCode: string;
}

export interface ExchangeDevicePairingInput {
  pairingCode: string;
  deviceId: string;
  deviceName?: string;
}

export interface DevicePairingExchange {
  schemaVersion: "device-pairing-exchange.v1";
  tenantId: string;
  userId: string;
  deviceId: string;
  deviceName: string;
  deviceToken: string;
  pairedAt: string;
}

export interface DevicePairingRegistry {
  create(input: CreateDevicePairingInput): Promise<DevicePairingCreation>;
  exchange(input: ExchangeDevicePairingInput): Promise<DevicePairingExchange>;
  createBootstrap(input: Pick<CreateDevicePairingInput, "tenantId" | "userId" | "expiresInSeconds">): Promise<{
    session: Omit<DeviceBootstrapSession, "tokenHash">;
    bootstrapToken: string;
  }>;
  exchangeBootstrap(input: {
    bootstrapToken: string;
    deviceId: string;
    previousDeviceId?: string;
    deviceName?: string;
  }): Promise<DevicePairingExchange>;
  authenticate(deviceToken: string): Promise<DeviceCredential | null>;
  terminateOwner(tenantId: string, userId: string): Promise<{
    credentials: number;
    pairingSessions: number;
    bootstrapSessions: number;
  }>;
}

export interface DeviceAuthStore {
  schemaVersion: "device-auth-store.v1";
  sessions: DevicePairingSession[];
  bootstrapSessions: DeviceBootstrapSession[];
  credentials: DeviceCredential[];
}

export function emptyStore(): DeviceAuthStore {
  return {
    schemaVersion: "device-auth-store.v1",
    sessions: [],
    bootstrapSessions: [],
    credentials: []
  };
}

export function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function normalizePairingCode(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function generatePairingCode(): string {
  let raw = "";
  for (let index = 0; index < 12; index += 1) {
    raw += PAIRING_ALPHABET[randomInt(PAIRING_ALPHABET.length)];
  }
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
}

export function publicSession(session: DevicePairingSession): Omit<DevicePairingSession, "codeHash"> {
  const { codeHash: _codeHash, ...value } = session;
  return structuredClone(value);
}

export function createSession(
  input: CreateDevicePairingInput,
  now: Date
): { session: DevicePairingSession; pairingCode: string } {
  if (!input.tenantId.trim() || !input.userId.trim()) throw new Error("缺少配对租户或用户标识");
  const requested = input.expiresInSeconds ?? 600;
  const expiresInSeconds = Math.min(Math.max(requested, 120), 1800);
  const pairingCode = generatePairingCode();
  return {
    pairingCode,
    session: {
      schemaVersion: "device-pairing-session.v1",
      pairingId: randomUUID(),
      tenantId: input.tenantId.trim(),
      userId: input.userId.trim(),
      deviceName: input.deviceName?.trim() || null,
      codeHash: digest(normalizePairingCode(pairingCode)),
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + expiresInSeconds * 1000).toISOString(),
      consumedAt: null,
      pairedDeviceId: null
    }
  };
}

export function exchangeFromStore(
  store: DeviceAuthStore,
  input: ExchangeDevicePairingInput,
  now: Date
): DevicePairingExchange {
  const code = normalizePairingCode(input.pairingCode);
  const deviceId = input.deviceId.trim();
  if (!code || !deviceId) throw new Error("缺少 pairingCode 或 deviceId");
  const session = store.sessions.find((item) => item.codeHash === digest(code));
  if (!session) throw new Error("配对码无效");
  if (session.consumedAt) throw new Error("配对码已使用，请在 AI 会话中重新生成");
  if (Date.parse(session.expiresAt) <= now.getTime()) throw new Error("配对码已过期，请在 AI 会话中重新生成");

  const deviceToken = `rpa_${randomBytes(32).toString("base64url")}`;
  const credential: DeviceCredential = {
    schemaVersion: "device-credential.v1",
    credentialId: randomUUID(),
    tenantId: session.tenantId,
    userId: session.userId,
    deviceId,
    tokenHash: digest(deviceToken),
    createdAt: now.toISOString(),
    revokedAt: null
  };
  store.credentials = store.credentials.filter((item) => !(item.tenantId === credential.tenantId &&
    item.deviceId === credential.deviceId));
  store.credentials.push(credential);
  session.consumedAt = now.toISOString();
  session.pairedDeviceId = deviceId;
  return {
    schemaVersion: "device-pairing-exchange.v1",
    tenantId: credential.tenantId,
    userId: credential.userId,
    deviceId,
    deviceName: input.deviceName?.trim() || session.deviceName || deviceId,
    deviceToken,
    pairedAt: now.toISOString()
  };
}

function authenticateFromStore(store: DeviceAuthStore, deviceToken: string): DeviceCredential | null {
  const token = deviceToken.trim();
  if (!token) return null;
  const credential = store.credentials.find((item) => item.tokenHash === digest(token) && !item.revokedAt);
  return credential ? structuredClone(credential) : null;
}

export function createBootstrapSession(
  input: Pick<CreateDevicePairingInput, "tenantId" | "userId" | "expiresInSeconds">,
  now: Date
) {
  if (!input.tenantId.trim() || !input.userId.trim()) throw new Error("缺少绑定租户或用户标识");
  const requested = input.expiresInSeconds ?? 120;
  const expiresInSeconds = Math.min(Math.max(requested, 60), 300);
  const bootstrapToken = `boot_${randomBytes(32).toString("base64url")}`;
  const session: DeviceBootstrapSession = {
    schemaVersion: "device-bootstrap-session.v1",
    bootstrapId: randomUUID(),
    tenantId: input.tenantId.trim(),
    userId: input.userId.trim(),
    tokenHash: digest(bootstrapToken),
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + expiresInSeconds * 1000).toISOString(),
    consumedAt: null,
    pairedDeviceId: null
  };
  return { bootstrapToken, session };
}

export function exchangeBootstrapFromStore(
  store: DeviceAuthStore,
  input: { bootstrapToken: string; deviceId: string; previousDeviceId?: string; deviceName?: string },
  now: Date
): DevicePairingExchange {
  const token = input.bootstrapToken.trim();
  const requestedDeviceId = input.deviceId.trim();
  if (!token || !requestedDeviceId) throw new Error("缺少 bootstrapToken 或 deviceId");
  const session = (store.bootstrapSessions ?? []).find((item) => item.tokenHash === digest(token));
  if (!session) throw new Error("设备绑定凭证无效");
  if (session.consumedAt) throw new Error("设备绑定凭证已使用");
  if (Date.parse(session.expiresAt) <= now.getTime()) throw new Error("设备绑定凭证已过期");
  const previousDeviceId = input.previousDeviceId?.trim() ?? "";
  const previousCredential = previousDeviceId
    ? store.credentials.find((item) => item.tenantId === session.tenantId &&
        item.deviceId === previousDeviceId && !item.revokedAt)
    : undefined;
  const sameOwnerRefresh = previousCredential?.userId === session.userId;
  const deviceId = sameOwnerRefresh ? previousDeviceId : requestedDeviceId;
  if (previousCredential && !sameOwnerRefresh) previousCredential.revokedAt = now.toISOString();
  const deviceToken = `rpa_${randomBytes(32).toString("base64url")}`;
  const credential: DeviceCredential = {
    schemaVersion: "device-credential.v1",
    credentialId: randomUUID(),
    tenantId: session.tenantId,
    userId: session.userId,
    deviceId,
    tokenHash: digest(deviceToken),
    createdAt: now.toISOString(),
    revokedAt: null
  };
  store.credentials = store.credentials.filter((item) => !(item.tenantId === credential.tenantId &&
    item.deviceId === credential.deviceId));
  store.credentials.push(credential);
  session.consumedAt = now.toISOString();
  session.pairedDeviceId = deviceId;
  return {
    schemaVersion: "device-pairing-exchange.v1",
    tenantId: credential.tenantId,
    userId: credential.userId,
    deviceId,
    deviceName: input.deviceName?.trim() || deviceId,
    deviceToken,
    pairedAt: now.toISOString()
  };
}

export class MemoryDevicePairingRegistry implements DevicePairingRegistry {
  private readonly store = emptyStore();

  constructor(private readonly now: () => Date = () => new Date()) {}

  async create(input: CreateDevicePairingInput): Promise<DevicePairingCreation> {
    const created = createSession(input, this.now());
    this.store.sessions.push(created.session);
    return { session: publicSession(created.session), pairingCode: created.pairingCode };
  }

  async exchange(input: ExchangeDevicePairingInput): Promise<DevicePairingExchange> {
    return structuredClone(exchangeFromStore(this.store, input, this.now()));
  }

  async createBootstrap(input: Pick<CreateDevicePairingInput, "tenantId" | "userId" | "expiresInSeconds">) {
    const created = createBootstrapSession(input, this.now());
    this.store.bootstrapSessions.push(created.session);
    const { tokenHash: _tokenHash, ...session } = created.session;
    return { session, bootstrapToken: created.bootstrapToken };
  }

  async exchangeBootstrap(input: {
    bootstrapToken: string;
    deviceId: string;
    previousDeviceId?: string;
    deviceName?: string;
  }) {
    return structuredClone(exchangeBootstrapFromStore(this.store, input, this.now()));
  }

  async authenticate(deviceToken: string): Promise<DeviceCredential | null> {
    return authenticateFromStore(this.store, deviceToken);
  }

  async terminateOwner(tenantId: string, userId: string) {
    const now = this.now().toISOString();
    let credentials = 0;
    let pairingSessions = 0;
    let bootstrapSessions = 0;
    for (const credential of this.store.credentials) {
      if (credential.tenantId !== tenantId || credential.userId !== userId || credential.revokedAt) continue;
      credential.revokedAt = now;
      credentials += 1;
    }
    this.store.sessions = this.store.sessions.filter((session) => {
      const terminate = session.tenantId === tenantId && session.userId === userId && !session.consumedAt;
      if (terminate) pairingSessions += 1;
      return !terminate;
    });
    const retained = this.store.bootstrapSessions.filter((session) => {
      const terminate = session.tenantId === tenantId && session.userId === userId && !session.consumedAt;
      if (terminate) bootstrapSessions += 1;
      return !terminate;
    });
    this.store.bootstrapSessions = retained;
    return { credentials, pairingSessions, bootstrapSessions };
  }
}

export class JsonDevicePairingRegistry implements DevicePairingRegistry {
  private operation = Promise.resolve();

  constructor(
    private readonly file: string,
    private readonly now: () => Date = () => new Date()
  ) {}

  private async load(): Promise<DeviceAuthStore> {
    try {
      const store = JSON.parse(await readFile(this.file, "utf8")) as DeviceAuthStore;
      return { ...store, bootstrapSessions: store.bootstrapSessions ?? [] };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyStore();
      throw error;
    }
  }

  private async save(store: DeviceAuthStore): Promise<void> {
    await mkdir(dirname(this.file), { recursive: true });
    const temporary = `${this.file}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(temporary, `${JSON.stringify(store, null, 2)}\n`, { mode: 0o600 });
    await rename(temporary, this.file);
  }

  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.operation.then(operation, operation);
    this.operation = next.then(() => undefined, () => undefined);
    return next;
  }

  async create(input: CreateDevicePairingInput): Promise<DevicePairingCreation> {
    return this.serialize(async () => {
      const store = await this.load();
      const created = createSession(input, this.now());
      store.sessions = store.sessions.filter((item) => Date.parse(item.expiresAt) > this.now().getTime() || item.consumedAt);
      store.sessions.push(created.session);
      await this.save(store);
      return { session: publicSession(created.session), pairingCode: created.pairingCode };
    });
  }

  async exchange(input: ExchangeDevicePairingInput): Promise<DevicePairingExchange> {
    return this.serialize(async () => {
      const store = await this.load();
      const result = exchangeFromStore(store, input, this.now());
      await this.save(store);
      return structuredClone(result);
    });
  }

  async createBootstrap(input: Pick<CreateDevicePairingInput, "tenantId" | "userId" | "expiresInSeconds">) {
    return this.serialize(async () => {
      const store = await this.load();
      const created = createBootstrapSession(input, this.now());
      store.bootstrapSessions = store.bootstrapSessions.filter((item) =>
        Date.parse(item.expiresAt) > this.now().getTime() || Boolean(item.consumedAt)
      );
      store.bootstrapSessions.push(created.session);
      await this.save(store);
      const { tokenHash: _tokenHash, ...session } = created.session;
      return { session, bootstrapToken: created.bootstrapToken };
    });
  }

  async exchangeBootstrap(input: {
    bootstrapToken: string;
    deviceId: string;
    previousDeviceId?: string;
    deviceName?: string;
  }) {
    return this.serialize(async () => {
      const store = await this.load();
      const result = exchangeBootstrapFromStore(store, input, this.now());
      await this.save(store);
      return structuredClone(result);
    });
  }

  async authenticate(deviceToken: string): Promise<DeviceCredential | null> {
    return authenticateFromStore(await this.load(), deviceToken);
  }

  async terminateOwner(tenantId: string, userId: string) {
    return this.serialize(async () => {
      const store = await this.load();
      const now = this.now().toISOString();
      let credentials = 0;
      let pairingSessions = 0;
      let bootstrapSessions = 0;
      for (const credential of store.credentials) {
        if (credential.tenantId !== tenantId || credential.userId !== userId || credential.revokedAt) continue;
        credential.revokedAt = now;
        credentials += 1;
      }
      store.sessions = store.sessions.filter((session) => {
        const terminate = session.tenantId === tenantId && session.userId === userId && !session.consumedAt;
        if (terminate) pairingSessions += 1;
        return !terminate;
      });
      store.bootstrapSessions = store.bootstrapSessions.filter((session) => {
        const terminate = session.tenantId === tenantId && session.userId === userId && !session.consumedAt;
        if (terminate) bootstrapSessions += 1;
        return !terminate;
      });
      if (credentials > 0 || pairingSessions > 0 || bootstrapSessions > 0) await this.save(store);
      return { credentials, pairingSessions, bootstrapSessions };
    });
  }
}
