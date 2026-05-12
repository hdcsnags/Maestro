# Maestro — User Guide

Maestro is an AI orchestration console. You type one prompt, it broadcasts to
several AI models at once, lets you compare their answers side-by-side,
synthesizes them into one answer, and (optionally) writes the result directly
to a GitHub repo as a pull request.

This guide walks a brand-new user from "I just opened the app" to "I shipped
something built by an orchestra of AIs."

---

## 1. Sign in

Open the app and sign in with your email. That's it — no team setup, no
org invite. Your workspace is created automatically.

---

## 2. Connect your API keys (the Vault)

Press **`V`** anywhere in the app to open the **Vault**. This is where you
paste API keys for the model providers you want to use. Keys are encrypted
at rest in Supabase and never leave your workspace.

You can connect any combination of:

| Provider    | Where to get a key                                  |
|-------------|------------------------------------------------------|
| Anthropic   | https://console.anthropic.com → API Keys           |
| OpenAI      | https://platform.openai.com → API Keys             |
| Google      | https://aistudio.google.com → Get API Key          |
| OpenRouter  | https://openrouter.ai/keys (has free models)       |

**You don't need all four.** Even one is enough to start.

Once a key is in, the provider row shows a green dot and its models become
available in the Orchestra.

### 2a. Getting keys for free (recommended path for first-time users)

You can try Maestro end-to-end without paying anything. Here's the fastest
route to a working setup, ranked easiest → most involved:

**🥇 OpenRouter (easiest, fully free models)**
1. Go to https://openrouter.ai and sign in with Google/GitHub.
2. Visit https://openrouter.ai/keys → **Create Key** → copy it.
3. Paste into Maestro's Vault under OpenRouter.
4. Models ending in `:free` cost $0 — Qwen 3 235B, Llama 4 Maverick,
   DeepSeek V3, GPT-OSS 120B, and more are all in the free tier.
5. Rate limits: ~50 free requests/day without credit, ~1000/day if you
   ever top up $10 (one-time, not a subscription).

**This is the only provider where you can legitimately run forever on $0.**
If your goal is "try the tool without a credit card," stop here.

**🥈 Google Gemini (free tier, credit card not required)**
1. Go to https://aistudio.google.com → **Get API Key** → **Create API key
   in new project**.
2. Copy, paste into Maestro's Vault under Google.
3. Gemini 2.0 Flash and 1.5 Flash have a generous free tier (currently
   ~15 requests/minute, 1M tokens/day). No billing setup required.

**🥉 Anthropic (small trial credit)**
1. Sign up at https://console.anthropic.com.
2. New accounts get a small free credit (typically $5) that you can burn
   through Haiku 4.5 broadcasts pretty far before it runs out.
3. API Keys → **Create Key** → paste into the Vault.
4. When the credit runs out, you'll need to add a payment method to keep
   going — but $5 of Haiku is a *lot* of broadcasts.

**OpenAI (no free tier anymore)**
OpenAI removed their free trial credit for new accounts. You'll need to
add a payment method and fund at least $5 to get an API key working. If
you're trying to stay at $0, **skip OpenAI and use OpenRouter's
`openai/gpt-oss-120b:free`** model instead — it's in the same neighborhood
and costs nothing.

### Recommended first-time combo

For your very first Maestro run, connect **OpenRouter + Google**. That gives
you:

- Qwen 3 235B (free via OpenRouter)
- GPT-OSS 120B (free via OpenRouter)
- Gemini 2.0 Flash (free via Google direct)

Three voices, zero dollars, no credit card. You can upgrade to paid
providers later once you know you like the tool.

---

## 3. Connect GitHub (optional, but where it gets fun)

