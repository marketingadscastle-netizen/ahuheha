import { GoogleGenAI, Type, HarmCategory, HarmBlockThreshold } from "@google/genai";
import { SceneAnalysis } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const SAFETY_SETTINGS = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
];

const parseJSONSafely = (text: string) => {
  let cleaned = text.trim();

  // 1. Remove Markdown formatting (```json ... ```)
  cleaned = cleaned.replace(/```(?:json)?/gi, "").replace(/```/g, "");

  // 2. Remove comments (often hallucinated by LLMs in JSON mode)
  cleaned = cleaned.replace(/\/\/.*$/gm, ""); // Single-line comments
  cleaned = cleaned.replace(/\/\*[\s\S]*?\*\//g, ""); // Multi-line comments

  // 3. Locate the outer JSON object
  const startIdx = cleaned.indexOf('{');
  const endIdx = cleaned.lastIndexOf('}');

  if (startIdx !== -1 && endIdx !== -1) {
    cleaned = cleaned.slice(startIdx, endIdx + 1);
  }

  // 4. Fix common JSON syntax errors from LLMs

  // Fix missing commas between string elements (e.g. "a" "b" -> "a", "b")
  cleaned = cleaned.replace(/"\s+(?=")/g, '", ');
  
  // Fix missing commas between object elements (e.g. {...} {...} -> {...}, {...})
  cleaned = cleaned.replace(/}\s+(?={)/g, '}, ');

  // Fix missing commas after numbers (e.g. 123 "key" -> 123, "key")
  cleaned = cleaned.replace(/(\d)\s+(?=")/g, '$1, ');

  // Fix missing commas after boolean/null (e.g. true "key" -> true, "key")
  cleaned = cleaned.replace(/(true|false|null)\s+(?=")/g, '$1, ');

  // Remove trailing commas (e.g. ["a", "b",] -> ["a", "b"])
  cleaned = cleaned.replace(/,\s*([\]}])/g, '$1');

  try {
    return JSON.parse(cleaned);
  } catch (e) {
    console.error("JSON Parse Error:", e);
    // Log a smaller snippet to avoid spamming console with huge base64 dumps if any
    console.log("Failed Text Snippet Start:", cleaned.substring(0, 500));
    console.log("Failed Text Snippet End:", cleaned.substring(Math.max(0, cleaned.length - 500)));
    // Return empty object so the app handles it gracefully via defaults
    return {};
  }
};

export const analyzeSceneFrame = async (base64Image: string): Promise<SceneAnalysis> => {
  const cleanBase64 = base64Image.replace(/^data:image\/(png|jpeg|jpg);base64,/, "");

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: "image/jpeg",
              data: cleanBase64,
            },
          },
          {
            text: `Analyze this video frame with ABSOLUTE PHOTOREALISTIC PRECISION. 
            
            Your task is to reverse-engineer the image into a prompt so detailed that a generative model could recreate this exact frame 1:1 without seeing the original.

            CRITICAL RULES FOR 'imagePrompt':
            1. OBJECTIVE REALITY: Describe ONLY what is strictly visible. Do not interpret emotional meaning unless it is physically visible in facial expressions.
            2. TECHNICAL CINEMATOGRAPHY: You MUST specify the estimated focal length (e.g., 35mm, 85mm), aperture (e.g., f/1.8), lighting type (e.g., Rembrandt, Chiaroscuro, harsh sunlight), and film grain/noise profile.
            3. SURFACE TEXTURE: Describe specific materials (e.g., "brushed aluminum with fingerprints," "distressed denim with white stitching," "porous concrete with moss").
            4. LIGHTING PHYSICS: Describe exactly where the light hits, the falloff, the shadow hardness, and any volumetric fog or atmospheric haze.
            5. COLOR GRADING: Describe the color palette using precise terms (e.g., "teal and orange contrast," "desaturated bleach bypass look," "neon cyberpunk aesthetic").

            CRITICAL RULES FOR 'videoPrompt':
            1. Describe the CAMERA MOVEMENT implied by motion blur or perspective (e.g., "slow dolly in," "handheld shaker," "static tripod").
            2. Describe SUBJECT MOVEMENT physics (e.g., "cloth flapping in wind," "rapid eye movement," "particles floating upward").
            
            Match this exact JSON structure:
            {
              "imagePrompt": "A raw, photorealistic shot of [subject] in [environment]. Shot on [camera/lens]. Lighting is [specific setup]. Textures include [details]. [Color grading info].",
              "videoPrompt": "The camera [specific move]. The subject [specific action]. Physics: [specific interaction].",
              "keywords": ["tag1", "tag2"],
              "mood": "string",
              "visualStyle": "string",
              "objects": [{"color": "string", "label": "string"}],
              "subjects": [{"name": "string", "description": "string", "action": "string"}],
              "originalCard": {"title": "string", "shotType": "string", "cameraAngle": "string", "lighting": "string"}
            }

            For 'originalCard', use standard film industry terminology.`
          }
        ],
      },
      config: {
        systemInstruction: "You are an elite Computer Vision Specialist and Cinematographer. Your output must be a factual, dense, and technically accurate reconstruction of the input. Avoid flowery language; prefer technical descriptions.",
        responseMimeType: "application/json",
        safetySettings: SAFETY_SETTINGS,
        maxOutputTokens: 8192,
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            imagePrompt: { type: Type.STRING },
            videoPrompt: { type: Type.STRING },
            keywords: { type: Type.ARRAY, items: { type: Type.STRING } },
            mood: { type: Type.STRING },
            visualStyle: { type: Type.STRING },
            objects: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  color: { type: Type.STRING },
                  label: { type: Type.STRING },
                },
              },
            },
            subjects: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  description: { type: Type.STRING },
                  action: { type: Type.STRING },
                },
              },
            },
            originalCard: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                shotType: { type: Type.STRING },
                cameraAngle: { type: Type.STRING },
                lighting: { type: Type.STRING },
              },
            },
          },
          required: ["imagePrompt", "videoPrompt", "keywords", "mood", "visualStyle", "objects", "subjects", "originalCard"],
        },
      },
    });

    const parsed = parseJSONSafely(response.text || "{}");

    return {
      imagePrompt: parsed.imagePrompt || "",
      videoPrompt: parsed.videoPrompt || "",
      keywords: Array.isArray(parsed.keywords) ? parsed.keywords : [],
      mood: parsed.mood || "Unknown",
      visualStyle: parsed.visualStyle || "Unknown",
      objects: Array.isArray(parsed.objects) ? parsed.objects : [],
      subjects: Array.isArray(parsed.subjects) ? parsed.subjects : [],
      originalCard: parsed.originalCard || { title: "", shotType: "", cameraAngle: "", lighting: "" },
    };

  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    throw error;
  }
};

