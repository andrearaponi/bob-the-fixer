---
status: approved
approved_at: 2026-07-06T17:06:35Z
last_modified: 2026-07-06T17:06:35Z
approved_fingerprint: sha256:a2f2ffc9a5e3e4afc562b26fd48857d94f900751e631b568c271ca029513b212
source_requirements_approved_at: 2026-07-06T17:05:26Z
source_requirements_fingerprint: sha256:04a3c5367a034087a8a1fd2253fd91588c90c433af5b2e78f798f72c08800f33
---

# Feature Design

## Overview

Aggiungere un segnale di reachability all'SCA con due parti: un modulo I/O `trivy/source-imports.ts` che raccoglie i pacchetti importati dal source JS/TS, e una funzione **pura** `trivy/reachability.ts` che classifica ogni vuln (`imported` / `not-imported` / `unknown`) in base al set di import + all'ecosistema. Lo scanner, dopo il parse, raccoglie gli import una volta e arricchisce le issue; il parser aggiunge l'ecosistema (`Type` di Trivy) all'issue; il report mostra il marker.

## Architecture

```text
  TrivyScanner.scan(projectPath)
        │  stdout ─► parser.parse ─► IScanResult (issues con dependency.ecosystem, directDependency)
        │  collectImportedPackages(projectPath)  ──►  Set<packageName>   (I/O, JS/TS)
        ▼
  for each issue: dependency.reachability = classifyReachability(dependency, importedSet)   (puro)
        ▼
  formatTrivyReport → "reachable: imported" | "dormant: not imported in source" | "unknown"
```

## Options Considered

### Option A — Import-set raccolto una volta nello scanner + classificazione pura (SCELTA)

- Summary: un solo scan del source per l'intera esecuzione; la classificazione è una funzione pura (issue, set).
- Why chosen: I/O isolato e fatto una volta (efficiente); la logica di classificazione resta pura e testabile (`NFR1`); riusa `directDependency` dell'increment 1.

### Option B — Controllare l'import per-vuln dentro il parser

- Summary: il parser legge il source mentre mappa le vuln.
- Why rejected: metterebbe I/O nel parser (oggi puro), ripeterebbe lo scan del source per ogni vuln, e accoppierebbe parsing e filesystem.

## Simplicity And Elegance Review

- Simplest viable shape: un walker del source con regex per gli import, una funzione di classificazione a 3 stati, due campi nuovi in `IIssue.dependency`.
- Coupling check: `source-imports` non conosce le issue; `reachability` non fa I/O; lo scanner fa da colla.
- Future-proofing: `source-imports` è riusabile; la classificazione può evolvere (es. per-linguaggio) senza toccare lo scan.

## Components And Interfaces

### `collectImportedPackages` (`trivy/source-imports.ts`, I/O)

- API: `collectImportedPackages(projectPath: string): Promise<Set<string>>`.
- Cammina il source (`.ts/.tsx/.js/.jsx/.mjs/.cjs`), **saltando** `node_modules`, `dist`, `build`, `coverage`, `.git`; cap sul numero di file visitati (`NFR2`). Estrae gli specifier via regex (`import … from 'X'`, `import 'X'`, `import('X')`, `export … from 'X'`, `require('X')`), scarta i relativi (`./`, `../`, assoluti), normalizza a nome pacchetto (scope+nome, oppure primo segmento). Errori di lettura → set (parziale/vuoto), mai throw (`R1.AC3`).
- Requirements: `R1.AC1`, `R1.AC2`, `R1.AC3`, `NFR2`

### `classifyReachability` (`trivy/reachability.ts`, puro)

- API: `classifyReachability(dep: IIssue['dependency'], imported: Set<string>): 'imported' | 'not-imported' | 'unknown'`.
- `unknown` se `dep` assente o `ecosystem !== 'npm'` (`R2.AC3`). Altrimenti: `imported` se `dep.packageName` **o** il nome della `directDependency` (spogliato della versione) è nel set (`R2.AC1`); se nessuno dei due ed il set è non vuoto → `not-imported` (`R2.AC2`); set vuoto → `unknown`.
- Requirements: `R2.AC1`, `R2.AC2`, `R2.AC3`, `NFR1`

### `TrivyResultParser` (ecosistema)

- Passa `result.Type` a `mapVulnerability`; imposta `dependency.ecosystem`.
- Requirements: `R3.AC1` (parte)

### `TrivyScanner.scan` (colla)

- Dopo `parser.parse`, `const imported = await collectImportedPackages(params.projectPath)`; per ogni issue `dependency.reachability = classifyReachability(dependency, imported)`.
- Requirements: `R3.AC1`

### `formatTrivyReport` (report)

- Riga/marker per issue: `imported` → "reachable (imported in source)"; `not-imported` → "dormant (not imported in source)"; `unknown` → nessun marker (o "reachability n/a"). Nota che è euristica di import-presence.
- Requirements: `R3.AC2`

## Data Models

Estensione di `IIssue.dependency`:

```ts
dependency?: {
  …esistenti (packageName, installedVersion, path, directDependency, relationship)…
  ecosystem?: string;                                    // Trivy result Type: 'npm' | 'pom' | 'gomod' | …
  reachability?: 'imported' | 'not-imported' | 'unknown';
};
```

## Error Handling

- Source illeggibile / cartella assente → set import parziale o vuoto → reachability `unknown` (`R1.AC3`), nessun throw; la scansione prosegue.

## Failure Modes And Tradeoffs

- Failure mode: import statico non rilevato (import dinamico/generato) → falso `not-imported`.
  - Mitigation: euristica dichiarata (`C1`); `not-imported` è un segnale di *deprioritizzazione*, non una prova di irraggiungibilità.
- Failure mode: regex matcha stringhe in commenti → falso `imported`.
  - Mitigation: errore conservativo (sovrastima la reachability = prudente per la sicurezza).
- Tradeoff: solo JS/TS; ecosistemi non-JS → `unknown` (nessun downgrade errato).

## Testing Strategy

- `reachability.test.ts` (puro): npm+importato→`imported`; npm+diretta importata (pkg no)→`imported`; npm+nessuno importato→`not-imported`; ecosistema non-npm→`unknown`; set vuoto→`unknown`.
- `source-imports.test.ts`: su una piccola dir temporanea di fixture (o mock fs) → estrae/normalizza gli import, salta `node_modules`, ignora i relativi.
- `trivy-report.test.ts` (esteso): marker reachability presente.
- Suite completa verde.

## Verification Plan

- Requirement proof:
  - `R1`: test di `source-imports` (estrazione/normalizzazione/skip).
  - `R2`: test puri di `classifyReachability` (i 5 casi).
  - `R3`: parser (ecosystem) + report (marker) + suite.
- Test evidence: nuovi unit test + suite verde.
- Operational evidence (bonus): run reale su questo repo → le vuln npm risultano `imported` (diretti usati), a conferma che il fix fatto era giustificato.

## Requirement Coverage

<!-- Every ID MUST be wrapped in backticks — the validator rejects rows without them -->
| Requirement | Covered By |
| --- | --- |
| `R1` | `collectImportedPackages` (walk + estrazione + normalizzazione + skip) |
| `R2` | `classifyReachability` (3 stati, npm-only) |
| `R3` | `dependency.ecosystem` nel parser + `reachability` nello scanner + marker nel report |
| `NFR1` | `classifyReachability` puro, testato |
| `NFR2` | walk bounded (skip node_modules/build, cap file) |
| `NFR3` | `unknown` inerte, nessuna regressione |
| `NFR4` | `strict` verde + test |
