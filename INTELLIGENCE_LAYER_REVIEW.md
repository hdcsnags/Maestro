# Council Review — `MAESTRO_INTELLIGENCE_LAYER_SPEC.md`

**Reviewer:** Opus 4.7
**Reviewed:** 2026-05-06
**Source doc:** `MAESTRO_INTELLIGENCE_LAYER_SPEC.md` (codename PROJECT COUNCIL, version 1.0, by Michael-Thomas via Copilot synthesis)
**Verdict:** **Approve the thesis. Reject the scope. Recommend a tight v1.**

---

## TL;DR

The core insight is correct: agents need institutional memory, and "I lacked the storytelling" is a real, addressable product gap. The proposed system is also too big, internally redundant with existing Maestro architecture, and at risk of becoming a 6-month side project that ships nothing.

There is a high-value v1 hiding inside this spec. It is not Graphify + Obsidian + Zep + local Maestro LLM. It is **a curated corpus + a Storytelling Agent role + a single new edge-function query path** — built INTO existing Maestro, not alongside it. That ships in 2-3 weeks and proves the thesis. The rest can follow if it earns the right to.

---

## What's Strong

### 1. The "storytelling gap" insight is real
> *"I was too focused on the code. I lacked the storytelling."*

This is not just hackathon-specific. Most AI build tools (including current Maestro) optimize hard for code generation and weakly for the narrative/pitch/positioning that determines whether the work matters. Cursor and Claude Code produce great code; neither helps you write the README that makes someone want to use it. **A first-class Storytelling Agent is genuinely differentiated.** Nobody is doing this.

### 2. Audit-annotated corpus > raw repo dump
The `audit_record.yml` schema is the smart part of the proposal. A naive RAG over hackathon repos gives you noise. RAG over **annotated** repos with `story_score`, `code_quality`, `pattern_reuse_value`, `narrative_patterns`, `security_notes` is structured signal. This is the actual moat.

### 3. Pattern extraction with rationale
`patterns_extracted: [{name, file, why_notable}]` — this is exactly the thing missing from Stack Overflow / GitHub trending. The "why notable" field captures human judgment that the code itself doesn't. Future agents querying this corpus aren't pattern-matching code; they're pattern-matching **annotated lessons.**

### 4. The storytelling agent role itself
"Led with user pain story before technical explanation" / "Used a live demo within first 60 seconds" / "Clear before/after framing in README" — these are real, learnable patterns. An agent that knows them and can say *"your README opens with implementation; the winning ones in your corpus open with the user"* is genuinely useful.

### 5. The closed loop
Every project the user ships → auto-ingests back into the corpus → next project learns from it. This is the institutional-memory thesis at its tightest. **DIFF-02 (per-repo memory) is already pointing toward this** — the intelligence layer is DIFF-02 generalized across repos.

---

## What's Risky

### 1. **Scope is too big for current state**
Maestro has 9 specs ready, Phase 4 (PRO-01, PRO-02) not even started, SEC-02 not yet deployed. Adding an entire intelligence layer ON TOP of unimplemented Phase 4 spreads the team thin. Risk: nothing ships well, everything ships half-done.

The doc lists 5 phases over 10+ weeks. Realistic estimate of total work as written: **3-5 months for a single implementer**, much of it new infrastructure (Graphify integration, Obsidian sync, Zep migration, MCP server, audit pipeline, fine-tuning corpus, fine-tuning runs).

### 2. **"PROJECT COUNCIL" is a naming collision**
Maestro's existing multi-agent broadcast is already called "the Council." The doc introduces a new "COUNCIL LAYER (SoM)" with overlapping but slightly different agent roles ("Lead Architect, Lead Researcher, Code Reviewer, Security Bouncer, Storytelling Agent, Devil's Advocate"). These are not the same as Maestro's existing council agents. **Two systems with the same name will confuse future agents and humans alike.** Pick one — either rename the new one (Boardroom? Library? Studio?), or fold it into the existing council architecture rather than parallel-build it.

### 3. **Devpost as primary corpus has sourcing problems**
Devpost winners are judged on demo polish + novelty + pitch performance. They are NOT necessarily a signal for sustainable architecture. Top 3 winners frequently have:
- Deliberately impressive demos with held-together-by-tape internals
- Patterns that work for a 48-hour build but break at scale
- Hardcoded credentials, no tests, vibes-driven structure
- Features optimized for the judging rubric, not real users

If the corpus is supposed to teach Maestro "what works," it needs to be honest about WHAT signal Devpost provides. **Devpost winners are a great corpus for STORYTELLING patterns** (which is what the user explicitly identified as the gap). They are a dubious corpus for code architecture patterns. Need to be deliberate about which kind of signal we mine from where.