export const generateTimelapsePrompt = async (sceneImages: string[]): Promise<string> => {
  // sceneImages is an array of base64 strings representing the flow from Start Frame to End Frame
  
  const contents = [];
  
  contents.push({ text: "Analyze this sequence of video frames. They are provided in chronological order. Treat this as a strict timeline to generate a MORPHING/TIMELAPSE prompt." });

  sceneImages.forEach((img, idx) => {
    const cleanData = img.replace(/^data:image\/(png|jpeg|jpg);base64,/, "");
    // Avoid division by zero if only 1 image
    const percentage = sceneImages.length > 1 ? Math.round((idx / (sceneImages.length - 1)) * 100) : 0;
    contents.push({ text: `Frame ${idx + 1} (${percentage}% timeline):` });
    contents.push({ inlineData: { mimeType: "image/jpeg", data: cleanData } });
  });

  contents.push({ text: "Generate a single, precise 'Timelapse Prompt'. \n\nREQUIREMENTS:\n1. Describe the EXACT evolution of the scene.\n2. Mention specifically which objects move, how the light shifts, and how the atmosphere changes from start to end.\n3. Include technical instructions for the transition (e.g., 'smooth interpolation', 'fast-forward motion').\n4. The output must allow a video model to bridge the gap between the first frame and last frame seamlessly while maintaining the exact visual identity of the scene." });

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: { parts: contents },
      config: { 
        safetySettings: SAFETY_SETTINGS,
        maxOutputTokens: 2048,
        temperature: 0.4, // Lower temperature for more precision/consistency
        systemInstruction: "You are a Timelapse Specialist. You analyze frame deltas and describe the physical transformation over time with high precision."
      }
    });
    return response.text || "Failed to generate timelapse prompt.";
  } catch (error) {
    console.error("Timelapse Gen Error", error);
    throw error;
  }
};
