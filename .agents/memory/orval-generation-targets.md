---
name: Orval generation targets
description: Compatibility constraints for generated React Query hooks and Zod schemas in this workspace.
---

**Rule:** Keep Orval's React Query and Zod target majors explicitly aligned with the workspace's runtime packages.

**Why:** Orval 8.41 can fail to infer workspace package versions and otherwise emits React Query v4 and Zod v4 output, which does not typecheck against the project's installed Query v5 and Zod v3 packages.

**How to apply:** When changing Orval, run API code generation and the full workspace typecheck. Change the explicit target versions only when the corresponding runtime dependencies are upgraded in lockstep.
