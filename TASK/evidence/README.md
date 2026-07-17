# Evidence directory convention

Execution notes referenced by `09-EXECUTION-STATUS.md` live under:

```text
TASK/evidence/<TASK-ID>/<YYYYMMDD-HHmm>-<actor-slug>.md
```

Examples:

```text
TASK/evidence/INT-100/20260717-1430-agent-fnd.md
TASK/evidence/QLT-220/20260718-0915-agent-qa.md
```

The note must use the handoff template in `08-AGENT-EXECUTION-RUNBOOK.md`, link the exact commit/CI run/test artifacts, and never contain raw credentials, tokens, recovery codes, document bytes, signed URLs, provider signatures, or unnecessary PII. Use sanitized hashes/metadata and test assertions instead.

One task may have multiple notes after handoffs; the registry cell should link the final note and any superseded note needed to explain a decision. Do not overwrite prior evidence. If evidence is stored in CI/PR tooling, add its immutable URL and keep this directory note as the index.
