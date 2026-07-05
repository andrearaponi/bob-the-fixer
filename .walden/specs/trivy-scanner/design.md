---
status: approved
approved_at: 2026-07-05T09:21:16Z
last_modified: 2026-07-05T09:21:16Z
approved_fingerprint: sha256:9170602dddf963a1d57bc9a55e1501d96924bcd82069a95bc9596bb5c22e6ab3
source_requirements_approved_at: 2026-07-05T09:17:09Z
source_requirements_fingerprint: sha256:f58f4bbe090b0e3a6747c8c7d6ffdc859cf49cb566cc89bbc8eacc91e9b0cbf0
---

# Feature Design

## Overview

Aggiungiamo un `TrivyScanner` che implementa l'`IScanner` "scan-and-return" già esistente. `scan()` esegue `trivy fs` (senza shell) e ne fa il parse del report JSON in `IIssue`/`IScanResult` normalizzati (`DEPENDENCY_VULN`, `source: 'trivy'`). Due nuovi tool MCP (`trivy_scan_dependencies`, `trivy_check_installation`) espongono la SCA con output fix-ready, risolvendo lo scanner via `ScannerRegistry` — che così diventa usato **in produzione per la prima volta**, senza toccare il path SonarQube (prova dell'Open-Closed, **R3**).

Il valore "alla Bob": non un dump di Trivy ma issue arricchite (package, `installed → fixed`, severità normalizzata, CVE come `ruleId`, link) formattate come le issue Sonar.

## Architecture

```text
  MCP tool call (trivy_scan_dependencies / trivy_check_installation)
        │
        ▼
  ToolRouter (toolRoutes)  ──>  trivy handler (funzione, per-call)
        │                              │
        │                              ▼
        │                     ScannerRegistry.register(new TrivyScanner()).get('trivy')
        │                              │
        │                              ▼
        │                     TrivyScanner (IScanner, type 'sca')
        │                        scan(): execFile('trivy', ['fs','--format','json',...])
        │                              │  → stdout JSON
        │                              ▼
        │                     TrivyResultParser (puro) → IScanResult / IIssue[]
        ▼
  Fix-ready text formatter → content[].text     (path Sonar: INVARIATO)
```

Confini:
- **`TrivyScanner`** è un wrapper sottile sull'eseguibile `trivy`; niente stato, niente rete verso un server (a differenza di Sonar). Non implementa `IQueryableScanner` (nessun `getIssues(projectKey)` — è scan-and-return puro, **R2.AC3 dello spec precedente**).
- **`TrivyResultParser`** è **puro** (JSON → modello normalizzato): testabile con una fixture senza avere Trivy installato.
- **Il path SonarQube non viene toccato** (`ScanOrchestrator`, `SonarQubeScanner`, `scan.handler` invariati) — **R3.AC2**.

## Options Considered

### Option A — `trivy fs --format json` + parser dedicato (SCELTA)

- Summary: eseguire `trivy fs --quiet --format json --scanners vuln <path>`, fare il parse dello stdout con un parser puro, mappare su `IIssue`/`IScanResult`.
- Why chosen: è il percorso standard e affidabile; i campi chiave (`VulnerabilityID`, `PkgName`, `InstalledVersion`, `Severity`) sono sempre valorizzati; il parser puro è testabile con fixture senza Trivy.

### Option B — Via SBOM (`--format cyclonedx` poi scan dell'SBOM)

- Summary: generare un SBOM e scansionarlo.
- Why rejected: doppio passaggio e più indirection; l'SBOM è esplicitamente **fuori scope** in questo spec. Nessun vantaggio per il caso "vulnerabilità delle dipendenze".

<!-- assumed: percorso file `src/trivy/` (simmetrico a `src/sonar/scanner/`): TrivyScanner.ts, trivy-parser.ts, trivy-report.ts; handler in src/mcp/handlers/. -->
<!-- assumed: `--scanners vuln` per limitarsi alle vulnerabilità (no secret/misconfig), coerente con lo scope. -->

## Simplicity And Elegance Review

- Simplest viable shape: separazione netta **esecuzione** (TrivyScanner, richiede Trivy) vs **parsing** (parser puro, testabile offline con fixture). L'handler è sottile.
- Coupling check: dipende solo dall'astrazione `IScanner`/`ScannerRegistry` e dal modello `IIssue`/`IScanResult`; zero dipendenze sul path Sonar. Nessun modello parallelo (**NFR1**).
- Future-proofing: aggiungere SBOM/container/IaC sarà estendere il parser/flag, non riscrivere. La reachability (fuori scope) resta un arricchimento futuro.

