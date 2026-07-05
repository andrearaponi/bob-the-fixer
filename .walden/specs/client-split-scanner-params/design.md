---
status: approved
approved_at: 2026-07-05T09:45:10Z
last_modified: 2026-07-05T09:45:10Z
approved_fingerprint: sha256:4161d6cd113786f08c47312aeb7c0e0ec9dff65aee972c87227127439e1625de
source_requirements_approved_at: 2026-07-05T09:41:29Z
source_requirements_fingerprint: sha256:11e45b5947448351e10cd0ecf64a847840908c30b8dbb8766def557f9174b9b5
---

# Feature Design

## Overview

Estraiamo il cluster di **costruzione parametri scanner per-linguaggio** (~1.200 righe, `sonar/client.ts` righe ~1397-2596) in una classe dedicata `ScannerParameterBuilder`. `SonarQubeClient` mantiene un campo `paramBuilder` e vi **delega** l'unico entry-point (`buildLanguageSpecificParams`), quindi il call-site interno (riga ~391) e l'intera API pubblica restano invariati — nessuna regressione (**R4**).

Analisi di accoppiamento (misurata): il cluster **non usa** `this.client`/axios, `getToken`, `projectKey`, `sleep`. Dipende solo da `this.projectContext` e da helper filesystem **interni al cluster**. L'unico helper condiviso col resto del client è `fileExists` (usato anche a riga 354): il builder ne terrà una **copia privata** (5 righe) per restare autonomo (**R1.AC3**). Si **sposta**, non si riscrive (**NFR2**).

## Architecture

```text
  triggerCliAnalysis (invariato)
        │  buildLanguageSpecificParams(path)
        ▼
  SonarQubeClient  ──delegate──>  this.paramBuilder.build(path)
                                        │
                                        ▼
                              ScannerParameterBuilder(projectContext)
                                build(path): Promise<string[]>
                                ├─ Java  (versione da pom/gradle, source/test dirs, JaCoCo, compilazione, Maven/Gradle libraries)
                                ├─ JavaScript/TypeScript (tsconfig, lcov)
                                ├─ Python (poetry/pipenv/setuptools, versione, coverage)
                                ├─ Go     (go.mod, coverage.out)
                                └─ C/C++  (compile_commands.json, build-wrapper)
                                (helper fs privati: fileExists, addDirectoryIfExists, ...)
```

Confini:
- **`ScannerParameterBuilder`** è autosufficiente: `projectContext` + filesystem. Nessuna dipendenza HTTP (**R1.AC3**).
- **`SonarQubeClient`** perde ~1.200 righe (**R3**); mantiene la sua `fileExists` (usata a riga 354) e delega la costruzione parametri.
- Nessun cambiamento a comportamento, API pubblica, call-site (**R4**).

## Options Considered

### Option A — Classe `ScannerParameterBuilder` con delega (SCELTA)

- Summary: spostare i metodi del cluster in una classe costruita dal `projectContext`; il client tiene un campo `paramBuilder` e delega.
- Why chosen: i metodi condividono lo stato `projectContext` e si chiamano a vicenda — una classe è la coesione naturale e rispecchia lo stile OO esistente; lo spostamento è meccanico (parità garantita).

### Option B — Funzioni libere in un modulo

- Summary: estrarre i metodi come funzioni pure passando `projectContext` a ognuna.
- Why rejected: i metodi si chiamano fittamente a vicenda e condividono `projectContext`; passarlo ovunque aumenterebbe il rumore e il rischio di errori nello spostamento, senza vantaggi qui.

<!-- assumed: percorso `src/sonar/scanner/ScannerParameterBuilder.ts` (accanto a SonarQubeScanner). fileExists duplicato nel builder (5 righe) per autonomia, invece di introdurre un modulo util condiviso — meno churn. -->

## Simplicity And Elegance Review

- Simplest viable shape: una classe che riceve `projectContext` e sposta i metodi verbatim; l'unica duplicazione è `fileExists` (banale, deliberata per autonomia).
- Coupling check: il builder non conosce l'HTTP; il client dipende dal builder solo per la delega. Confine netto e verificabile (grep: nessun `axios`/`getToken`/`projectKey` nel builder).
- Future-proofing: stabilisce il **pattern di estrazione** per i cluster A (scan/CE/lock) e C (read API) negli spec successivi.

## Components And Interfaces

### `ScannerParameterBuilder` (`src/sonar/scanner/ScannerParameterBuilder.ts`)

