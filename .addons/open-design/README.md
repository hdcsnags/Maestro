# open-design — Plugin Summary

**Source:** https://github.com/nexu-io/open-design  
**Pulled:** 2026-06-02  
**License:** Apache 2.0  
**Stars:** ~40K  
**Version:** 0.8.0-preview

## Overview
Open-source alternative to Claude Design. Auto-detects 16 coding-agent CLIs on PATH, drives them with 139 composable Skills and 150 brand-grade Design Systems. Local-first, BYOK, web-deployable.

**Supported CLIs:** Claude Code, Codex, Devin for Terminal, Cursor Agent, Gemini CLI, OpenCode, Qwen, GitHub Copilot CLI, Kimi, and more.

## What's Relevant to Maestro
Maestro's **Design Phase** (between Synthesis and Pre-Build) is entirely unbuilt. Open Design directly addresses this:
- Agents produce HTML mockups → user reviews → locks design
- 150 design systems = design token library for Design Phase prompts
- 139 skills: layout, color, typography, component generation
- BYOK proxy for agents without local CLI

## Compatibility: ✅ MEDIUM-HIGH for Design Phase
This is the closest open-source implementation of what Maestro's Design Phase describes. Study before designing that phase.

## Integration Path
- Study skill system and design-token approach before building Design Phase
- HTML mockup generation flow → adapt for `FolioCard` artifact output in Design mode
- Design system tokens → embed subset in Maestro's Design Phase system prompts

## Action
Full read before Sprint 3 / Design Phase design. Don't install — reference architecture only.
