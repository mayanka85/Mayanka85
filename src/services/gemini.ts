import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";

// Standard official SDK initialization
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
const ai = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

export interface RegulatoryComparison {
  crrText: string;
  psText: string;
  crrUrl: string;
  psUrl: string;
  ebaQas: { id: string; question: string; answer: string }[];
  comparisonTable: ComparisonRow[];
  summary: string[];
  practitionerNotes: string[];
  executiveBriefing: ExecutiveBriefing;
}

export interface ExecutiveBriefing {
  strategicImpact: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  capitalImpact: 'NEUTRAL' | 'INCREASE' | 'DECREASE';
  operationalComplexity: 'LOW' | 'MEDIUM' | 'HIGH';
  keyTakeaways: string[];
  businessImplications: string;
}

export interface ComparisonRow {
  dimension: string;
  crrValue: string;
  psValue: string;
  changeType: 'NO CHANGE' | 'MODIFIED' | 'DELETED' | 'NEW' | 'DIVERGENCE' | 'TRANSITIONAL';
}

const USE_PYTHON_BACKEND = true;

async function retryWithBackoff<T>(fn: () => Promise<T>, retries = 3, delay = 1000, fallbackModel?: string): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    const errorMsg = error?.message || String(error);
    const isBusy = errorMsg.includes('503') || errorMsg.includes('UNAVAILABLE') || errorMsg.includes('high demand');
    
    if (isBusy && retries > 0) {
      console.warn(`Regulatory Engine is busy, retrying in ${delay}ms... (${retries} attempts left)`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return retryWithBackoff(fn, retries - 1, delay * 2, fallbackModel);
    }
    throw error;
  }
}

function sanitizeRegulatoryData(data: any): RegulatoryComparison {
  const ensureArray = (val: any) => {
    if (Array.isArray(val)) return val;
    if (typeof val === 'string') return [val];
    if (val && typeof val === 'object') return Object.values(val);
    return [];
  };

  const processed = { ...data };
  processed.summary = ensureArray(processed.summary);
  processed.practitionerNotes = ensureArray(processed.practitionerNotes);
  processed.ebaQas = Array.isArray(processed.ebaQas) ? processed.ebaQas : [];
  processed.comparisonTable = Array.isArray(processed.comparisonTable) ? processed.comparisonTable : [];
  
  if (processed.executiveBriefing && typeof processed.executiveBriefing === 'object') {
    processed.executiveBriefing = { ...processed.executiveBriefing };
    processed.executiveBriefing.keyTakeaways = ensureArray(processed.executiveBriefing.keyTakeaways);
  } else {
    processed.executiveBriefing = {
      strategicImpact: 'MEDIUM',
      capitalImpact: 'NEUTRAL',
      operationalComplexity: 'MEDIUM',
      keyTakeaways: [],
      businessImplications: typeof processed.executiveBriefing === 'string' ? processed.executiveBriefing : 'N/A'
    };
  }

  return processed as RegulatoryComparison;
}

export async function lookupRegulatorySection(filter: string): Promise<RegulatoryComparison> {
  if (USE_PYTHON_BACKEND) {
    try {
      const resp = await fetch("/api/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: filter }),
      });
      if (resp.ok) {
        const rawData = await resp.json();
        return sanitizeRegulatoryData(rawData);
      }
    } catch (e) {
      console.warn("Backend fallback active");
    }
  }

  return retryWithBackoff(async () => {
    const prompt = `You are a Senior Prudential Regulatory Analyst. Access your internal knowledge of CRR (Regulation (EU) No 575/2013) and the PRA Basel 3.1 PS01/2026.
      
      TASK: Retrieve and compare the regulatory text for: "${filter}".
      
      OUTPUT REQUIREMENTS:
      1. CRR TEXT: Provide the FULL, VERBATIM, and COMPLETELY UNTRUNCATED text of the CRR Article. 
      2. PS01/2026 TEXT: Provide the FULL, VERBATIM text of the correspoding PRA rule.
      3. ANALYSIS: Professional comparison table, summary, and executive briefing.
      
      Return EXACTLY a JSON object with the properties: crrText, psText, crrUrl, psUrl, ebaQas, comparisonTable, summary, practitionerNotes, executiveBriefing.`;

    const result = await ai.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.1,
      },
    });

    const text = result.response.text();
    if (!text) {
      throw new Error("Empty response from AI Engine.");
    }

    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      // Cleanup common markdown formatting if present
      const cleaned = text.replace(/```json\n?|\n?```/g, '').trim();
      data = JSON.parse(cleaned);
    }

    return sanitizeRegulatoryData(data);
  });
}

export async function analyzeRegulatoryQuery(query: string, context?: string): Promise<string> {
  if (USE_PYTHON_BACKEND) {
    try {
      const resp = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, context }),
      });
      if (resp.ok) {
        const data = await resp.json();
        return data.analysis;
      }
    } catch (e) {
      console.warn("Analysis fallback active");
    }
  }

  return retryWithBackoff(async () => {
    const prompt = `You are a Regulatory Assistant. Analyze: "${query}"
      ${context ? `Context of current regulatory search: ${context}` : ''}
      
      Provide a concise, expert analysis focusing on capital impact and implementation challenges.`;

    const result = await ai.generateContent(prompt);
    
    return result.response.text() || "Analysis currently unavailable.";
  });
}
