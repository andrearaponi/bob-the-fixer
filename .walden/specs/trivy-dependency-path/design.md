---
status: approved
approved_at: 2026-07-06T13:54:37Z
last_modified: 2026-07-06T13:54:37Z
approved_fingerprint: sha256:d03d1699e14d53e9178d0667a7e87591d95c8c13d42e3ed3bbe6c921a696b79b
source_requirements_approved_at: 2026-07-06T13:52:36Z
source_requirements_fingerprint: sha256:f3a071096e9c9822e56f4e1261eae7260d16c64c965357bd730b9224ed7e0101
---

# Feature Design

## Overview

Aggiungere il dependency path all'SCA Trivy con un modulo **puro** `trivy/dependency-graph.ts` (grafo dei pacchetti + BFS), usato dal parser. Lo scanner chiede a Trivy `--list-all-pkgs`; il parser, per ogni Result, costruisce il grafo da `Packages[]` e per ogni vuln calcola il path dal pacchetto **diretto** d'ingresso a quello **vulnerabile** (via `PkgID`). Il path e la diretta d'ingresso vengono attaccati a `IIssue.dependency` e resi nel report. Se il grafo manca, si degrada alla lista piatta odierna.

## Architecture

```text
  TrivyScanner  ── trivy fs --list-all-pkgs --format json --scanners vuln ──>  JSON
        │
        ▼
  TrivyResultParser.parse()
        │  per Result: new DependencyGraph(result.Packages)
        │  per Vulnerability: graph.pathTo(vuln.PkgID)
        ▼
  IIssue.dependency { packageName, installedVersion, path[], directDependency, relationship }
        │
        ▼
  formatTrivyReport → "Via: express@4.17 → body-parser@1.19 → qs@6.7 (VULN) | Fix: bump express"
```

`DependencyGraph` è puro (nessun I/O) → testabile offline; il parser resta sottile.

## Options Considered

### Option A — Modulo puro `dependency-graph.ts` usato dal parser (SCELTA)

- Summary: la logica del grafo (indicizzazione per ID, BFS dalle direct/root, visited-set) in un modulo a sé; il parser lo istanzia per Result e interroga `pathTo(pkgId)`.
- Why chosen: rispetta `NFR1` (puro, testabile in isolamento) e `NFR3` (traversal bounded); tiene il parser leggibile; il grafo è riusabile per gli increment futuri (reachability).

### Option B — Logica del grafo inline nel parser

- Summary: costruire mappe e camminare il grafo dentro `mapVulnerability`.
- Why rejected: gonfia il parser, mescola parsing e algoritmo, e rende i test del path meno isolati.

## Simplicity And Elegance Review

- Simplest viable shape: un modulo con una classe `DependencyGraph`, una BFS shortest-path, e 3 campi nuovi in `IIssue.dependency`.
- Coupling check: il grafo non conosce Trivy oltre alla forma `TrivyPackage`; il parser fa da colla; il report legge solo campi normalizzati.
- Future-proofing: il grafo è la base per la reachability (increment 2) e per eventuali path multipli.

## Components And Interfaces

### `DependencyGraph` (`trivy/dependency-graph.ts`, nuovo, puro)

- Input: `TrivyPackage[]` — `{ ID, Name, Version?, Relationship?: 'root'|'direct'|'indirect', DependsOn?: string[] }`.
- API: `pathTo(pkgId: string): { path: string[]; directDependency?: string; relationship: 'direct'|'indirect'|'root'|'unknown' }`.
  - Indicizza i pacchetti per `ID`; raccoglie i nodi `direct` e `root` come sorgenti.
  - **BFS** dalle sorgenti seguendo `DependsOn` fino a `pkgId`, primo arrivo = path più corto; **visited-set** per grafi ciclici (`NFR3`).
  - `path` = catena come `Name@Version`; `directDependency` = primo nodo non-root del path; `relationship` = quello del pacchetto vulnerabile (Trivy lo fornisce), o `unknown` se irraggiungibile.
  - Pacchetto vulnerabile già `direct`/`root` → path a un elemento (`R2.AC2`); irraggiungibile → `relationship: 'unknown'`, nessun crash (`R2.AC4`).
- Requirements: `R2.AC1`, `R2.AC2`, `R2.AC3`, `R2.AC4`, `NFR1`, `NFR3`

### `TrivyResultParser` (esteso)

