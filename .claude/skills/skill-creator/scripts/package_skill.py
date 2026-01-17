#!/usr/bin/env python3
"""
Skill Packager - Packages a skill directory into a .skill file

Usage:
    package_skill.py <skill-directory> [output-directory]

Examples:
    package_skill.py skills/public/my-skill
    package_skill.py skills/public/my-skill ./dist
"""

import sys
import zipfile
from pathlib import Path


def package_skill(skill_path, output_dir=None):
    """
    Package a skill directory into a .skill file (zip format).

    Args:
        skill_path: Path to the skill directory
        output_dir: Optional output directory (defaults to current directory)

    Returns:
        Path to created .skill file, or None if error
    """
    # Resolve the skill path
    skill_path = Path(skill_path).resolve()

    # Verify skill directory exists
    if not skill_path.exists():
        print(f"❌ Error: Skill directory does not exist: {skill_path}")
        return None

    if not skill_path.is_dir():
        print(f"❌ Error: Path is not a directory: {skill_path}")
        return None

    # Verify SKILL.md exists
    skill_md = skill_path / 'SKILL.md'
    if not skill_md.exists():
        print(f"❌ Error: SKILL.md not found in {skill_path}")
        return None

    # Import and run quick validation
    try:
        import quick_validate
        print("🔍 Validating skill structure...")
        is_valid = quick_validate.validate_skill(str(skill_path))
        if not is_valid:
            print("❌ Validation failed. Please fix the errors above before packaging.")
            return None
        print("✅ Validation passed")
    except ImportError:
        print("⚠️  Warning: quick_validate module not found, skipping validation")
    except Exception as e:
        print(f"⚠️  Warning: Validation error: {e}")

    # Determine output directory
    if output_dir:
        output_path = Path(output_dir).resolve()
        output_path.mkdir(parents=True, exist_ok=True)
    else:
        output_path = Path.cwd()

    # Create .skill filename
    skill_name = skill_path.name
    skill_file = output_path / f"{skill_name}.skill"

    # Create zip file
    try:
        print(f"📦 Packaging {skill_name}...")
        with zipfile.ZipFile(skill_file, 'w', zipfile.ZIP_DEFLATED) as zipf:
            # Walk through all files in skill directory
            for file_path in skill_path.rglob('*'):
                if file_path.is_file():
                    # Calculate relative path from skill directory
                    arcname = file_path.relative_to(skill_path.parent)
                    zipf.write(file_path, arcname)
                    print(f"  Added: {arcname}")

        print(f"✅ Successfully created {skill_file}")
        return skill_file

    except Exception as e:
        print(f"❌ Error creating package: {e}")
        return None


def main():
    if len(sys.argv) < 2:
        print("Usage: package_skill.py <skill-directory> [output-directory]")
        print("\nExamples:")
        print("  package_skill.py skills/public/my-skill")
        print("  package_skill.py skills/public/my-skill ./dist")
        sys.exit(1)

    skill_path = sys.argv[1]
    output_dir = sys.argv[2] if len(sys.argv) > 2 else None

    result = package_skill(skill_path, output_dir)

    if result:
        sys.exit(0)
    else:
        sys.exit(1)


if __name__ == "__main__":
    main()
