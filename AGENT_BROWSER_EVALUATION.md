# agent-browser Evaluation Report

**Version tested:** 0.8.6
**Date:** 2026-02-01

## Summary

`agent-browser` is a fast, Rust-based CLI tool for browser automation designed for AI agents. It uses Playwright under the hood with a streamlined command interface.

## Test Results

### ✅ Successful Tests

| Feature            | Result  | Notes                                                    |
| ------------------ | ------- | -------------------------------------------------------- |
| Installation       | ✅ Pass | `npm install -g agent-browser` + `agent-browser install` |
| Navigation         | ✅ Pass | `open`, `back`, `forward` work well                      |
| Snapshot with refs | ✅ Pass | Clean accessibility tree with `@ref` identifiers         |
| Click by ref       | ✅ Pass | `click @e1` works reliably                               |
| Form filling       | ✅ Pass | `fill`, `check`, `uncheck` all work                      |
| Form submission    | ✅ Pass | Full workflow completed successfully                     |
| Radio buttons      | ✅ Pass | Click to select works                                    |
| Screenshots        | ✅ Pass | Good quality PNG output                                  |
| Session management | ✅ Pass | Multiple sessions supported                              |
| Error handling     | ✅ Pass | Clear error messages for invalid refs                    |
| JavaScript eval    | ✅ Pass | `eval` command executes JS in page                       |
| Get page info      | ✅ Pass | `get url`, `get text @ref` work                          |

### ❌ Issues Found

| Feature                | Result      | Notes                                            |
| ---------------------- | ----------- | ------------------------------------------------ |
| `find` semantic search | ❌ Timeout  | `find role/text` commands hung/timed out         |
| Profile persistence    | ⚠️ Partial  | Can't change profile once daemon running         |
| Ref stability          | ⚠️ Expected | Refs change when DOM updates (expected behavior) |

## Key Features

### Snapshot + Refs System

```
- heading "Example Domain" [ref=e1] [level=1]
- paragraph: This domain is for use in...
- link "Learn more" [ref=e2]:
    - /url: https://iana.org/domains/example
```

Very efficient - ~93% less context than full DOM dumps.

### CLI Commands

```bash
# Basic workflow
agent-browser open https://example.com
agent-browser snapshot -i          # Interactive elements only
agent-browser fill @e1 "text"      # Fill form field
agent-browser click @e2            # Click element
agent-browser screenshot test.png  # Capture screenshot
agent-browser close                # End session
```

## Comparison: agent-browser vs claude-in-chrome MCP

| Aspect              | agent-browser            | claude-in-chrome          |
| ------------------- | ------------------------ | ------------------------- |
| **Interface**       | CLI commands             | MCP tools                 |
| **Browser**         | Headless Chromium        | User's Chrome             |
| **Use case**        | Scripting, automation    | Interactive browsing      |
| **Integration**     | Shell scripts, CI/CD     | Claude Code conversations |
| **State**           | Session-based, --profile | User's browser profile    |
| **Speed**           | <50ms startup            | Extension overhead        |
| **Visual feedback** | Screenshots only         | Live browser view         |

## Recommendations for Orient

### Potential Use Cases

1. **E2E Test Scripting**
   - Combine with Vitest for assertions
   - Good for testing dashboard flows
   - Could automate login, form submission, navigation tests

2. **Documentation Screenshots**
   - Automated screenshot capture
   - Consistent, reproducible images
   - Could integrate with existing `documentation-screenshots` skill

3. **CI/CD Integration**
   - Headless by default
   - Session management for parallel tests
   - Clean CLI interface for scripting

### Not Recommended For

- Real-time interactive debugging (use claude-in-chrome)
- Complex dynamic content testing (ref instability)
- Tests requiring browser extensions (limited support)

## Verdict

**Adopt for specific use cases.** agent-browser is a solid tool that could complement existing testing infrastructure:

- ✅ Worth adopting for automated E2E scripting
- ✅ Good for CI/CD browser tests
- ✅ Complements claude-in-chrome (different use cases)
- ⚠️ The `find` command issues need monitoring in future versions

## Next Steps

If adopting:

1. Create a test helper that wraps agent-browser commands
2. Integrate with Vitest for assertions
3. Consider for dashboard E2E test suite
4. Document common patterns in a skill
