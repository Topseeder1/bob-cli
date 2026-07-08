export interface CommandEntry {
  name:          string;
  alias?:        string;
  brief:         string;
  description:   string;
  usage:         { command: string; description: string }[];
  flags?:        { flag: string; description: string }[];
  slashCommands?: { command: string; description: string }[];
  tier:          string;
}

export interface CategoryEntry {
  label:       string;
  icon:        string;
  description: string;
  commands:    CommandEntry[];
}

export interface HelpData {
  categories: CategoryEntry[];
  links: {
    discord: string;
    gitbook: string;
    web:     string;
    npm:     string;
  };
}

export const HELP_DATA: HelpData = {

  links: {
    discord: 'https://discord.gg/wM9ZBXdd',
    gitbook: 'https://seedling-io.gitbook.io/bob-cli',
    web:     'https://bobs-workshop.web.app',
    npm:     'https://www.npmjs.com/package/@bobsworkshop/cli',
  },

  categories: [

    // ─── CONVERSATION ────────────────────────────────────────────
    {
      label:       'Conversation',
      icon:        '💬',
      description: 'Chat, consult, forks, and deep dives',
      commands: [
        {
          name:        'bob chat',
          brief:       'AI coding partner with automatic file discovery',
          description: 'The primary interface for conversational AI assistance. Bob reads your project files, understands your architecture through intelligent two-step retrieval, and writes code with your explicit approval. Every response shows which files Bob referenced. Conversations persist across sessions and sync to the web app on Tier 3.',
          usage: [
            { command: 'bob chat "question"',          description: 'One-shot message' },
            { command: 'bob chat',                      description: 'Interactive session' },
            { command: 'bob chat --interactive',        description: 'Interactive session (explicit)' },
            { command: 'bob chat --personalized',       description: 'DNA-aware responses (Tier 3)' },
            { command: 'bob chat --new "message"',      description: 'Start a fresh conversation' },
            { command: 'bob chat -f <path> "message"',  description: 'Include a specific file as context' },
            { command: 'bob chat --no-context "msg"',   description: 'Skip project file scanning' },
          ],
          slashCommands: [
            { command: '/deepdive',         description: 'Open a sandboxed exploration on a Bob message' },
            { command: '/include <path>',   description: 'Load a file into active context mid-session' },
            { command: '/delete <path>',    description: 'Delete a file with safety confirmation + backup' },
            { command: '/ref',              description: 'Browse cross-project references' },
            { command: '/pin',              description: 'Toggle sticky cross-project reference' },
            { command: '/new',              description: 'Start a fresh conversation' },
            { command: '/clear',            description: 'Clear the terminal display' },
            { command: '/constraints',      description: 'View active negative constraints' },
            { command: '/exit',             description: 'End the session' },
          ],
          tier: 'Tier 1 (local) + Tier 3 (platform)',
        },
        {
          name:        'bob consult',
          brief:       'Strategic advice — no code output',
          description: 'Dedicated strategic advisory mode that enforces a strict no-code policy. Bob will never generate code blocks regardless of how the question is framed. Use this for architectural decisions, technology selection, scaling strategies, and design tradeoffs. Conversations persist and are fully searchable.',
          usage: [
            { command: 'bob consult "question"',       description: 'One-shot strategic question' },
            { command: 'bob consult',                   description: 'Interactive consultant session' },
            { command: 'bob consult --interactive',     description: 'Interactive session (explicit)' },
            { command: 'bob consult --new',             description: 'Start a fresh session' },
            { command: 'bob consult -f <path> "msg"',   description: 'Include file for architectural review' },
          ],
          slashCommands: [
            { command: '/include <path>', description: 'Load a file into active context' },
            { command: '/deepdive',       description: 'Open sandboxed exploration' },
            { command: '/new',            description: 'Start a fresh conversation' },
            { command: '/clear',          description: 'Clear the terminal display' },
            { command: '/constraints',    description: 'View active negative constraints' },
            { command: '/exit',           description: 'End the session' },
          ],
          tier: 'Tier 1 (local) + Tier 3 (platform)',
        },
        {
          name:        'bob conversations',
          brief:       'Browse, search, and rejoin conversation history',
          description: 'Full conversation management interface. Lists your most recent conversations showing title, age, origin (CLI or web), and project workspace. For Tier 3 users, includes conversations from both the terminal and the web app in a unified list. The join command sets any conversation as your active session.',
          usage: [
            { command: 'bob conversations',                    description: 'List 10 most recent conversations' },
            { command: 'bob conversations --search "auth"',    description: 'Filter by keyword' },
            { command: 'bob conversations --page 2',           description: 'Navigate to page 2' },
            { command: 'bob conversations join',               description: 'Select and resume a conversation' },
          ],
          tier: 'Tier 1 (local) + Tier 3 (platform)',
        },
        {
          name:        'bob fork',
          alias:       'bob forks',
          brief:       'Branch a conversation into a focused sub-project',
          description: 'Conversation branching that decomposes complex projects into focused sub-threads. When you fork, the system generates a summary of everything discussed, creates a new conversation seeded with that summary, and Bob posts a kickstart message in the new thread. The parent conversation receives a permanent record of the fork. Mirrors Git branching for AI collaboration.',
          usage: [
            { command: 'bob fork "Authentication System"', description: 'Create a fork with a title' },
            { command: 'bob forks',                        description: 'List all forks of the current conversation' },
          ],
          tier: 'Tier 3 (platform)',
        },
        {
          name:        'bob deepdive',
          alias:       'bob deepdives / bob deepdives-join',
          brief:       'Sandboxed exploration on a specific Bob message',
          description: 'Creates a sandboxed exploration environment attached to a specific message. Investigate ideas in depth without polluting the main conversation. The /promote command summarizes the deep dive and merges insights back into the parent thread. Deep dives are visually distinct — blue double-border containers with the 🤿 icon.',
          usage: [
            { command: 'bob deepdive',          description: 'Create a new deep dive (select a message)' },
            { command: 'bob deepdives',          description: 'List all deep dives in current conversation' },
            { command: 'bob deepdives-join',     description: 'Re-enter an existing deep dive' },
            { command: '/deepdive',              description: 'Enter deep dive from inside chat interactive mode' },
          ],
          slashCommands: [
            { command: '/promote',  description: 'Summarize and merge findings back to main conversation' },
            { command: '/surface',  description: 'Exit deep dive without promoting' },
            { command: '/clear',    description: 'Clear the display while maintaining history' },
          ],
          tier: 'Tier 3 (platform)',
        },
      ],
    },

    // ─── PROJECT TOOLS ───────────────────────────────────────────
    {
      label:       'Project Tools',
      icon:        '🔧',
      description: 'Index, analyse, repair, and push your codebase',
      commands: [
        {
          name:        'bob index',
          brief:       'AI-powered project understanding — summaries + dependency map',
          description: 'Transforms Bob from a generic assistant into a project-aware partner. Scans every code file, generates a 2-3 sentence AI summary of each file\'s purpose and dependencies, then creates a dependency map showing how all files relate. Stored locally in ~/.bob/projects/{name}/analysis/. Runs entirely on your local model — zero cost, code never leaves your machine.',
          usage: [
            { command: 'bob index',           description: 'Index all code files in the current directory' },
            { command: 'bob index --verbose',  description: 'Show summaries and dependencies as they generate' },
          ],
          tier: 'Tier 1 (local) — requires Ollama',
        },
        {
          name:        'bob analyse',
          brief:       'Full QA code review — bugs, features, improvements, upgrades',
          description: 'Performs a comprehensive production-grade code review across your entire indexed project. Identifies genuine bugs, missing features, code improvements, and upgrade opportunities. Every finding includes a specific title, detailed description of the problem, priority level, and exact implementation instructions. Results persist between sessions and are fully searchable.',
          usage: [
            { command: 'bob analyse',                                       description: 'Run full QA review on all indexed files' },
            { command: 'bob analyse --results',                             description: 'View dashboard with category counts' },
            { command: 'bob analyse --results --bugs',                      description: 'Interactive searchable bug list' },
            { command: 'bob analyse --results --features',                  description: 'Interactive feature list' },
            { command: 'bob analyse --results --improvements',              description: 'Interactive improvements list' },
            { command: 'bob analyse --results --upgrades',                  description: 'Interactive upgrades list' },
            { command: 'bob analyse --results --bugs --sort file',          description: 'Group results by file path' },
            { command: 'bob analyse --results --bugs --search "auth"',      description: 'Filter results by keyword' },
            { command: 'bob analyse --auto',                                description: 'Auto-fix with safety constraints (90% confidence)' },
            { command: 'bob analyse --auto --confidence 80',                description: 'Lower the confidence gate' },
            { command: 'bob analyse --auto --priority high',                description: 'Include high-priority items' },
            { command: 'bob analyse --auto --bugs',                         description: 'Auto-fix bugs only' },
          ],
          tier: 'Tier 1 (local) + Tier 3 (platform)',
        },
        {
          name:        'bob autonomy',
          brief:       'Full autonomous codebase repair — processes all pending issues',
          description: 'Launches a complete autonomous repair session that processes ALL pending analysis suggestions, implements fixes with safety constraints, and optionally commits and pushes to Git upon completion. On Tier 1, processes tasks sequentially using your local model. On Tier 3, ignites cloud workers that stream real-time progress to your terminal.',
          usage: [
            { command: 'bob autonomy',                    description: 'Process all pending suggestions' },
            { command: 'bob autonomy --category bugs',    description: 'Only fix bugs' },
            { command: 'bob autonomy --priority critical', description: 'Only critical items' },
            { command: 'bob autonomy --no-push',          description: 'Implement fixes but skip git push' },
            { command: 'bob autonomy --status',           description: 'Check current autonomy run progress (Tier 3)' },
          ],
          tier: 'Tier 1 (local) + Tier 3 (platform)',
        },
        {
          name:        'bob push',
          brief:       'Git stage + commit + push in one command',
          description: 'Consolidates the most common Git workflow into a single atomic operation. Stages all changes, creates a commit with your message, and pushes to the remote repository. Automatically detects the current branch, handles missing upstream tracking branches, and provides clear visual feedback showing commit hash, branch, file count, and changed file list.',
          usage: [
            { command: 'bob push "message"',              description: 'Stage, commit, and push all changes' },
            { command: 'bob push --no-stage "message"',   description: 'Commit only already-staged files' },
            { command: 'bob push -b feature/auth "msg"',  description: 'Push to a specific branch' },
          ],
          tier: 'Tier 1 (local) + Tier 3 (platform)',
        },
      ],
    },

    // ─── THE CREW ────────────────────────────────────────────────
    {
      label:       'The Crew',
      icon:        '🤖',
      description: 'Multi-agent autonomous orchestration — spawn a team, set a mission, ship code',
      commands: [
        {
          name:        'bob agent',
          brief:       'Manage your autonomous agent team',
          description: 'Spawn, configure, and manage specialized AI agents that work autonomously on your codebase. Each agent can be given a name, a role description, and a specialist persona. DirectorBob coordinates the team — reviewing every file change before marking a task complete and every commit before it touches git. Runs entirely on your local model.',
          usage: [
            { command: 'bob agent spawn builder "Implement features"',          description: 'Spawn a named agent' },
            { command: 'bob agent spawn arch "Design" --persona local:architectBob', description: 'Spawn with a persona' },
            { command: 'bob agent list',                                          description: 'List all active agents' },
            { command: 'bob agent status',                                        description: 'Detailed status with session info' },
            { command: 'bob agent hub',                                           description: 'Interactive command center' },
            { command: 'bob agent chat <name>',                                   description: 'Chat with a specific agent' },
            { command: 'bob agent personas',                                      description: 'List all available personas' },
            { command: 'bob agent stop <name>',                                   description: 'Stop an agent' },
            { command: 'bob agent reset <name>',                                  description: 'Reset an agent' },
          ],
          tier: 'Tier 1 (local) — requires Ollama',
        },
        {
          name:        'bob agent-run',
          brief:       'Launch a supervised autonomous mission against your codebase',
          description: 'One command to launch a full autonomous engineering mission. DirectorBob reads your codebase, decomposes the mission into dependency-aware tasks, and dispatches agents to execute. Every file write is reviewed before acceptance. Every commit is reviewed before git. Three failed reviews and the mission pauses for you. Full backup on every file write.',
          usage: [
            { command: 'bob agent-run "Add authentication"',   description: 'Launch mission with active team' },
            { command: 'bob agent-run --dry-run "mission"',    description: 'Preview task map only — no execution' },
            { command: 'bob agent-run --resume',               description: 'Resume a paused mission' },
            { command: 'bob agent-run --no-commit',            description: 'Skip post-mission commit prompt' },
          ],
          slashCommands: [
            { command: '/pause',                description: 'Pause after active tasks complete' },
            { command: '/resume',               description: 'Resume from pause' },
            { command: '/status',               description: 'Full task map with current state' },
            { command: '/skip <taskId>',        description: 'Skip a stuck task' },
            { command: '/inject "note"',        description: 'Send a director note mid-mission' },
            { command: '/set-target <agent> <n>', description: 'Adjust satisfaction target' },
            { command: '/abort',                description: 'Stop everything immediately' },
          ],
          tier: 'Tier 1 (local) — requires Ollama',
        },
      ],
    },

    // ─── VAULTBOB ────────────────────────────────────────────────
    {
      label:       'VaultBob',
      icon:        '🔒',
      description: 'Encrypted backup, versioning, and restore — your code\'s permanent memory',
      commands: [
        {
          name:        'bob backup',
          brief:       'Encrypted cloud backup, versioning, and restore',
          description: 'The only backup system built specifically for how developers work. Back up Bob\'s knowledge of your project, your actual source code, individual files, or your entire engineering brain. Everything is encrypted on your machine before it ever leaves. Built in partnership with AWS — your code is never visible to anyone but you.',
          usage: [
            { command: 'bob backup create',                          description: 'Back up project context (Bob\'s knowledge)' },
            { command: 'bob backup create --source',                 description: 'Back up your actual source code' },
            { command: 'bob backup create --source --file <path>',   description: 'Back up one specific file' },
            { command: 'bob backup create --global',                 description: 'Full machine backup — all projects (Grid)' },
            { command: 'bob backup create --archive "name"',         description: 'Named checkpoint (intentional save)' },
            { command: 'bob backup list',                            description: 'View all revisions for this project' },
            { command: 'bob backup list --source',                   description: 'View all source code snapshots' },
            { command: 'bob backup list --source --file <path>',     description: 'View one file\'s complete history' },
            { command: 'bob backup restore',                         description: 'Interactive restore — pick any version' },
            { command: 'bob backup restore --source',                description: 'Restore source code' },
            { command: 'bob backup restore --source --file <path>',  description: 'Restore one specific file' },
            { command: 'bob backup restore --global',                description: 'Full machine restore (Grid)' },
          ],
          tier: 'Tier 3 (platform) — Patch/Build/Forge/Grid plans',
        },
      ],
    },

    // ─── USERBOB ─────────────────────────────────────────────────
    {
      label:       'UserBob',
      icon:        '🧬',
      description: 'Digital twin simulation + autonomous task management',
      commands: [
        {
          name:        'bob userbob',
          brief:       'Launch your AI digital twin simulation',
          description: 'Creates an autonomous AI proxy of you, built from your behavioral DNA, engineering philosophy, and communication style. Your digital twin negotiates with Bob on your behalf to advance a mission you define. You watch, tune, and approve results. The simulation runs autonomously until satisfaction reaches your target, then implementation tasks are dispatched.',
          usage: [
            { command: 'bob userbob "mission"',             description: 'Launch with inline mission' },
            { command: 'bob userbob',                        description: 'Interactive mission prompt' },
            { command: 'bob userbob --target 90',            description: 'Set satisfaction target (default: 85)' },
            { command: 'bob userbob --grading 60',           description: 'Set Teacher\'s Curve (default: 50)' },
            { command: 'bob userbob --stag 3',               description: 'Set stalemate threshold' },
            { command: 'bob userbob --div 2',                description: 'Set divergence threshold' },
            { command: 'bob userbob --resume',               description: 'Resume a stalled session' },
            { command: 'bob userbob --local "mission"',      description: 'Force local Ollama mode (Tier 1)' },
          ],
          slashCommands: [
            { command: '/set target 80',    description: 'Update satisfaction target mid-session' },
            { command: '/set grading 70',   description: 'Update Teacher\'s Curve' },
            { command: '/set stag 5',       description: 'Update stalemate threshold' },
            { command: '/set div 3',        description: 'Update divergence threshold' },
            { command: '/inject "note"',    description: 'Steer the simulation mid-session' },
            { command: '/status',           description: 'Show current simulation parameters' },
            { command: '/abort',            description: 'Stop the simulation immediately' },
          ],
          tier: 'Tier 1 (local) + Tier 3 (platform)',
        },
        {
          name:        'bob command-center',
          alias:       'bob cc',
          brief:       'Inspect, approve, and manage autonomous task dispatch',
          description: 'The oversight dashboard for every task UserBob dispatches to MiniBob. Shows all pending, running, completed, and failed tasks in a live task board. Select any task to see the full chain of custody: trigger → request → outcome. Approve or deny pending tasks directly from the terminal with live execution log streaming.',
          usage: [
            { command: 'bob command-center',            description: 'Interactive task board' },
            { command: 'bob cc',                         description: 'Alias — same as above' },
            { command: 'bob cc --stream',                description: 'Live decision stream feed' },
            { command: 'bob cc --settings',              description: 'Configure autonomy threshold and category overrides' },
          ],
          tier: 'Tier 3 (platform)',
        },
      ],
    },

    // ─── PROFILE & IDENTITY ──────────────────────────────────────
    {
      label:       'Profile & Identity',
      icon:        '🧬',
      description: 'Behavioral DNA profiling, trends, and personalization',
      commands: [
        {
          name:        'bob profile',
          brief:       'Generate and view your behavioral DNA profile',
          description: 'Builds a behavioral profile from your actual conversations — how you communicate, make decisions, handle stress, and work. Powers Personalization Mode so Bob adapts to your style. Cloud profilers use the Frank Reasoning Engine for deep daily, weekly, and monthly synthesis. The interactive viewer lets you explore any scope, section, and display mode.',
          usage: [
            { command: 'bob profile --view',                               description: 'Interactive profile viewer (scope + section + mode)' },
            { command: 'bob profile --view --full',                        description: 'Full text — no truncation' },
            { command: 'bob profile --view --scope daily',                 description: 'Daily profile only' },
            { command: 'bob profile --view --scope weekly',                description: 'Weekly synthesis only' },
            { command: 'bob profile --view --scope monthly',               description: 'Monthly DNA only' },
            { command: 'bob profile --view --scope daily --section mood',  description: 'Specific section' },
            { command: 'bob profile --trends',                             description: 'Sparkline trend chart (7 days)' },
            { command: 'bob profile --trends --trends-days 14',            description: 'Trend chart — last 14 days' },
            { command: 'bob profile --trends --trends-days 30',            description: 'Trend chart — last 30 days' },
            { command: 'bob profile --cloud',                              description: 'Generate daily cloud profile' },
            { command: 'bob profile --cloud-weekly',                       description: 'Generate weekly synthesis' },
            { command: 'bob profile --cloud-monthly',                      description: 'Generate monthly DNA' },
            { command: 'bob profile --today',                              description: 'Generate daily profile (local Ollama)' },
            { command: 'bob profile --week',                               description: 'Generate weekly profile (local)' },
            { command: 'bob profile --month',                              description: 'Generate monthly profile (local)' },
          ],
          tier: 'Tier 1 (local generation) + Tier 3 (cloud Frank Engine)',
        },
      ],
    },

    // ─── REMOTE — SOVEREIGNLINK ──────────────────────────────────
    {
      label:       'Remote — SovereignLink™',
      icon:        '🌐',
      description: 'Execute commands on your machine from anywhere in the world',
      commands: [
        {
          name:        'bob serve',
          brief:       'Start an Active Bob — receive commands from any device',
          description: 'Starts a persistent daemon that listens for commands from the web app, another terminal, or any device in the world. Your AI model runs on your hardware. Your code never leaves your machine. Only the text of responses transits through the encrypted relay. Tiered polling speeds: Power (2s), Pro (10s), Starter (15s).',
          usage: [
            { command: 'bob serve', description: 'Start Active Bob on the current project' },
          ],
          tier: 'Tier 3 — Starter/Pro/Power plans',
        },
        {
          name:        'bob remote',
          brief:       'Send commands to an Active Bob on a remote machine',
          description: 'Control a remote Active Bob from any terminal. Send chat messages, trigger git pushes, re-index projects, run analysis, and manage backups — all executing on your home machine while you\'re anywhere in the world. Interactive mode provides a persistent session with slash commands.',
          usage: [
            { command: 'bob remote',                       description: 'Show connection status' },
            { command: 'bob remote --new',                 description: 'Discover and connect to an Active Bob' },
            { command: 'bob remote --interactive',         description: 'Persistent remote session' },
            { command: 'bob remote chat "message"',        description: 'One-shot remote chat' },
            { command: 'bob remote consult "message"',     description: 'Remote strategic advice' },
            { command: 'bob remote push "message"',        description: 'Remote git commit + push' },
            { command: 'bob remote index',                 description: 'Re-index project on remote machine' },
            { command: 'bob remote analyse',               description: 'Run QA analysis on remote machine' },
            { command: 'bob remote backup',                description: 'Trigger backup on remote machine' },
            { command: 'bob remote backup --source',       description: 'Remote source code backup' },
            { command: 'bob remote restore',               description: 'Restore latest on remote machine' },
          ],
          slashCommands: [
            { command: '/consult "msg"',   description: 'Strategic advice on remote machine' },
            { command: '/push "msg"',      description: 'Git commit + push on remote' },
            { command: '/index',           description: 'Re-index remote project' },
            { command: '/analyse',         description: 'Run analysis on remote' },
            { command: '/backup',          description: 'Backup remote context' },
            { command: '/backup source',   description: 'Backup remote source code' },
            { command: '/restore',         description: 'Restore latest on remote' },
            { command: '/exit',            description: 'Disconnect from remote session' },
          ],
          tier: 'Tier 3 — Starter/Pro/Power plans',
        },
      ],
    },

    // ─── CONFIGURATION ───────────────────────────────────────────
    {
      label:       'Configuration',
      icon:        '⚙️',
      description: 'Authentication, API keys, and CLI settings',
      commands: [
        {
          name:        'bob login',
          brief:       'Authenticate with Bob\'s Workshop platform',
          description: 'Secure browser-based authentication that connects your terminal to the Bob\'s Workshop platform. Uses the same zero-friction redirect flow as GitHub CLI and Vercel CLI. Tokens are stored locally and auto-refresh when they expire — you never see a session expired error during active use. One command, one browser click, permanently connected.',
          usage: [
            { command: 'bob login',   description: 'Open browser, authenticate, store tokens' },
            { command: 'bob logout',  description: 'Clear credentials, return to Tier 1' },
            { command: 'bob whoami',  description: 'Show current auth state, tier, provider, project' },
          ],
          tier: 'Tier 3 (platform)',
        },
        {
          name:        'bob config',
          brief:       'View and set CLI configuration values',
          description: 'Manages your CLI configuration stored locally. Set your AI provider, local model endpoint, personalization mode, and other settings. Changes take effect immediately on the next command.',
          usage: [
            { command: 'bob config',                                          description: 'View all current configuration' },
            { command: 'bob config set provider local',                       description: 'Use local Ollama model' },
            { command: 'bob config set localEndpoint <url>',                  description: 'Set Ollama endpoint URL' },
            { command: 'bob config set provider platform',                    description: 'Use Bob\'s Workshop platform' },
          ],
          tier: 'Tier 1 (local) + Tier 3 (platform)',
        },
        {
          name:        'bob byok',
          brief:       'Bring Your Own API Keys — configure provider keys',
          description: 'Secure terminal-based API key management for your own AI provider accounts. Keys are stored on the platform and respected by all provider cascades. Takes effect immediately — no restart required. Organization users are directed to their admin dashboard for centralized key management.',
          usage: [
            { command: 'bob byok set google <key>',    description: 'Configure a Google/Gemini key' },
            { command: 'bob byok set openai <key>',    description: 'Configure an OpenAI key' },
            { command: 'bob byok set bedrock <key>',   description: 'Configure an AWS Bedrock key' },
            { command: 'bob byok set grok <key>',      description: 'Configure an xAI Grok key' },
            { command: 'bob byok remove google',       description: 'Remove a provider key' },
            { command: 'bob byok status',              description: 'Show which providers are configured' },
          ],
          flags: [
            { flag: 'google',   description: 'Google Gemini API key' },
            { flag: 'bedrock',  description: 'AWS Bedrock key' },
            { flag: 'openai',   description: 'OpenAI API key' },
            { flag: 'grok',     description: 'xAI Grok API key' },
          ],
          tier: 'Tier 3 (platform)',
        },
        {
          name:        'bob whoami',
          brief:       'Show current authentication status and configuration',
          description: 'Displays your current auth state, tier, provider, personalization mode, IDRP status, active project, and conversation session. The fastest way to verify your setup is correct.',
          usage: [
            { command: 'bob whoami', description: 'Show full configuration status' },
          ],
          tier: 'Tier 1 (local) + Tier 3 (platform)',
        },
      ],
    },

  ],
};