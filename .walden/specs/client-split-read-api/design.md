---
status: approved
approved_at: 2026-07-05T11:28:23Z
last_modified: 2026-07-05T11:28:23Z
approved_fingerprint: sha256:8344cfc3c3212b329d0622c6e1192328dcdfac356fd9c9ca35dbeb35171543ec
source_requirements_approved_at: 2026-07-05T11:11:14Z
source_requirements_fingerprint: sha256:0b5ca4bebbbf5e85278cb2dabfe17055ec93f0ce6c4747137b767986d8d8177a
---

# Feature Design

## Overview

Estrarre il blocco sources (`sonar/client.ts` righe ~801-922) in `SonarSourceFetcher` (`src/sonar/api/SonarSourceFetcher.ts`), costruito con l'`AxiosInstance` e proprietario della `rawSourceLinesCache`. `SonarQubeClient` tiene un campo `sourceFetcher` e delega i due metodi pubblici `getSourceContext`/`getSourceLines`; i due privati (`getSourceLinesFromIndex`, `getRawFileLines`) si spostano dentro il fetcher. Comportamento, firme e call-site invariati.

## Architecture

```text
  IssueAnalyzer / SecurityAnalyzer
        │  client.getSourceContext(...) / getSourceLines(...)
        ▼
  SonarQubeClient  ──delegate──>  this.sourceFetcher.<metodo>(...)
                                        │
                                        ▼
                              SonarSourceFetcher(client)
                                getSourceContext / getSourceLines
                                (privati: getSourceLinesFromIndex, getRawFileLines)
                                cache: rawSourceLinesCache (propria)
```

Il fetcher dipende solo dall'`AxiosInstance` e dalla propria cache; nessun `projectKey`/`getToken`/scanner (**R1.AC3**).

## Options Considered

### Option A — Classe `SonarSourceFetcher` iniettata con l'AxiosInstance (SCELTA)

- Summary: il client passa `this.client` al fetcher nel costruttore; il fetcher tiene la cache e i 4 metodi (spostati verbatim); il client delega i 2 pubblici.
- Why chosen: accoppiamento minimo e già misurato (solo `this.client` + cache); spostamento meccanico → parità garantita; stabilisce il pattern per gli altri sotto-moduli read-API.

### Option B — Funzioni libere passando client+cache

- Summary: estrarre come funzioni pure con client e cache passati.
- Why rejected: i 4 metodi si chiamano a vicenda e condividono la cache; una classe è la coesione naturale (come per `ScannerParameterBuilder`).

## Simplicity And Elegance Review

- Simplest viable shape: una classe con l'axios instance + cache; 4 metodi verbatim; 2 delegatori nel client.
- Coupling check: il fetcher non conosce projectKey/token/scanner; il client dipende dal fetcher solo per delega.
- Future-proofing: è lo **stampo** per gli incrementi successivi (rules+ruleCache, measures/hotspots/duplication).

## Components And Interfaces

### `SonarSourceFetcher` (`src/sonar/api/SonarSourceFetcher.ts`)

- Purpose: fetch del contesto/righe di codice sorgente, con cache raw confinata.
- Inputs/Outputs: `constructor(client: AxiosInstance)`; `getSourceContext(component, line, contextLines?)`, `getSourceLines(componentKey, from, to, options?)`; privati `getSourceLinesFromIndex`, `getRawFileLines`; campo `rawSourceLinesCache`.
- Requirements: `R1.AC1`, `R1.AC3`, `R2.AC1`, `R2.AC2`

### `SonarQubeClient` (delega)

- Purpose: campo `private readonly sourceFetcher: SonarSourceFetcher` (costruito nel costruttore con `this.client`).
- Cambio: `getSourceContext`/`getSourceLines` diventano delegatori (firme identiche); `getSourceLinesFromIndex`/`getRawFileLines` e `rawSourceLinesCache` **rimossi** dal client (spostati nel fetcher).
- Requirements: `R1.AC2`, `R3.AC1`, `R3.AC2`

## Data Models

Nessun nuovo modello (usa `SonarLineCoverage`).

## Error Handling

Invariato: spostamento verbatim (best-effort su getSourceContext, fallback index→raw su getSourceLines, cache in getRawFileLines).

## Failure Modes And Tradeoffs

- Failure mode: spostamento impreciso cambia il contesto codice restituito.
  - Mitigation: i test dei consumatori (`IssueAnalyzer`, `SecurityAnalyzer`) e i test client su source restano verdi (parità); nuovo test unitario del fetcher.
  - Tradeoff: nessuno rilevante.

## Testing Strategy

- Nuovo `SonarSourceFetcher.test.ts` con axios mockato: index-endpoint, fallback raw, cache (secondo fetch senza chiamata), best-effort su errore.
- Suite completa verde (inclusi i test che oggi esercitano `getSourceContext`/`getSourceLines`) → API pubblica e comportamento invariati.

## Verification Plan

- Requirement proof:
  - **R1/R2**: test del fetcher + parità suite; grep che il fetcher non referenzia `projectKey`/`getToken`.
  - **R3**: build `strict` + suite completa (call-site invariati); grep che `getRawFileLines`/`rawSourceLinesCache` non sono più in `client.ts`.
- Test evidence: suite vitest verde; nuovo test fetcher.
- Operational evidence: n/a (refactor interno).

## Requirement Coverage

<!-- Every ID MUST be wrapped in backticks — the validator rejects rows without them -->
| Requirement | Covered By |
| --- | --- |
| `R1` | `SonarSourceFetcher` + delega da `SonarQubeClient` |
| `R2` | Spostamento verbatim + test fetcher/parità |
| `R3` | Delegatori (firme invariate); metodi/cache rimossi dal client |
| `NFR1` | `strict` pulito, nessun nuovo `as any` |
| `NFR2` | move-not-rewrite |
| `NFR3` | test del fetcher + suite verde |
