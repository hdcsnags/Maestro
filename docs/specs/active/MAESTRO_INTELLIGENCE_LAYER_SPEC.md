# MAESTRO INTELLIGENCE LAYER — Design Specification
**Codename:** `PROJECT COUNCIL`
**Version:** 1.0
**Author:** Michael-Thomas (via Copilot synthesis)
**Status:** Active Design — Pre-Build
**Date:** 2026-05-06

---

## 0. HOW TO READ THIS DOCUMENT (FOR AGENTS)

This document is your **primary context file** for all work related to Project Council.
Before making any architectural decision, any code change, or any tooling suggestion in this domain:

1. Read this document fully
2. Cross-reference `decisions/` for any flagged prior decisions
3. If your proposed change conflicts with a `# WHY:` note here — stop and surface the conflict before proceeding
4. You are building **alongside** a human who has strong opinions and a heavy build process. Do not over-automate. Ask before abstracting.

---

## 1. VISION

### 1.1 What We Are Building

A **self-enriching local intelligence layer** that:

- Ingests, audits, and knowledge-graphs real-world shipped projects (starting with Devpost hackathon winners/losers)
- Feeds that enriched corpus into a multi-model, multi-agent council (the "Maestro environment")
- Allows any agent in the council to **surgically query battle-tested project patterns** instead of relying on hallucinated or outdated training data
- Closes the loop: every build we do enriches the corpus further, making the next build smarter

### 1.2 The Core Problem We Are Solving

> "I was too focused on the code. I lacked the storytelling."

This is not just a Devpost problem. It is a systematic gap between:
- **What gets built** (technically sound, privately documented)
- **What gets communicated** (narrative, decisions, tradeoffs, why it matters)

We are building a system where both layers are first-class citizens in the knowledge graph, indexed, traversable, and queryable by any agent before, during, and after a build.

### 1.3 Why This Matters Beyond Hackathons

The future of AI-assisted development requires agents that have **institutional memory** — not just context windows. This system is a working proof of that. It is:

- A competitive advantage in hackathons (pattern-matched storytelling + architecture)
- A training corpus for Maestro (local LLM fine-tuning)
- A reusable foundation for every future project
- A reference implementation for human-in-the-loop SoM (Society of Mind) environments

---

## 2. SYSTEM ARCHITECTURE OVERVIEW

```
┌─────────────────────────────────────────────────────────────┐
│                     MAESTRO INTERFACE                        │
│              (Human-in-the-loop entry point)                 │
└────────────────────────┬────────────────────────────────────┘
                         │
          ┌──────────────▼──────────────┐
          │     COUNCIL LAYER (SoM)     │
          │  Lead Agents | Bouncers     │
          │  Multi-model routing        │
          │  (Copilot, Gemini, Claude,  │
          │   OpenAI, Kimi, Qwen,       │
          │   + local Maestro LLM)      │
          └──────────────┬──────────────┘
                         │ MCP tool calls
          ┌──────────────▼──────────────┐
          │     KNOWLEDGE LAYER         │
          │  graphify MCP server        │
          │  graph.json (global)        │
          │  Obsidian vault             │
          │  decisions/ docs            │
          └──────────────┬──────────────┘
                         │
          ┌──────────────▼──────────────┐
          │     CORPUS LAYER            │
          │  Devpost projects (audited) │
          │  Own project history        │
          │  Pattern/narrative DB       │
          └─────────────────────────────┘
```

---

## 3. THE THREE LAYERS IN DETAIL

---

### LAYER 1: CORPUS — The Devpost Intelligence Ingest

#### 3.1 What We Ingest

- **Winners** (top 3 per category, multiple events): primary signal for what works
- **Notable losers** (good code, weak pitch OR good pitch, weak code): counter-signal, calibration
- **Our own past projects**: first-class citizens, not afterthoughts

#### 3.2 Ingestion Pipeline

```
Step 1: SOURCE
  - Manually curated Devpost event URLs (start with 5–10 events)
  - Scrape submission GitHub links (public by default on Devpost)

Step 2: CLONE + GRAPH
  graphify clone <github-url>
  # or for batch:
  for url in $(cat devpost_repos.txt); do graphify clone $url; done

Step 3: EXTRACT (local LLM, no API cost for code)
  graphify extract ./devpost_corpus \
    --backend ollama \
    --global \
    --as devpost_winners_batch_01

Step 4: MERGE into unified corpus graph
  graphify merge-graphs \
    devpost_winners_batch_01.json \
    devpost_winners_batch_02.json \
    --out corpus_master.json

Step 5: REGISTER to global graph
  graphify global add corpus_master.json devpost_corpus

Step 6: AUDIT PASS (human-in-the-loop — this is critical)
  See Section 3.3
```

