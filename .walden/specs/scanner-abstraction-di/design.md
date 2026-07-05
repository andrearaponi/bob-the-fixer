---
status: approved
approved_at: 2026-07-05T07:53:55Z
last_modified: 2026-07-05T07:53:55Z
approved_fingerprint: sha256:f130399812fa16cd6553107a88c2c416b51f3aa88cd760894247474bface2ced
source_requirements_approved_at: 2026-07-05T07:44:47Z
source_requirements_fingerprint: sha256:b69bf78b5ba6a7766b8e6297045eced324fe07839c3914cf7045b301fdee1054
---

# Feature Design

## Overview

Oggi `ScanOrchestrator` costruisce e usa direttamente `SonarQubeClient` (il God object da ~3.288 righe); l'astrazione `IScanner` esiste ma è orfana (`SonarQubeScanner.scan()` lancia "not implemented" e usa il client parallelo morto `SonarQubeApiClient`), e il wiring degli handler è duplicato (classe `@injectable` **+** funzione `@deprecated`, con il router che usa quella deprecata).

Il design punta a un'unica architettura target dove:

1. **Un solo meccanismo di wiring** (composition root esplicito, **Opzione A** — vedi `## Options Considered`) costruisce gli handler e il set di scanner, eliminando il ramo `@deprecated`, il container TSyringe e gli `as any` alle giunzioni — soddisfa **R1**.
2. **`ScanOrchestrator` dipende dall'astrazione `IScanner`** ottenuta da un **`ScannerRegistry`**, non da `SonarQubeClient` — soddisfa **R2, R3, R6**.
3. Il contratto scanner è **"scan-and-return"**: `scan(params) → IScanResult` è il metodo canonico (vale per Sonar e per Trivy); la query per `projectKey` diventa una *capability opzionale* implementata solo dagli scanner con store lato server — soddisfa **R2.AC3**.
4. Il path SonarQube viene **migrato dietro un `SonarQubeScanner` reale** (che riusa la macchina funzionante di `SonarQubeClient`, non il client morto), preservando gli output attuali — soddisfa **R4**.

## Architecture

Flusso target:

```text
  MCP tool call (es. sonar_scan_project)
        │
        ▼
  ToolRouter ──> ScanHandler ──> ScanOrchestrator            (pipeline generica:
        │        (costruito dal          │  lock, retry policy,   assembla il
        │         composition root)      │  fallback, summary MCP)  riepilogo)
        │                               ▼
        │                        ScannerRegistry.get(name) ──> IScanner
        │                                                        │
        │                          ┌─────────────────────────────┴───────────────┐
        │                          ▼                                              ▼
        │                 SonarQubeScanner (IQueryableScanner)              TrivyScanner (spec futuro)
        │                 scan() → IScanResult                              scan() → IScanResult
        │                 getIssues(projectKey) [capability opzionale]      (scan-and-return puro)
        ▼
  Consumatori (reporting/analysis) ── dipendono solo da IScanResult / IIssue
```

Confini chiave:

