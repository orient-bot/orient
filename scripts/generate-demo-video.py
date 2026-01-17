#!/usr/bin/env python3
"""
Generate Demo Video for Orient Website

This script uses the Veo API via Google's Gemini Python SDK to generate
a demo video showing Orient's agentic capabilities.

Usage:
    pip install google-genai
    python scripts/generate-demo-video.py

Requirements:
    - GEMINI_API_KEY or GOOGLE_GEMINI_API_KEY environment variable
    - google-genai package installed
"""

import os
import time
import base64
from pathlib import Path

# Configuration
OUTPUT_DIR = Path("website/static/video")
OUTPUT_FILENAME = "ori-demo.mp4"
POSTER_PATH = Path("website/static/img/screenshots/demo-poster.png")

# Veo model - use 3.1 for best quality
VEO_MODEL = "veo-3.1-generate-preview"

# Demo video prompt
DEMO_PROMPT = """Create a smooth, professional demo video showing an AI assistant workflow on a smartphone:

SCENE 1 (0-2 seconds):
A smartphone screen displaying a WhatsApp chat interface. The contact name shows "Ori 🐕" with a blue dot indicating online status. A user is typing a message that appears: "Hey Ori, schedule a meeting with Tom tomorrow at 3pm"

SCENE 2 (2-4 seconds):
The typing indicator shows Ori is responding. Then Ori's message appears with a friendly cartoon border collie avatar (blue bandana). The response shows: "I'll check Tom's availability..." followed by a small calendar preview card embedded in the chat showing tomorrow's schedule with available slots highlighted in green.

SCENE 3 (4-6 seconds):
A new message from Ori appears: "Done! ✓ Meeting scheduled for tomorrow 3pm with Tom. Calendar invite sent to both of you." A small notification animation slides in from the top showing "📅 Meeting Scheduled - Tomorrow 3:00 PM".

SCENE 4 (6-8 seconds):
The chat scrolls up slightly to show the full conversation. A subtle glow effect highlights the confirmation. The phone screen transitions to show a clean calendar view with the new meeting entry highlighted.

VISUAL STYLE:
- Clean, modern smartphone UI (iPhone-style bezels)
- WhatsApp-like chat bubbles: green for user messages, white for Ori
- Smooth, fluid animations between scenes
- Soft, professional lighting on the phone
- Cartoon mascot avatar for Ori (friendly blue border collie with bandana)
- Neutral, blurred background suggesting a professional workspace

AUDIO:
- Subtle WhatsApp-like message send/receive sounds
- Soft "ding" when meeting is confirmed
- Light ambient background music (professional, optimistic tone)

MOOD: Efficient, helpful, friendly. Demonstrate that complex tasks happen automatically through simple conversation."""