## Components And Interfaces

### `TrivyScanner` (`src/trivy/TrivyScanner.ts`)

- Purpose: `IScanner` per la SCA. `name='trivy'`, `type='sca'`.
- `scan(params)`: `execFileAsync('trivy', ['fs','--quiet','--format','json','--scanners','vuln', params.projectPath], { timeout, maxBuffer })` → `TrivyResultParser.parse(stdout, params)` → `IScanResult`.
- `checkHealth()`: `execFileAsync('trivy', ['--version'])` → `{ available:true, version }`; su `ENOENT` → `{ available:false, errorMessage: 'Trivy not found on PATH' }`.
- Dependencies: `child_process.execFile` (array di argomenti, **niente shell**), `TrivyResultParser`.
- Requirements: `R1.AC1`, `R1.AC2`, `R5.AC1`, `R6.AC1`, `R6.AC2`, `R6.AC3`

### `TrivyResultParser` (`src/trivy/trivy-parser.ts`) — puro

- Purpose: mappa il JSON di `trivy fs` in `IScanResult`/`IIssue[]`.
- Mapping per vulnerabilità (`Results[].Vulnerabilities[]` → `IIssue`):

  | Campo IIssue | Fonte Trivy |
  | --- | --- |
  | `id` | `` `${VulnerabilityID}:${PkgName}` `` |
  | `source` | `'trivy'` |
  | `type` | `'DEPENDENCY_VULN'` |
  | `ruleId` | `VulnerabilityID` (CVE/advisory) — **R2.AC3** |
  | `severity` | normalizza `Severity` (`UNKNOWN→INFO`, resto 1:1) — **R2.AC2** |
  | `message` | `Title` ?? prima riga di `Description` ?? `VulnerabilityID` |
  | `dependency` | `{ packageName: PkgName, installedVersion: InstalledVersion }` — **R1.AC3** |
  | `remediation` | `{ fixedVersion: FixedVersion, referenceUrl: PrimaryURL }` — **R2.AC1** |
  | `location` | `{ filePath: Result.Target }` (lockfile/manifest), opzionale |
  | `tags` | `CweIDs ?? []` |
  | `rawData` | l'oggetto vulnerabilità |

- Costruisce `IScanResult` (source `'trivy'`, scannerType `'sca'`, status `COMPLETED`, `summary.counts` con `DEPENDENCY_VULN`/severità, `metrics`).
- Nota onestà: **diretta vs transitiva** non è affidabilmente presente in `trivy fs` → **non** mappata in questo spec (best-effort/futuro), coerente con i requisiti.
- Requirements: `R1.AC3`, `R2.AC1`, `R2.AC2`, `R2.AC3`, `NFR1`

### `trivy_scan_dependencies` handler (`src/mcp/handlers/trivy-scan.handler.ts`)

- Purpose: funzione handler che risolve `TrivyScanner` da un `ScannerRegistry`, chiama `scan(params)` e formatta l'output fix-ready.
- Wiring: registrata in `toolRoutes` (`ToolRouter.ts`) + definizione in `tool-definitions.ts`. Costruisce `new ScannerRegistry()` + `register(new TrivyScanner())` + `get('trivy')` (**R3.AC1**: registry usato in produzione; **R3.AC2**: Sonar intatto).
- Requirements: `R4.AC1`, `R3.AC1`, `R3.AC2`

### `trivy_check_installation` handler (`src/mcp/handlers/trivy-check.handler.ts`)

- Purpose: chiama `TrivyScanner.checkHealth()` e riporta installato/versione o guida all'installazione.
- Requirements: `R4.AC2`, `R6.AC1`

### Fix-ready formatter (`src/trivy/trivy-report.ts`)

- Purpose: `IScanResult` → testo fix-ready (per package: `PkgName installed → fixed`, severità con icona, CVE, link, passo di remediation), stile coerente con `issue-details`.
- Requirements: `R4.AC1`

## Data Models

Nessun nuovo modello: si riusa `IIssue`/`IScanResult`/`IssueSummary` (già SCA-aware). Popolati i campi `dependency`, `remediation.fixedVersion`, `bySource.trivy`, `byType.DEPENDENCY_VULN` (**NFR1**).