- Estende `TrivyVulnerability` con `PkgID?`; aggiunge `TrivyPackage` e `TrivyResult.Packages?`.
- In `parse()`: per ogni Result costruisce `new DependencyGraph(result.Packages ?? [])` e lo passa a `mapVulnerability`.
- `mapVulnerability(vuln, target, graph?)`: se `graph` e `vuln.PkgID` presenti, `graph.pathTo(vuln.PkgID)` popola `dependency.path/directDependency/relationship`; altrimenti nessun path (fallback piatto, `R1.AC3`).
- Requirements: `R1.AC2`, `R1.AC3`, `R3.AC1`

### `TrivyScanner` (comando)

- Aggiunge `--list-all-pkgs` all'array args (`R1.AC1`). Nessun'altra modifica (execFile, no shell, invariato).
- Requirements: `R1.AC1`

### `formatTrivyReport` (report)

- In `formatIssue`: se `relationship === 'indirect'` e `path.length > 1`, aggiunge `   Via: <path join ' → '>` e un hint di fix che nomina la diretta d'ingresso; se `direct`/`root`, nessuna riga "Via" (è una diretta).
- Requirements: `R3.AC2`

## Data Models

Estensione di `IIssue.dependency`:

```ts
dependency?: {
  packageName: string;
  installedVersion: string;
  vulnerableVersions?: string;
  path?: string[];                                    // [direct@v, …, vulnerable@v]
  directDependency?: string;                          // diretta d'ingresso (name@version)
  relationship?: 'direct' | 'indirect' | 'root' | 'unknown';
};
```

## Error Handling

- Grafo assente/schema vecchio → `graph.pathTo` non chiamato / ritorna `unknown` → lista piatta (`R1.AC3`), nessun throw.
- Grafo ciclico/sconnesso → BFS con visited-set termina; `unknown` se non raggiunge una sorgente (`R2.AC4`, `NFR3`).

## Failure Modes And Tradeoffs

- Failure mode: `PkgID` della vuln non combacia con nessun `Package.ID` (schema drift).
  - Mitigation: `pathTo` ritorna `unknown`; la vuln resta nel report senza path (degradazione, non crash).
- Tradeoff: un solo path (il più corto). Un pacchetto può entrare da più dirette; per la remediation basta indicarne una (Out Of Scope lo dichiara).
- Tradeoff: `relationship` viene da Trivy; se assente, il path calcolato resta valido ma `relationship` può essere `unknown`.

## Testing Strategy

- `dependency-graph.test.ts` (puro): diretta→singolo elemento; transitivo→path più corto; grafo ciclico→termina senza loop; pacchetto irraggiungibile→`unknown`; scelta del path più corto tra due sorgenti.
- `trivy-parser.test.ts` (esteso): fixture con `Packages[]` (derivata dal JSON Trivy 0.69.1 reale) → path attaccato a `dependency`; fixture senza `Packages[]` → fallback piatto invariato.
- `trivy-report.test.ts` (esteso): vuln indiretta → riga `Via:` presente; vuln diretta → assente.
- Fixture piccola e realistica ricavata dal report reale (in scratchpad) per non dipendere da Trivy in CI.

## Verification Plan

- Requirement proof:
  - `R1`: grep che lo scanner passa `--list-all-pkgs`; test parser con/senza `Packages`.
  - `R2`: test del grafo (path, diretta, ciclo, irraggiungibile).
  - `R3`: test parser (campi su `IIssue`) + report (riga `Via:`).
- Test evidence: nuovi test unit + suite completa verde.
- Operational evidence (bonus, non-CI): run live `trivy` su questo repo → path reali (es. il CVE transitivo `@hono/node-server`).

## Requirement Coverage

<!-- Every ID MUST be wrapped in backticks — the validator rejects rows without them -->
| Requirement | Covered By |
| --- | --- |
| `R1` | `TrivyScanner` `--list-all-pkgs` + parser legge `Packages`/`PkgID` + fallback |
| `R2` | `DependencyGraph.pathTo` (BFS, diretta, ciclo, irraggiungibile) |
| `R3` | `IIssue.dependency` esteso + `formatTrivyReport` riga `Via:` |
| `NFR1` | `DependencyGraph` puro, testato offline |
| `NFR2` | fallback piatto quando il grafo manca |
| `NFR3` | BFS con visited-set (bounded) |
| `NFR4` | `strict` verde + test da fixture reale |