- Purpose: costruisce i parametri scanner per-linguaggio.
- Inputs/Outputs: `constructor(projectContext?: ProjectContext)`; `build(projectPath: string): Promise<string[]>` (ex `buildLanguageSpecificParams`).
- Contenuto spostato (verbatim): tutti i metodi del cluster — `addJavaParameters`/`addMavenJavaParameters`/`addJacocoCoverageParams`/`addGradleJavaParameters`/`addGenericJavaParameters`/`addJavaVersionParameter`/`detectJavaVersionFromPom`/`detectJavaVersionFromGradle`/`checkJavaCompilation`/`findCompiledClassesRecursive`/`detectJavaSourceDirs`/`detectJavaTestDirs`/`containsJavaFiles`/`addJavaScriptParameters`/`addPythonParameters`/`addPythonVersionParameter`/`detectPythonVersion`/`detectPythonVersionFromPyproject`/`detectPythonVersionFromPythonVersion`/`addGoParameters`/`detectTsConfig`/`detectCompileCommands`/`addCCppParameters`/`addMavenLibraries`/`addGradleLibraries`/`getGradleCommand`/`findGradleDependencyJars`/`findJarFilesInDirectory`/`addDirectoryIfExists`/`directoryContainsPythonFiles` + copia privata di `fileExists`.
- Requirements: `R1.AC1`, `R1.AC3`, `R2.AC1`, `R2.AC2`

### `SonarQubeClient` (delega)

- Purpose: aggiunge `private readonly paramBuilder: ScannerParameterBuilder` (costruito nel costruttore con `this.projectContext`).
- Cambio: `buildLanguageSpecificParams(path)` diventa `return this.paramBuilder.build(path)` (oppure il call-site chiama direttamente `this.paramBuilder.build(path)`); tutti i metodi del cluster **rimossi**. Mantiene la propria `fileExists` (riga 354).
- Requirements: `R1.AC2`, `R3.AC1`, `R3.AC2`, `R4.AC1`

## Data Models

Nessun nuovo modello: input `ProjectContext`, output `string[]` (parametri `-Dsonar.*`). Logica invariata.

## Error Handling

Invariato: i metodi sono spostati verbatim, con gli stessi try/catch e comportamenti di detection (**R4.AC2** — se il linguaggio non è determinabile, il builder si comporta come prima).

## Failure Modes And Tradeoffs

- Failure mode: uno spostamento impreciso cambia un parametro → regressione silenziosa nello scan.
  - Mitigation: i 7 test `tests/sonar/*` (detection Java/JS/Python/Go/C++, Maven libraries) ri-orientati al builder provano la parità; suite completa verde.
  - Tradeoff: si toccano 7 file di test (cambio del solo oggetto costruito: client → builder).
- Failure mode: `fileExists` duplicato diverge nel tempo.
  - Mitigation: è un wrapper `fs.access` di 5 righe, stabile; documentato.
  - Tradeoff: micro-duplicazione accettata per l'autonomia del builder.

## Testing Strategy

- Migrazione: i 7 file `tests/sonar/*.test.ts` costruiscono `new ScannerParameterBuilder(projectContext)` invece di `new SonarQubeClient(...)` e chiamano `(builder as any).<metodo>` (stesse asserzioni).
- Parità: la suite completa (incluso `client.test.ts`) resta verde → API pubblica e comportamento invariati.
- Isolamento: grep che il builder non referenzia `axios`/`getToken`/`projectKey` (**R1.AC3**).

## Verification Plan

- Requirement proof:
  - **R1/R2**: i test `tests/sonar/*` verdi contro il builder; grep no-HTTP nel builder.
  - **R3**: `wc -l sonar/client.ts` sceso (~-1.200); grep che i metodi del cluster **non** sono più in `client.ts`.
  - **R4**: build `strict` + suite completa verdi (call-site invariati).
- Test evidence: suite vitest completa verde; 7 suite di detection migrate.
- Operational evidence: n/a (refactor interno).

## Requirement Coverage

<!-- Every ID MUST be wrapped in backticks — the validator rejects rows without them -->
| Requirement | Covered By |
| --- | --- |
| `R1` | `ScannerParameterBuilder` + delega da `SonarQubeClient` |
| `R2` | Spostamento verbatim + 7 suite `tests/sonar/*` migrate |
| `R3` | Metodi rimossi da `client.ts`; `wc -l` ridotto |
| `R4` | API pubblica invariata; build + suite completa verdi |
| `NFR1` | `strict` pulito, nessun nuovo `as any` alla giunzione |
| `NFR2` | move-not-rewrite (parità) |
| `NFR3` | test sul builder (suite migrate) |
