---
status: approved
approved_at: 2026-07-05T09:17:09Z
last_modified: 2026-07-05T09:17:09Z
approved_fingerprint: sha256:f58f4bbe090b0e3a6747c8c7d6ffdc859cf49cb566cc89bbc8eacc91e9b0cbf0
---

# Requirements Document

## Introduction

Aggiungere l'analisi SCA (Software Composition Analysis) tramite **Trivy**, innestandola sull'astrazione scanner appena creata (`IScanner`/`ScannerRegistry`, spec `scanner-abstraction-di`). Trivy è una CLI locale "scan-and-return" che rileva vulnerabilità nelle dipendenze; il modello dati normalizzato è già SCA-aware (`IssueType.DEPENDENCY_VULN`, `IssueSource 'trivy'`, `IIssue.dependency`, `IssueRemediation.fixedVersion`, `IScanResult.sbom`, `ScannerType 'sca'`).

L'obiettivo non è un passthrough di Trivy, ma la **SCA "alla Bob"**: aggregare e **arricchire** l'output (fix version, dipendenza diretta vs transitiva, severità normalizzata, remediation actionable) e formattarlo fix-ready per l'LLM — la stessa filosofia dei tool Sonar. L'aggiunta deve avvenire **senza modificare `ScanOrchestrator` né il path SonarQube** (prova dell'Open-Closed abilitato dallo spec precedente).

<!-- assumed: scope = scansione VULNERABILITÀ DELLE DIPENDENZE (trivy fs) + arricchimento fix-ready + tool MCP. Fuori scope (spec successivi): generazione SBOM CycloneDX/SPDX, scansione container image / IaC / secret, e reachability analysis (Trivy OSS non la fa — è appannaggio dei tool commerciali). -->

<!-- assumed: c'è uno skew di versione noto — il binario runtime btf 0.6.0 espone già i tool trivy_check_installation/trivy_scan_dependencies ma il sorgente a HEAD non contiene un TrivyScanner; questo spec produce l'implementazione canonica nel sorgente e la riconcilia con la superficie tool. -->

## Requirements

### R1 TrivyScanner come IScanner "scan-and-return"

**User Story:** Come utente, voglio scansionare le dipendenze del mio progetto con Trivy attraverso Bob, così da avere le vulnerabilità delle dipendenze nello stesso formato normalizzato delle issue Sonar.

#### Acceptance Criteria

1. `R1.AC1` The system SHALL provide a `TrivyScanner` that implements `IScanner` with name `'trivy'` and type `'sca'`.
2. `R1.AC2` WHEN a dependency scan is requested for a project path, the system SHALL run Trivy against that path and return a normalized `IScanResult`.
3. `R1.AC3` WHEN Trivy reports a dependency vulnerability, the system SHALL represent it as a normalized `IIssue` with type `DEPENDENCY_VULN`, source `'trivy'`, and a populated `dependency` object (package name and installed version).

### R2 Arricchimento fix-ready ("alla Bob")

**User Story:** Come sviluppatore che deve rimediare, voglio sapere subito a quale versione aggiornare e se la dipendenza è diretta o transitiva, così da agire senza cercare altrove.

#### Acceptance Criteria

1. `R2.AC1` WHEN Trivy provides a fixed version for a vulnerability, the system SHALL include it in the issue's `remediation.fixedVersion`.
2. `R2.AC2` The system SHALL normalize each Trivy/CVSS severity to the unified severity bands (`CRITICAL`/`HIGH`/`MEDIUM`/`LOW`/`INFO`).
3. `R2.AC3` WHEN a vulnerability references a CVE or advisory identifier, the system SHALL surface that identifier as the issue's `ruleId`.

### R3 Registrazione ed estensibilità senza toccare l'esistente

**User Story:** Come manutentore, voglio che aggiungere Trivy non tocchi il path SonarQube, così da confermare che l'astrazione scanner regge davvero l'Open-Closed.

#### Acceptance Criteria

1. `R3.AC1` The system SHALL register `TrivyScanner` in the scanner wiring alongside the SonarQube scanner.
2. `R3.AC2` The system SHALL add Trivy support without modifying `ScanOrchestrator` or the SonarQube scanner/handler.

### R4 Superficie MCP per la SCA

**User Story:** Come utente di un assistente AI, voglio invocare la scansione SCA e verificare l'installazione di Trivy come tool MCP dedicati.

#### Acceptance Criteria

1. `R4.AC1` WHEN the `trivy_scan_dependencies` tool is invoked, the system SHALL run the Trivy scanner and return a fix-ready text summary of dependency vulnerabilities.
2. `R4.AC2` WHEN the `trivy_check_installation` tool is invoked, the system SHALL report whether Trivy is installed and its version.

### R5 Sicurezza dell'esecuzione

**User Story:** Come utente che scansiona repository non fidati, voglio che l'esecuzione di Trivy non sia iniettabile e non esponga segreti.

#### Acceptance Criteria

1. `R5.AC1` IF a scan target path or option contains shell metacharacters, THEN the system SHALL execute Trivy without shell interpretation (argument array, no shell).
2. `R5.AC2` IF the scan uses registry or authentication credentials, THEN the system SHALL mask them in any log or MCP output.

### R6 Disponibilità e gestione dei fallimenti

**User Story:** Come utente, voglio un errore chiaro se Trivy non è installato o la scansione fallisce, così da sapere cosa fare.

#### Acceptance Criteria

1. `R6.AC1` IF Trivy is not installed or not found on PATH, THEN the system SHALL return a normalized, actionable error with installation guidance.
2. `R6.AC2` WHEN `checkHealth()` is called and Trivy is not available, the system SHALL report the scanner as unavailable.
3. `R6.AC3` IF a Trivy scan exits with an error or times out, THEN the system SHALL surface a normalized error without leaving partial state.

## Non-Functional Requirements

- `NFR1` The system SHALL reuse the existing `IIssue`/`IScanResult` model as the normalization target and SHALL NOT introduce a parallel SCA model (bridged by `R1.AC3`).
- `NFR2` The system SHALL never execute Trivy through a shell with untrusted input (bridged by `R5.AC1`).
- `NFR3` The system SHALL never emit registry/authentication secrets in logs or MCP output (bridged by `R5.AC2`).
- `NFR4` The new SCA scanner, parser, and MCP handlers SHALL be covered by automated tests, including parsing of a representative Trivy JSON fixture.

## Constraints And Dependencies

- `C1` Trivy è una **dipendenza CLI esterna** che deve essere installata sull'host; la scansione richiede `trivy` su PATH.
- `C2` Trivy **OSS non fa reachability analysis** (se una funzione vulnerabile è effettivamente chiamata): fuori scope, eventualmente euristica in uno spec futuro.
- `C3` Riuso obbligatorio dell'astrazione dello spec `scanner-abstraction-di` (`IScanner` scan-and-return, `ScannerRegistry`, wiring a funzioni `toolRoutes`).
- `C4` Va riconciliato lo **skew di versione**: il runtime `btf 0.6.0` espone già i tool `trivy_*` ma il sorgente no; questo spec è l'implementazione canonica.

## Out Of Scope

- Generazione/lettura **SBOM** CycloneDX/SPDX (il campo `IScanResult.sbom` esiste ma la popolazione è spec successivo).
- Scansione **container image**, **IaC** e **secret** di Trivy (focus: vulnerabilità delle dipendenze del filesystem).
- **Reachability analysis** (limite Trivy OSS).
- Integrazione con **Dependency-Track** o aggregatori SBOM esterni.
