import { reportEvent } from "../../api.js";
import type { ClawConfig } from "../../config.js";

export interface IncidentReport {
  title: string;
  message: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  metadata?: Record<string, any>;
}

/**
 * Incident Service - Bridges local security events to the Thamos UI.
 * This allows the remote worker to report Sentinel-style alerts back home.
 */
export class IncidentService {
  constructor(private config: ClawConfig) {}

  /**
   * Reports a high-severity security incident back to the Thamos Desktop.
   */
  async reportIncident(report: IncidentReport, jobId?: string) {
    console.log(`🚨 [IncidentService] Reporting: ${report.title} (${report.severity.toUpperCase()})`);
    
    // We use reportEvent if we are inside a job, otherwise we could use a dedicated endpoint
    // For now, we'll assume there's a global "system_node" job ID or similar for general events
    const targetJobId = jobId || "system_node_event";

    try {
      await reportEvent(this.config, targetJobId, "incident", {
        ...report,
        timestamp: Date.now()
      });
      return true;
    } catch (err) {
      console.error(`⚠️ [IncidentService] Failed to report incident:`, err);
      return false;
    }
  }
}
