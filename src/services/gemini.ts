import { GoogleGenAI, Type } from "@google/genai";

// Ensure process.env.GEMINI_API_KEY is available during the build (handled by Vite define)
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

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

export async function lookupRegulatorySection(filter: string): Promise<RegulatoryComparison> {
  if (USE_PYTHON_BACKEND) {
    try {
      const resp = await fetch("/api/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: filter }),
      });
      if (resp.ok) return await resp.json();
    } catch (e) {
      console.warn("Backend fallback active");
    }
  }

  return retryWithBackoff(async () => {
    const response = await ai.models.generateContent({
      model: "gemini-1.5-flash", // Use Flash for high availability
      contents: `You are a Senior Prudential Regulatory Analyst with access to complete consolidated versions of the CRR (Regulation (EU) No 575/2013) and the PRA Basel 3.1 PS01/2026 implementing standards.
      
      TASK: Retrieve and compare the regulatory text for: "${filter}".
      
      CRITICAL SEARCH & RETRIEVAL LOGIC:
      1. CRR TEXT RETRIEVAL:
         - Identify the EXACT CRR Article(s) requested or related to the filter.
         - You MUST provide the FULL, VERBATIM, and COMPLETELY UNTRUNCATED text for every paragraph and sub-paragraph. 
         - If the input is "Article 178", provide ALL sections from (1) to (6) and all sub-points.
         - If the input is "Article 115", provide ALL paragraphs from (1) to (5).
         - NEVER summarize or use "..." to truncate the text. 
      
      2. PS01/2026 TEXT RETRIEVAL:
         - Find the corresponding technical standard or rule in PS01/2026 (UK Basel 3.1 implementation).
         - Provide the FULL, VERBATIM text of the PRA implementation for that specific section.
      
      3. COMPARISON & ANALYSIS:
         - Match the texts precisely.
         - Create a detailed technical delta table.
         - Provide practitioner notes and a strategic executive briefing.
      
      Return the result in JSON format following the provided schema. Priority is given to completeness of crrText and psText.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            crrText: { type: Type.STRING, description: "The FULL AND VERBATIM consolidated legal text of the CRR article. DO NOT TRUNCATE." },
            psText: { type: Type.STRING, description: "The FULL AND VERBATIM legal text of the PS01/2026 implementation. DO NOT TRUNCATE." },
            crrUrl: { type: Type.STRING },
            psUrl: { type: Type.STRING },
            ebaQas: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  question: { type: Type.STRING },
                  answer: { type: Type.STRING }
                },
                required: ["id", "question", "answer"]
              }
            },
            comparisonTable: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  dimension: { type: Type.STRING },
                  crrValue: { type: Type.STRING },
                  psValue: { type: Type.STRING },
                  changeType: { type: Type.STRING }
                },
                required: ["dimension", "crrValue", "psValue", "changeType"]
              }
            },
            summary: { type: Type.ARRAY, items: { type: Type.STRING } },
            practitionerNotes: { type: Type.ARRAY, items: { type: Type.STRING } },
            executiveBriefing: {
              type: Type.OBJECT,
              properties: {
                strategicImpact: { type: Type.STRING, enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"] },
                capitalImpact: { type: Type.STRING, enum: ["NEUTRAL", "INCREASE", "DECREASE"] },
                operationalComplexity: { type: Type.STRING, enum: ["LOW", "MEDIUM", "HIGH"] },
                keyTakeaways: { type: Type.ARRAY, items: { type: Type.STRING } },
                businessImplications: { type: Type.STRING }
              },
              required: ["strategicImpact", "capitalImpact", "operationalComplexity", "keyTakeaways", "businessImplications"]
            }
          },
          required: ["crrText", "psText", "crrUrl", "psUrl", "ebaQas", "comparisonTable", "summary", "practitionerNotes", "executiveBriefing"]
        }
      }
    });

    if (!response || !response.text) {
      throw new Error("Empty response from AI Engine.");
    }

    return JSON.parse(response.text);
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
    const response = await ai.models.generateContent({
      model: "gemini-1.5-flash", // Standard alias
      contents: `You are a Regulatory Assistant. Analyze: "${query}"
      ${context ? `Context of current regulatory search: ${context}` : ''}
      
      Provide a concise, expert analysis focusing on capital impact and implementation challenges.`,
      config: {
        tools: [{ googleSearch: {} }] as any
      }
    });
    
    return response.text || "Analysis currently unavailable.";
  });
}
