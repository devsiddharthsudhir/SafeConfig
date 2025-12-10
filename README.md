# SafeConfig

> **SafeConfig** is a type-safe configuration *compiler* and static analysis engine for service & infrastructure configs.
> It turns human-friendly YAML into a validated intermediate representation (IR), runs security & reliability rules, and produces actionable reports.

---

## Table of Contents

1. [Context & Motivation](#context--motivation)
2. [Key Features](#key-features)
3. [Architecture Overview](#architecture-overview)
4. [Repository Layout](#repository-layout)
5. [Getting Started](#getting-started)
6. [CLI Usage](#cli-usage)
7. [Configuration Model](#configuration-model)
8. [Rule Engine & Examples](#rule-engine--examples)
9. [Extensibility](#extensibility)
10. [Quality, Testing & Tooling](#quality-testing--tooling)
11. [Roadmap](#roadmap)
12. [Why This Project Matters (For Reviewers)](#why-this-project-matters-for-reviewers)

---

## Context & Motivation

Modern backends are composed of many services: API gateways, databases, workers, queues, and internal tools.
Their **configuration** (YAML / JSON / Helm values / compose files) quietly encodes:

* Which services are public vs private
* Which ports and hosts they bind to
* Which protocols are used (HTTP vs HTTPS)
* How data and traffic flow between them

Misconfigurations here lead directly to:

* Publicly exposed databases
* Non-TLS endpoints on internet-facing services
* Inconsistent environments between dev/stage/prod

**SafeConfig** is built to catch these issues *before* they reach production, by treating configuration as code and running it through a **compiler-style pipeline**.

---

## Key Features

1. **Typed Configuration Compiler**

   * Parses human-readable YAML into a **strongly-typed IR (Intermediate Representation)** using TypeScript and Zod.
   * Normalizes different configuration shapes into a single canonical model.

2. **Static Analysis & Policy Engine**

   * Runs a rules engine over the IR to enforce **security and reliability invariants**.
   * Example rules:

     * `R1_NO_PUBLIC_DB`: No database service should be directly reachable from the internet.
     * `R2_PUBLIC_REQUIRES_TLS`: Public-facing services must expose at least one TLS-enabled endpoint.

3. **Developer-Friendly CLI**

   * Single entry-point CLI to analyze configs:

     ```bash
     npm run cli -- analyze ./examples/sample-config.yaml --format yaml
     ```
   * Human-readable text output and machine-consumable formats.

4. **Deterministic Hashing of Configs**

   * Computes a stable **config hash** (e.g., `Config hash: 9a3ef3d9a2dd`) so changes across commits/environments are easily tracked.

5. **CI/CD Ready**

   * Designed to be dropped into GitHub Actions / GitLab CI / any pipeline to **fail builds** on policy violations.

6. **Extensible by Design**

   * New rules are just pure functions over the IR.
   * Easy to support new config formats or sources while reusing the same compiler core.

---

## Architecture Overview

At a high level, SafeConfig behaves like a small compiler:

1. **Input Layer**

   * Reads one or more YAML configuration files.
   * Handles basic IO and error reporting.

2. **Parsing & Validation**

   * Uses [`js-yaml`](https://github.com/nodeca/js-yaml) to parse YAML into raw JS objects.
   * Uses [`zod`](https://github.com/colinhacks/zod) schemas to:

     * Validate shape and required fields.
     * Provide clear, structured validation errors.
   * Produces a well-typed `ConfigIR`.

3. **Intermediate Representation (IR)**

   * Structures configuration into:

     * `Service` objects (name, type, protocol, exposure, bindings, metadata, …)
     * `NetworkBinding` objects (host, port, protocol, tlsEnabled, …)
   * This IR is the core contract for rules and future backends.

4. **Rule Engine**

   * Each rule is a function: `(config: ConfigIR) => RuleResult[]`.
   * Rules can be labeled by:

     * ID (e.g., `R1_NO_PUBLIC_DB`)
     * Severity (`LOW` | `MEDIUM` | `HIGH`)
     * Category (`security`, `networking`, `reliability`, …)

5. **Reporting**

   * Aggregates results into a final report:

     * Summary stats: number of services, hash of config.
     * List of rule violations with severity and target.
     * CLI-printable + format-specific serializations (e.g., YAML).

---

## Repository Layout

> *This is a representative layout; exact structure may evolve as the project grows.*

```bash
safeconfig/
  backend/
    src/
      cli/
        safeconfig-cli.ts       # CLI entry point
      compiler/
        parser.ts               # YAML -> IR parsing & validation
        ir.ts                   # IR types (ConfigIR, Service, Protocol, ServiceType, ...)
        rules/
          security-rules.ts     # e.g., R1_NO_PUBLIC_DB, R2_PUBLIC_REQUIRES_TLS
          # more rule modules...
      utils/
        logger.ts               # Console/log abstraction (if present)
    examples/
      sample-config.yaml        # Example service configuration
    package.json
    tsconfig.json
    README.md                   # (You are here)
```

---

## Getting Started

### 1. Prerequisites

* **Node.js** ≥ 18 (recommended: 20.x)
* **npm** or **pnpm**
* Git (if cloning from GitHub)

### 2. Clone & Install

```bash
# Clone repository
git clone https://github.com/devsiddharthsudhir/SafeConfig.git
cd SafeConfig/backend

# Install dependencies
npm install
# or
pnpm install
```

### 3. Build (optional if using ts-node)

If you’re compiling TypeScript to JavaScript:

```bash
npm run build
```

---

## CLI Usage

The CLI currently exposes an `analyze` command.

### Basic Analysis

```bash
npm run cli -- analyze ./examples/sample-config.yaml --format yaml
```

Example output:

```text
Config hash: 9a3ef3d9a2dd
Services: 3

❌ Found 2 violation(s):
  [HIGH] R2_PUBLIC_REQUIRES_TLS @ api-gateway -> Publicly exposed service listens on HTTP without any HTTPS endpoint. Public services must have TLS enabled.
  [HIGH] R1_NO_PUBLIC_DB @ user-db -> Database service is exposed publicly (host=0.0.0.0 or marked public). Databases should not be directly reachable from the internet.
```

### Flags

* `--format <format>`

  * Currently supports `yaml` for a structured YAML report.
  * Default (no `--format`) prints a human-readable text summary.
* `<configPath>`

  * Path to a YAML config file describing your services.

> **Note:** As the CLI evolves, more commands and formats (e.g., `json`, `sarif`) can be added without changing the compiler core.

---

## Configuration Model

A configuration file describes one or more services and how they are exposed.

Conceptually, a `Service` in the IR captures:

* **Identity**

  * `name`: unique name (e.g., `api-gateway`, `user-db`)
  * `type`: enum-like (e.g., `api`, `database`, `worker`)

* **Exposure**

  * `public`: boolean indicating if it is internet-facing
  * `bindings`: list of host/port/protocol bindings, for example:

    * `host: 0.0.0.0`, `port: 80`, `protocol: http`
    * `host: 0.0.0.0`, `port: 443`, `protocol: https` (with TLS)

* **Metadata**

  * Optional labels/annotations that rules can use later (e.g., `env: prod`)

In code, bindings are validated with a Zod schema like:

```ts
const networkBindingSchema = z.object({
  host: z.string(),
  port: z.number().int().nonnegative(),
  // ...potentially protocol, tlsEnabled, etc.
});
```

This guarantees that only well-formed bindings enter the IR, which simplifies rules and reduces edge cases.

---

## Rule Engine & Examples

Rules operate over the validated `ConfigIR` and emit structured results.

### Example: `R1_NO_PUBLIC_DB`

> **Goal:** Prevent any database service from being directly accessible from the internet.

Pseudo-implementation (TypeScript):

```ts
function R1_NO_PUBLIC_DB(config: ConfigIR): RuleResult[] {
  return config.services
    .filter((svc) => svc.type === "database" && svc.public)
    .map((svc) => ({
      id: "R1_NO_PUBLIC_DB",
      severity: "HIGH",
      target: svc.name,
      message:
        "Database service is exposed publicly (host=0.0.0.0 or marked public). Databases should not be directly reachable from the internet.",
    }));
}
```

### Example: `R2_PUBLIC_REQUIRES_TLS`

> **Goal:** Ensure all public-facing services have at least one TLS-enabled endpoint.

Conceptually:

1. Filter to `public` services.
2. Inside each service, check its `bindings`.
3. Verify that at least one binding uses `https`/TLS.

Violations are rendered in the CLI as:

```text
[HIGH] R2_PUBLIC_REQUIRES_TLS @ api-gateway -> Publicly exposed service listens on HTTP without any HTTPS endpoint. Public services must have TLS enabled.
```

---

## Extensibility

SafeConfig is deliberately modular:

1. **Adding a New Rule**

   * Implement a function `(config: ConfigIR) => RuleResult[]`.
   * Export it from a rule module (e.g., `rules/security-rules.ts`).
   * Register it in the rule engine’s list.

2. **Supporting a New Config Source**

   * Write a loader that transforms your source format into the IR shape expected by the compiler.
   * Existing rules work unchanged because they operate on the IR, not raw YAML.

3. **Integrating with CI/CD**

Example: a minimal GitHub Actions workflow:

```yaml
name: SafeConfig Analysis

on:
  pull_request:
    paths:
      - "backend/**.yaml"
      - "backend/**.yml"

jobs:
  analyze-config:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: backend
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm install
      - run: npm run cli -- analyze ./examples/sample-config.yaml --format yaml
```

This makes misconfigurations a **hard gate** on pull requests.

---

## Quality, Testing & Tooling

Internally, the project is designed to reflect production-grade engineering:

* **TypeScript** end-to-end for type safety and refactorability.
* **Zod-based validation** to keep runtime and compile-time types in sync.
* Clear separation between:

  * Parsing
  * IR modeling
  * Rule evaluation
  * CLI presentation

You can inspect `package.json` for scripts such as:

* `npm run cli` – run the SafeConfig CLI.
* (Optional) `npm run lint`, `npm test` – if you add ESLint / testing frameworks.

Contributions or extensions should follow the same structure:

* Add types in `ir.ts`.
* Validate via `parser.ts`.
* Add rules inside `rules/`.

---

## Roadmap

Planned/possible extensions:

1. **More Built-in Rules**

   * Rate limit configs, auth requirements, cross-service dependency checks.
2. **JSON & SARIF Output**

   * Machine-readable outputs for IDE integration and security dashboards.
3. **Config Visualization**

   * Generate diagrams of service graphs and network topology.
4. **Language-Server / Editor Integration**

   * Real-time linting of config files in VS Code.

---

## Why This Project Matters (For Reviewers)

**For Engineering Teams / FAANG-style Interviews**

* Demonstrates the ability to:

  1. Design and implement a **compiler-like pipeline** (parse → IR → analysis → report).
  2. Reason about **security & reliability** in distributed systems.
  3. Build **extensible tooling** that integrates with CI/CD, not just app code.
  4. Use modern TypeScript practices (type-safe schemas, strong module boundaries).

**For SFU / BCIT Admissions**

* Shows applied computing skills in:

  * **Static analysis & program reasoning** (for configs instead of traditional code).
  * **Formalizing real-world constraints** (e.g., “no public DB”) as enforceable rules.
  * **Software engineering discipline**: clear architecture, CLI design, and scope for research-style extensions (e.g., generating formal proofs, policy languages, or visualizations).

SafeConfig is intentionally positioned between **practical DevOps tooling** and **compiler / static analysis concepts**, making it relevant for both industry and graduate-level academic evaluation.

---

*Authored & maintained by **Siddharth Sudhir**.*
Feel free to open issues, suggest new rules, or fork the project to adapt it to your own configuration formats.
