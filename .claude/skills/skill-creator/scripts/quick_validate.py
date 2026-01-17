#!/usr/bin/env python3
"""
Quick Skill Validator - Validates skill structure and metadata

Usage:
    quick_validate.py <skill-directory>

Examples:
    quick_validate.py skills/public/my-skill
"""

import sys
import re
from pathlib import Path


def validate_skill(skill_path):
    """
    Validate a skill's structure and metadata.

    Args:
        skill_path: Path to the skill directory

    Returns:
        True if valid, False if validation errors found
    """
    skill_path = Path(skill_path).resolve()
    errors = []

    # Check if directory exists
    if not skill_path.exists():
        errors.append(f"Skill directory does not exist: {skill_path}")
        return False

    if not skill_path.is_dir():
        errors.append(f"Path is not a directory: {skill_path}")
        return False

    # Check for SKILL.md
    skill_md = skill_path / 'SKILL.md'
    if not skill_md.exists():
        errors.append("SKILL.md not found")
        print_errors(errors)
        return False

    # Read SKILL.md content
    try:
        content = skill_md.read_text()
    except Exception as e:
        errors.append(f"Error reading SKILL.md: {e}")
        print_errors(errors)
        return False

    # Check for YAML frontmatter
    if not content.startswith('---'):
        errors.append("SKILL.md must start with YAML frontmatter (---)")
        print_errors(errors)
        return False

    # Extract frontmatter
    parts = content.split('---', 2)
    if len(parts) < 3:
        errors.append("Invalid YAML frontmatter format (must have opening and closing ---)")
        print_errors(errors)
        return False

    frontmatter = parts[1].strip()

    # Parse frontmatter (basic parsing)
    metadata = {}
    for line in frontmatter.split('\n'):
        line = line.strip()
        if ':' in line:
            key, value = line.split(':', 1)
            metadata[key.strip()] = value.strip()

    # Check required fields
    if 'name' not in metadata:
        errors.append("Missing required field 'name' in frontmatter")
    else:
        # Validate name format
        name = metadata['name']
        if not re.match(r'^[a-z0-9-]+$', name):
            errors.append(f"Invalid name format '{name}' - must be lowercase letters, digits, and hyphens only")
        if len(name) > 64:
            errors.append(f"Name too long ({len(name)} chars) - max 64 characters")

    if 'description' not in metadata:
        errors.append("Missing required field 'description' in frontmatter")
    else:
        desc = metadata['description']
        if desc.startswith('[TODO'):
            errors.append("Description contains TODO placeholder - must be completed")
        if len(desc) > 1024:
            errors.append(f"Description too long ({len(desc)} chars) - max 1024 characters")
        if '<' in desc or '>' in desc:
            errors.append("Description contains angle brackets - not allowed")

    # Check for unexpected fields
    allowed_fields = {'name', 'description', 'license', 'allowed-tools', 'metadata'}
    unexpected = set(metadata.keys()) - allowed_fields
    if unexpected:
        errors.append(f"Unexpected fields in frontmatter: {', '.join(unexpected)}")

    # Print results
    if errors:
        print_errors(errors)
        return False
    else:
        print("✅ Skill validation passed")
        return True


def print_errors(errors):
    """Print validation errors."""
    print("❌ Validation errors found:")
    for error in errors:
        print(f"  • {error}")


def main():
    if len(sys.argv) < 2:
        print("Usage: quick_validate.py <skill-directory>")
        print("\nExamples:")
        print("  quick_validate.py skills/public/my-skill")
        sys.exit(1)

    skill_path = sys.argv[1]

    print(f"🔍 Validating skill: {skill_path}\n")

    is_valid = validate_skill(skill_path)

    if is_valid:
        sys.exit(0)
    else:
        sys.exit(1)


if __name__ == "__main__":
    main()
