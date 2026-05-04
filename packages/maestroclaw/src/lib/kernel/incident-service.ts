import type { ClawConfig } from "../../config.js";

export type IncidentSeverity = 'low' | 'medium' | 'high' | 'critical';
export type IncidentCategory =
  | 'kernel_violation'
  | 'security_violation'
  | 'auth_violation'
  | 'scope_violation'
  | 'system_error'
  | 'manual';

export interface IncidentPayload {
  severity: IncidentSeverity;
  category: IncidentCategory;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
  job_id?: string;
}

/**
 * Routes local kernel/security events to the executor-api report_incident
 * endpoint so they surface in the user's SecurityPanel in real-time.
 * All errors are swallowed — incident reporting must never crash the executor.
 */
export class IncidentService {
  private readonly url: string;
  private readonly token: string;

  constructor(config: ClawConfig) {
    this.url = `${config.supabaseUrl}/functions/v1/executor-api?action=report_incident`;
    this.token = config.executorToken;
  }

  async report(payload: IncidentPayload): Promise<boolean> {
    console.log(`🚨 [IncidentService] ${payload.severity.toUpperCase()} ${payload.category}: ${payload.title}`);
    try {
      const res = await fetch(this.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Executor-Token": this.token,
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        console.error(`[IncidentService] HTTP ${res.status}: ${body}`);
        return false;
      }
      return true;
    } catch (err) {
      console.error("[IncidentService] Failed to report incident:", err);
      return false;
    }
  }
}