#### 3.3 The Audit Schema

Every ingested project gets a metadata annotation. This is the signal layer that separates our corpus from a raw clone dump.

```yaml
# audit_record.yml (one per project)
project_id: devpost_2025_healthtech_winner_01
repo_url: https://github.com/...
event: "Health Innovation Hackathon 2025"
placement: winner          # winner | runner_up | notable_loser | our_project
category: healthtech

scores:
  story_score: 8           # 1–10: how well did they communicate the why?
  code_quality: 6          # 1–10: architecture, readability, patterns
  security_flags: 2        # count of flagged issues
  pattern_reuse_value: 9   # 1–10: how extractable are the patterns?
  novelty: 7               # 1–10: did they solve something in a new way?

patterns_extracted:
  - name: "streaming RAG with fallback cache"
    file: src/rag/pipeline.py
    why_notable: "Handles latency without blocking UI — we've never done this cleanly"
    
narrative_patterns:
  - "Led with user pain story before technical explanation"
  - "Used a live demo within first 60 seconds of pitch"
  - "Clear 'before/after' framing in README"

security_notes:
  - "API keys hardcoded in frontend — DO NOT replicate"
  - "No input sanitization on file upload"

decision_log:
  - "Excluded agent orchestration module — too tightly coupled to their proprietary backend"
  - "Flagged streaming pattern for extraction into our RAG toolkit"
```

> **# WHY:** The audit schema is what transforms a raw clone into institutional knowledge. Without it, the corpus is noise. With it, every query the council makes is grounded in *annotated human judgment*, not just code similarity.

#### 3.4 MiroFish Patterns to Extract

[Source: `666ghj/MiroFish` — AGPL-3.0, patterns only, no direct code copy]

MiroFish is a reference implementation of swarm intelligence with GraphRAG. Specific patterns to extract and adapt:

| Pattern | MiroFish Location | Adaptation for Council |
|---|---|---|
| **GraphRAG seed injection** | `backend/app/services/` | Use as model for how to inject corpus graph context into agent prompts |
| **Temporal memory per agent** | Zep Cloud integration | Adapt for Maestro's per-agent memory; consider local Zep alternative |
| **Dual-platform parallel simulation** | OASIS + custom backend | Blueprint for running multiple models in parallel on same brief |
| **ReportAgent with rich toolset** | `backend/app/api/` | Model for how to structure council synthesis output |
| **Persona generation from seed** | `backend/app/services/` | Blueprint for how Maestro spins up specialized agents per build domain |
| **Dynamic temporal memory update** | Zep mid-simulation | How to update agent context as a build session progresses |

**MiroFish Workflow (for reference):**
```
Seed material → GraphRAG construction → Persona generation →
Parallel agent simulation → Dynamic memory updates →
ReportAgent synthesis → Deep interaction
```

**Our equivalent:**
```
Build brief → Corpus graph query → Agent role assignment →
Parallel model council → Decision flagging + weighting →
Maestro synthesis → Ship + enrich corpus
```

> **# WHY:** MiroFish proves the architecture works at scale (59k stars, Shanda Group backing). We are not copying it — we are validating our own pattern against a proven reference and extracting specific techniques (especially Zep-style temporal memory and dual-platform simulation) that our system currently lacks.

---

### LAYER 2: KNOWLEDGE LAYER — Graphify as the Spine

#### 3.5 Graph Structure

We maintain **three distinct graphs** that can be queried independently or merged:

```
~/.graphify/
├── global.json                    ← merged view of everything
├── projects/
│   ├── devpost_corpus.json        ← all ingested hackathon projects
│   ├── own_projects.json          ← our own project history
│   └── decisions.json            ← decision docs, WHY notes, architecture choices
└── sessions/
    └── {project_slug}/graph.json  ← per-active-project graph
```

#### 3.6 Graphify Commands Reference (Agent Use)

Agents in the council should know these commands and use them via the MCP server:

```bash
# Query the corpus for a pattern
graphify query "what RAG patterns appear in top hackathon winners?"

# Find structural connections
graphify path "AuthService" "DatabasePool"

# Explain a concept node
graphify explain "temporal_memory_agent"

# Start MCP server (run once, agents connect as tools)
python -m graphify.serve ~/.graphify/global.json --port 8765

# Add a new source (paper, video, URL)
graphify add https://arxiv.org/abs/...

# Rebuild after new ingestion
graphify merge-graphs devpost_corpus.json own_projects.json --out global.json
```

#### 3.7 Obsidian Integration

