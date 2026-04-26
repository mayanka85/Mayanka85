import { GoogleGenAI, Type, ThinkingLevel } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

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
  const response = await ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: `You are a Senior Prudential Regulatory Analyst. 
    Retrieve and compare regulatory text for the filter: "${filter}".
    
    CRITICAL SEARCH LOGIC:
    - If the user provides an EBA Q&A ID (e.g., "2017_3424" or "2021_6123"), you MUST find the specific Q&A content for that ID.
    - Identify the CRR Article that this Q&A interprets (e.g., Article 178 for 2017_3424).
    - Provide the full comparison for that CRR Article vs PS01/2026.
    - Ensure the "ebaQas" array contains the specific Q&A the user asked for as the first item.
    
    Follow these steps:
    1. Retrieve the FULL verbatim CRR (EU 575/2013) consolidated text for the matched section. Do not truncate.
    2. Retrieve the FULL verbatim PS01/2026 PRA Basel 3.1 implementation text for the same section. Do not truncate.
    3. Provide the direct URLs to the specific articles/chapters on legislation.gov.uk and bankofengland.co.uk.
    4. Perform an EXHAUSTIVE search of the EBA Q&A database. You MUST provide ALL relevant Q&As (IDs, Questions, and Answers) that apply to this specific article or topic. Do not limit to one.
    5. Produce a detailed structured comparison table focusing on technical deltas.
    6. Provide "Regulatory Guidance & Technical Interpretations" (professional notes) that synthesize official guidance and practitioner considerations.
    7. Generate a "Professional Executive Briefing" for senior stakeholders (Strategic Impact, Capital Impact, Operational Complexity, Business Implications).
    
    Return the result in JSON format.`,
    config: {
      thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
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

  if (!response.text) {
    throw new Error("The model did not provide a response text.");
  }

  // Sanitize the response text in case the model included markdown blocks
  const sanitizedText = response.text.replace(/```json\n?/, '').replace(/```\n?/, '').trim();
  
  try {
    return JSON.parse(sanitizedText);
  } catch (err) {
    console.error("JSON Parse Error:", err);
    console.error("Original Text:", response.text);
    console.error("Sanitized Text:", sanitizedText);
    throw new Error(`Failed to parse regulatory data: ${err instanceof Error ? err.message : 'Unknown error'}`);
  }
}

export async function analyzeRegulatoryQuery(query: string, context?: string): Promise<string> {
  const response = await (ai.models as any).generateContent({
    model: "gemini-3-flash-preview",
    contents: `Analyze the following regulatory query: "${query}"
    ${context ? `Context: ${context}` : ''}
    
    Provide a concise, expert analysis focusing on capital impact and implementation challenges.`,
    tools: [{ googleSearch: {} }]
  });
  
  return response.text;
}
