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
            text: `Perform a FORENSIC OPTICAL ANALYSIS of this frame.
            
            GOAL: Generate an 'imagePrompt' that yields a PIXEL-PERFECT clone of this image when used in a generator.
            
            STRICT REQUIREMENTS:
            1. **GEOMETRY & SPATIAL MAPPING**: Describe the exact position of objects (e.g., "lower left quadrant," "centered in foreground").
            2. **MATERIAL PHYSICS**: Describe textures with tactile precision (e.g., "oxidized copper with verdigris," "matte plastic with oil smudges," "translucent skin with subsurface scattering").
            3. **LIGHTING TOPOLOGY**: Identify every light source, its temperature (Kelvin), direction, hardness, and how it interacts with surfaces (specular highlights, diffuse shadows).
            4. **OPTICAL CHARACTERISTICS**: Estimate focal length (mm), aperture (f-stop), depth of field blur, lens flares, and chromatic aberration.
            5. **COLORIMETRY**: Use specific color names or hex codes if possible. Describe grading (e.g., "high contrast bleach bypass," "teal-orange cinematic lut").

            For 'videoPrompt', describe the KINETIC ENERGY:
            - Camera motion vector (e.g., "dolly forward 50cm/s").
            - Object momentum and weight.
            - Atmospheric turbulence (wind, dust drift).
            
            OUTPUT JSON STRUCTURE:
            {
              "imagePrompt": "A hyper-realistic, forensic description of [subject] in [environment]. Shot on [camera/lens]. Lighting is [specific setup]. Textures include [details]. [Color grading info].",
              "videoPrompt": "Cinematic movement description...",
              "keywords": ["specific_material", "specific_lighting", "specific_camera"],
              "mood": "string",
              "visualStyle": "string",
              "objects": [{"color": "string", "label": "string"}],
              "subjects": [{"name": "string", "description": "string", "action": "string"}],
              "originalCard": {"title": "string", "shotType": "string", "cameraAngle": "string", "lighting": "string"}
            }`
          }
        ],
      },
      config: {
        systemInstruction: "You are a specialized Computer Vision AI focused on photorealistic reconstruction. You do not hallucinate. You describe exactly what pixels are present.",
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
  const contents = [];
  
  contents.push({ text: "TIMELINE ANALYSIS: You are analyzing a chronological sequence of frames. Your output must describe the visual METAMORPHOSIS with scientific precision." });

  sceneImages.forEach((img, idx) => {
    const cleanData = img.replace(/^data:image\/(png|jpeg|jpg);base64,/, "");
    const percentage = sceneImages.length > 1 ? Math.round((idx / (sceneImages.length - 1)) * 100) : 0;
    contents.push({ text: `T=${percentage}%:` });
    contents.push({ inlineData: { mimeType: "image/jpeg", data: cleanData } });
  });

  contents.push({ text: "Generate a 'Morphing Prompt' that describes the flow from the first frame to the last.\n\nREQUIREMENTS:\n1. Describe the EXACT trajectory of moving objects.\n2. Describe the continuous change in lighting intensity and color.\n3. Describe any camera movement (e.g., 'The camera pushes in while panning left').\n4. The prompt must serve as a functional instruction set for a video interpolation model to reconstruct the missing frames perfectly." });

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: { parts: contents },
      config: { 
        safetySettings: SAFETY_SETTINGS,
        maxOutputTokens: 2048,
        temperature: 0.3, 
        systemInstruction: "You are a Temporal Reconstruction AI. You analyze frame deltas and output precise motion vectors and state changes."
      }
    });
    return response.text || "Failed to generate timelapse prompt.";
  } catch (error) {
    console.error("Timelapse Gen Error", error);
    throw error;
  }
};
