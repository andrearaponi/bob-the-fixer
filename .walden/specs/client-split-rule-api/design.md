---
status: approved
approved_at: 2026-07-05T11:49:43Z
last_modified: 2026-07-05T11:49:43Z
approved_fingerprint: sha256:031c5535805a8e8ba981ce7d2772387bc4bb0e3b6196c779d8f8bd8232529cab
source_requirements_approved_at: 2026-07-05T11:39:40Z
source_requirements_fingerprint: sha256:fd551bf6b5590d044aaf9f389bb8c99b1a52658ae945904e86eba495bedb8657
---

# Feature Design

## Overview

Estrarre il cluster rules in `SonarRuleApi` (`src/sonar/api/SonarRuleApi.ts`), costruito con l'`AxiosInstance` e proprietario di `ruleCache` + `RULE_CACHE_TTL`. Il cluster è **non contiguo**: due range separati — `getRuleDetails`+`getRulesSearch` (1073-1191, contigui) e `getUniqueRulesInfo` (1269-1328) — con `getComponentDetails`/`getQualityGateStatus` in mezzo che **restano** nel client. `getUniqueRulesInfo` chiama `getRuleDetails`, quindi si spostano insieme e la chiamata interna si risolve dentro `SonarRuleApi`. `SonarQubeClient` delega i 3 metodi pubblici.

## Architecture

```text
  PatternAnalysisService / IssueAnalyzer
        │  client.getRuleDetails / getRulesSearch / getUniqueRulesInfo
        ▼
  SonarQubeClient  ──delegate──>  this.ruleApi.<metodo>(...)
                                        │
                                        ▼
                              SonarRuleApi(client)
                                getRuleDetails / getRulesSearch / getUniqueRulesInfo
                                (getUniqueRulesInfo -> this.getRuleDetails, interno)
                                cache: ruleCache (+ RULE_CACHE_TTL)
```

Stesso stampo del `SonarSourceFetcher` (incremento 1): dipende solo dall'`AxiosInstance` + cache propria.

## Options Considered

### Option A — Classe `SonarRuleApi` iniettata con l'AxiosInstance (SCELTA)

- Summary: spostare i 2 range (3 metodi) verbatim in una classe con `this.client` + cache; il client delega.
- Why chosen: stesso pattern già validato nell'incremento 1; accoppiamento minimo misurato; parità garantita dallo spostamento meccanico.

### Option B — Spostare solo `getRuleDetails`+`getRulesSearch`, lasciare `getUniqueRulesInfo`

- Summary: estrarre solo il blocco contiguo.
- Why rejected: `getUniqueRulesInfo` è logica rules e dipende da `getRuleDetails`; lasciarlo indietro spezzerebbe la coesione e richiederebbe un back-reference al client.

## Simplicity And Elegance Review

- Simplest viable shape: una classe con client + cache; 3 metodi verbatim; 3 delegatori nel client; `ruleApi` inizializzato accanto a `sourceFetcher`.
- Coupling check: nessun projectKey/token/scanner; `getUniqueRulesInfo -> getRuleDetails` resta interno alla classe.
- Future-proofing: prosegue lo svuotamento della read-API (dopo: measures/hotspots/duplication).

## Components And Interfaces

### `SonarRuleApi` (`src/sonar/api/SonarRuleApi.ts`)

- Purpose: lettura regole (dettaglio, ricerca, info uniche) con cache TTL.
- Inputs/Outputs: `constructor(client: AxiosInstance)`; `getRuleDetails(ruleKey)`, `getRulesSearch(filter?, page?, pageSize?)`, `getUniqueRulesInfo(...)`; campo `ruleCache` + `RULE_CACHE_TTL`.
- Requirements: `R1.AC1`, `R1.AC3`, `R2.AC1`, `R2.AC2`

### `SonarQubeClient` (delega)

- Purpose: campo `private readonly ruleApi: SonarRuleApi` (costruito nel costruttore con `this.client`, accanto a `sourceFetcher`).
- Cambio: i 3 metodi diventano delegatori (firme identiche); i bodies, `ruleCache` e `RULE_CACHE_TTL` **rimossi** dal client.
- Requirements: `R1.AC2`, `R3.AC1`, `R3.AC2`

## Data Models

Nessun nuovo modello (usa `SonarRuleDetails`, `SonarRuleSearchFilter`, `SonarRulesResponse` e i tipi di `getUniqueRulesInfo`).

## Error Handling

Invariato: spostamento verbatim (cache TTL in getRuleDetails, gestione errori dei singoli metodi immutata).

## Failure Modes And Tradeoffs

- Failure mode: spostamento impreciso di un range non contiguo cambia comportamento o rompe la build.
  - Mitigation: due range estratti verbatim con confini verificati; build `strict` + suite completa + nuovo test del `SonarRuleApi`.
  - Tradeoff: nessuno rilevante (getComponentDetails/getQualityGateStatus restano intatti nel client).

## Testing Strategy

- Nuovo `SonarRuleApi.test.ts` con axios mockato: getRuleDetails (+ cache hit senza secondo GET), getRulesSearch, getUniqueRulesInfo (aggrega via getRuleDetails).
- Suite completa verde (inclusi i test che oggi esercitano questi metodi) → API pubblica e comportamento invariati.

## Verification Plan

- Requirement proof:
  - **R1/R2**: test del rule-api + parità suite; grep che il rule-api non referenzia `projectKey`/`getToken`.
  - **R3**: build `strict` + suite completa; grep che `getUniqueRulesInfo`/`ruleCache` non sono più in `client.ts`.
- Test evidence: suite vitest verde; nuovo test rule-api.
- Operational evidence: n/a (refactor interno).

## Requirement Coverage

<!-- Every ID MUST be wrapped in backticks — the validator rejects rows without them -->
| Requirement | Covered By |
| --- | --- |
| `R1` | `SonarRuleApi` + delega da `SonarQubeClient` |
| `R2` | Spostamento verbatim (2 range) + test rule-api/parità |
| `R3` | Delegatori (firme invariate); metodi/cache rimossi dal client |
| `NFR1` | `strict` pulito, nessun nuovo `as any` |
| `NFR2` | move-not-rewrite |
| `NFR3` | test del rule-api + suite verde |