Better signal sources for code architecture:
- GitHub trending in target categories
- Projects YOU admire specifically (small, curated, not crowd-judged)
- Reading recommendations from your existing agents on what's good
- Your own past wins/losses with annotated post-mortems

### 4. **The audit step is enormous manual work**
"100% of ingested projects have `audit_record.yml`" with 5 numeric scores + patterns_extracted + narrative_patterns + security_notes + decision_log. That's ~30 minutes per project minimum, often more if you actually read the code. 100 projects = 50+ hours. **Realistically: this never happens at the planned scale unless you build LLM-driven first-pass audit with human review of just the score column.**

The doc doesn't discuss audit automation. That's the load-bearing implementation question and it's missing.

### 5. **Local Maestro LLM is a multi-month sub-project**
Fine-tuning, evaluating, iterating, deploying. This is essentially a research project parallel to the product. The doc has it as Phase 4 (weeks 6-10) but realistically it's its own entire workstream. Fine-tuning to "represent Michael-Thomas's judgment" is also a tricky goal — what's the eval metric? "Would Michael approve this?" needs labeled data the user doesn't yet have at scale.

**Recommend defer entirely.** Use cloud models (Sonnet/Haiku) for the gating role. Revisit fine-tuning when you have 6 months of session decision logs and real eval data.

### 6. **Graphify dependency unverified**
The doc references `safishamsi/graphify` extensively but doesn't validate:
- Is it actively maintained? (Check commit history.)
- License: doc says MIT — verify in source.
- Single maintainer / org? Single point of failure?
- What's the alternative if it's deprecated 6 months in?

If Graphify is the spine of the entire knowledge layer, betting on it deserves the same scrutiny as betting on a database vendor.

### 7. **Zep Cloud + MCP server + Obsidian = three new external dependencies**
Each adds:
- Setup friction for new users
- A failure mode
- Maintenance burden
- A bridge to Maestro's existing Supabase backend

**Maestro currently has ONE backend** (Supabase). The proposed system adds Zep (cloud or local), MCP (separate transport), Obsidian (separate file system layer). For a "self-enriching local intelligence layer," that's a lot of "and also."

### 8. **Two parallel agent models**
Maestro's existing agents (council-side: Sonnet/Opus/GPT/Gemini/Kimi as broadcast targets; builder-side: same plus MaestroClaw adapters; bouncer; concierge). The doc proposes new agent roles (Lead Architect, Lead Researcher, etc.) that are NOT directly mapped to existing roles. Are they:
- Renames of existing agents? (Then say so.)
- New agents that REPLACE existing ones? (Big change; needs migration spec.)
- A second agent system that runs alongside? (Two parallel systems = confused state.)

The doc doesn't resolve this. **It must.** Otherwise "the council" means two different things in two different files.

### 9. **MCP transport layer mismatch**
Maestro's agent communication goes through Supabase Edge Functions (orchestrate, concierge, etc.). The doc proposes Graphify MCP as a tool the agents call. This is a new transport layer. Either:
- Bridge: Graphify queries become Supabase edge function calls (e.g., a `corpus-query` edge function). Single transport. Cleanest.
- Direct MCP: agents need MCP client integration, which Maestro doesn't have today. New code path.

The doc doesn't choose. **Recommend the bridge.** Wrap Graphify in an edge function; Maestro agents query it like any other tool. Don't introduce a second transport.

### 10. **The audit's score columns are subjective and not validated**
`story_score: 8` / `code_quality: 6` / `novelty: 7` — these are 1-10 numeric scores generated by... whom? With what rubric? If different humans audit different projects, the scores aren't comparable. If one LLM audits all of them, the scores reflect the LLM's biases at one point in time and rot when the LLM changes.

The doc says "this is the signal layer that separates our corpus from a raw clone dump" — but the signal is only as good as the rubric, and the rubric isn't defined.

---

## The Right v1 — What I'd Actually Build

Drop everything in the doc except the Storytelling Agent and a tiny curated corpus, integrated into existing Maestro. Here's what that looks like:

### v1 Scope (3-4 weeks)

**1. New agent role: Storytelling Agent**
Add a new entry to `AGENT_DEFAULTS` in `src/types/index.ts` with role `Storytelling Lead`. Model: Claude Sonnet 4.6 (good at narrative, available, no new infra). Triggered by:
- Concierge intent classification — when user prompt is about "build a project," "ship a feature," "what should this README say," etc., the storytelling agent gets pinged.
- A new `composer intent`: `Story` (alongside existing Direct/Broadcast/Execute/Build).
- Post-build automatic — after a successful build, storytelling agent reviews the README/PR description and suggests improvements.

**2. Curated corpus, NOT a Devpost dump**
Skip the 100-project ingestion. Start with **20 hand-picked READMEs** that the user personally admires — these become the storytelling corpus. Stored as a single Postgres table:

