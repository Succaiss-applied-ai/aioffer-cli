import type { VisionSession, VisionSessionStore } from "./vision-agent.js";
import type { PgGatewayDatabase } from "./postgres-database.js";

export class PgVisionSessionRepository implements VisionSessionStore {
  constructor(private readonly database: PgGatewayDatabase) {}

  async save(session: VisionSession & { expiresAt: string }): Promise<void> {
    await this.database.query(`WITH expired AS (
      SELECT session_id FROM recruiting_gateway.vision_sessions WHERE expires_at<=now()
      ORDER BY expires_at,session_id FOR UPDATE SKIP LOCKED LIMIT 100)
      DELETE FROM recruiting_gateway.vision_sessions USING expired WHERE vision_sessions.session_id=expired.session_id`);
    await this.database.query(`INSERT INTO recruiting_gateway.vision_sessions
      (session_id,tenant_id,user_id,device_id,expires_at,data) VALUES ($1,$2,$3,$4,$5,$6::jsonb)`,
      [session.sessionId,session.tenantId,session.userId,session.deviceId,session.expiresAt,JSON.stringify(session)]);
  }

  async get(sessionId: string): Promise<VisionSession | null> {
    return (await this.database.query<{ data: VisionSession }>("SELECT data FROM recruiting_gateway.vision_sessions WHERE session_id=$1", [sessionId])).rows[0]?.data ?? null;
  }
}
