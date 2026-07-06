---
status: approved
approved_at: 2026-07-06T17:43:18Z
last_modified: 2026-07-06T17:43:18Z
approved_fingerprint: sha256:ebd5181e90ecada4862946ab42b37d54078bb483379a3dde614e30754c67fc4a
---

# Requirements Document

## Introduction

Increment 3 (ultimo) del punto 6 ("Trivy alla Bob"). Aggiunge un tool MCP `trivy_generate_sbom` che produce un **SBOM** (Software Bill of Materials) delle dipendenze del progetto in formato **CycloneDX** (default) o **SPDX**, via Trivy. È l'artefatto di supply-chain/compliance: lo scrive su file e restituisce un riepilogo (formato, percorso, numero di componenti), senza inondare la risposta MCP con l'SBOM intero.

## Requirements

### R1 Generare l'SBOM via Trivy

**User Story:** Come utente, voglio generare l'SBOM del progetto, così da avere l'inventario delle dipendenze per compliance/supply-chain.

#### Acceptance Criteria

1. `R1.AC1` WHEN the SBOM tool is invoked, the system SHALL run Trivy to produce an SBOM in the requested format (CycloneDX or SPDX).
2. `R1.AC2` WHERE no format is specified, the system SHALL default to CycloneDX.
3. `R1.AC3` IF Trivy is not installed, THEN the system SHALL return a clear installation hint rather than crashing.
4. `R1.AC4` IF an unsupported format is requested, THEN the system SHALL reject it with a clear error before invoking Trivy.

### R2 Persistere e riassumere

**User Story:** Come agente/dev, voglio l'SBOM su file e un riepilogo conciso, così da non ricevere un JSON enorme inline.

#### Acceptance Criteria

1. `R2.AC1` The system SHALL write the SBOM to a file (default path derived from the format; overridable via a parameter).
2. `R2.AC2` The system SHALL return a summary (format, output path, component/package count) rather than the full SBOM inline.
3. `R2.AC3` IF the SBOM output cannot be parsed for a component count, THEN the system SHALL still report the output path and format (degraded summary) rather than fail.

### R3 Superficie del tool MCP

**User Story:** Come utente, voglio invocare l'SBOM come tool MCP, così da usarlo dall'assistente.

#### Acceptance Criteria

1. `R3.AC1` The system SHALL expose the capability as an MCP tool `trivy_generate_sbom` accepting optional projectPath, format, and outputPath.
2. `R3.AC2` The tool SHALL be registered in the router and advertised in the tool definitions (routable end-to-end).

## Non-Functional Requirements

- `NFR1` The Trivy invocation SHALL use an argument array via `execFile` (no shell), so the project path/output path cannot inject commands.
- `NFR2` TypeScript `strict` stays green; the generator and handler SHALL be covered by tests with Trivy (`execFile`) mocked (no Trivy required in CI).
- `NFR3` The change SHALL NOT alter the existing scan/SCA tools' behavior.

## Constraints And Dependencies

- `C1` Dipende da Trivy (`trivy fs --format cyclonedx|spdx-json`).
- `C2` Formati supportati: `cyclonedx` (default) e `spdx-json`.
- `C3` Il tool **scrive un file** nel progetto (effetto collaterale atteso per un SBOM); il percorso è overridabile.
- `C4` Aggiunge il 24° tool MCP: router + tool-definitions + il conteggio atteso nei test vanno aggiornati in modo coerente.

## Out Of Scope

- Diff tra SBOM, firma/attestazione, upload a un registry, VEX.
- Formati diversi da CycloneDX/SPDX.
- Inclusione forzata delle vulnerabilità nell'SBOM (si usa l'output SBOM di Trivy così com'è).
