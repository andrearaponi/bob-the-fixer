---
status: approved
approved_at: 2026-07-06T17:05:26Z
last_modified: 2026-07-06T17:05:26Z
approved_fingerprint: sha256:04a3c5367a034087a8a1fd2253fd91588c90c433af5b2e78f798f72c08800f33
---

# Requirements Document

## Introduction

Increment 2 del punto 6 ("Trivy alla Bob"). Aggiunge un segnale di **triage per reachability**: la vulnerabilità passa per un pacchetto **davvero importato** nel codice del progetto, o è una transitive dormiente / dipendenza morta? Sfrutta l'increment 1 (la dipendenza diretta d'ingresso già calcolata). È un'**euristica**: guarda la *presenza di import* nel source JS/TS, non la call-graph reachability della funzione vulnerabile. Si aggancia nello scanner dopo il parse (serve leggere il source → I/O).

## Requirements

### R1 Raccogliere i pacchetti importati dal source

**User Story:** Come manutentore, voglio sapere quali pacchetti il progetto importa davvero, così da distinguere dipendenze usate da dipendenze morte.

#### Acceptance Criteria

1. `R1.AC1` The system SHALL scan the project's JS/TS source files (excluding `node_modules` and build output) and collect the set of imported/required package names.
2. `R1.AC2` The system SHALL normalize import specifiers to package names (strip subpaths, keep scope): `lodash/merge` → `lodash`, `@scope/pkg/x` → `@scope/pkg`.
3. `R1.AC3` IF the source cannot be read, THEN the system SHALL treat the imported set as empty and continue (reachability `unknown`) rather than failing the scan.

### R2 Classificare la reachability per vulnerabilità

**User Story:** Come agente/dev, voglio che ogni vulnerabilità sia marcata come raggiungibile o dormiente, così da dare priorità a ciò che è davvero esposto.

#### Acceptance Criteria

1. `R2.AC1` For an npm-ecosystem vulnerability, the system SHALL mark it `imported` when the vulnerable package or its entry-point direct dependency is in the imported set.
2. `R2.AC2` For an npm-ecosystem vulnerability whose package and entry-point direct dependency are both absent from the imported set, the system SHALL mark it `not-imported` (dormant).
3. `R2.AC3` For a non-JS ecosystem (e.g. maven, go), the system SHALL mark reachability `unknown` (import scanning is JS/TS only).

### R3 Esporre la reachability

**User Story:** Come agente/dev, voglio vedere la reachability nel report, così da triare a colpo d'occhio.

#### Acceptance Criteria

1. `R3.AC1` The system SHALL attach the reachability classification to each vulnerability issue in the normalized model.
2. `R3.AC2` The report SHALL indicate reachability per vulnerability (reachable/imported vs dormant/not-imported vs unknown) to support triage.

## Non-Functional Requirements

- `NFR1` The reachability classification SHALL be a pure function of (issue, imported-set), unit-testable offline.
- `NFR2` The source scan SHALL be bounded: it SHALL NOT descend into `node_modules`/build output, and SHALL cap traversal to avoid excessive work on large trees.
- `NFR3` The change SHALL NOT regress the existing SCA output when reachability cannot be determined (`unknown` is inert).
- `NFR4` TypeScript `strict` stays green; new logic covered by tests.

## Constraints And Dependencies

- `C1` È un'euristica di **presenza di import**, non reachability della funzione vulnerabile (call-graph) — dichiarato esplicitamente in report/docs.
- `C2` Scope JS/TS (npm): l'ecosistema per issue viene dal `Type` del risultato Trivy; ecosistemi non-JS → `unknown`.
- `C3` Dipende dalla dipendenza diretta d'ingresso dell'increment 1 (`directDependency`).

## Out Of Scope

- Call-graph reachability vera (funzione vulnerabile effettivamente invocata).
- Import-scanning per linguaggi non-JS (maven, go, ecc.).
- Import dinamici/generati non rilevabili staticamente.
- SBOM (increment 3).
