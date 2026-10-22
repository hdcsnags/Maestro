// `maestroclaw skills` — index the repo's skills/ directory (Agent Skills format:
// SKILL.md with name/description frontmatter) and keep .claude/skills pointer stubs
// in sync so Claude Code sessions discover the same procedures. Seats get the INDEX
// (name + description + path), not the whole library (OpenClaw 2026.10.1 pattern):
// `council run --skills` prepends it to a brief.

import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

export interface SkillEntry { name: string; description: string; harness: string[]; path: string; }

export function findSkillsRoot(start = process.cwd()): string | null {
  let dir = resolve(start);
  for (let i = 0; i < 6; i++) {
    const cand = join(dir, "skills");
    if (existsSync(cand) && statSync(cand).isDirectory() && existsSync(join(dir, "AGENTS.md"))) return cand;
    const up = resolve(dir, "..");
    if (up === dir) break;
    dir = up;
  }
  return null;
}

export function parseFrontmatter(md: string): Record<string, string | string[]> {
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const out: Record<string, string | string[]> = {};
  if (!m) return out;
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([a-zA-Z_][\w-]*):\s*(.*)$/);
    if (!kv) continue;
    const [, k, raw] = kv;
    const v = raw.trim();
    if (v.startsWith("[") && v.endsWith("]")) out[k] = v.slice(1, -1).split(",").map((s) => s.trim()).filter(Boolean);
    else out[k] = v;
  }
  return out;
}

export function loadSkills(root: string): SkillEntry[] {
  const out: SkillEntry[] = [];
  for (const name of readdirSync(root).sort()) {
    const p = join(root, name, "SKILL.md");
    if (!existsSync(p)) continue;
    const fm = parseFrontmatter(readFileSync(p, "utf-8"));
    out.push({
      name: String(fm.name ?? name),
      description: String(fm.description ?? ""),
      harness: Array.isArray(fm.harness) ? fm.harness : fm.harness ? [String(fm.harness)] : ["any"],
      path: `skills/${name}/SKILL.md`,
    });
  }
  return out;
}

export function renderIndexForBrief(skills: SkillEntry[]): string {
  if (!skills.length) return "";
  return ["## Procedures available (read a file only if the task needs it)", ...skills.map((s) => `- **${s.name}** — ${s.description} (\`${s.path}\`)`)].join("\n");
}

export function syncClaudePointers(repoRoot: string, skills: SkillEntry[]): number {
  let n = 0;
  for (const s of skills) {
    const dir = join(repoRoot, ".claude", "skills", s.name);
    mkdirSync(dir, { recursive: true });
    const stub = [
      "---", `name: ${s.name}`, `description: ${s.description}`, "---", "",
      `Canonical copy: \`${s.path}\` (generated pointer; edit the canonical file, then run \`maestroclaw skills\`).`, "",
      "Read that file now and follow it.", "",
    ].join("\n");
    const p = join(dir, "SKILL.md");
    if (!existsSync(p) || readFileSync(p, "utf-8") !== stub) { writeFileSync(p, stub, "utf-8"); n++; }
  }
  return n;
}

export async function skillsMain(argv: string[]): Promise<void> {
  const root = findSkillsRoot();
  if (!root) throw new Error("no skills/ directory found above the current directory (looked for a folder with AGENTS.md)");
  const repoRoot = resolve(root, "..");
  const skills = loadSkills(root);
  const cmd = argv[0] ?? "sync";
  if (cmd === "list") {
    for (const s of skills) console.log(`${s.name.padEnd(22)} [${s.harness.join(",")}]  ${s.description.slice(0, 110)}${s.description.length > 110 ? "…" : ""}`);
    return;
  }
  if (cmd === "brief") { console.log(renderIndexForBrief(skills)); return; }
  if (cmd === "sync") {
    writeFileSync(join(root, "index.json"), JSON.stringify({ schema: "maestro.skills.index/1", generated_at: new Date().toISOString(), skills }, null, 2), "utf-8");
    const n = syncClaudePointers(repoRoot, skills);
    console.log(`${skills.length} skills indexed → skills/index.json; ${n} .claude/skills pointer(s) written`);
    return;
  }
  throw new Error(`unknown skills command "${cmd}" (list | sync | brief)`);
}
