# Voiceover with ElevenLabs

Complete implementation guide for adding AI-generated voiceovers to videos using ElevenLabs TTS and FFmpeg audio mixing.

## Table of Contents

1. [Setup](#setup)
2. [Generating Voiceover Audio](#generating-voiceover-audio)

3. [Voice Selection](#voice-selection)
4. [Mixing Audio into Video](#mixing-audio-into-video)

5. [Timed Voiceover Segments](#timed-voiceover-segments)
6. [Complete Pipeline Example](#complete-pipeline-example)

---

## Setup

### 1. Generate Speech Without a Connection

In a conversation, voiceover generation does not use the user's ElevenLabs connection: do not propose the connector and never fetch its credentials. Generate speech through the `external-apis` skill's ElevenLabs route when it is available; if that route is not available, tell the user voiceover generation needs a project (`transitionToProject`).

The sections below do not apply in a conversation -- they implement the connector-credential TTS flow that only exists in a project. Audio mixing with FFmpeg still works on any audio file you already have.

