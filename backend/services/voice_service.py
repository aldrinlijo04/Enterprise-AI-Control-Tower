import os
import httpx
from fastapi import HTTPException

ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY", "")
ELEVENLABS_AGENT_ID = os.getenv("ELEVENLABS_AGENT_ID", "")

async def get_signed_url() -> dict:
    if not ELEVENLABS_API_KEY:
        raise HTTPException(400, "Missing ELEVENLABS_API_KEY")
    if not ELEVENLABS_AGENT_ID:
        raise HTTPException(400, "Missing ELEVENLABS_AGENT_ID")

    api_url = "https://api.elevenlabs.io/v1/convai/conversation/get_signed_url"
    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.get(
            api_url,
            params={"agent_id": ELEVENLABS_AGENT_ID},
            headers={"xi-api-key": ELEVENLABS_API_KEY}
        )
    response.raise_for_status()
    payload = response.json()
    signed_url = payload.get("signed_url")
    if not signed_url:
        raise HTTPException(502, "No signed_url in ElevenLabs response")
    return {"signed_url": signed_url}

def get_voice_config() -> dict:
    return {
        "agent_id": ELEVENLABS_AGENT_ID,
        "has_api_key": bool(ELEVENLABS_API_KEY),
    }