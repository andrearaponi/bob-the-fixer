---
status: approved
approved_at: 2026-07-06T13:52:36Z
last_modified: 2026-07-06T13:52:36Z
approved_fingerprint: sha256:f3a071096e9c9822e56f4e1261eae7260d16c64c965357bd730b9224ed7e0101
---

# Requirements Document

## Introduction

Primo enrichment del punto 6 ("Trivy alla Bob"). Oggi l'SCA è una **lista piatta** di pacchetti vulnerabili (VulnID/PkgName/versione fix). Questo increment aggiunge il **dependency path**: per ogni vulnerabilità in un pacchetto transitivo, la catena dalla dipendenza **diretta** al pacchetto **vulnerabile**, così l'agente sa *cosa bumpare* invece di ricevere un ID nudo.

Fattibilità **verificata su dati reali** (Trivy 0.69.1 su questo repo): con `--list-all-pkgs`, `Results[].Packages[]` espone `ID` / `Relationship` (`root`/`direct`/`indirect`) / `DependsOn` (array di ID), e `Results[].Vulnerabilities[].PkgID` collega la vuln al pacchetto. Il grafo è quindi ricostruibile. Validazione sia **offline** (fixture JSON mockate) sia **live** (Trivy gira su questo repo, che ha vuln reali con path transitivi).

## Requirements

### R1 Acquisire il grafo delle dipendenze da Trivy

**User Story:** Come manutentore, voglio che lo scanner chieda a Trivy l'elenco completo dei pacchetti, così da avere il grafo per calcolare i path.

#### Acceptance Criteria

1. `R1.AC1` The system SHALL invoke Trivy with the full-package-listing option so that `Results[].Packages[]` (with `ID`, `Relationship`, `DependsOn`) is present in the JSON.
2. `R1.AC2` The parser SHALL read the package list and the `PkgID` link on each vulnerability from the Trivy report.
3. `R1.AC3` IF the report contains no package graph (empty or older schema), THEN the system SHALL fall back to the existing flat vulnerability list without failing.

### R2 Calcolare il dependency path per ogni vulnerabilità

**User Story:** Come utente, voglio vedere da quale mia dipendenza diretta arriva il pacchetto vulnerabile, così da sapere dove intervenire.

#### Acceptance Criteria

1. `R2.AC1` For a vulnerability whose package is transitive, the system SHALL compute a path from a `direct` (or `root`) package to the vulnerable package following `DependsOn` edges.
2. `R2.AC2` WHEN the vulnerable package is itself a `direct`/`root` dependency, the system SHALL report a single-element path (the package itself).
3. `R2.AC3` The system SHALL identify the entry-point direct dependency (the first non-root node of the path) for each vulnerability.
4. `R2.AC4` IF no path to a direct/root dependency can be found (disconnected/cyclic graph), THEN the system SHALL mark the path as unknown rather than failing.

### R3 Esporre il path nell'output SCA

**User Story:** Come agente/dev, voglio il path e la versione fix nel report, così che la remediation sia immediata.

#### Acceptance Criteria

1. `R3.AC1` The system SHALL attach the dependency path and the entry-point direct dependency to each vulnerability issue in the normalized model.
2. `R3.AC2` The Trivy report SHALL render, per vulnerability, the path (`direct → … → vulnerable@version`) together with the fixed version, so the fix is actionable.

## Non-Functional Requirements

- `NFR1` The path computation SHALL be pure (no I/O), so it is unit-testable offline with mocked Trivy JSON.
- `NFR2` The change SHALL NOT regress the existing flat SCA output when the graph is absent (bridged by `R1.AC3`).
- `NFR3` The graph traversal SHALL be bounded (visited-set) so cyclic dependency graphs cannot cause infinite loops or excessive work.
- `NFR4` TypeScript `strict` stays green; new logic covered by tests (fixtures derived from the real Trivy 0.69.1 shape).

## Constraints And Dependencies

- `C1` Dipende da Trivy `--list-all-pkgs`; la forma del grafo segue il JSON Trivy (`Package.ID/Relationship/DependsOn`, `Vulnerability.PkgID`), verificata su 0.69.1.
- `C2` Trivy espone il path come "chi dipende da chi", non "perché la versione X"; il path indica **dove** intervenire (dipendenza diretta d'ingresso), non garantisce che bumparla risolva (potrebbe servire un override) — l'agente decide.
- `C3` È l'**increment 1** del punto 6; reachability e SBOM sono increment successivi.

## Out Of Scope

- Reachability (il pacchetto è davvero usato?) e SBOM (CycloneDX/SPDX) — increment successivi.
- Applicazione automatica dei fix / riscrittura dei manifest.
- Path multipli completi per vuln: è sufficiente **un** path rappresentativo verso una diretta (il più corto).
