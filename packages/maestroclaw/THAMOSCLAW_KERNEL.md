# THAMOSCLAW KERNEL: The Lead Agent Manifesto
**Version:** 1.0.0-Alpha (Enterprise Grade)
**Status:** Council-Hardened
**Architecture:** Post-OpenClaw Harvest Integration

---

## 1. VISION: FROM EXECUTOR TO WORKSTATION
ThamosClaw (formerly MaestroClaw) has evolved. We have transitioned from a reactive "Shell Script Executor" to a proactive **Context-Aware Security Kernel**. This worker is the "Physical Bridge" between the Thamos6 browser workstation and the physical infrastructure.

**The Mandate:** Every command is an asset; every binary is a risk. We do not just run code; we analyze intent.

---

## 2. THE THREE PILLARS OF THE KERNEL

### I. The Shell Analyzer (The Brain)
*   **Source:** Ported from OpenClaw's high-fidelity parser.
*   **Capability:** Full recursive analysis of complex shell pipelines (`&&`, `||`, `;`).
*   **Function:** It decomposes string-based prompts into discrete `ShellCommandSegments`. This prevents "Prompt Injection" via hidden sub-commands.
*   **Alignment:** Future agents must use `analyzeShellCommand()` before invoking any execution adapter.

### II. High-Fidelity PTY (The Interactivity)
*   **Engine:** `@lydell/node-pty`.
*   **Capability:** Native Pseudo-Terminal sessions.
*   **Function:** Supports high-fidelity terminal features including escape sequences, terminal resizing, and interactive CLIs (`top`, `vim`, `htop`).
*   **Value:** Transforms the Thamos6 Terminal from a text log into a real-time Operator Console.

### III. Security Allowlisting (The Shield)
*   **Implementation:** Kernel-level gating in `ApprovedShellAdapter`.
*   **Control:** A strict `TRUSTED_COMMANDS` registry.
*   **Enforcement:** Even if an agent generates a command, the Kernel will reject the execution if the binary is not on the workstation allowlist. 
*   **Auditability:** Every rejection is reported as a `Kernel Violation`.

---

## 3. REAL-TIME INCIDENT REPORTING
The Kernel now includes a dedicated `IncidentService`. 
*   **Remote-to-Home Bridge:** The worker can now "Push" high-severity security events (e.g., local detection of malware, unauthorized access) directly to the Thamos UI via the Supabase `executor-api`.
*   **Actionable Payload:** These incidents carry metadata that allows the UI to trigger investigation playbooks instantly.

---

## 4. INSTRUCTIONS FOR THE COUNCIL (Agent Handover)

1.  **Respect the Allowlist:** Do not attempt to bypass the Kernel's binary check. If you need a new tool (e.g., `powershell.exe` for Azure scripts), update the `TRUSTED_COMMANDS` registry in `pty-shell.ts`.
2.  **State Persistence:** All "Jobs" must be claimed via the `claimJob` API. Do not run multi-step stateful operations without a valid `session_id`.
3.  **Kernel-First Development:** When adding new adapters (TopDesk/Defender), they must inherit the `Adapter` type and implement pre-flight kernel analysis.

---

## 5. REPOSITORY IMPACT
The following files are now the "Single Source of Truth" for ThamosClaw execution:
*   `src/lib/kernel/shell-analyzer.ts` (The Parser)
*   `src/lib/kernel/incident-service.ts` (The Bridge)
*   `src/adapters/pty-shell.ts` (The Interactive Engine)
*   `src/adapters/approved-shell.ts` (The Hardened Executor)

**The Lamborghini is now armored. Proceed with precision.**

---
*Authored by the Gemini CLI Lead Agent. Council Review Pending.*
