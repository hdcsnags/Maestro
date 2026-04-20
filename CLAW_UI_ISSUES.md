# Claw Mode — UI Polish & Flagged Issues

Tracking minor UI/UX items flagged during testing. Check off as addressed.

## Phase 0 Flags

- [ ] **Orb should replace robot icon** — The empty-state bot icon (🤖) should eventually be the Maestro orb. Low priority, cosmetic.
- [ ] **Left nav for sessions/threads** — Collapsible sidebar showing sessions and thread history. Important for multi-thread workflows in Phase 1+.
- [ ] **Lazy scroll / virtualization** — For very long chat threads, consider virtualizing the message list to keep performance smooth.
- [ ] **Model picker label should show active model in thread** — When resuming a thread, the header should reflect which model was used (store in thread metadata).

## Future Phase Flags

_(Add items here as they come up during Phase 1-3 testing)_

## Phase 1 Flags

- [x] **Model picker z-index bug** — Dropdown opens but clicks don't register. Header was `z-10`, same as content area; dropdown trapped behind content. Fixed: header bumped to `z-20`.
- [x] **Direct chat missing broadcast context** — Clicking agent pill created empty thread. Agent's broadcast response not carried over. Fixed: new direct threads seed with agent's latest response.
- [x] **Export/download on carousel cards** — Each FolioCard now has an "Export" button that downloads the response as markdown (includes agent name, model, date, content, file manifest).
- [ ] **Agent pill UX — double-click vs single-click** — User had to double-click pills to enter Focus view. May need debounce or clearer affordance (e.g., "Click to chat" tooltip).
- [ ] **UX/UI tightening pass** — General layout, spacing, and visual polish TBD after functional testing.
