// Seat catalog and parsing. A seat is a label → adapter + model. The catalog carries
// the defaults the autumn-2026 councils actually used; every entry can be overridden
// on the command line as `label=adapter:model` or by a seats JSON file.
//
// Before this module, adapters read their model from process.env at import, which
// forced "one seat per process" (see MAESTRO_STATE 2026-09-06). Adapters now take a
// per-instance model option, so `astra` and `sol` can share a process.

import { existsSync, readFileSync } from "node:fs";
import type { Adapter } from "../adapters/types.js";
import { CodexCliAdapter } from "../adapters/codex-cli.js";
import { AgyCliAdapter } from "../adapters/agy-cli.js";
import { KimiCliAdapter } from "../adapters/kimi-cli.js";
import { ClaudeCodeAdapter } from "../adapters/claude-code.js";
import type { CouncilMode, SeatAdapter, SeatSpec } from "./types.js";

const ADAPTERS: ReadonlySet<string> = new Set(["codex_cli", "agy_cli", "kimi_cli", "claude_code"]);

/** Defaults. Model undefined = the CLI's configured default (codex: ~/.codex/config.toml). */
export const SEAT_CATALOG: Record<string, Omit<SeatSpec, "label">> = {
  sol: { adapter: "codex_cli" },
  astra: { adapter: "codex_cli", model: "gpt-6-astra" },
  gemini: { adapter: "agy_cli", model: "gemini-4-argon-high" },
  argon: { adapter: "agy_cli", model: "gemini-4-argon-high" },
  gemini38: { adapter: "agy_cli", model: "gemini-3.8-flash-high" },
  opus: { adapter: "agy_cli", model: "claude-opus-5-5-high" },
  sonnet55: { adapter: "agy_cli", model: "claude-sonnet-5-5-high" },
  kimi: { adapter: "kimi_cli", model: "kimi-code/k3" },
  sonnet: { adapter: "claude_code", model: "sonnet" },
  fable5: { adapter: "claude_code", model: "claude-fable-5" },
  claude: { adapter: "claude_code" },
};

/**
 * Parse `astra,gemini,sol` or `rev=codex_cli:gpt-6-astra,g=agy_cli:gemini-4-argon-high`.
 * A label not in the catalog must carry an explicit adapter.
 */
export function parseSeats(spec: string, catalog: Record<string, Omit<SeatSpec, "label">> = SEAT_CATALOG): SeatSpec[] {
  const out: SeatSpec[] = [];
  for (const raw of spec.split(",").map((s) => s.trim()).filter(Boolean)) {
    const eq = raw.indexOf("=");
    if (eq < 0) {
      const base = catalog[raw];
      if (!base) throw new Error(`unknown seat "${raw}"; use label=adapter:model or one of ${Object.keys(catalog).join(", ")}`);
      out.push({ label: raw, ...base });
      continue;
    }
    const label = raw.slice(0, eq).trim();
    const rhs = raw.slice(eq + 1).trim();
    const colon = rhs.indexOf(":");
    const adapter = (colon < 0 ? rhs : rhs.slice(0, colon)).trim();
    const model = colon < 0 ? undefined : rhs.slice(colon + 1).trim() || undefined;
    if (!ADAPTERS.has(adapter)) throw new Error(`seat "${label}": unknown adapter "${adapter}"`);
    if (!/^[a-z0-9][a-z0-9_-]*$/i.test(label)) throw new Error(`seat label "${label}" must be alphanumeric`);
    out.push({ label, adapter: adapter as SeatAdapter, model });
  }
  const seen = new Set<string>();
  for (const s of out) {
    if (seen.has(s.label)) throw new Error(`duplicate seat label "${s.label}"`);
    seen.add(s.label);
  }
  if (out.length === 0) throw new Error("no seats given");
  return out;
}

/** Optional seats file: { "label": { "adapter": "...", "model": "...", "configDir": "..." } }. */
export function loadSeatCatalog(path?: string): Record<string, Omit<SeatSpec, "label">> {
  if (!path) return SEAT_CATALOG;
  if (!existsSync(path)) throw new Error(`seats file not found: ${path}`);
  const extra = JSON.parse(readFileSync(path, "utf-8")) as Record<string, Omit<SeatSpec, "label">>;
  for (const [label, v] of Object.entries(extra)) {
    if (!ADAPTERS.has(v.adapter)) throw new Error(`seats file: "${label}" has unknown adapter "${v.adapter}"`);
  }
  return { ...SEAT_CATALOG, ...extra };
}

export function makeAdapter(seat: SeatSpec, mode: CouncilMode): Adapter {
  switch (seat.adapter) {
    case "codex_cli":
      return new CodexCliAdapter({ sandbox: mode === "code" ? "workspace-write" : "read-only", model: seat.model });
    case "agy_cli":
      return new AgyCliAdapter({ model: seat.model });
    case "kimi_cli":
      return new KimiCliAdapter({ model: seat.model });
    case "claude_code":
      return new ClaudeCodeAdapter({ model: seat.model, configDir: seat.configDir });
  }
}

/** What containment the seat's adapter provides, stated honestly (verified only when the CLI confirms it). */
export function sandboxDeclaration(seat: SeatSpec, mode: CouncilMode): { mode: "read-only" | "workspace-write" | "none" | "unknown"; flag: string } {
  switch (seat.adapter) {
    case "codex_cli":
      return { mode: mode === "code" ? "workspace-write" : "read-only", flag: `--sandbox ${mode === "code" ? "workspace-write" : "read-only"}` };
    case "agy_cli":
      return { mode: "none", flag: "--dangerously-skip-permissions --add-dir <copy> (agy --sandbox fails on Windows)" };
    case "claude_code":
      return { mode: "none", flag: "--print (task mode; no write permission granted)" };
    case "kimi_cli":
      return { mode: "none", flag: "--print" };
  }
}