- **`ScanOrchestrator`** resta il proprietario delle preoccupazioni trasversali (acquisizione lock, policy di retry, generazione del fallback recuperabile, normalizzazione del riepilogo per l'output MCP) ma **non conosce più SonarQube**: chiede uno `IScanner` al registry e lo guida via `scan()`.
- **La logica Sonar-specifica** oggi dentro `ScanOrchestrator`/`SonarQubeClient` (pre-scan validation, trigger analisi, polling CE, fetch issues/hotspots/metrics) viene spostata **dentro `SonarQubeScanner`** (pattern strangler-fig: si sposta, non si riscrive, per non regredire — **R4**).
- **I consumatori** (reporting, analysis) dipendono esclusivamente dal modello normalizzato (**R6**).

## Options Considered

Il punto di biforcazione era **quale meccanismo di wiring** adottare per soddisfare R1 (wiring unico, nessun ramo morto, nessun `as any`).

### Option A — Rimuovere TSyringe: composition root esplicito + `ScannerRegistry` leggero (SCELTA)

- Summary: si eliminano il container TSyringe, i decoratori `@injectable`/`@inject`, la dipendenza `reflect-metadata` e le funzioni `@deprecated`. Il wiring diventa un unico *composition root* esplicito (una factory di handler costruiti una volta). Per gli scanner si aggiunge un `ScannerRegistry` di codice semplice (`Map<string, IScanner>`), senza framework.
- Why chosen: minima cerimonia; rimuove il framework di fatto morto e gli `as any` alle giunzioni; un server MCP mono-processo stdio non ha bisogno di un container IoC; il multi-scanner è servito da un registry esplicito. Percorso a **minor rischio** verso "un solo wiring" (R1) e abilita R3 con poche righe.

### Option B — Completare la migrazione TSyringe (scartata)

- Summary: registrare davvero tutti gli handler/scanner/servizi nel container, far risolvere il router dal container, eliminare le `@deprecated` e gli `as any`.
- Why rejected: più lavoro e più rischio (il container oggi registra solo 4 servizi via `require()` lazy per aggirare cicli di import; completare significa cablarne ~20+ e sciogliere i cicli davvero); mantiene una dipendenza pesante e il costo runtime di `reflect-metadata`/decoratori per un beneficio dubbio. L'unico vantaggio reale — risoluzione automatica — non è mai stato sfruttato.

<!-- assumed (decisione utente): Opzione A scelta esplicitamente. Option C (ibrido) collassa su A: un "mini-container solo per scanner" È un ScannerRegistry esplicito. -->

## Simplicity And Elegance Review

- Simplest viable shape: un composition root esplicito più una `Map` di scanner; nessun framework, nessuna risoluzione "magica". Il conteggio dei concetti scende nettamente (via container, catalogo token, decoratori, `reflect-metadata`).
- Coupling check: gli handler dipendono da **interfacce** (`IScanner`, `IProjectManager`, `ISonarAdmin`) ricevute dal costruttore; `ScanOrchestrator` dipende dal `ScannerRegistry`, non da `SonarQubeClient`; i consumatori dipendono solo dal modello normalizzato. Le interfacce in `infrastructure/interfaces/` si **mantengono** — sono il seam pulito per l'iniezione via costruttore senza framework.
- Future-proofing: aggiungere Trivy = una riga nel composition root (`registry.register(new TrivyScanner())`), zero modifiche a `ScanOrchestrator`. Deferiti volutamente: split di `client.ts` e dettagli SCA di Trivy (spec successivi).

## Components And Interfaces

### Composition Root (Opzione A)

- Purpose: unico punto che costruisce `ProjectManager`, `SonarAdmin`, `SonarQubeClient`, il `ScannerRegistry` (con `SonarQubeScanner` registrato) e la mappa degli handler; il `ToolRouter` riceve gli handler già costruiti.
- Inputs/Outputs: `createScannerRegistry(config): ScannerRegistry`; `createHandlers(deps): Record<toolName, IHandler>`.
- Rimozioni: `infrastructure/di/container.ts` e `tokens.ts`; decoratori `@injectable`/`@inject` da **~30+ file** (~20 handler + i **10 servizi `core/*`** che oggi importano `TOKENS` per `@inject(TOKENS.*)` + `SonarQubeScanner`); `reflect-metadata` da `package.json` e dagli entrypoint; tutte le funzioni `handle*()` `@deprecated`; la registrazione `HTTPServer` nel container.
- Nota: le interfacce `IProjectManager`/`ISonarAdmin` in `infrastructure/interfaces/` si **mantengono** (tipi dei parametri costruttore); si rimuove solo il catalogo `TOKENS` e i decoratori.
- Requirements: `R1.AC1`, `R1.AC2`, `R1.AC3`

### `IScanner` (contratto rivisto)

- Purpose: contratto comune "scan-and-return" per ogni scanner (SAST, SCA).
- Inputs/Outputs: `scan(params: ScanParams): Promise<IScanResult>` (canonico); `checkHealth()`, `getConfig()/configure()`, `name`, `type`.
- Cambio: **rimuovere `getIssues(projectKey, filter)` dal contratto base** (Sonar-centrico, non mappa su Trivy).
- Requirements: `R2.AC1`, `R2.AC2`, `R2.AC3`, `R6.AC1`

### `IQueryableScanner extends IScanner` (capability opzionale)

- Purpose: aggiunge `getIssues(projectKey, filter)` per i soli scanner con store lato server interrogabile.
- Chi la implementa: `SonarQubeScanner`. **Trivy non la implementa**.
- Requirements: `R2.AC3`

### `ScannerRegistry`

- Purpose: registro degli `IScanner` disponibili; è il seam che rende l'aggiunta di uno scanner un'estensione.
- Inputs/Outputs: `register(scanner)`, `get(name)`, `list()`, `getByType(type)`. Sostituisce l'`IScannerFactory` mai implementata (rimossa o ridefinita su questo registry).
- Requirements: `R3.AC1`, `R3.AC2`

### `SonarQubeScanner` (reso reale)

- Purpose: implementazione `IQueryableScanner`; `scan()` esegue davvero l'analisi e ritorna `IScanResult`.
- Dependencies: riusa `SonarQubeClient` funzionante (non il morto `SonarQubeApiClient`, che viene rimosso o assorbito).
- Requirements: `R4.AC1`, `R4.AC2`

### `ScanOrchestrator` (reso scanner-agnostico)

- Purpose: pipeline generica che seleziona lo scanner dal registry e lo guida, assemblando il riepilogo MCP.
- Cambio: non costruisce più `SonarQubeClient`; dipende da `ScannerRegistry`/`IScanner`.
- Requirements: `R2.AC1`, `R3.AC2`, `R4.AC2`

## Data Models

Il modello normalizzato **esiste già ed è SCA-aware** (`IIssue` con `DEPENDENCY_VULN`, `source: 'trivy'`, `dependency{packageName, installedVersion, vulnerableVersions}`; `IScanResult` con `sbom` CycloneDX/SPDX; `bySource.{sonarqube, trivy, unified}`). **Va mantenuto**, non sostituito (**C4**). Nessun nuovo modello necessario in questo spec; estensioni per i dettagli Trivy sono nello spec successivo.

Nota tecnica: `BaseScannerImpl.generateScanId()` usa `Date.now()`/`Math.random()` — accettabile per un ID di scan, da rivedere solo se serve determinismo nei test.

## Error Handling

- **Scanner non disponibile** (`R5.AC1`): `IScanner.checkHealth()` ritorna `available:false` con `errorMessage`; l'orchestratore lo traduce in un errore normalizzato e actionable che nomina lo scanner e il rimedio.
- **Eccezione durante lo scan** (`R5.AC2`): l'orchestratore rilascia il lock nel `finally` e propaga un errore normalizzato (gerarchia `custom-errors`).
- **Mascheramento token** (`R5.AC3`): ogni messaggio d'errore che potrebbe contenere un token passa da `maskToken()` — coerente con la hard rule della constitution e con il fix di sicurezza appena applicato.

## Security Considerations

Il refactor riduce la superficie di leak: rimuovendo i percorsi handler duplicati si eliminano anche i punti dove il wiring legacy ricostruiva client con token da env. Regola invariata: nessun token in chiaro nei log o nell'output MCP.

## Failure Modes And Tradeoffs

- Failure mode: la rimozione di decoratori/TSyringe tocca **~30+ file** (~20 handler + **~10 servizi `core/*`** che usano `@inject(TOKENS.*)` + `SonarQubeScanner`) → rischio di regressione di massa.
  - Mitigation: migrazione **meccanica file-per-file**, con build `strict` + suite completa a ogni passo; i test esistenti degli handler (che mockano le dipendenze) restano validi perché continuiamo a passare le stesse dipendenze via costruttore.
  - Tradeoff: composition root più verboso (wiring esplicito) accettato in cambio di zero framework e zero `as any`.
- Failure mode: qualche punto potrebbe risolvere dal container a runtime.
  - Mitigation: `grep` conferma zero `container.resolve`/`initializeContainer` in produzione (solo `di/` e test) → la rimozione non toglie nulla di vivo.
  - Tradeoff: i pochi test DI-based vanno riscritti per costruire le dipendenze direttamente.
- Failure mode: spostare la logica Sonar dentro `SonarQubeScanner` altera un output.
  - Mitigation: test di **parità output** su `sonar_scan_project` pre/post (**R4.AC2**); si sposta il codice, non si riscrive.
  - Tradeoff: PR più grande, ma comportamento invariato.

## Testing Strategy

- Unit: contratto `IScanner`/`IQueryableScanner`; `ScannerRegistry` (register/get/list/getByType); mapping `SonarQubeScanner` (riuso dei test esistenti sul mapping unified).
- Integration: `sonar_scan_project` end-to-end via il nuovo seam, con confronto dell'output di riepilogo pre/post migrazione (**R4.AC2**).
- Estensibilità: un **fake scanner** registrato nel registry entra nella pipeline senza modificare `ScanOrchestrator` (**R3.AC2**, **NFR4**).

## Verification Plan

- Requirement proof:
  - **R1**: assenza di import `tsyringe`/`reflect-metadata` nel sorgente; assenza di funzioni `handle*()` deprecate referenziate dal router; build `strict` pulito senza `as any` alle giunzioni scanner/handler.
  - **R2/R3**: test del fake scanner che prova `scan()` canonico e registrazione senza toccare l'orchestratore.
  - **R4**: confronto output pre/post di `sonar_scan_project`.
  - **R5**: test su health non disponibile, rilascio lock su eccezione, mascheramento token.
- Test evidence: suite vitest completa verde; nuovi test `ScannerRegistry` e fake-scanner; test di parità output scan.
- Operational evidence: n/a (refactor interno; nessun cambio osservabile di log/metriche oltre alla rimozione dei token dai log, già coperta dal fix di sicurezza).

## Requirement Coverage

<!-- Every ID MUST be wrapped in backticks — the validator rejects rows without them -->
| Requirement | Covered By |
| --- | --- |
| `R1` | Composition root esplicito (Opzione A) + rimozione `tsyringe`/`@deprecated` |
| `R2` | `IScanner.scan()` canonico + `IQueryableScanner`, `ScannerRegistry` |
| `R3` | `ScannerRegistry` + `ScanOrchestrator` scanner-agnostico |
| `R4` | `SonarQubeScanner` reale (strangler-fig su `SonarQubeClient`) |
| `R5` | `## Error Handling` (health, lock finally, `maskToken`) |
| `R6` | Consumatori dipendono solo da `IIssue`/`IScanResult` |
| `NFR1` | Rimozione `as any` alle giunzioni (composition root tipato) |
| `NFR2` | `maskToken` su ogni errore (R5.AC3) |
| `NFR3` | Nessun round-trip aggiuntivo (riuso `SonarQubeClient`) |
| `NFR4` | Test con fake scanner registrato |
