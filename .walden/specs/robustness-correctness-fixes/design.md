---
status: approved
approved_at: 2026-07-05T10:40:37Z
last_modified: 2026-07-05T10:40:37Z
approved_fingerprint: sha256:dafbd5082e796740bc2ba9f46a3581e5bdc31c8e209e86e2557b378929e6a172
source_requirements_approved_at: 2026-07-05T10:35:56Z
source_requirements_fingerprint: sha256:6b442a97625dd0138348e30de0084396479db8b0e8261e31a6f9d3f6584f3dfb
---

# Feature Design

## Overview

Cinque fix localizzati, indipendenti tra loro, ciascuno con test unitario (axios/fs mockati). Nessun refactoring strutturale: si correggono comportamenti specifici in `sonar/client.ts` (R1, R2, R3) e in due handler (R4, R5).

## Architecture

Nessun cambiamento architetturale: modifiche puntuali a metodi esistenti. Il flusso resta identico; cambiano il calcolo delle pagine (R1), l'identificazione del task CE (R2), la condizione di uscita del cache-refresh (R3), l'allineamento degli enum azione (R4) e la gestione errore/validazione di delete (R5).

## Options Considered

### Option A — Fix mirati in-place (SCELTA)

- Summary: correggere ogni bug nel suo punto, con test dedicati.
- Why chosen: sono bug distinti e circoscritti; un intervento mirato è a rischio minimo e verificabile.

### Option B — Rinviare i 2 fix di `client.ts` a un refactoring più ampio

- Summary: aspettare lo split dei cluster A/C di `client.ts`.
- Why rejected: i bug (10k, polling CE) sono attivi e vanno chiusi ora; sono indipendenti dallo split.

## Simplicity And Elegance Review

- Simplest viable shape: modifiche minime che preservano firme e flusso dove possibile; un solo nuovo helper (`readCeTaskId`).
- Coupling check: nessun nuovo accoppiamento; R4 riduce il drift (una sola lista di azioni).
- Future-proofing: i fix non ostacolano i futuri split A/C.

## Components And Interfaces

### R1 — `getIssues`: cap alla finestra dei 10k (`sonar/client.ts`)

- Cambio: `MAX_PAGE = Math.floor(10000 / PAGE_SIZE)` (= 20). Le pagine da recuperare diventano `2..min(totalPages, MAX_PAGE)`. Se `total > 10000`, loggare un avviso di **troncamento** e restituire comunque le issue recuperate (no `Promise.all` che rigetta su 400).
- Requirements: `R1.AC1`, `R1.AC2`, `R1.AC3`

### R2 — Polling CE per task id (`sonar/client.ts`, `ScanOrchestrator`)

- Nuovo helper `readCeTaskId(projectPath): Promise<string | null>`: legge `report-task.txt` (prova `<path>/.scannerwork/report-task.txt`, poi `target/sonar/`, `build/sonar/`), estrae `ceTaskId=`; ritorna `null` se assente.
- `waitForAnalysis(timeout?, ceTaskId?)` e `checkTaskStatus(ceTaskId?)`: se `ceTaskId` presente → `GET /api/ce/task?id=<id>` (task specifico); altrimenti → l'attuale `GET /api/ce/activity` (fallback, **R2.AC2**).
- `ScanOrchestrator` (unico caller, riga ~417): `const ceTaskId = await sonarClient.readCeTaskId(projectPath); await sonarClient.waitForAnalysis(60000, ceTaskId ?? undefined)`.
- Requirements: `R2.AC1`, `R2.AC2`

### R3 — Cache-refresh: niente uscita su zero stabile (`sonar/client.ts`)

- Cambio in `waitForCacheRefresh`: la condizione di uscita diventa `previousIssueCount >= 0 && currentCount === previousIssueCount && currentCount > 0`. Un conteggio 0 stabile (CE ancora in indicizzazione) non conclude "cache refreshed"; il progetto genuinamente pulito esce comunque al timeout (comportamento sicuro).
- Requirements: `R3.AC1`

### R4 — `config_manager`: enum azioni allineati (`tool-definitions`, `mcp-schemas`, handler)

- Cambio: `tool-definitions.ts` enum `['view','validate','reset','update']` → `['view','validate','reset']`; `SonarConfigManagerSchema` (zod) `['get','set','validate','reset']` → `['view','validate','reset']`; l'handler chiama `validateInput(SonarConfigManagerSchema, args, 'sonar_config_manager')` all'ingresso (un'azione ignota → `ValidationError` actionable, **R4.AC3**). Lo `switch` mantiene il `default` come rete di sicurezza.
- Requirements: `R4.AC1`, `R4.AC2`, `R4.AC3`

### R5 — `delete_project`: `isError` e conferma (`delete-project.handler.ts`)

- Cambio: nel `catch`, aggiungere `isError: true` al risultato (**R5.AC1**). All'ingresso, `validateInput(SonarDeleteProjectSchema, args, 'sonar_delete_project')` che impone la guardia `confirm` (**R5.AC2**).
- Requirements: `R5.AC1`, `R5.AC2`

## Data Models

Nessun nuovo modello.

## Error Handling

- R1: nessun throw sul limite 10k; troncamento loggato.
- R4/R5: errori di validazione normalizzati (`ValidationError` → messaggio actionable); `delete` fallito → `isError: true`.

## Failure Modes And Tradeoffs

- Failure mode: `report-task.txt` in un percorso non previsto → nessun `ceTaskId`.
  - Mitigation: fallback all'`ce/activity` attuale (**R2.AC2**); nessuna regressione rispetto a oggi.
- Failure mode: progetto genuinamente con 0 issue → `waitForCacheRefresh` attende l'intero timeout.
  - Mitigation: accettabile (max 15s poi procede); meglio di un falso "0 issue".
- Tradeoff: R4 rimuove `update`/`set`/`get` mai implementati dalla superficie (scelta: allineare al reale, non implementare una nuova scrittura config).

## Testing Strategy

- R1: mock axios, `total=15000` → asserire ≤ 20 pagine richieste, nessun throw, avviso troncamento.
- R2: mock `fs` (report-task.txt) + axios `ce/task?id=` → asserire poll per id; senza file → fallback `ce/activity`.
- R3: `getIssues` mockato a 0,0 → non esce; a 5,5 → esce.
- R4: azione ignota → errore; test di consistenza enum tool-def ↔ zod.
- R5: delete fallito → `isError:true`; `confirm:false` → errore/nessuna cancellazione.

## Verification Plan

- Requirement proof: unit test per ciascun R (axios/fs mockati) + build `strict` + suite completa verde.
- Test evidence: nuovi test in `client.test.ts`, `config-manager.handler.test.ts`, `delete-project.handler.test.ts`.
- Operational evidence: R1/R2 richiedono un Sonar live con dati reali per la prova end-to-end (fuori CI, **C1**).

## Requirement Coverage

<!-- Every ID MUST be wrapped in backticks — the validator rejects rows without them -->
| Requirement | Covered By |
| --- | --- |
| `R1` | `getIssues` cap `MAX_PAGE` + troncamento |
| `R2` | `readCeTaskId` + `waitForAnalysis`/`checkTaskStatus` per id, fallback |
| `R3` | `waitForCacheRefresh` condizione `> 0` |
| `R4` | enum allineati (tool-def/zod/handler) + `validateInput` |
| `R5` | `isError:true` nel catch + `validateInput` (guardia confirm) |
| `NFR1` | `strict` pulito, nessun nuovo `as any` |
| `NFR2` | suite completa verde (parità) |
| `NFR3` | unit test con axios/fs mockati |
