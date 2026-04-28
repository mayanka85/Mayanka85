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
      model: "gemini-3-flash-preview",
      contents: `You are a Senior Prudential Regulatory Analyst. 
      Analyze and compare the regulatory landscape for: "${filter}".
      
      CRITICAL SEARCH LOGIC:
      - If the user provides an EBA Q&A ID (e.g., "2017_3424"), find that specific Q&A and its associated CRR Article.
      - Match the CRR (EU 575/2013) consolidated text against the PRA PS01/2026 (UK Basel 3.1) implementation.
      
      Professional Requirements:
      1. Verbatim CRR text (focused on the specific section).
      2. Verbatim PS01/2026 PRA text for the technical delta.
      3. Direct source URLs (legislation.gov.uk and bankofengland.co.uk).
      4. Retrieve relevant EBA Q&As interpreting this article.
      5. Detailed comparison table of technical changes.
      6. Regulatory synthesis (Practitioner Notes).
      7. Professional Executive Briefing (Strategic Impact, Capital Implications, Operational Complexity).
      
      Return the result in JSON format following the schema.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            crrText: { type: Type.STRING },
            psText: { type: Type.STRING },
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
                strategicImpact: { type: Type.STRING },
                capitalImpact: { type: Type.STRING },
                operationalComplexity: { type: Type.STRING },
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

    const text = response.text;
    if (!text) {
      throw new Error("The model did not provide a response text.");
    }

    return JSON.parse(text);
  } catch (err) {
    console.error("Regulatory Search Error:", err);
    throw new Error(`Regulatory Intelligence Error: ${err instanceof Error ? err.message : 'Unknown network error'}`);
  }
}

export async function analyzeRegulatoryQuery(query: string, context?: string): Promise<string> {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Analyze the following regulatory query: "${query}"
      ${context ? `Context: ${context}` : ''}
      
      Provide a concise, expert analysis focusing on capital impact and implementation challenges.`,
      config: {
        tools: [{ googleSearch: {} }] as any
      }
    });
    
    return response.text || "Failed to generate analysis.";
  } catch (err) {
    console.error("Regulatory Analysis Error:", err);
    throw new Error("Failed to process regulatory query.");
  }
}
