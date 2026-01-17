# Skills

Skills are domain knowledge modules that extend Claude's capabilities with specialized knowledge, workflows, and tools.

## Structure

Skills use a **flat hierarchy** - all skills are directly under `.claude/skills/`:

```
.claude/skills/
├── skill-name/              # Core skills (tracked in git)
│   ├── SKILL.md            # Required: skill definition
│   ├── scripts/            # Optional: executable scripts
│   ├── references/         # Optional: documentation to load as needed
│   └── assets/             # Optional: files for output (templates, etc.)
├── example-*/              # Example skills with example- prefix
└── personal-skill -> ...   # Personal skills (symlinked, gitignored)
```

## Creating a Skill

Each skill is a directory with a `SKILL.md` file containing YAML frontmatter:

```markdown
---
name: my-skill
description: Clear description of what the skill does and when to use it. Include trigger phrases.
---

# Title

Your instructions and content here.
```

### Frontmatter Fields

- `name`: Skill identifier (must be unique across all skills)
- `description`: Primary trigger mechanism - include both what the skill does AND when to use it

### Optional Resources

- `scripts/` - Executable code (Python/Bash) for deterministic tasks
- `references/` - Documentation loaded on-demand into context
- `assets/` - Files used in output (templates, icons, etc.)

## Personal Skills

Personal skills contain organization-specific content (IPs, credentials, project IDs) and are excluded from the open-source repository.

### Convention

- **Prefix**: All personal skills use the `personal-` prefix
- **Gitignore**: Pattern `.claude/skills/personal-*/` automatically excludes them
- **Location**: Store in the same `.claude/skills/` directory with the prefix

### Creating a Personal Skill

```bash
# Create a personal skill
mkdir .claude/skills/personal-my-skill
# Add SKILL.md with name: personal-my-skill
```

Personal skills are automatically gitignored and won't be pushed to the repository.

## Discovery

Skills are discovered by Claude Code from `.claude/skills/`. Each skill directory must contain a `SKILL.md` file with valid YAML frontmatter.

## Best Practices

1. **Concise SKILL.md** - Keep under 500 lines, use references for detailed content
2. **Comprehensive descriptions** - Include trigger phrases in the description field
3. **Progressive disclosure** - Load references only when needed
4. **No extraneous files** - Only include SKILL.md and functional resources

## Project Skills

- `agent-permissions` - Permissions policies, approval flows, and adapters
