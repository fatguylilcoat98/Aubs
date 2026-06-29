<!-- Phase B execution order. Companion to PHASE_B_ROADMAP.md and RISK_REGISTER.md.
     Item IDs are shared across all three. Planning only — no code, no defaults, no Pages. -->

# AUBS — Phase B Execution Order

Recommended sequencing of the roadmap items, derived from their dependencies and from the rule that **nothing is promoted toward default‑on before its category gate is met**. Sequence by **dependency and gate**, not by raw priority number — a P1 polish item can ship before a P2 feature it unblocks.

## Dependency graph (who must precede whom)

```
PH-1 (durability) ─┐
PH-2 (scaling) ────┼─► LEDGER default-on gate ─► EC-3, EC-5, PH-5
PH-3 (mem harden) ─┬─► IN-1 (TSM in chat) ─┬─► IN-2 (grounding)
                   │                        ├─► IN-3 (multi-step planner)
                   └─► EC-4 (multi-user) ◄──┘
UX-1/UX-2/UX-3 ────► OUTWARD-UX gate ─► EC-1 ─► EC-2
PH-4 (bundling) ───► EC-1
UX-7 (decision) ───► informs UX-4/UX-5/EC-1 surfacing
```

Independent / no upstream dependency: **PH‑1, PH‑2, PH‑3, PH‑4, UX‑1, UX‑2, UX‑3, UX‑7, UX‑4, UX‑5, UX‑6, IN‑4, PH‑6.**

## Optimal order — four waves

Each wave ends at a **gate**; do not start the next wave's dependent items until the gate passes. Items inside a wave marked ∥ can run in parallel.

### Wave 0 — Foundations (P0 hardening). *Must precede any ledger/TSM default‑on.*
1. **PH‑1** Ledger durability (Low) ∥
2. **PH‑3** Memory‑service hardening (Low) ∥
3. **PH‑2** Ledger scaling / checkpoint + rotation (Med‑High) — the long pole; start early.
> **Gate 0:** ledger verifies under rotation + simulated quota in a real browser (🌐), verify cost is bounded, and the memory service has no unhandled‑rejection path (🔬). Ledger may now be considered for default‑on; TSM may be wired (IN‑1).

### Wave 1 — Make it feel finished + decide (P1). *Unblocks all outward work.*
4. **UX‑1** User‑safe error strings ∥
5. **UX‑2** Version label (retire internal build string) ∥
6. **UX‑3** Human‑language flag‑mode strings ∥
7. **UX‑7** Founder decision on Glass Box "Why?" visibility (do this early — it informs UX‑4/UX‑5 and every outward surface)
8. **PH‑4** Production bundling (Low‑Med) ∥
> **Gate 1 (Outward‑UX):** a no‑flag device pass (📱) shows zero internal vocabulary; bundled build is behavior‑identical to the unbundled stack (🔬🌐).

### Wave 2 — Core Phase‑B value: governed intelligence (P2).
9. **IN‑1** Wire TSM into the constitutional chat path (Med) — depends PH‑3; prove flag‑OFF byte‑identical.
10. **IN‑2** Surface grounding through the constitutional path (Med) — depends IN‑1.
11. **IN‑4** Router/Response‑Quality evaluation → default‑on criteria (Med) — independent; can run ∥ with IN‑1.
12. **PH‑5** Key resilience (Low) ∥; **PH‑6** Flag lifecycle (Low) ∥; **UX‑4** console hygiene ∥; **UX‑5** recovery/tamper messaging ∥.
> **Gate 2 (Memory/TSM‑in‑chat):** IN‑1 is flag‑gated, flag‑OFF byte‑identical (🔬📱), grounded answers cite real memory, and a 🏛 review confirms permissions are honored end‑to‑end.

### Wave 3 — Ecosystem + advanced intelligence (P3).
13. **EC‑1** Activate Tools (M10) behind a flag — depends UX‑3, PH‑4.
14. **EC‑2** Activate Skills (M11) beyond `local_chat` — depends EC‑1.
15. **IN‑3** Multi‑step planner in chat — depends IN‑1.
16. **EC‑4** Multi‑user readiness / owner‑bound scopes — depends PH‑3, IN‑1 (High; 🏛 first).
17. **EC‑3** Governed external provider path + egress consent — depends PH‑1, PH‑2, UX‑3 (High; 🏛 first).
18. **EC‑5** Ledger portability / export‑import — depends PH‑2.
19. **UX‑6** Micro‑polish (anytime; lowest cost).
> **Gate 3 (Ecosystem):** each surface is default‑OFF, governed end‑to‑end, fail‑closed, and 🏛‑reviewed before it is even offered behind a flag.

## Rationale for the ordering
- **Hardening before promotion.** The acceptance pass showed the ledger silently disables and the memory service can reject unhandled. Fix those before anyone depends on the ledger or wires TSM — otherwise outward work inherits latent breakage.
- **PH‑2 starts first despite being mid‑wave‑0** because it is the highest‑effort, highest‑risk item and gates the most downstream work (EC‑3, EC‑5, default‑on).
- **UX before Ecosystem.** No outward surface (tools, skills, cloud) should ship while internal vocabulary still leaks; UX‑1/2/3 are cheap and unblock everything user‑facing.
- **IN‑1 is the hinge.** Governed memory‑in‑chat is the first item that delivers visible Phase‑B value *and* is the dependency for grounding, the multi‑step planner, and multi‑user. It cannot start before PH‑3.
- **The two High‑risk ecosystem items (EC‑3 cloud egress, EC‑4 multi‑user) come last and 🏛‑review first** — they are the only items that change the privacy/security posture, so they get the most scrutiny and the most stable base beneath them.

## Standing constraints during Phase B
Every item lands on a feature branch behind a **default‑OFF flag**; flag‑OFF must remain byte‑identical to the working offline loop; no Pages change and no default flip without an explicit founder go; the model identifier never appears in commits/PRs/code.
