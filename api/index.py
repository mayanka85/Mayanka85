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
        # Use the highly available stable alias
        model = genai.GenerativeModel('gemini-1.5-flash') 
        
        prompt = f"""
        You are a Senior Regulatory Counsel specializing in CRR (EU) and PRA (UK) Prudential standards.
        
        INPUT QUERY: "{request.query}"
        
        REQUISITE ACTION:
        Perform a deep lookup of the relevant regulatory articles.
        
        1. CONSOLIDATED CRR TEXT:
           - Locate the article in Regulation (EU) No 575/2013.
           - Retrieve the COMPLETE, VERBATIM, and UNABRIDGED consolidated text. 
           - Do not truncate points (1), (2), (a), (b), etc. The user requires legal certainty.
        
        2. PRA PS01/2026 (UK BASEL 3.1) TEXT:
           - Identify the corresponding rule or paragraph in the PRA's implementation of Basel 3.1.
           - Provide the FULL verbatim text of the British implementation.
        
        3. TECHNICAL DELTA:
           - Compare the two texts side-by-side in a 'comparisonTable'.
           - Highlight additions, deletions, or 'DIVERGENCE' where UK and EU paths separate.
        
        4. BUSINESS IMPACT:
           - In 'executiveBriefing', score the Strategic Impact (LOW-CRITICAL) and Capital Impact.
           - Provide practitioner notes explaining common implementation pitfalls.
        
        FORMAT: Return strictly JSON following the specified schema properties.
        """
        
        config = genai.types.GenerationConfig(
            response_mime_type="application/json",
            temperature=0.1
        )
        
        response = retry_generate(model, prompt, config=config)
        
        if not response or not response.text:
            raise HTTPException(status_code=500, detail="The AI engine failed to return regulatory text.")
            
        data = json.loads(response.text)
        
        # Validation and default assignment
        required_keys = ["crrText", "psText", "crrUrl", "psUrl", "ebaQas", "comparisonTable", "summary", "practitionerNotes", "executiveBriefing"]
        for key in required_keys:
            if key not in data:
                if key in ["ebaQas", "comparisonTable", "summary", "practitionerNotes"]:
                    data[key] = []
                elif key == "executiveBriefing":
                    data[key] = {"strategicImpact": "MEDIUM", "capitalImpact": "NEUTRAL", "operationalComplexity": "MEDIUM", "keyTakeaways": [], "businessImplications": ""}
                else:
                    data[key] = ""
        
        return data
        
    except Exception as e:
        error_msg = str(e)
        print(f"Regulatory Engine Error: {error_msg}")
        raise HTTPException(status_code=500, detail=f"Regulatory Engine Error: {error_msg}")

@app.post("/api/analyze")
async def analyze_query(request: QueryRequest):
    try:
        model = genai.GenerativeModel('gemini-1.5-flash')
        
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
