from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import os
import google.generativeai as genai
import json
from typing import List, Optional

app = FastAPI(title="Regulatory Intelligence API")

# Configure CORS for the React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize Gemini
api_key = os.getenv("GEMINI_API_KEY")
if not api_key:
    # Fallback for dev environments if needed, but ideally provided by platform
    api_key = ""

genai.configure(api_key=api_key)

# Schemas
class ComparisonRow(BaseModel):
    dimension: str
    crrValue: str
    psValue: str
    changeType: str

class EbaQa(BaseModel):
    id: str
    question: str
    answer: str

class ExecutiveBriefing(BaseModel):
    strategicImpact: str
    capitalImpact: str
    operationalComplexity: str
    keyTakeaways: List[str]
    businessImplications: str

class RegulatoryComparison(BaseModel):
    crrText: str
    psText: str
    crrUrl: str
    psUrl: str
    ebaQas: List[EbaQa]
    comparisonTable: List[ComparisonRow]
    summary: List[str]
    practitionerNotes: List[str]
    executiveBriefing: ExecutiveBriefing

class QueryRequest(BaseModel):
    query: str
    context: Optional[str] = None

@app.get("/api/health")
async def health():
    return {"status": "ok", "engine": "FastAPI Regulatory Expert"}

import time

def retry_generate(model, prompt, config=None, retries=3, delay=1):
    last_error = None
    for i in range(retries):
        try:
            if config:
                return model.generate_content(prompt, generation_config=config)
            return model.generate_content(prompt)
        except Exception as e:
            last_error = e
            err_str = str(e)
            # Retry on 503 (Unavailable), 429 (Rate Limit), or generic resource exhaustion
            is_retryable = any(msg in err_str for msg in ["503", "429", "RESOURCE_EXHAUSTED", "unavailable", "high demand"])
            if i < retries - 1 and is_retryable:
                time.sleep(delay * (2 ** i))
                continue
            break
    raise last_error

@app.post("/api/lookup", response_model=RegulatoryComparison)
async def lookup_regulatory_section(request: QueryRequest):
    try:
        # gemini-2.0-flash is the most stable and high-performance model for this task
        model = genai.GenerativeModel('gemini-1.5-pro') 
        
        prompt = f"""Analyze the regulatory article: "{request.query}"
        
        Return a formal JSON response with:
        crrText (Full verbatim), psText (Full verbatim), crrUrl, psUrl, 
        ebaQas (List of ID/Q/A), comparisonTable (List), summary (List), 
        practitionerNotes (List), executiveBriefing (Object).
        
        Do not truncate the legal texts."""
        
        config = genai.types.GenerationConfig(
            response_mime_type="application/json",
            temperature=0.1
        )
        
        response = retry_generate(model, prompt, config=config)
        
        if not response or not response.text:
            raise HTTPException(status_code=500, detail="AI Engine returned empty data.")
            
        try:
            data = json.loads(response.text)
        except Exception:
            # More aggressive cleaning
            text = response.text.strip()
            if "```json" in text:
                text = text.split("```json")[1].split("```")[0].strip()
            elif "```" in text:
                text = text.split("```")[1].split("```")[0].strip()
            data = json.loads(text)
        
        # Final normalization to handle ANY hallucinated structure
        def normalize_to_list(val):
            if isinstance(val, list): return val
            if isinstance(val, (str, dict, int, float)) and val: return [str(val)]
            return []

        data["summary"] = normalize_to_list(data.get("summary"))
        data["practitionerNotes"] = normalize_to_list(data.get("practitionerNotes"))
        data["ebaQas"] = data.get("ebaQas") if isinstance(data.get("ebaQas"), list) else []
        data["comparisonTable"] = data.get("comparisonTable") if isinstance(data.get("comparisonTable"), list) else []

        # Ensure executiveBriefing is always a valid dict
        eb = data.get("executiveBriefing")
        if not isinstance(eb, dict):
            # If AI sent briefing as a string, put it into businessImplications
            briefing_text = str(eb) if eb else "N/A"
            data["executiveBriefing"] = {
                "strategicImpact": "MEDIUM",
                "capitalImpact": "NEUTRAL",
                "operationalComplexity": "MEDIUM",
                "keyTakeaways": [],
                "businessImplications": briefing_text
            }
        else:
            eb["keyTakeaways"] = normalize_to_list(eb.get("keyTakeaways"))
            # Ensure other fields are strings
            for k in ["strategicImpact", "capitalImpact", "operationalComplexity", "businessImplications"]:
                if k not in eb: eb[k] = "N/A"
                else: eb[k] = str(eb[k])
                
        return data
        
    except Exception as e:
        print(f"Regulatory Engine Error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Regulatory Engine Error: {str(e)}")

@app.post("/api/analyze")
async def analyze_query(request: QueryRequest):
    try:
        model = genai.GenerativeModel('gemini-1.5-pro')
        
        context_str = f"Context: {request.context}" if request.context else ""
        prompt = f"""
        Analyze the following regulatory query: "{request.query}"
        {context_str}
        
        Provide a concise, expert analysis focusing on capital impact and implementation challenges. Use professional language.
        """
        
        response = retry_generate(model, prompt)
        return {"analysis": response.text or "Analysis unavailable."}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    # Use port 3000 as required by the platform proxy
    uvicorn.run(app, host="0.0.0.0", port=3000)
