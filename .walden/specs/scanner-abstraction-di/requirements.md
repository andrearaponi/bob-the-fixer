---
status: approved
approved_at: 2026-07-05T07:44:47Z
last_modified: 2026-07-05T07:44:47Z
approved_fingerprint: sha256:b69bf78b5ba6a7766b8e6297045eced324fe07839c3914cf7045b301fdee1054
---

# Requirements Document

## Introduction

Questo spec risolve il debito architetturale che oggi impedisce di aggiungere in modo pulito un nuovo scanner (in particolare un `TrivyScanner` per la SCA). Due problemi sono accoppiati e vanno affrontati insieme: (1) lo strato di Dependency Injection (TSyringe) è cablato ma **mai risolto a runtime** — ogni handler MCP ha una classe `@injectable` e una funzione `@deprecated`, e il router usa la funzione deprecata; (2) l'astrazione multi-scanner `IScanner` è modellata su SonarQube ("interroga un progetto lato server per la sua chiave"), è implementata solo da `SonarQubeScanner` (il cui `scan()` lancia "not implemented"), `IScannerFactory` non è mai implementata, e `ScanOrchestrator` parla direttamente a `SonarQubeClient` invece che all'astrazione.

L'obiettivo è: scegliere **un solo** meccanismo di wiring ed eliminare quello morto; ridisegnare `IScanner` attorno al modello "scan-and-return" (che vale sia per Sonar sia per Trivy); migrare il path SonarQube esistente sull'astrazione **senza regressioni**; e dimostrare che un nuovo scanner si aggiunge senza toccare l'orchestratore.

<!-- assumed: lo scope è l'ABILITAZIONE (decisione DI + astrazione scanner + migrazione del path Sonar + prova di estensibilità). L'implementazione completa del TrivyScanner SCA (rilevamento installazione, SBOM, arricchimento dependency-vuln) è uno spec successivo. Coerente con la scelta esplicita dell'utente "DI + astrazione scanner", distinta dall'opzione "implementa Trivy". -->

## Requirements

### R1 Wiring unico per gli handler MCP

**User Story:** Come manutentore, voglio un solo meccanismo di costruzione/dispatch degli handler MCP, così da eliminare il percorso duplicato e morto introdotto dal refactoring DI incompleto.

#### Acceptance Criteria

1. `R1.AC1` The system SHALL resolve every MCP tool handler through a single wiring mechanism.
2. `R1.AC2` The system SHALL contain no handler construction path that is registered but unreachable through `ToolRouter`.
3. `R1.AC3` The system SHALL type the scanner and handler wiring boundary without `any` casts.

### R2 Contratto scanner "scan-and-return"

**User Story:** Come sviluppatore che aggiunge uno scanner, voglio un contratto `IScanner` che restituisca i risultati direttamente da una scansione, così da poter integrare tool locali come Trivy che non hanno uno store lato server interrogabile per chiave progetto.

#### Acceptance Criteria

1. `R2.AC1` WHEN a scan is requested for a project path, the system SHALL invoke the selected scanner's scan operation with the target path and its options.
2. `R2.AC2` WHEN a scanner completes a scan, the system SHALL return the findings as a normalized `IScanResult` whose entries are normalized `IIssue` values.
3. `R2.AC3` The system SHALL support scanners that produce findings directly from a scan without querying a server-side issue store keyed by project.

### R3 Estensibilità senza modificare l'orchestratore

**User Story:** Come sviluppatore, voglio poter registrare un nuovo scanner senza modificare `ScanOrchestrator`, così che aggiungere Trivy (o altri) sia un'estensione e non una riscrittura.

#### Acceptance Criteria

1. `R3.AC1` WHERE an additional scanner implementation is registered, the system SHALL include it in the scan pipeline through the `IScanner` contract.
2. `R3.AC2` The system SHALL allow adding a new scanner implementation without modifying `ScanOrchestrator`.

### R4 Migrazione del path SonarQube sull'astrazione, senza regressioni

**User Story:** Come utente esistente, voglio che il comportamento del path SonarQube resti identico dopo il refactoring, così da non perdere alcuna funzionalità dei tool attuali.

#### Acceptance Criteria

1. `R4.AC1` The system SHALL route SonarQube scanning and issue retrieval through the `IScanner` abstraction.
2. `R4.AC2` WHEN the `sonar_scan_project` tool is invoked after the migration, the system SHALL produce the same scan-summary output structure as before the migration.

### R5 Gestione dei fallimenti degli scanner

**User Story:** Come utente, voglio errori chiari quando uno scanner non è disponibile o fallisce, così da capire cosa fare senza compromettere il resto del sistema.

#### Acceptance Criteria

1. `R5.AC1` IF a selected scanner's backend or executable is unavailable, THEN the system SHALL return a normalized, actionable error that identifies the scanner and the remediation step.
2. `R5.AC2` IF a scanner throws during a scan, THEN the system SHALL release any acquired scan lock and surface a normalized error.
3. `R5.AC3` IF a scanner error message would include an authentication token, THEN the system SHALL mask the token before surfacing the message.

### R6 Il modello normalizzato è l'unico contratto verso i consumatori

**User Story:** Come manutentore, voglio che i servizi di reporting/analisi dipendano solo dal modello normalizzato, così da poter cambiare o aggiungere scanner senza toccare i consumatori.

#### Acceptance Criteria

1. `R6.AC1` The system SHALL expose scan findings to reporting and analysis consumers only as `IIssue` and `IScanResult`, not as scanner-specific response types.

## Non-Functional Requirements

- `NFR1` The system SHALL preserve TypeScript `strict` compilation and SHALL NOT increase the count of `as any` casts at the scanner/handler seam (bridged by `R1.AC3`).
- `NFR2` The system SHALL never emit unmasked authentication tokens in logs or MCP output (bridged by `R5.AC3`).
- `NFR3` The scanner abstraction SHALL NOT introduce additional network round-trips to SonarQube beyond those made before the migration.
- `NFR4` The new scanner seam SHALL be covered by automated tests, including a test that registers a fake scanner to prove `R3.AC2`.

## Constraints And Dependencies

- `C1` TypeScript `strict`, ESM, Node.js 18/20 (matrice CI) — nessun cambio di stack.
- `C2` Il transport **stdio** è quello di produzione: il refactoring non deve romperlo. L'HTTP è sperimentale e fuori scope.
- `C3` La scelta del meccanismo di wiring concreto (completare TSyringe vs sostituirlo con una factory/registry leggera) è una decisione della **fase di Design**; i requisiti restano agnostici sul meccanismo.
- `C4` Il modello `IIssue`/`IScanResult` è già SCA-aware (~80%): va **mantenuto ed eventualmente esteso** come target di normalizzazione, non sostituito.

## Out Of Scope

- Implementazione completa del `TrivyScanner` SCA (rilevamento installazione, generazione/lettura SBOM, arricchimento dependency-vuln con fix version e reachability) — spec successivo.
- Split del God object `sonar/client.ts` (~3.288 righe) — spec successivo, sebbene l'astrazione crei i seam che lo faciliteranno.
- Completamento/hardening del transport HTTP.
- Nuovi verbi di prodotto: mutazione issue (false-positive/transition/commento), branch/PR/diff-aware, export SARIF.
