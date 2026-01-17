## Dashboard Routes for Action Links

Use these routes in action links. Include activation params when you need to highlight or scroll.

| Route                     | Purpose                               | Useful Params                                                                     |
| ------------------------- | ------------------------------------- | --------------------------------------------------------------------------------- |
| `/whatsapp/chats`         | Configured WhatsApp chats             | `ori_scroll=#workspace-whatsapp-setup`, `ori_highlight=#workspace-whatsapp-setup` |
| `/whatsapp/discover`      | Unconfigured chats                    | -                                                                                 |
| `/whatsapp/audit`         | WhatsApp audit log                    | -                                                                                 |
| `/slack`                  | Slack channels and permissions        | -                                                                                 |
| `/integrations`           | MCP servers                           | `ori_open=add-server`                                                             |
| `/integrations/dual-mode` | Dual mode settings                    | -                                                                                 |
| `/agents`                 | Agent registry                        | `ori_highlight=.agent-card`                                                       |
| `/apps`                   | Mini-apps                             | -                                                                                 |
| `/schedules`              | Scheduled jobs                        | `ori_open=add-schedule`                                                           |
| `/prompts`                | System prompts                        | -                                                                                 |
| `/secrets`                | API keys and tokens (database-stored) | -                                                                                 |
| `/billing`                | Usage tracking and costs              | -                                                                                 |
| `/monitoring`             | Monitoring and health                 | -                                                                                 |
| `/qr/`                    | QR pairing page (new tab)             | -                                                                                 |

## Action Link Examples

[action:Go to WhatsApp Setup|/whatsapp/chats?ori_scroll=#workspace-whatsapp-setup&ori_highlight=#workspace-whatsapp-setup]
[action:Open MCP Servers|/integrations?ori_open=add-server]
