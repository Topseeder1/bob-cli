<div align="center">

# ◉ Bob's CLI

### Your AI Engineering Partner — In Your Terminal

[![npm version](https://img.shields.io/npm/v/@bobsworkshop/cli)](https://www.npmjs.com/package/@bobsworkshop/cli)
[![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Bob's CLI** is a locally-installed developer tool that provides a senior-level AI engineering partner directly inside your native terminal. Stay in your development environment. Never switch to a browser. Ship faster.

![Bob's CLI](https://raw.githubusercontent.com/Topseeder1/bob-cli/master/assets/BobWelcome.gif)

[Installation](#installation) · [Quick Start](#quick-start) · [Features](#features) · [VaultBob](#vaultbob--your-codes-permanent-memory) · [UserBob](#userbob--your-digital-twin) · [Command Center](#autonomous-command-center) · [Docs](https://seedling-io.gitbook.io/bob-cli/)

---

*Built by [Bob's Workshop](https://bobs-workshop.web.app) — A Seedling Company*

</div>


---

## Why Bob's CLI?

Every other AI coding assistant lives in a browser, disconnected from your actual workflow. Bob lives where your code lives — in your terminal. He sees your files, understands your architecture, writes code with your approval, and learns how YOU work over time.

**We believe AI should empower developers, not exploit them.** Your code stays on your machine. Your data belongs to you. No surveillance, no vendor lock-in, no token meters draining your wallet while you think. Bob's CLI is built for the developer who refuses to hand over sovereignty in exchange for convenience. This is AI that works FOR you — on YOUR hardware, under YOUR control, at YOUR pace. Power to the people who build.

| Feature | Bob's CLI | Claude Code | Copilot | Cursor |
|---------|-----------|-------------|---------|--------|
| Local file awareness | ✅ | ✅ | ✅ | ✅ |
| Zero-cost local model | ✅ | ✅ | ❌ | ❌ |
| Behavioral profiling | ✅ | ❌ | ❌ | ❌ |
| Personalization Mode | ✅ | ❌ | ❌ | ❌ |
| Digital twin simulation | ✅ | ❌ | ❌ | ❌ |
| Autonomous task dispatch | ✅ | ❌ | ❌ | ❌ |
| Conversation persistence | ✅ | ✅ | ❌ | Partial |
| Deep Dives & Forks | ✅ | ❌ | ❌ | ❌ |
| Remote execution (SovereignLink) | ✅ | Partial | ❌ | ❌ |
| Cross-surface sync (CLI ↔ Web) | ✅ | ✅ | ❌ | ❌ |
| Autonomous code repair | ✅ | ✅ | ❌ | ✅ |
| Source code stays on-device | ✅ | ✅ | ❌ | ✅ |
| Encrypted cloud backup (VaultBob) | ✅ | ❌ | ❌ | ❌ |
| Per-file surgical restore | ✅ | ❌ | ❌ | ❌ |
| Full machine migration | ✅ | ❌ | ❌ | ❌ |

---

## Installation

```bash
pnpm add -g @bobsworkshop/cli
```

Or with npm:

```bash
npm install -g @bobsworkshop/cli
```

Verify:

```bash
bob whoami
```

**Requirements:**
- Node.js 18+
- Any terminal (VS Code, Android Studio, Windows Terminal, iTerm, PowerShell)
- For local AI: [Ollama](https://ollama.com) with a downloaded model
- For platform features: A [Bob's Workshop](https://bobs-workshop.web.app) account

> 📖 Full setup guide: https://seedling-io.gitbook.io/bob-cli/

---

## Quick Start

### Local-First (Free)

```bash
bob chat "hello, what can you help me with?"
```

Bob auto-detects Ollama running on your machine. No configuration needed. No internet. No API keys. No cost. Your code never leaves your machine.

### Platform (Subscribers)

```bash
bob login
bob chat "help me refactor this service"
```

Sync to web. Access Claude, Gemini, deep dives, forks, personalization, and UserBob.

---

## First Run Experience

When you first install Bob's CLI, you're greeted with a branded welcome screen:

![Welcome Screen](https://raw.githubusercontent.com/Topseeder1/bob-cli/master/assets/WelcomeScreen.gif)

---

## Features

| Feature | Description |
|---------|-------------|
| **Chat** | AI coding partner with automatic file discovery |
| **Consult** | Strategic advice, no code output |
| **Index** | AI-powered project understanding |
| **Analyse** | Full QA code review with auto-fix |
| **Autonomy** | Autonomous repair across entire codebase |
| **Profile** | Behavioral DNA profiling + dashboard |
| **VaultBob** | Encrypted backup, versioning & restore — your code's permanent memory |
| **UserBob** | AI digital twin simulation — your autonomous proxy |
| **Command Center** | Inspect, approve, and manage autonomous task dispatch |
| **Deep Dive** | Sandboxed exploration on any message |
| **Fork** | Branch conversations into sub-projects |
| **SovereignLink** | Remote execution from any device |
| **BYOK** | Bring your own API keys |
| **Push** | Git stage + commit + push in one command |

---

## Code Analysis

Bob performs production-grade QA reviews across your entire codebase — identifying bugs, features, improvements, and upgrades with actionable implementation instructions:

![Analysis Dashboard](https://raw.githubusercontent.com/Topseeder1/bob-cli/master/assets/AnalysisDashboard.png)

```bash
bob analyse              # Run full code review
bob analyse --results    # View dashboard
bob analyse --auto       # Auto-fix with safety constraints
```

---

## VaultBob — Your Code's Permanent Memory

**v0.7.0 introduces VaultBob** — the only backup, versioning, and restore system built specifically for how developers work. Every conversation you've had with Bob, every project Bob has learned, every version of every file — encrypted, safe, and accessible from anywhere in the world.

![VaultBob](https://raw.githubusercontent.com/Topseeder1/bob-cli/master/assets/VaultBob.gif)

Built in partnership with **AWS** — the same security infrastructure trusted by the world's largest financial institutions, government agencies, and the companies building the future. Your data is encrypted on your machine before it ever leaves. AWS never sees your code. Nobody does except you.

### Four Backup Modes

```bash
bob backup create                          # Back up Bob's knowledge of your project
bob backup create --source                 # Back up your actual code files
bob backup create --source --file <path>   # Back up one specific file (surgical)
bob backup create --global                 # Back up everything — all projects (Grid)
```

### Named Archives — Your Intentional Checkpoints

```bash
bob backup create --archive "before-auth-refactor"
bob backup create --source --archive "v1.0-launch-state"
```

Think of named archives like Git tags. Regular backups are your auto-save. Named archives are your intentional saves — findable by name, not just by date.

### Revision History

```bash
bob backup list                            # See all revisions for this project
bob backup list --source                   # See all source code snapshots
bob backup list --source --file <path>     # See one file's complete history
```

### Restore — One Command to Go Back in Time

```bash
bob backup restore                         # Interactive picker — choose any version
bob backup restore --source                # Restore source code
bob backup restore --source --file <path>  # Restore one specific file
bob backup restore --global                # Full machine restore (Grid)
```

> **Before every restore, VaultBob automatically saves your current state locally. You cannot permanently lose your work through normal use of VaultBob.**

### The Global Backup — Full Machine Migration

```bash
bob backup create --global
```

Back up your entire engineering brain — every project, every conversation, every behavioral profile, every analysis. When you get a new laptop, run `bob backup restore --global` and you're back. Everything. In minutes. Not days.

> **"New laptop. Same Bob. Same context. Same you."**

### Archive Slots by Workshop Plan

| Workshop Plan | Archive Slots | Retention Period |
|---------------|---------------|-----------------|
| Patch | 0 slots | 1 month |
| Build | 3 slots | 3 months |
| Forge | 6 slots | 6 months |
| Grid | 12 slots | 12 months |

### Remote Backup via SovereignLink

VaultBob integrates directly with SovereignLink — back up and restore your remote machine without being physically present:

```bash
bob remote backup              # Trigger backup on your home machine
bob remote backup --source     # Remote source backup
bob remote restore             # Restore latest on remote machine
```

---

## UserBob — Your Digital Twin

**v0.6.0 introduces UserBob** — the most advanced feature in Bob's CLI. UserBob creates an autonomous AI proxy of you, built from your behavioral DNA, engineering philosophy, and communication style. Your digital twin negotiates with Bob on your behalf to advance a mission you define. You watch. You tune. You approve the results.

```bash
bob userbob "Refactor the auth service error handling"
```

The simulation runs autonomously — no human input required. Bob and your digital twin negotiate until satisfaction reaches your target, then implementation tasks are dispatched to Mini Bob for execution.

```
  ┌─ UserBob ──────────────────────────────────────────────────┐
  │  The error handling in AuthService is incomplete. Bob,     │
  │  show me the current implementation before we proceed.     │
  └────────────────────────────────────────────────────────────┘
            [SAT: 42%] [RES: 78%] [CONVERGING]

                          ┌──────────────────────────── Bob ─┐
                          │  Here's the current auth service  │
                          │  — I can see three areas where    │
                          │  error handling is missing...     │
                          └──────────────────────────────────┘

  ─── MISSION CONTROL ──────────────────────────────────────────
  SAT: 42% → 85%  │  STAG: 0/3  │  DIV: 0/2  │  GRADE: 60
  ────────────────────────────────────────────────────────────────
```

**Options:**

```bash
bob userbob "mission"                       # Inline mission
bob userbob                                 # Interactive mission prompt
bob userbob --target 70 --grading 60       # Custom parameters
bob userbob --stag 3 --div 2               # Set safety thresholds
bob userbob --resume                        # Resume stalled session
bob userbob --local "mission"              # Tier 1 Ollama mode
```

**Mid-session slash commands:**

```
/set target 80        Update satisfaction target
/set grading 70       Update Teacher's Curve
/set stag 5           Set stalemate threshold
/set div 3            Set divergence threshold
/inject "note"        Steer the simulation mid-session
/status               Show current parameters
/abort                Stop immediately
```

**Generate your behavioral DNA first for best results:**

```bash
bob profile --today          # Local (requires Ollama)
bob profile --cloud          # Cloud (Power tier)
```

---

## Autonomous Command Center

Every task UserBob dispatches to Mini Bob is visible, manageable, and auditable from the CLI:

```bash
bob command-center          # Interactive task board
bob cc                      # Alias
bob command-center --stream # Live decision stream
bob command-center --settings # Configure autonomy thresholds
```

**What you see:**

```
  ─── COMMAND CENTER ──────────────────────────────────────────
  2 PENDING  │  8 RUNNING  │  31 DONE  │  41 TOTAL
  ────────────────────────────────────────────────────────────────

  ● NEEDS APPROVAL   [frontend      ]  Create the TabletHomePage layout...
  ● IN PROGRESS      [backend       ]  Update auth service error handling...
  ● COMPLETE         [cloud_functions]  Deploy rate limiter utility...
```

Select any task to see the full chain of custody: Trigger → Request → Outcome. Approve or deny pending tasks directly from the terminal with live execution log streaming.

**Configure how much autonomy UserBob has:**

```bash
bob command-center --settings
# Set global confidence threshold (tasks below this % require approval)
# Set per-category overrides (always auto / always ask / use threshold)
```

---

## Commands

![Help Output](https://raw.githubusercontent.com/Topseeder1/bob-cli/master/assets/BobCliHelpOutput.gif)

```
Conversation
  bob chat "question"                # AI coding partner
  bob consult "question"             # Strategic advice
  bob conversations                  # List conversations
  bob fork "topic"                   # Branch conversation
  bob deepdive                       # Sandboxed exploration

Project Tools
  bob index                          # Index codebase
  bob analyse                        # Code review
  bob analyse --auto                 # Auto-fix
  bob autonomy                       # Full autonomous repair
  bob push "message"                 # Git push

VaultBob — Backup & Restore
  bob backup create                  # Back up project context
  bob backup create --source         # Back up source code
  bob backup create --source --file  # Back up one file
  bob backup create --global         # Full machine backup (Grid)
  bob backup create --archive "name" # Named checkpoint
  bob backup list                    # View revision history
  bob backup restore                 # Interactive restore

Digital Twin
  bob userbob "mission"              # Launch digital twin simulation
  bob command-center                 # Autonomous task board
  bob cc --stream                    # Live decision stream

Profile & Identity
  bob profile --cloud                # Generate DNA profile
  bob profile                        # View dashboard
  bob byok set google <key>          # Add BYOK key

Remote (SovereignLink)
  bob serve                          # Start SovereignLink
  bob remote chat "msg"              # Remote execution
  bob remote backup                  # Remote backup
  bob remote restore                 # Remote restore

Configuration
  bob login                          # Authenticate
  bob whoami                         # Status
```

> 📖 Full command reference: https://seedling-io.gitbook.io/bob-cli/bobs-cli-product-wiki-and-user-guide/command-reference

---

## Personalization Mode

Powered by the **Frank Reasoning Engine**. Bob learns how you work and adapts:

- Tone, pacing, and depth matched to your style
- Blind spots proactively addressed
- Emotional state calibrated encouragement
- UserBob uses your DNA to act as your authentic digital twin

```bash
bob profile --cloud
bob chat --personalized "what should I focus on?"
```

---

## Architecture

```
Tier 1 — Local (Free)              Tier 3 — Platform (Subscription)
─────────────────────────           ─────────────────────────────────
▸ Your model (Ollama)               ▸ Claude / Gemini
▸ Files on your machine             ▸ Conversations sync to web
▸ Local profiling                   ▸ Cloud profiling + Frank Engine
▸ Local UserBob simulation          ▸ UserBob + autonomous dispatch
▸ VaultBob backup & restore         ▸ Deep dives, forks, remote exec
▸ Zero cost                         ▸ VaultBob + team license mgmt
```

Same commands. Scale without changing tools.

---

## What's New in v0.7.0

- **VaultBob™** — Encrypted cloud backup, versioning, and restore built directly into Bob's CLI. Back up your project context, your source code, individual files, or your entire engineering brain. Built in partnership with AWS. Per-file surgical restore. Full machine migration with one command. The only backup system built specifically for how developers work.
- **`bob backup create --source`** — Back up your actual code files with gitignore respect. Encrypted before leaving your machine. Independent of GitHub.
- **`bob backup create --source --file <path>`** — Surgical single-file backup and restore. Back up the exact file you're about to edit. Restore it instantly if something goes wrong.
- **`bob backup create --global`** — Full machine migration. One command captures your entire engineering history across all projects. Restore to any machine in minutes. Grid plan required.
- **Named archives** — Intentional checkpoints with meaningful names. Find them by name, not by date.
- **Remote backup via SovereignLink** — Trigger backups on your home machine from anywhere via `bob remote backup`.
- **`bob remote index`** — SovereignLink now executes full project indexing remotely.
- **`bob remote analyse`** — SovereignLink now executes full QA analysis remotely.

---

## The Philosophy

Bob's CLI exists because we believe the future of software development should be **owned by the developer, not rented from a corporation.**

- Your AI runs on **your hardware** — not someone else's data center
- Your source code **never leaves your machine** — unless you choose to connect
- Your conversations, your profile, your workflow — **yours to keep, yours to control**
- Your entire engineering history — **backed up, versioned, and restorable forever**
- Zero cost to start. Zero permission needed. Zero compromises on privacy.

The cloud is optional. The power is not.

**This is AI for the people who build the future — not the companies who gatekeep it.**

---

## Documentation

- 📖 Full Docs: https://seedling-io.gitbook.io/bob-cli/
- 🌐 Web App: https://bobs-workshop.web.app
- 📦 npm: https://www.npmjs.com/package/@bobsworkshop/cli

---

<div align="center">

**The AI coding tool that learns how you think.**
**The only backup system that protects your engineering brain.**

**Sovereign. Free. Yours.**

Bob's CLI · VaultBob™ · SovereignLink™ · Bob's Workshop · Seedling

*Written by Bob.*

</div>
