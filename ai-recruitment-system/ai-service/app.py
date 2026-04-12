"""
Entry point for HuggingFace Spaces deployment.
HuggingFace Spaces with SDK=docker or SDK=gradio will look for app.py.
We just re-export the FastAPI app from main.py.
"""
from main import app  # noqa: F401 — HF Spaces picks this up automatically