Still in the Vault, click **Connect GitHub**. Paste a personal access token
with `repo` scope (https://github.com/settings/tokens).

Then open the **Orchestra drawer** (click the `Orchestra` button in the
composer, or press `O`) and pick a repo from the dropdown. Maestro stores
this as the "active repo connection" — anything the agents write will target
this repo.

You can also set **scoped paths** per agent — e.g. the frontend agent can
only touch `src/**`, the docs agent only `docs/**`. This is a safety rail:
the server will block writes outside declared scopes unless you explicitly
flip the "conductor override" switch.

---

## 4. Pick your agents

Open the Orchestra drawer. You'll see slots for each provider. Toggle agents
on/off — each active agent is one voice in the broadcast. Defaults:

- **Claude Haiku 4.5** — fast triage
- **GPT-4o mini** — fast drafting
- **Gemini 2.0 Flash** — spatial/UI-leaning
- **Qwen 3 235B (free)** — free tier baseline

Premium models (Opus, GPT-4o, o1, Gemini Pro) are there too — you just need
the corresponding key in the Vault.

> **Heads up:** Maestro caps broadcasts at **3 premium agents per round** by
> default. If you select more, the composer shows a warning and blocks send
> unless you switch to Elevated mode (see §7).

---

## 5. Pick an orchestration mode

The composer has three mode pills: **Analysis · Build · Artifact**.

- **Analysis** — agents discuss and explain. No files, no code.
- **Build** — agents return code changes as unified diffs with metadata
  (files modified, lines added/removed). This is what you want for
  "change the repo" tasks.
- **Artifact** — agents return a single self-contained file (a markdown doc,
  an HTML page, a script). Good for "write me a README" or "draft a
  landing page."

---

## 6. Broadcast your first prompt

Type in the composer. Before you send, Maestro shows you an **Estimated
Input Cost** line — something like `~$0.04–$0.12 across 4 agents · 1 free`.
This is computed locally from a hard-coded price table, not a live API call,
so you can trust it's free to look at.

Hit **`⌘/Ctrl + Enter`** (or click Broadcast).

Each agent responds in its own card (Maestro calls these "folios"). You can:

- **Flag** a response as low quality
- **Pin** one as important (pinned responses feed into future rounds as
  context)
- **Mark as Lead** — that agent's answer becomes the spine of the synthesis

When the round finishes, Maestro runs a **synthesis pass** that merges the
agent outputs into one unified answer using the lead agent's voice.

Send another prompt to start another round. Earlier rounds automatically
feed forward as context (tiered: synthesis → summaries → pinned → file
references), so the conversation accumulates naturally.

---

## 7. Execute: write to GitHub

When you have a synthesis you like and you're in **Build mode**, click
**Execute** (bottom of the synthesis card). This opens the Execution modal.

Pick a strategy:

- **Per-agent branches** — each agent's contribution becomes its own branch
  and PR (society-of-mind style).
- **Synthesized PR** — one combined branch/PR built from the synthesis.

Then pick an **execution mode**:

- **Analyze** — dry run, nothing written. Safe default.
- **PR Flow** — writes to GitHub, opens a PR for you to review.
- **Elevated** — writes directly, bypasses some checks, **requires explicit
  approval for every run** via the Approval modal. Use this when you trust
  the synthesis and just want it to ship.

In Elevated mode you'll see an **Approval modal** showing exactly what will
be written: the agent, the branch, the scoped paths, and the list of files
affected with line counts. Click **Approve**, optionally tick "Approve for
10 minutes" to skip the modal on subsequent runs that target the **exact
same repo + branch + scope** within that window.

Once execution completes you get clickable PR links. Open them in GitHub,
review, merge. Done.

---

## 8. A suggested first project

Try this end to end:

1. Connect OpenRouter (free) + one premium provider of your choice.
2. Create a throwaway public repo on GitHub — e.g. `my-first-maestro`.
3. Connect it in the Vault.
4. In Orchestra, scope one agent to `src/**` and another to `README.md`.
5. Switch to **Build** mode and broadcast:
   > *"Create a tiny React counter app in `src/`. Write a README explaining
   > how to run it."*
6. Review the folios, pick a lead, synthesize.
7. Click **Execute** → **Synthesized PR** → **PR Flow**.
8. Open the PR link, merge, and you've got a working app built by a panel
   of AIs.

---

## 9. Keyboard shortcuts

| Key           | Action                        |
|---------------|-------------------------------|
| `V`           | Open Vault (API keys)         |
| `O`           | Open Orchestra drawer         |
| `⌘/Ctrl+Enter`| Broadcast current prompt      |
| `Esc`         | Close any modal               |

---

## 10. When something goes wrong

- **"No repository connected"** — open the Vault, connect GitHub, then pick
  a repo in the Orchestra drawer.
- **"Agent has no scoped paths — writes will be blocked"** — either set
  scoped paths in the Orchestra drawer, or tick "Conductor override" in the
  Execution modal.
- **"Approval scope mismatch"** — your reused approval doesn't match the
  current run's repo/branch/paths exactly. Hit Execute again to request a
  fresh approval.
- **Premium cap warning** — reduce selected premium agents to 3 or switch
  to Elevated mode and confirm.

---

That's the whole flow. If you can connect a key, pick a repo, type a prompt
and click Execute, you can ship.
