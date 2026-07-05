---
status: approved
approved_at: 2026-07-05T10:35:56Z
last_modified: 2026-07-05T10:35:56Z
approved_fingerprint: sha256:6b442a97625dd0138348e30de0084396479db8b0e8261e31a6f9d3f6584f3dfb
---

# Requirements Document

## Introduction

Correzione di 5 bug concreti individuati nella review, in un unico spec. Tre sono verificabili offline (config_manager, delete_project, cache-refresh); due sono robustezza della pipeline scan/API in `sonar/client.ts` (limite 10k issue, polling CE) — implementati e coperti da unit test con axios mockato, con validazione end-to-end su Sonar live segnalata come fuori CI.

## Requirements

### R1 Paginazione oltre la finestra dei 10.000 risultati (`getIssues`)

**User Story:** Come utente con un progetto grande, voglio che il recupero delle issue non fallisca del tutto quando ce ne sono più di 10.000, così da avere comunque i risultati.

#### Acceptance Criteria

1. `R1.AC1` WHEN a project has more issues than the SonarQube 10,000-result window, the system SHALL still return the issues it can fetch without failing the entire retrieval.
2. `R1.AC2` The system SHALL request issue pages only within the server's `page * pageSize <= 10000` limit.
3. `R1.AC3` IF the available results exceed the 10,000-result window, THEN the system SHALL stop at the limit and signal that the result set was truncated.

### R2 Polling del Compute Engine per task id

**User Story:** Come utente, voglio che l'attesa dell'analisi guardi il task della MIA analisi, così da non leggere lo stato di un task sbagliato su progetti condivisi.

#### Acceptance Criteria

1. `R2.AC1` The system SHALL poll the Compute Engine task using the analysis's own task id (from the scanner's `report-task.txt`) rather than the latest task for the project.
2. `R2.AC2` IF the analysis task id cannot be determined, THEN the system SHALL fall back to the previous behavior with a logged caveat.

### R3 L'euristica di cache-refresh non conclude prematuramente

**User Story:** Come utente, voglio che un conteggio "0 issue" durante l'indicizzazione non venga scambiato per "scansione pulita", così da non ricevere risultati vuoti falsi.

#### Acceptance Criteria

1. `R3.AC1` WHILE the Compute Engine is still indexing results, the system SHALL NOT conclude that the cache is refreshed based solely on a stable count of zero.

### R4 `config_manager`: azioni pubblicizzate = implementate

**User Story:** Come utente, voglio che ogni azione offerta dal tool esista davvero, così da non incappare in un'azione pubblicizzata ma rotta.

#### Acceptance Criteria

1. `R4.AC1` The `config_manager` tool SHALL advertise only actions that are implemented.
2. `R4.AC2` The `config_manager` input validation schema SHALL accept exactly the implemented actions, consistent with the tool definition.
3. `R4.AC3` IF an unsupported action is requested, THEN the system SHALL return a clear, actionable error rather than an uncaught exception.

### R5 `delete_project`: segnala i fallimenti e impone la conferma

**User Story:** Come utente, voglio che una cancellazione fallita sia segnalata come errore e che la conferma sia obbligatoria, così da non credere riuscita una cancellazione fallita né cancellare per sbaglio.

#### Acceptance Criteria

1. `R5.AC1` IF a project deletion fails, THEN the system SHALL return the error result with `isError: true`.
2. `R5.AC2` The system SHALL validate the input and enforce the `confirm` flag before performing a deletion.

## Non-Functional Requirements

- `NFR1` The system SHALL preserve TypeScript `strict` compilation and introduce no new `as any` at the touched sites.
- `NFR2` The fixes SHALL NOT regress the existing behavior of the affected tools/methods (bridged by full-suite parity).
- `NFR3` Each fix SHALL be covered by unit tests with the SonarQube API mocked (no live server required).

## Constraints And Dependencies

- `C1` I fix di `getIssues` (10k) e del polling CE sono in `sonar/client.ts`: unit-test con axios mockato; la prova end-to-end richiede un SonarQube live con dati reali (fuori CI).
- `C2` Il polling per task id dipende dalla presenza di `.scannerwork/report-task.txt` prodotto dallo scanner.
- `C3` Nessun cambiamento alla API pubblica dei tool oltre a quanto necessario per R4 (allineamento enum azioni).

## Out Of Scope

- Retry sugli errori transienti di rete/5xx (miglioramento separato).
- Health-check pre-scan e il resto della robustezza (voci review non incluse qui).
- Refactoring dei cluster A/C di `client.ts` (spec separati).
