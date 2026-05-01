# @tsops/skill

A [Claude Skill](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview) that teaches Claude how to use [tsops](https://github.com/Pom4H/tsops) correctly.

When installed, Claude Code, the Agent SDK, or any other tool that implements the [Agent Skills standard](https://agentskills.io/specification) will load this skill automatically when:

- the project contains a `tsops.config.ts` file, or
- the user mentions tsops, `tsops plan`, `tsops deploy`, `tsops up`, preview namespaces, or asks to add/rename/remove apps, secrets, namespaces, or routes.

## Install

```bash
# Run once — copies the skill into ~/.claude/skills/tsops
npx @tsops/skill install
```

Or commit the skill to your repo so every contributor's agent picks it up:

```bash
npx @tsops/skill install --project
```

After install, restart Claude Code (or your Agent SDK session). Verify:

```bash
claude /skills
# tsops should be listed
```

## What's inside

```
~/.claude/skills/tsops/
├── SKILL.md                       # entry point — frontmatter + tactical rules
├── reference/
│   ├── commands.md                # tsops plan / build / deploy / up / down
│   ├── runtime-helpers.md         # config.url, config.env, config.dns
│   ├── secrets.md                 # secret validation, cluster fallback
│   └── preview-overlays.md        # PR-style preview namespaces
└── examples/
    ├── add-app.md                 # recipe: add a new app
    ├── rename-app.md              # recipe: rename safely (compiler-driven)
    └── add-secret.md              # recipe: add a secret
```

The skill is small on purpose — references load on demand, only the file relevant to the current task.

## Why a skill, not just docs

The tsops docs explain what tsops is. This skill teaches Claude **how to operate it correctly** — the hard rules (no internal URLs in env vars, never bypass `tsops plan`, always run `tsc --noEmit` after a rename), the canonical workflow, and the specific failure modes that cost the most time.

Without the skill, an LLM agent will reach for `BACKEND_URL=http://api:3000` because that's the pattern it has seen everywhere else. With the skill, it reaches for `config.url('api', 'service')`.

## Uninstall

```bash
npx @tsops/skill uninstall
npx @tsops/skill uninstall --project
```

## Versioning

This package is versioned independently of the tsops core. The skill text is content-addressable — pinning a version pins the wording.

When tsops's CLI surface changes in a way that affects how an agent should use it, this package gets a release with the updated instructions.

## License

MIT