```bash
# Generate Obsidian vault from corpus
/graphify ./devpost_corpus --obsidian

# This creates a vault where:
# - Every project is a note
# - Every pattern is a note
# - Every decision doc is linked to the relevant project/pattern nodes
# - Bidirectional links = traversable knowledge
```

The Obsidian vault is the **human-readable layer** of the graph. The `graph.json` is the **machine-queryable layer**. Both are maintained in sync.

#### 3.8 Decision Documentation Standard

Every significant decision in any project must be flagged using these inline markers:

```python
# WHY: Chose Zep over raw vector DB because temporal ordering matters for agent memory
# NOTE: This will need to be swapped if we go fully local (no Zep Cloud dependency)
# HACK: Temporary workaround for OASIS rate limiting — revisit before prod
# DECISION: 2026-05-06 — Excluded MiroFish orchestration module, too tightly coupled
```

These markers are **first-class nodes** in the graph. Graphify extracts them automatically. They become queryable by agents.

---

### LAYER 3: COUNCIL LAYER — Maestro + Multi-Model Routing

#### 3.9 Agent Roles (Current Council Structure)

| Agent Role | Model(s) | Responsibility |
|---|---|---|
| **Maestro** | Local LLM (fine-tuned) | Human representative, gating layer, final synthesis |
| **Lead Architect** | Claude / OpenAI | System design, architecture decisions |
| **Lead Researcher** | Gemini / Kimi | Corpus queries, RAG retrieval, pattern matching |
| **Code Reviewer** | Copilot Pro+ | Implementation quality, surgical edits |
| **Security Bouncer** | Qwen / dedicated | Flags vulnerabilities, checks against known bad patterns in corpus |
| **Storytelling Agent** | Claude | Narrative structure, README quality, pitch framing |
| **Devil's Advocate** | Rotates | Challenges consensus, prevents groupthink |

> **# WHY:** Role separation is not just organizational — it enables parallel execution. Maestro gates the output, not the process. Agents work simultaneously; Maestro synthesizes and represents the human's weighted preference.

#### 3.10 Build Session Flow

```
1. BRIEF INTAKE
   Maestro receives build brief from human
   ↓
2. CORPUS QUERY (automated)
   Lead Researcher queries graphify MCP:
   - "similar projects in corpus"
   - "known failure patterns for this domain"
   - "winning narrative structures for this category"
   ↓
3. PARALLEL COUNCIL SESSION
   All agents receive: brief + corpus query results + relevant decision docs
   Each agent contributes their domain perspective
   Human adds weight to ideas (the SoM weighting mechanism)
   ↓
4. SECURITY PASS
   Security Bouncer cross-references proposed patterns against:
   - Flagged bad patterns in devpost corpus
   - Known CVEs in dependency stack
   - Our own security decision history
   ↓
5. STORYTELLING PASS
   Storytelling Agent queries narrative patterns from winning submissions:
   - README structure
   - Demo framing
   - "Before/after" language
   - Hook within first 60 seconds
   ↓
6. MAESTRO SYNTHESIS
   Maestro synthesizes council output
   Human reviews, adjusts weights, approves
   ↓
7. BUILD + ENRICH
   Project is built
   Decision docs are written inline (# WHY, # NOTE, etc.)
   Completed project is ingested back into corpus
   Corpus graph is updated
```

#### 3.11 Maestro Fine-Tuning Strategy

Maestro (local LLM) is trained to **represent the human**, not to be the most capable model.

Fine-tuning corpus sources (in priority order):
1. All `# WHY:` and `# DECISION:` notes from our own projects
2. Human weight-adjustment logs from council sessions
3. Audit records from corpus ingestion (our subjective scoring)
4. Narrative patterns we have personally validated as effective

> **# WHY:** Maestro should be a compressed, opinionated representation of Michael-Thomas's judgment — not a general-purpose LLM. The other council members handle capability. Maestro handles values, priorities, and final gatekeeping.

---

## 4. TECHNOLOGY STACK

| Layer | Tool | Purpose |
|---|---|---|
| Knowledge Graph | `graphify` (safishamsi/graphify) | Graph building, querying, MCP server |
| Personal Knowledge | Obsidian | Human-readable vault, bidirectional links |
| Agent Memory | Zep Cloud → local Zep (migration path) | Per-agent temporal memory |
| Swarm Simulation | CAMEL-AI OASIS (pattern reference) | Multi-agent parallel council sessions |
| Local LLM | Maestro (to be defined) | Human-representative gating model |
| Corpus Storage | `graph.json` + `audit_record.yml` | Structured project knowledge |
| Multi-model CLI | Copilot Pro+, Gemini, Claude, OpenAI, Kimi, Qwen | Council member models |
| Backend (future) | Flask (MiroFish pattern) | API layer if externalizing council |
| Containerization | Docker (MiroFish pattern) | Reproducible council environment |

