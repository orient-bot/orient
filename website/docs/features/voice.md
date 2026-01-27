---
sidebar_position: 4
---

# Voice Integration

Talk to Orient using voice commands. Voice input is available across supported platforms and provides a hands-free way to interact with Ori.

## Overview

Voice integration allows you to:

- Send voice messages that Orient transcribes and responds to
- Use voice commands for quick actions
- Get spoken responses on supported platforms

## Voice on WhatsApp

WhatsApp natively supports voice messages. When you send a voice message to Orient:

1. Orient receives the audio file
2. The audio is transcribed using your configured speech-to-text service
3. The transcription is processed like a text message
4. Orient responds with text (and optionally audio)

No special setup is needed — just send a voice message as you normally would.

## Voice on Slack

Slack huddles and voice clips can be used with Orient. Voice messages sent in DMs are transcribed and processed.

## Wake Word Activation

Orient supports wake-word activation for always-on voice interfaces. When configured:

1. Orient listens for the wake word (default: "Hey Ori")
2. After activation, it captures your voice command
3. Processes the command and responds

### Configuration

Wake-word support requires additional configuration for the audio input device. See the [CLI documentation](/docs/help/cli) for setup details.

## Supported Speech Services

Orient supports multiple speech-to-text providers:

| Provider           | Setup                            |
| ------------------ | -------------------------------- |
| **OpenAI Whisper** | Set `OPENAI_API_KEY` in secrets  |
| **Google Speech**  | Configure via Google integration |

## Voice Tips

- Speak clearly and at a normal pace
- For complex requests, text may be more precise than voice
- Voice messages are transcribed and stored as text in conversation history
- Voice works best for quick commands: scheduling, status checks, simple queries
