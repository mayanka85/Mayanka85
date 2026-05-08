# Regulatory Intelligence Engine: FastAPI + React

This project has been upgraded to a production-ready architecture using **Python (FastAPI)** for the regulatory engine and **React (Vite)** for the frontend.

## Architecture

1.  **Frontend**: React SPA with Tailwind CSS and Framer Motion.
2.  **Backend**: FastAPI (Python 3.9+) serving the Regulatory Intel Engine.
3.  **AI Layer**: Google Gemini 1.5 Pro (via `google-generativeai` Python SDK).

## Why this change?
- **Security**: Move AI logic and API keys to the backend.
- **Precision**: Professional Pydantic schemas ensure verbatim CRR/PRA text retrieval without truncation.
- **Scalability**: Python is the industry standard for risk and regulatory modeling.

## How to run (Local Development)

### 1. Start the FastAPI Backend
```bash
# Install dependencies
pip install -r requirements.txt

# Run the server
python main.py
```
The server will start on `http://localhost:3000`.

### 2. Configure the Frontend
In `src/services/gemini.ts`, set `USE_PYTHON_BACKEND = true`.

### 3. Start the Frontend
```bash
npm run dev
```

## Regulatory Logic
The engine is specifically tuned for:
- **CRR (EU 575/2013)** consolidated retrieval.
- **PRA PS01/2026 (UK Basel 3.1)** technical matching.
- **EBA Q&A** cross-referencing.