def main():
    print("🎬 Orient Demo Video Generator (Python)")
    print("=" * 40)
    print()

    # Get API key
    api_key = os.environ.get("GOOGLE_GEMINI_API_KEY") or os.environ.get("GEMINI_API_KEY")
    if not api_key:
        print("❌ Error: GEMINI_API_KEY or GOOGLE_GEMINI_API_KEY not set")
        return 1

    # Import google-genai
    try:
        from google import genai
        from google.genai import types
    except ImportError:
        print("❌ Error: google-genai package not installed")
        print("   Run: pip install google-genai")
        return 1

    # Create output directory
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    print("📝 Video Configuration:")
    print(f"   Model: {VEO_MODEL}")
    print(f"   Aspect Ratio: 16:9")
    print(f"   Output: {OUTPUT_DIR / OUTPUT_FILENAME}")
    print()

    print("🚀 Starting video generation...")
    print("   This may take several minutes.")
    print()

    try:
        # Initialize client
        client = genai.Client(api_key=api_key)

        # Load reference image if available
        reference_image = None
        if POSTER_PATH.exists():
            print(f"✅ Loading reference image from {POSTER_PATH}")
            with open(POSTER_PATH, "rb") as f:
                reference_image = f.read()
            print()

        print("📡 Calling Veo API...")
        print()

        # Generate video
        # Try with generate_videos method
        try:
            operation = client.models.generate_videos(
                model=VEO_MODEL,
                prompt=DEMO_PROMPT,
                config=types.GenerateVideosConfig(
                    aspect_ratio="16:9",
                    number_of_videos=1,
                ),
            )
        except AttributeError:
            # Fallback: try alternative API structure
            print("ℹ️  Trying alternative API method...")
            operation = client.generate_video(
                model=VEO_MODEL,
                prompt=DEMO_PROMPT,
                aspect_ratio="16:9",
            )

        print(f"📊 Operation started: {getattr(operation, 'name', 'unknown')}")
        print()

        # Poll for completion
        print("⏳ Waiting for video generation to complete...")
        start_time = time.time()
        max_wait = 600  # 10 minutes
        poll_interval = 5  # seconds

        while not operation.done:
            elapsed = int(time.time() - start_time)
            print(f"\r⏳ Generating... {elapsed}s elapsed", end="", flush=True)

            if elapsed > max_wait:
                print()
                print("❌ Video generation timed out after 10 minutes")
                return 1

            time.sleep(poll_interval)

            # Refresh operation status
            if hasattr(operation, 'name') and operation.name:
                try:
                    operation = client.operations.get(operation)
                except Exception as e:
                    # Try with name string
                    try:
                        operation = client.operations.get(name=operation.name)
                    except Exception as e2:
                        print(f"\n⚠️  Poll warning: {e2}")

        print()
        print()

        # Check for errors
        if hasattr(operation, 'error') and operation.error:
            print(f"❌ Generation failed: {operation.error}")
            return 1

        # Get result
        result = operation.result if hasattr(operation, 'result') else operation

        # Find generated videos
        generated_videos = None
        if hasattr(result, 'generated_videos'):
            generated_videos = result.generated_videos
        elif hasattr(result, 'generatedVideos'):
            generated_videos = result.generatedVideos
        elif isinstance(result, dict):
            generated_videos = result.get('generated_videos') or result.get('generatedVideos')

        if not generated_videos:
            print("❌ No video was generated")
            print(f"   Result: {result}")
            return 1

        print("✅ Video generated successfully!")
        print()

        # Download and save video
        video = generated_videos[0]
        output_path = OUTPUT_DIR / OUTPUT_FILENAME

        print("📥 Downloading video...")

        # Try different ways to get the video data
        video_data = None

        # Method 1: video has a .video file reference
        if hasattr(video, 'video') and video.video:
            try:
                video_file = client.files.download(file=video.video)
                if isinstance(video_file, bytes):
                    video_data = video_file
                elif hasattr(video_file, 'read'):
                    video_data = video_file.read()
                elif hasattr(video_file, 'data'):
                    video_data = video_file.data
            except Exception as e:
                print(f"⚠️  Download method 1 failed: {e}")

        # Method 2: video has URI
        if not video_data and hasattr(video, 'uri') and video.uri:
            try:
                import urllib.request
                with urllib.request.urlopen(video.uri) as response:
                    video_data = response.read()
            except Exception as e:
                print(f"⚠️  Download method 2 failed: {e}")

        # Method 3: video has inline data
        if not video_data and hasattr(video, 'data'):
            if isinstance(video.data, bytes):
                video_data = video.data
            elif isinstance(video.data, str):
                video_data = base64.b64decode(video.data)

        # Method 4: video is a dict with video_uri or data
        if not video_data and isinstance(video, dict):
            if 'video_uri' in video:
                try:
                    import urllib.request
                    with urllib.request.urlopen(video['video_uri']) as response:
                        video_data = response.read()
                except Exception as e:
                    print(f"⚠️  Download method 4a failed: {e}")
            elif 'data' in video:
                video_data = base64.b64decode(video['data']) if isinstance(video['data'], str) else video['data']

        if not video_data:
            print("❌ Could not extract video data")
            print(f"   Video object type: {type(video)}")
            print(f"   Video attributes: {dir(video) if hasattr(video, '__dir__') else video}")
            return 1

        # Save video
        with open(output_path, 'wb') as f:
            f.write(video_data)

        file_size = output_path.stat().st_size / (1024 * 1024)
        print(f"✅ Video saved to: {output_path}")
        print(f"   Size: {file_size:.2f} MB")
        print()

        print("🎉 Demo video generation complete!")
        print(f"\nThe video is ready at: {output_path}")
        print("You can now view it on the Orient website.")
        return 0

    except Exception as e:
        print()
        print(f"❌ Error during video generation: {e}")

        error_msg = str(e).lower()
        if 'not found' in error_msg or '404' in error_msg:
            print()
            print("💡 The Veo API may not be available for your account.")
            print("   Veo requires specific API access. See:")
            print("   https://cloud.google.com/vertex-ai/generative-ai/docs/video/generate-videos")

        if 'quota' in error_msg or 'rate' in error_msg:
            print()
            print("💡 API quota exceeded. Try again later.")

        import traceback
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    exit(main())
