# Canary — Product context

**Register:** product (clinical tool UI). Design SERVES the task; earned familiarity over novelty.

**What it is:** a single-page demo of the Canary loop for one CHF patient story —
① physician triage → ② FHIR hand-off → ③ home monitoring. A judge watches a discharge
packet get read by AI, scored by transparent deterministic rules, the doctor decide, the
data travel untouched to the homecare EMR, and a day-4 trajectory alert fire before any
single vital looks alarming.

**Primary user (in the demo):** a physician at the point of discharge, then a care
coordinator on the monitoring side. Real audience: hackathon judges — so the interface
must be inspectable live ("why 86?" answerable by pointing at the screen).

**Non-negotiables (the demo's credibility rests on these):**
- Every on-screen number traces to the engine's `contributions` / `TierResult`. No copy can contradict the math.
- Accept and Override are equal weight — the UI never nudges the clinical decision.
- A tier is always color + icon + word (accessibility + honesty).
- The individual thresholds are visible, so "no single value is out of range" is provable, not asserted.
- Works fully offline (press `F`) — zero hard network dependency.

**Register fit:** dense, legible, restrained. Linear/Stripe-grade trust, not marketing flash.
The one place delight is earned is the day-4 monitoring moment (the payoff).
