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

export async function lookupRegulatorySection(filter: string): Promise<RegulatoryComparison> {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.1-pro-preview", // Use Pro for higher fidelity and following long verbatim instructions
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
      throw new Error("The AI model returned an empty response. This can happen if the requested article is extremely large or hit a safety filter. Please try a more specific article number.");
    }

    return JSON.parse(response.text);
  } catch (err) {
    console.error("Regulatory Search Error:", err);
    let errorMessage = "Unknown network error";
    if (err instanceof Error) {
      errorMessage = err.message;
    }
    throw new Error(`Regulatory Intelligence Error: ${errorMessage}`);
  }
}

export async function analyzeRegulatoryQuery(query: string, context?: string): Promise<string> {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-flash-latest", // Use Flash for quick interactive assistant
      contents: `You are a Regulatory Assistant. Analyze: "${query}"
      ${context ? `Context of current regulatory search: ${context}` : ''}
      
      Provide a concise, expert analysis focusing on capital impact and implementation challenges.`,
      config: {
        tools: [{ googleSearch: {} }] as any
      }
    });
    
    return response.text || "Analysis currently unavailable.";
  } catch (err) {
    console.error("Regulatory Analysis Error:", err);
    throw new Error("Assistant failed to process query.");
  }
}
