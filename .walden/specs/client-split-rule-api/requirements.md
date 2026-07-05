---
status: approved
approved_at: 2026-07-05T11:39:40Z
last_modified: 2026-07-05T11:39:40Z
approved_fingerprint: sha256:fd551bf6b5590d044aaf9f389bb8c99b1a52658ae945904e86eba495bedb8657
---

# Requirements Document

## Introduction

Incremento 2 dello split della read-API di `sonar/client.ts` (ora 2.045 righe). Estrae il cluster **rules** — `getRuleDetails`, `getRulesSearch`, `getUniqueRulesInfo` e la cache `ruleCache` (+ `RULE_CACHE_TTL`) — in un `SonarRuleApi`. A differenza del source fetcher (contiguo), i 3 metodi sono **sparsi** (con `getComponentDetails`/`getQualityGateStatus` in mezzo), quindi l'estrazione è più chirurgica ma l'accoppiamento resta minimo (solo `this.client` + `ruleCache`, verificato: nessun uso di token/projectKey nel cluster). `SonarQubeClient` delega; consumatore esterno noto: `PatternAnalysisService`.

## Requirements

### R1 Estrazione in `SonarRuleApi`

**User Story:** Come manutentore, voglio la logica di lettura delle regole in un modulo dedicato con la sua cache, così da ridurre `sonar/client.ts` in modo coeso.

#### Acceptance Criteria

1. `R1.AC1` The system SHALL provide a `SonarRuleApi` exposing `getRuleDetails`, `getRulesSearch`, and `getUniqueRulesInfo`, constructed with the HTTP client, and owning the rule cache and its TTL.
2. `R1.AC2` The system SHALL make `SonarQubeClient` delegate `getRuleDetails`, `getRulesSearch`, and `getUniqueRulesInfo` to `SonarRuleApi`.
3. `R1.AC3` The `SonarRuleApi` SHALL NOT depend on the project key, token, or scanner concerns — only on the HTTP client and its own cache.

### R2 Parità di comportamento (nessuna regressione)

**User Story:** Come utente, voglio che i dettagli/ricerca regole restino identici, così da non avere regressioni.

#### Acceptance Criteria

1. `R2.AC1` WHEN rule details, rule search, or unique-rules info are requested, the system SHALL return the same result as before the extraction.
2. `R2.AC2` The system SHALL preserve the rule-details caching behavior (TTL-based; a cached rule not re-fetched before expiry).

### R3 API pubblica e call-site invariati

**User Story:** Come manutentore, voglio che `PatternAnalysisService` e gli altri consumatori non cambino, così che l'estrazione sia trasparente.

#### Acceptance Criteria

1. `R3.AC1` The system SHALL preserve `SonarQubeClient`'s public `getRuleDetails`/`getRulesSearch`/`getUniqueRulesInfo` signatures so existing call-sites need no change.
2. `R3.AC2` After the extraction, `SonarQubeClient` SHALL NOT contain the rule-method bodies (delegation only).

## Non-Functional Requirements

- `NFR1` The system SHALL preserve TypeScript `strict` compilation and introduce no new `as any` at the client/rule-api seam.
- `NFR2` The extraction SHALL move the existing logic, not rewrite it (behavior parity, bridged by `R2.AC1`).
- `NFR3` `SonarRuleApi` SHALL be covered by tests (moved/added), and the full suite SHALL stay green.

## Constraints And Dependencies

- `C1` I 3 metodi rules sono **non contigui** (getComponentDetails/getQualityGateStatus in mezzo): l'estrazione sposta blocchi separati, non un range unico.
- `C2` `ruleCache` + `RULE_CACHE_TTL` sono confinati a `getRuleDetails` (verificato); si spostano nel `SonarRuleApi`.
- `C3` È l'**incremento 2** dello split read-API; measures/hotspots/duplication e il cluster A sono spec successivi.

## Out Of Scope

- Altri sotto-moduli read-API: **measures/hotspots/duplication/coverage** — spec successivo.
- Cluster A (scan machinery) — spec successivo.
- Unificazione con la classe `RuleCache` esistente in `sonar/cache/` (il client usa la sua Map inline; nessun cambio qui).
- Qualsiasi cambiamento ai call-site o alla logica (solo spostamento).
