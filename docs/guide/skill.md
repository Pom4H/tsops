# Use with Claude (Skill)

`@tsops/skill` is a [Claude Skill](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview) that teaches Claude how to operate tsops correctly. Once installed, Claude Code, the Agent SDK, and any other tool implementing the [Agent Skills standard](https://agentskills.io/specification) load it automatically when relevant.

## Why

The docs explain what tsops _is_. The Skill tells Claude how to _use_ it — specifically, the hard rules that an agent will violate by default if it has only ever seen YAML deploys before:

- Don't put internal service URLs in env vars — use `config.url('api', 'service')`.
- Always run `tsops plan` before `tsops deploy`.
- After editing `tsops.config.ts`, run `tsc --noEmit` so renames propagate.
- Never `--no-verify` past secret validation.

Without the Skill, an agent reaches for `BACKEND_URL=http://api:3000` because that pattern is everywhere else on the public internet. With the Skill, it reaches for `config.url`.

## Install

::: code-group

```bash [user-scope]
# Install once for your account → ~/.claude/skills/tsops
npx @tsops/skill install
```

```bash [project-scope]
# Commit the Skill to your repo → ./.claude/skills/tsops
# Every contributor's agent picks it up automatically.
npx @tsops/skill install --project
```

:::

After install, restart Claude Code (or your Agent SDK session). Verify with:

```bash
claude /skills
# "tsops" should appear in the list
```

## What's inside

```
~/.claude/skills/tsops/
├── SKILL.md                # entry point — frontmatter + hard rules
├── reference/
│   ├── commands.md         # CLI commands and flags
│   ├── runtime-helpers.md  # config.url, config.env, config.dns
│   ├── secrets.md          # secret validation
│   └── preview-overlays.md # overlay namespace lifecycle
└── examples/
    ├── add-app.md
    ├── rename-app.md
    └── add-secret.md
```

The Skill is small on purpose. The entry-point `SKILL.md` covers the mental model and the hard rules. References load on demand — Claude pulls in `reference/secrets.md` only when secret work is in scope.

## Updating

```bash
npx @tsops/skill@latest install --force
```

The Skill is versioned independently of tsops core. When the CLI surface changes in a way that affects how an agent should operate, the Skill gets a release with updated instructions.

## Uninstall

```bash
npx @tsops/skill uninstall            # remove from ~/.claude/skills/tsops
npx @tsops/skill uninstall --project  # remove from ./.claude/skills/tsops
```

## Source

The Skill content lives at [`skills/tsops/`](https://github.com/Pom4H/tsops/tree/main/skills/tsops) in the main tsops repo. Edits go through PR review, the same as any other code change. Changes to the Skill should explain — in the PR description — what failure mode the change prevents.