```sql
CREATE TABLE storytelling_examples (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_url text NOT NULL,           -- where the README came from
  category text NOT NULL,             -- 'ai_tools' | 'dev_productivity' | etc.
  what_it_does text NOT NULL,         -- 1-2 sentences
  why_admired text NOT NULL,          -- the user's annotation: WHY this README is good
  readme_content text NOT NULL,       -- the actual README markdown
  patterns_observed text[] DEFAULT '{}',  -- e.g., ['opens_with_user_pain', 'live_demo_first', 'before_after_framing']
  added_at timestamptz NOT NULL DEFAULT now(),
  added_by uuid REFERENCES auth.users(id) NOT NULL
);
```

20 hand-curated entries with thoughtful `why_admired` annotations is more valuable than 100 auto-scraped Devpost entries with auto-generated scores. Quality over quantity.

**3. One new edge function: `storytelling-query`**
Takes a prompt or build artifact (README draft, PR description, project summary). Returns:
- 3 most relevant examples from the corpus
- Specific actionable feedback grounded in those examples
- A revised version if requested

No Graphify needed. Postgres full-text search + small vector embedding (pgvector) over the 20 entries is plenty for this scale. Add Graphify later if the corpus grows past a few hundred entries.

**4. New thread message kind: `storytelling_review`**
Renders inline in the thread when storytelling agent has provided feedback. Tone-styled like other event cards. User can apply suggestions, dismiss, or ask for another revision.

