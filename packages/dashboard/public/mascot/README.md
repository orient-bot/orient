# Orient Mascot Assets

This folder contains the Orient mascot (border collie with blue bandana) and its variations.

## Structure

```
mascot/
├── base.png          # The original mascot image (REQUIRED)
├── variations/       # Generated variations
│   ├── celebration.png
│   ├── thinking.png
│   └── ...
└── README.md
```

## Setup

1. Place the base mascot image as `base.png` in this folder
2. The image should be PNG format, ideally 1024x1024 or larger
3. Generated variations will be saved to the `variations/` subfolder

## Usage

Mascot variations are generated using the `ai_first_generate_mascot` MCP tool.
See the `mascot-generator` skill for usage documentation.

## Generated Variations

| Filename          | Description                  |
| ----------------- | ---------------------------- |
| `celebration.png` | Party hat, confetti          |
| `thinking.png`    | Thought bubble, looking up   |
| `loading.png`     | Animated thinking expression |
| ...               | Add more as generated        |