---

## 5. PHASED ROADMAP

### Phase 1 — Foundation (Weeks 1–2)
- [ ] Set up graphify globally, configure for all CLI tools
- [ ] Create `~/.graphify/` structure
- [ ] Ingest first 10 own projects → build `own_projects.json`
- [ ] Set up Obsidian vault with graphify output

### Phase 2 — Corpus Seed (Weeks 2–4)
- [ ] Curate first batch of 20–30 Devpost winner URLs (2 categories, 3 years)
- [ ] Batch clone + extract via graphify
- [ ] Complete audit records for each (human pass required)
- [ ] Merge into `devpost_corpus.json`
- [ ] Register to global graph

### Phase 3 — Council Integration (Weeks 4–6)
- [ ] Stand up graphify MCP server as persistent council tool
- [ ] Define council agent roles and routing logic
- [ ] Wire corpus query into build session intake flow
- [ ] Security Bouncer: build bad-pattern index from audited losers
- [ ] Storytelling Agent: build narrative pattern index from winners

### Phase 4 — Maestro Training (Weeks 6–10)
- [ ] Collect fine-tuning corpus from decision logs + weight sessions
- [ ] First Maestro fine-tune run
- [ ] Evaluate: does Maestro gate in the human's interest?
- [ ] Iterate

### Phase 5 — Close the Loop (Ongoing)
- [ ] Every shipped project → ingest back into corpus
- [ ] Post-hackathon: annotate what worked, what didn't, update audit records
- [ ] Quarterly corpus pruning: remove low-value nodes, re-weight

---

## 6. CONSTRAINTS AND GUARDRAILS

### 6.1 Licensing
- **MiroFish** is AGPL-3.0. Extract patterns and architectural ideas only. Do not copy source code unless your project is also open source and AGPL-compatible.
- **Graphify** is MIT. Full usage permitted.
- **Devpost projects** are individually licensed. Check each repo. When in doubt: learn from structure, do not copy implementation.

### 6.2 What Agents Must NOT Do
- Do not make architectural changes without checking `decisions/` first
- Do not add new dependencies without a `# WHY:` justification committed to docs
- Do not ingest a new project into the corpus without a completed `audit_record.yml`
- Do not bypass Maestro's gating layer — even if a decision seems obvious

### 6.3 Context Management
- Agents do **not** need full project history in context
- Use `graphify query` to retrieve only what is relevant to the current task
- If you find yourself needing more than 3 graph queries to answer a question, surface the question to Maestro — the corpus may need enrichment

---

## 7. SUCCESS METRICS

| Metric | Target |
|---|---|
| Council query latency (corpus → response) | < 3 seconds |
| Audit coverage | 100% of ingested projects have `audit_record.yml` |
| Decision doc coverage | 100% of architectural decisions have `# WHY:` |
| Devpost storytelling score (self-assessed) | +3 points vs baseline by Phase 3 |
| Maestro gating accuracy | "Would Michael-Thomas approve this?" — 80%+ human agreement |
| Corpus size (Phase 5) | 100+ projects, 3+ categories |

---

## 8. RELATED REFERENCES

| Resource | Role in This System |
|---|---|
| `safishamsi/graphify` | Core knowledge graph engine — read the full README |
| `666ghj/MiroFish` | SoM + GraphRAG reference implementation — extract patterns, respect AGPL |
| Obsidian | Human vault layer — linked to graphify output |
| Zep Cloud (getzep.com) | Agent temporal memory — evaluate local replacement |
| CAMEL-AI OASIS | Swarm simulation framework (underpins MiroFish) |
| Devpost (devpost.com) | Primary corpus source |

---

## 9. OPEN QUESTIONS (FOR COUNCIL TO RESOLVE)

1. **Local Zep alternative?** Zep Cloud has a free tier but adds an external dependency. Do we self-host or accept the cloud dependency for Phase 1?
2. **Maestro base model?** Which local LLM is the starting point for fine-tuning? (Mistral, LLaMA, Qwen-local?)
3. **Corpus categories for Phase 2?** Recommend starting with: AI/ML tools + Developer Productivity. Agree?
4. **Obsidian sync strategy?** Vault lives locally. Do we want a git-backed sync layer for team/future use?
5. **MCP server always-on vs on-demand?** Running graphify MCP as a daemon vs spinning up per session.

---

*This document is a living spec. Update it as decisions are made. Every update should have a date and a `# WHY:` in the commit message.*