## Error Handling

- **Trivy non installato** (`R6.AC1`/`R6.AC2`): `execFile` fallisce con `ENOENT`; `checkHealth()` → `available:false`; `scan()` lancia un errore normalizzato e actionable ("Trivy non trovato su PATH. Installazione: https://trivy.dev/docs/getting-started/installation/").
- **Scan fallito/timeout** (`R6.AC3`): `execFile` rigetta (exit code ≠ 0 o timeout) → errore normalizzato via gerarchia `custom-errors`; nessuno stato parziale (nessun file scritto).
- **JSON malformato**: parser difensivo (try/parse) → errore normalizzato.

## Security Considerations

- **Nessuna shell** (`R5.AC1`/`NFR2`): `execFile('trivy', [args])` con array; il `projectPath` e ogni opzione sono argomenti letterali → injection impossibile. Coerente con la hard rule della constitution (post fix .NET).
- **Segreti** (`R5.AC2`/`NFR3`): eventuali credenziali di registry privati passano da variabili d'ambiente Trivy e **non** vengono loggate; il comando loggato contiene solo argomenti non sensibili. Se un valore sensibile dovesse comparire in un messaggio d'errore, si applica `maskToken()`.

## Failure Modes And Tradeoffs

- Failure mode: `trivy fs` con `--exit-code` farebbe fallire il processo in presenza di vuln.
  - Mitigation: **non** impostare `--exit-code` → exit 0 con vuln; exit ≠ 0 = errore reale.
  - Tradeoff: distinzione netta tra "vuln trovate" (successo) e "scan fallito".
- Failure mode: report molto grandi.
  - Mitigation: `maxBuffer` adeguato e `timeout`; il formatter tronca/riepiloga per il budget token.
  - Tradeoff: su progetti enormi il testo è riassunto, il dettaglio completo resta in `rawOutput`.

## Testing Strategy

- Unit (offline, senza Trivy): `TrivyResultParser` con una **fixture JSON rappresentativa** (`tests/fixtures/trivy-fs-report.json`) — mapping severità, `fixedVersion`, CVE, `dependency` (**NFR4**).
- Unit: `TrivyScanner` con `execFile` mockato (scan ok, ENOENT→unavailable, exit≠0→errore).
- Unit: handler `trivy_scan_dependencies`/`trivy_check_installation` con scanner mockato (routing + formattazione + errore actionable).
- Estensibilità: un test che prova che registrare `TrivyScanner` nel `ScannerRegistry` non richiede modifiche a `ScanOrchestrator` (**R3.AC2**).

## Verification Plan

- Requirement proof:
  - **R1/R2**: test del parser sulla fixture (tipo/severità/fixedVersion/CVE/dependency).
  - **R3**: build + grep che `ScanOrchestrator`/`scan.handler` non sono modificati (diff vuoto su quei file); i due tool compaiono in `toolRoutes`.
  - **R4**: test degli handler (output fix-ready, check installazione).
  - **R5**: test che `scan()` usa `execFile` (no shell) — un path con metacaratteri non esegue nulla.
  - **R6**: test ENOENT→unavailable + errore actionable; exit≠0→errore.
- Test evidence: suite vitest verde; nuova fixture + test parser/scanner/handler.
- Operational evidence: n/a (feature locale).

## Requirement Coverage

<!-- Every ID MUST be wrapped in backticks — the validator rejects rows without them -->
| Requirement | Covered By |
| --- | --- |
| `R1` | `TrivyScanner` + `TrivyResultParser` (mapping DEPENDENCY_VULN) |
| `R2` | `TrivyResultParser` (fixedVersion, severità, CVE) |
| `R3` | `ScannerRegistry` nell'handler Trivy; Sonar intatto (diff vuoto) |
| `R4` | handler `trivy_scan_dependencies` / `trivy_check_installation` + tool-definitions |
| `R5` | `execFile` (no shell) + masking |
| `R6` | `checkHealth`/scan: ENOENT, exit≠0, timeout → errori normalizzati |
| `NFR1` | riuso `IIssue`/`IScanResult` |
| `NFR2` | `execFile` con array |
| `NFR3` | nessun segreto in log/output |
| `NFR4` | fixture + test parser/scanner/handler |
