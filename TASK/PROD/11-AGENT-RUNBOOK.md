# 11 — Agent execution runbook (PROD)

## 1. Before any code

1. Read `TASK/PROD/README.md` + `00` + `01` + target phase file.
2. Open `09-EXECUTION-STATUS.md`; claim **one** task (`in_progress`).
3. Confirm dependencies are `done`.
4. Confirm UI freeze unless task allows exception.
5. Confirm you will **not** paste secrets from `/var/www/pg.txt` into the repo.

## 2. Claim format (in 09 board)

```md
| PROD-B10 | done | @nikki/opencode | 2026-07-19 | evidence/PROD-B10/20260719-opencode.md |
```

Only one `in_progress` money-path task per agent unless parallel-safe (read-only docs).

## 3. Implementation order inside a task

1. Tests first when behavior is specified (adapter unit / integration).
2. Port-compatible changes; avoid leaking provider DTOs upward.
3. Config fail-closed tests for staging/production.
4. OpenAPI update if HTTP surface changes.
5. FE mapper-only changes if DTO shifts (no redesign).
6. `go test` / `npm run typecheck` as applicable.
7. Evidence file under `TASK/PROD/evidence/<TASK-ID>/`.

## 4. Evidence template

```md
# PROD-XXX — evidence

- Date:
- Agent:
- Commit:
- Scope:

## Commands run
(redact secrets)

## Results
pass/fail

## Manual proof
links/ids only

## Rollback
how to undo

## Secrets check
- [ ] no keys in this file
- [ ] no keys in commit
```

## 5. Done criteria

- [ ] Acceptance checkboxes in phase file marked in evidence (copy).
- [ ] `09` status → `done` + evidence path.
- [ ] No unrelated refactors.
- [ ] Push only if user asked or program policy allows.

## 6. Stop conditions (escalate)

- Need live money movement without owner GO.
- Need to break UI freeze for non-listed reason.
- Provider API ambiguity (Duitku signature) — document and pause.
- Secret appeared in git — rotate immediately, purge, incident note.

## 7. Preferred vertical order for first week

```text
A10 → A20 → B10 → B20 → B30 → C10 → C20 → D10 → D20 → D30 → E10 → E20 → F20 → F30 → F40
```

Then G* with humans.