**5. Auto-ingest user's own shipped projects**
After every successful build with bouncer pass:
- Show an opt-in "Add this README to your storytelling corpus?" card
- If user clicks yes, the user is prompted: "What do you admire about this one?" (the `why_admired` annotation, in user's own voice)
- Stored as a `storytelling_examples` row with `category: 'own_project'`

This is the closed loop, but radically simpler than the doc's full corpus ingestion pipeline. Let the user grow their own corpus by tagging their own work first. They'll have richer annotations because they remember the context.

### What v1 Does NOT Do

- ❌ Graphify integration (not needed at 20-row scale)
- ❌ Obsidian vault (not needed; UI surface is the chat thread)
- ❌ Zep Cloud / temporal memory (DIFF-02 per-repo memory already covers this)
- ❌ Local Maestro LLM (cloud Sonnet is fine; defer fine-tuning to v3 when there's data)
- ❌ MCP server (use existing Supabase edge function transport)
- ❌ Devpost batch ingestion (replace with curated 20-project list)
- ❌ Audit schema with 5 numeric scores (replace with single `why_admired` annotation)
- ❌ MiroFish pattern extraction (defer; revisit when v1 proves out)
- ❌ Renaming the existing Council to PROJECT COUNCIL
- ❌ Six new agent roles (just Storytelling for now; add others if v1 proves the value)

### What v1 DOES Do

- ✅ Closes the storytelling gap the user explicitly identified
- ✅ Ships in 3-4 weeks (one Sonnet rotation; probably less)
- ✅ Lives inside existing Maestro architecture (no parallel system)
- ✅ Validates the thesis: do agents grounded in curated examples produce noticeably better narrative output?
- ✅ Provides a clean migration path to bigger versions if v1 succeeds
- ✅ Composes with existing backlog: pairs naturally with PRO-01 deliberation (storytelling agent participates in deliberation rounds), DIFF-02 memory (per-repo memory CAN reference storytelling decisions), LIVE-01 coordinator (coordinator can narrate "Storytelling agent flagged your README opening")

---

## How v1 Composes With Existing Backlog

The 9-spec backlog isn't blocked by intelligence layer work. They compose:

| Existing spec | Composition with Storytelling Agent v1 |
|---|---|
| **DIFF-02** (per-repo memory) | Memory can reference storytelling decisions ("for this repo, you decided the README should open with the user pain"). Cross-references natural. |
| **PRO-01** (deliberation) | Storytelling Agent participates in deliberation rounds. Architect says "build it"; Storytelling pushes back "but the README will read like a spec." Real differentiation moment. |
| **LIVE-01** (concierge coordinator) | Coordinator can narrate storytelling events: "Storytelling Agent flagged your README — wants to review before merge." |
| **PRO-02** (iteration loop) | Iteration loops can run storytelling-only iterations: "improve this README" → propose → review → apply → iterate. Self-evident integration. |
| **BOUNCER-01/02** | Storytelling has its own concerns; doesn't conflict with bouncer's security focus. |
| **MULTIEXEC-01** | Storytelling agent is a cloud agent (Sonnet); routing isn't affected. |
| **SANDBOX-01** | Storytelling generates text, not code that runs. No sandbox impact. |

Storytelling Agent v1 is genuinely orthogonal to the rest. Slots in cleanly.

---

## Decisions You Need To Make Before Committing

If you want to go forward (with v1 scope, not the full doc):

1. **Naming.** "PROJECT COUNCIL" collides with existing Council. Pick a distinct name for the corpus/intelligence work. Suggestions: **Library**, **Studio**, **Atelier** (Gemini already used this for the orb), **Archive**, **Folio**. I'd recommend **Library** — clean, accurate, no overlap.
2. **Categories for v1 corpus.** Pick 1-2: AI tools, developer productivity, design tools, security tools? You said hackathons are the source pain — what TYPE of project are you usually building? Curate to match.
3. **Annotation voice.** The `why_admired` field is the audit schema's only required signal in v1. Will it be: numeric scores (1-10), free-text rationale, or structured tags (`opens_with_user_pain`, `live_demo_first`, etc.)? **Recommend: free-text + structured tags.** Tags are queryable; rationale is voice.
4. **Cloud vs local for v1.** Doc emphasizes "local intelligence layer." For v1's 20-entry corpus, cloud Postgres (Supabase) is fine. Going local has value but it's friction without proportional payoff at this scale. **Recommend: Supabase for v1, evaluate local later.**
5. **Scope of "shipped projects auto-ingest."** Is it ALL successful builds, or only ones the user explicitly tags? **Recommend: explicit tag.** Auto-ingest creates noise and asks the user to annotate `why_admired` for everything they ship — fatigue.
6. **Devpost in v1 — yes or no?** I'd say **no** for v1. Hand-curate 20 things you actually like first. Revisit Devpost ingestion in v2 once the schema and querying are validated. Devpost adds an entire scraping pipeline for marginal value vs hand-picked.

---

## What I Recommend You Do Next

In priority order:

1. **First: ship LIVE-01 OR SANDBOX-01 Phase 1 from the existing backlog.** Pick whichever you want to feel happen. Both are blocking-impact items. The intelligence layer can wait one more rotation.

2. **Decide whether v1 of this is the right scope.** If you read this review and disagree, push back — your intuition about your own product is real signal. If you agree, I can write a tight `STORYTELLING_AGENT_SPEC.md` (probably 400-500 lines) that's implementation-ready for Sonnet, scoped to the v1 outline above. ~1 hour of Opus context.

3. **Don't write `STORYTELLING_AGENT_SPEC.md` yet if you're not ready to ship it.** Specs that sit unimplemented are technical debt. The 9 existing specs already exceed Sonnet's pickup velocity.

4. **Defer the rest of the intelligence layer doc.** Graphify, Obsidian, Zep, fine-tuning, MiroFish patterns, audit pipeline — these are real ideas with real value, but their value increases when v1 has shipped and proven the thesis. Try the small thing. If it works and you want more, the doc waits patiently.

5. **Open questions in the doc that I'd answer:**
   - Q1 Local Zep alternative? **Skip Zep for v1; DIFF-02 covers per-repo memory.**
   - Q2 Maestro base model? **Don't pick yet; cloud Sonnet for the gating role until you have eval data.**
   - Q3 Corpus categories Phase 2? **Don't go to Phase 2; nail v1 first.**
   - Q4 Obsidian sync? **No; UI surface is the thread.**
   - Q5 MCP always-on vs on-demand? **Neither; use Supabase edge function.**

---

## What's Genuinely Worth Keeping From The Original Doc

So I'm not just deleting things — these elements should be preserved for the eventual v2/v3:

- The audit schema concept (with the score quantification problem solved — probably tag-based, not numeric)
- The closed-loop pattern (ship → ingest → query)
- The "WHY/NOTE/HACK/DECISION" inline marker convention — this is good engineering practice regardless of intelligence layer
- The Storytelling Agent as a permanent council role
- The MiroFish pattern study as a future reference (it IS a useful blueprint, just not for v1)
- The principle that agents need INSTITUTIONAL memory, not just context windows

Park these in the back of the doc as "v2+ aspirations" rather than v1 deliverables. Keeps the vision intact, keeps the work honest.

---

## Closing Thought

You asked for honesty. Honest answer: this brainstorm is the best kind of brainstorm — it identifies a real product gap and gestures at a real solution. It's also the most dangerous kind of brainstorm because it's broad enough to absorb your entire roadmap if you let it.

Ship the smallest version that proves the thesis. If "agents grounded in curated storytelling examples produce better narrative output" is true, the 20-entry v1 will demonstrate it in two weeks. If it's not true, you've saved yourself five months of corpus pipeline work that would have proven the same thing.

The thesis is good. The doc is the wrong size for it.

---

*End of review. If you want me to draft the v1 `STORYTELLING_AGENT_SPEC.md`, say the word.*
