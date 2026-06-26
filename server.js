import express from "express";
import path from "path";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

// Helper to call any promise-returning function with exponential retry backoff on 503 or 429 errors
async function callWithRetry(fn, maxAttempts = 3, delayMs = 1500) {
  let attempt = 0;
  while (attempt < maxAttempts) {
    try {
      return await fn();
    } catch (error) {
      attempt++;
      const msg = error?.message || "";
      const status = error?.status;
      const isRateLimitOrBusy = 
        status === 503 || 
        status === 429 ||
        msg.includes("503") || 
        msg.includes("429") || 
        msg.includes("high demand") || 
        msg.includes("busy") || 
        msg.includes("UNAVAILABLE") || 
        msg.includes("Resource has been exhausted") ||
        msg.includes("overloaded");

      const isQuotaExceeded = 
        msg.toLowerCase().includes("quota") || 
        msg.toLowerCase().includes("exceeded") ||
        msg.toLowerCase().includes("exhausted");

      if (isRateLimitOrBusy && !isQuotaExceeded && attempt < maxAttempts) {
        console.warn(`[Gemini API Warning] Attempt ${attempt} failed with busy/rate-limit error. Retrying in ${delayMs}ms... Error: ${msg}`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
        delayMs *= 2; // exponential backoff
      } else {
        throw error;
      }
    }
  }
}

// Helper to provide friendly Indonesian errors for API rate-limits/capacity constraints
function getFriendlyErrorMessage(error) {
  const msg = error?.message || "";
  const status = error?.status;
  if (status === 503 || msg.includes("503") || msg.includes("temporary") || msg.includes("UNAVAILABLE") || msg.includes("high demand") || msg.includes("overloaded")) {
    return "Server AI Google sedang padat/sibuk saat ini (Error 503). Kami telah mencoba melakukan retry otomatis di sistem, namun server Google masih belum merespon. Silakan tunggu beberapa detik dan coba klik tombol lagi.";
  }
  if (status === 429 || msg.includes("429") || msg.includes("Resource has been exhausted") || msg.includes("rate limit") || msg.includes("quota")) {
    return "Batas panggilan API (Rate Limit / Quota) terlampaui (Error 429). Jika Anda menggunakan API Key versi gratis, batas pemanggilan per menit sangat ketat. Silakan coba beberapa saat lagi atau upgrade kunci API Anda di menu Settings.";
  }
  return msg || "Terjadi kegagalan komunikasi dengan model AI Gemini.";
}

// Helper to clean and parse JSON securely even with conversational wrapper text
function cleanAndParseJSON(text) {
  if (!text) return null;
  let cleanText = text.trim();
  
  // Remove markdown code blocks if any
  if (cleanText.includes("```")) {
    const match = cleanText.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (match && match[1]) {
      cleanText = match[1].trim();
    }
  }
  
  // If it still doesn't look like JSON (doesn't start with { or [), try to find the first { or [ and the last } or ]
  if (!cleanText.startsWith("{") && !cleanText.startsWith("[")) {
    const firstBrace = cleanText.indexOf("{");
    const firstBracket = cleanText.indexOf("[");
    const lastBrace = cleanText.lastIndexOf("}");
    const lastBracket = cleanText.lastIndexOf("]");
    
    let startIndex = -1;
    let endIndex = -1;
    
    if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
      startIndex = firstBrace;
      endIndex = lastBrace;
    } else if (firstBracket !== -1) {
      startIndex = firstBracket;
      endIndex = lastBracket;
    }
    
    if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
      cleanText = cleanText.substring(startIndex, endIndex + 1).trim();
    }
  }
  
  try {
    return JSON.parse(cleanText);
  } catch (err) {
    console.error("cleanAndParseJSON failed to parse:", err.message);
    return null;
  }
}

// Keyless public text generation model via Pollinations AI
async function generateContentWithPollinations(contents, config) {
  console.log(`[Pollinations AI] Generating text content (keyless fallback)...`);
  let userContentParts = [];
  let promptText = "";

  if (typeof contents === 'string') {
    userContentParts.push({ type: "text", text: contents });
    promptText = contents;
  } else if (Array.isArray(contents)) {
    contents.forEach(item => {
      if (typeof item === 'string') {
        userContentParts.push({ type: "text", text: item });
        promptText = (promptText ? promptText + "\n" : "") + item;
      } else if (item && typeof item === 'object') {
        if (item.text) {
          userContentParts.push({ type: "text", text: item.text });
          promptText = (promptText ? promptText + "\n" : "") + item.text;
        } else if (item.inlineData) {
          const mime = item.inlineData.mimeType || "image/jpeg";
          const data = item.inlineData.data;
          userContentParts.push({
            type: "image_url",
            image_url: {
              url: `data:${mime};base64,${data}`
            }
          });
        } else if (item.parts) {
          item.parts.forEach(p => {
            if (typeof p === 'string') {
              userContentParts.push({ type: "text", text: p });
              promptText = (promptText ? promptText + "\n" : "") + p;
            } else if (p && typeof p === 'object') {
              if (p.text) {
                userContentParts.push({ type: "text", text: p.text });
                promptText = (promptText ? promptText + "\n" : "") + p.text;
              } else if (p.inlineData) {
                const mime = p.inlineData.mimeType || "image/jpeg";
                const data = p.inlineData.data;
                userContentParts.push({
                  type: "image_url",
                  image_url: {
                    url: `data:${mime};base64,${data}`
                  }
                });
              }
            }
          });
        }
      }
    });
  } else if (contents && typeof contents === 'object') {
    if (contents.parts && Array.isArray(contents.parts)) {
      contents.parts.forEach(p => {
        if (p.text) {
          userContentParts.push({ type: "text", text: p.text });
          promptText = (promptText ? promptText + "\n" : "") + p.text;
        } else if (p.inlineData) {
          const mime = p.inlineData.mimeType || "image/jpeg";
          const data = p.inlineData.data;
          userContentParts.push({
            type: "image_url",
            image_url: {
              url: `data:${mime};base64,${data}`
            }
          });
        }
      });
    } else if (contents.inlineData) {
      const mime = contents.inlineData.mimeType || "image/jpeg";
      const data = contents.inlineData.data;
      userContentParts.push({
        type: "image_url",
        image_url: {
          url: `data:${mime};base64,${data}`
        }
      });
    } else {
      const strVal = JSON.stringify(contents);
      userContentParts.push({ type: "text", text: strVal });
      promptText = strVal;
    }
  }

  // Use plain text representation for Pollinations to avoid payload size limit issues with Base64 images
  const finalUserContent = promptText || "Please design based on context.";

  const systemPrompt = config?.systemInstruction || "You are a professional designer, brand expert, and creative assistant. Always speak in Indonesian or follow the prompt's language request.";
  const isJson = config?.responseMimeType === "application/json";

  try {
    const payload = {
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: finalUserContent }
      ],
      model: "openai",
      jsonMode: isJson
    };

    const response = await fetch("https://text.pollinations.ai/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Pollinations HTTP error: ${response.status} ${response.statusText}`);
    }

    let text = await response.text();
    if (isJson) {
      const parsed = cleanAndParseJSON(text);
      if (parsed) {
        text = JSON.stringify(parsed);
      }
    }
    return {
      text: text,
      candidates: [
        {
          content: {
            parts: [{ text: text }]
          }
        }
      ]
    };
  } catch (err) {
    console.warn("[Pollinations AI POST Failed]. Trying URL GET fallback...", err);
    try {
      let finalPrompt = promptText || "Please design based on context.";
      if (finalPrompt.length > 1000) {
        console.log(`[Pollinations AI] Truncating long text prompt from ${finalPrompt.length} to 1000 chars to prevent 414 URL too large.`);
        finalPrompt = finalPrompt.substring(0, 1000);
      }
      if (isJson) {
        finalPrompt += "\n\nCRITICAL: Return the response as a valid JSON object string.";
      }
      const url = `https://text.pollinations.ai/${encodeURIComponent(finalPrompt)}?system=${encodeURIComponent(systemPrompt)}&model=openai`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Pollinations GET HTTP error: ${response.status} ${response.statusText}`);
      }
      let text = await response.text();
      if (isJson) {
        const parsed = cleanAndParseJSON(text);
        if (parsed) {
          text = JSON.stringify(parsed);
        }
      }
      return {
        text: text,
        candidates: [
          {
            content: {
              parts: [{ text: text }]
            }
          }
        ]
      };
    } catch (fallbackErr) {
      console.error("[Pollinations AI GET Fallback also Failed]", fallbackErr);
      throw fallbackErr;
    }
  }
}

// Keyless public image generation model via Pollinations AI
async function generateImagesWithPollinations(prompt, config) {
  try {
    let cleanPrompt = prompt || "aesthetic product design";
    // Append negative modifiers to ensure the generated image is completely textless, clean, and without overlays
    cleanPrompt = `${cleanPrompt}, textless, no lettering, no typography, no words, no logos, clean, high quality`.trim();
    
    if (cleanPrompt.length > 1400) {
      cleanPrompt = cleanPrompt.substring(0, 1400);
    }
    console.log(`[Pollinations AI] Generating image. Prompt: ${cleanPrompt}`);
    const encodedPrompt = encodeURIComponent(cleanPrompt);
    let ratioParam = "";
    if (config?.aspectRatio) {
      const [wStr, hStr] = config.aspectRatio.split(":");
      if (wStr && hStr) {
        const w = parseInt(wStr);
        const h = parseInt(hStr);
        let width = 1024;
        let height = 1024;
        if (w > h) {
          width = 1024;
          height = Math.round(1024 * (h / w));
        } else if (h > w) {
          height = 1024;
          width = Math.round(1024 * (w / h));
        }
        ratioParam = `&width=${width}&height=${height}`;
      }
    }

    // Intelligent model selection based on prompt keywords to get the absolute best visual quality
    let model = "flux"; // default Flux model, excellent for text rendering, graphics, and layout
    const lowerPrompt = (prompt || "").toLowerCase();
    
    // Check for realism, photography, mockups, or physical booth/packaging designs
    if (
      lowerPrompt.includes("booth") || 
      lowerPrompt.includes("exhibition") || 
      lowerPrompt.includes("packaging") || 
      lowerPrompt.includes("mockup") || 
      lowerPrompt.includes("realistic product") || 
      lowerPrompt.includes("photorealistic") || 
      lowerPrompt.includes("photo-realistic") || 
      lowerPrompt.includes("studio lighting") || 
      lowerPrompt.includes("commercial photography") ||
      lowerPrompt.includes("realism") ||
      lowerPrompt.includes("highly detailed photograph") ||
      lowerPrompt.includes("photo of")
    ) {
      model = "flux-realism";
    } 
    // Check for 3D renderings, isometric, cgi, or game assets
    else if (
      lowerPrompt.includes("3d render") || 
      lowerPrompt.includes("3d model") || 
      lowerPrompt.includes("isometric") || 
      lowerPrompt.includes("plastic toy") || 
      lowerPrompt.includes("glass mockup") ||
      lowerPrompt.includes("cgi") ||
      lowerPrompt.includes("rendering of")
    ) {
      model = "flux-3d";
    } 
    // Check for anime, illustration, manga, cartoon, drawings
    else if (
      lowerPrompt.includes("anime") || 
      lowerPrompt.includes("cartoon") || 
      lowerPrompt.includes("manga") || 
      lowerPrompt.includes("illustration") || 
      lowerPrompt.includes("drawing") || 
      lowerPrompt.includes("sketch") ||
      lowerPrompt.includes("watercolor") ||
      lowerPrompt.includes("doodle")
    ) {
      model = "flux-anime";
    }
    // Check for scenic views, landscapes, or natural environments
    else if (
      lowerPrompt.includes("scenic") || 
      lowerPrompt.includes("landscape") || 
      lowerPrompt.includes("nature") || 
      lowerPrompt.includes("scenery") || 
      lowerPrompt.includes("background wall")
    ) {
      model = "flux-scenic";
    }

    const seed = Math.floor(Math.random() * 1000000000);
    const imageUrl = `https://image.pollinations.ai/p/${encodedPrompt}?seed=${seed}&nologo=true&enhance=true&model=${model}${ratioParam}`;
    
    console.log(`[Pollinations AI] Selected model: ${model}, URL: ${imageUrl}`);
    
    // Bypassing server-side fetch download blocks, timeouts, and memory spikes by returning the public URL directly!
    return {
      url: imageUrl,
      generatedImages: [
        {
          image: {
            imageBytes: null,
            url: imageUrl
          }
        }
      ]
    };
  } catch (err) {
    console.error("[Pollinations AI Image Failed]", err);
    throw err;
  }
}

const imageCache = new Map();
const cacheKeys = [];

function saveImageToCache(base64Data, mimeType = "image/jpeg") {
  if (!base64Data) return "";
  const id = "img_" + Math.random().toString(36).substring(2, 15);
  let buffer;
  if (Buffer.isBuffer(base64Data)) {
    buffer = base64Data;
  } else {
    const cleanData = base64Data.includes(",") ? base64Data.split(",")[1] : base64Data;
    buffer = Buffer.from(cleanData, 'base64');
  }
  imageCache.set(id, { buffer, mimeType });
  cacheKeys.push(id);
  
  if (cacheKeys.length > 50) {
    const oldestKey = cacheKeys.shift();
    imageCache.delete(oldestKey);
  }
  
  return `/api/view-image?id=${id}`;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Atur batas upload payload gambar b64 berukuran besar
  app.use(express.json({ limit: "25mb" }));
  app.use(express.urlencoded({ extended: true, limit: "25mb" }));

  app.get("/api/view-image", (req, res) => {
    const id = req.query.id;
    if (!id || !imageCache.has(id)) {
      return res.status(404).send("Gambar tidak ditemukan atau sudah kedaluwarsa.");
    }
    const { buffer, mimeType } = imageCache.get(id);
    res.setHeader("Content-Type", mimeType);
    res.send(buffer);
  });

  // Helper untuk membuat API Client Gemini yang tangguh dengan auto-retry dan fallback otomatis ke Pollinations AI
  function createAiClient(key) {
    if (!key) {
      return {
        models: {
          generateContent: async function(params) {
            return await generateContentWithPollinations(params?.contents || params, params?.config);
          },
          generateImages: async function(params) {
            return await generateImagesWithPollinations(params?.prompt, params?.config);
          }
        }
      };
    }

    const client = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });

    // Monkey patch generateContent dengan fungsi penanganan retry & fallback ke Pollinations
    const originalGenerateContent = client.models.generateContent.bind(client.models);
    client.models.generateContent = async function(params, ...extraArgs) {
      if (!params) params = {};
      const requestedModel = params.model;
      
      const candidates = [
        requestedModel,
        'gemini-2.5-flash',
        'gemini-2.0-flash',
        'gemini-1.5-flash',
        'gemini-1.5-flash-latest',
        'gemini-3.5-flash'
      ].filter(Boolean);
      
      const uniqueCandidates = Array.from(new Set(candidates));
      let lastError = null;
      
      for (const modelCandidate of uniqueCandidates) {
        try {
          params.model = modelCandidate;
          return await callWithRetry(() => originalGenerateContent(params, ...extraArgs));
        } catch (error) {
          console.warn(`[Gemini API Warning] Model ${modelCandidate} gagal (${error?.message || error}). Mencoba model alternatif...`);
          lastError = error;
        }
      }
      
      console.warn(`[Gemini API Warning] Semua model Gemini gagal. Mengalihkan secara otomatis ke model publik bebas kunci (Pollinations AI)...`);
      try {
        return await generateContentWithPollinations(params?.contents || params, params?.config);
      } catch (fallbackError) {
        console.error(`[Fallback Error] Pollinations AI juga gagal:`, fallbackError);
        if (lastError) {
          lastError.message = getFriendlyErrorMessage(lastError);
          throw lastError;
        }
        throw fallbackError;
      }
    };

    // Monkey patch generateImages dengan fungsi penanganan retry & fallback ke Pollinations
    const originalGenerateImages = client.models.generateImages.bind(client.models);
    client.models.generateImages = async function(params, ...extraArgs) {
      if (!params) params = {};
      const requestedModel = params.model;
      
      const candidates = [
        requestedModel,
        'imagen-3.0-generate-002',
        'imagen-3.0-capability-001'
      ].filter(Boolean);
      
      const uniqueCandidates = Array.from(new Set(candidates));
      let lastError = null;
      
      for (const modelCandidate of uniqueCandidates) {
        try {
          params.model = modelCandidate;
          return await callWithRetry(() => originalGenerateImages(params, ...extraArgs));
        } catch (error) {
          console.warn(`[Gemini API Warning] Imagen model ${modelCandidate} gagal (${error?.message || error}). Mencoba model alternatif...`);
          lastError = error;
        }
      }
      
      console.warn(`[Gemini API Warning] Semua model Imagen gagal. Mengalihkan secara otomatis ke model publik bebas kunci (Pollinations AI)...`);
      try {
        return await generateImagesWithPollinations(params?.prompt, params?.config);
      } catch (fallbackError) {
        console.error(`[Fallback Error] Pollinations AI juga gagal:`, fallbackError);
        if (lastError) {
          lastError.message = getFriendlyErrorMessage(lastError);
          throw lastError;
        }
        throw fallbackError;
      }
    };

    return client;
  }

  // Inisialisasi API Client AI Gemini
  const apiKey = process.env.GEMINI_API_KEY;
  let ai = createAiClient(apiKey);
  if (!apiKey) {
    console.log("[AI Client] Kunci API tidak terdeteksi di server. Menggunakan model publik bebas kunci (Pollinations AI) secara default.");
  }

  // Generic AI text & analysis processor endpoint with multi-modal capability
  app.post("/api/process-ai", async (req, res) => {
    try {
      const { systemPrompt, imageBase64, toolId, customPrompt } = req.body;
      if (!systemPrompt) {
        return res.status(400).json({ error: "System prompt required" });
      }

      const activeAi = ai;

      const contents = [];
      if (imageBase64) {
        contents.push({
          inlineData: {
            mimeType: "image/jpeg",
            data: imageBase64
          }
        });
      }
      contents.push({ text: systemPrompt });

      const response = await activeAi.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: contents
      });

      let textResponse = "";
      if (response && response.text) {
        textResponse = response.text;
      } else if (response && response.candidates && response.candidates[0]?.content?.parts[0]?.text) {
        textResponse = response.candidates[0].content.parts[0].text;
      } else if (typeof response === "string") {
        textResponse = response;
      } else {
        textResponse = "Gagal memproses respons dari AI.";
      }

      let generatedImageUrl = "";
      
      // Determine if this tool requires image generation
      const imageGenerationTools = [
        "campaign", "brandkit", "creatorlab", "packaging", "booth", "poster",
        "enhancer", "outfit", "resize", "frame", "banner", "carousel", "kolase"
      ];

      if (toolId && imageGenerationTools.includes(toolId)) {
        try {
          // 1. Generate descriptive prompt for Imagen 3 using Gemini 2.5 Flash
          let imagePromptSubject = "";
          switch (toolId) {
            case "campaign":
              imagePromptSubject = "Create an incredibly professional, modern digital marketing and social media advertisement banner featuring this product. The design should have vibrant lighting, clean layout, beautiful decorative shapes, and look like a high-end brand commercial with no text elements.";
              break;
            case "brandkit":
              imagePromptSubject = "Create a premium, modern, and minimalist brand identity mockup. It should showcase brand collateral like business cards and packaging, using professional color schemes and clean geometric shapes without any text.";
              break;
            case "creatorlab":
              imagePromptSubject = "A high-end designer portfolio cover or creative concept showcase, featuring elegant geometry, abstract modern aesthetics, and sophisticated 3D studio lighting.";
              break;
            case "packaging":
              imagePromptSubject = "A high-resolution 3D mockup of the product's packaging (such as a premium bottle, custom paper box, pouch, or canister). The packaging should feature the logo or visual from the reference image, rendered on a clean studio background with realistic lighting, shadows, and textures.";
              break;
            case "booth":
              imagePromptSubject = "A professional, realistic 3D retail exhibition booth, market stall, or promotional stand. The poster or logo from the reference image should be seamlessly integrated and displayed on the booth's walls or banners under professional exhibition lighting.";
              break;
            case "poster":
              imagePromptSubject = "A high-quality, professional marketing poster. The subject from the reference image should be the central hero element, blended into a beautifully designed graphic poster layout with modern composition, elegant background patterns, decorative abstract borders, and clean design accents, completely clean and textless.";
              break;
            case "enhancer":
              imagePromptSubject = "A hyper-realistic, highly-enhanced, professional studio photography version of this product. It should have perfect product lighting (soft box, rim light), elegant drop shadows, clean high-contrast neutral background, and extreme high-definition details.";
              break;
            case "outfit":
              imagePromptSubject = "A professional portrait photo where the person's outfit in the reference image is replaced with a custom, highly formal, elegant outfit (such as a professional dark suit, formal blazer, neat shirt, or fashion outfit). Keep the face, hair, and head posture identical to the original image.";
              break;
            case "resize":
              imagePromptSubject = "Extend the background and fill the outer areas of this image to fit a widescreen ratio perfectly (Generative Expand / Generative Fill). The extended areas must seamlessly match the original lighting, textures, and background elements, creating a natural, complete wider scene.";
              break;
            case "frame":
              imagePromptSubject = "A highly professional photo of the subject from the reference image, beautifully enclosed inside a premium, modern, decorative frame, border, or celebratory event twibbon. The frame should blend naturally with the image colors without obscuring any main subject details.";
              break;
            case "banner":
              imagePromptSubject = "A stunning horizontal, landscape web banner design featuring the product or subject. It should have wide space, modern asymmetrical design, premium branding patterns, and clean professional background with no text.";
              break;
            case "carousel":
              imagePromptSubject = "An elegant, clean social media multi-slide or carousel presentation layout. Show a beautiful collage of graphical boxes with minimal modern layout, elegant visual partitions, and the subject/product integrated, completely textless.";
              break;
            case "kolase":
              imagePromptSubject = "A high-end, artistic photographic collage featuring multiple beautifully arranged viewpoints or stylized shots of the subject. Use elegant arrangements like polaroid borders, minimalist grid lines, or layered frames on a clean background.";
              break;
          }

          if (customPrompt) {
            imagePromptSubject += ` User instruction: "${customPrompt}".`;
          }

          const isPhotoTool = ["outfit", "enhancer", "resize", "frame", "kolase"].includes(toolId);
          let descPrompt = "";

          if (isPhotoTool) {
            descPrompt = `Write a detailed, highly descriptive English image generation prompt for an image generator (like Imagen 3 or Flux).
The prompt should combine the visual content, key subject, and style of this uploaded reference image with the following instruction:
"${imagePromptSubject}"

CRITICAL INSTRUCTIONS for image editing and preservation:
1. The output prompt MUST focus on realistic photo preservation and modifications, NOT a marketing graphic design layout or poster.
2. It MUST NOT include any added marketing texts, slogans, typography, letters, layout partitions, logos, or commercial frames. The image must be completely textless.
3. For "outfit" (Outfit Changer): It MUST keep the subject's face, eyes, hair, skin tone, facial features, age, gender, ethnicity, and head posture 100% IDENTICAL to the reference image. Describe the face and features exactly as they appear in the reference image. Only replace the clothing with the requested new outfit.
4. For "enhancer" (Photo Enhancer): It MUST keep the exact subject, details, and layout, but describe it under high-end studio lighting (softbox, rim light), with perfect textures, realistic shadows, and on a clean, professional solid/neutral background.
5. For "resize" (Generative Expand): It MUST describe extending the surrounding background seamlessly, maintaining the exact texture, lighting, elements, and colors of the reference image.
6. For "frame" / "kolase": Describe the framing or grid layout without obscuring the main subject.
7. EXTREMELY IMPORTANT: To preserve the identity of the person or product in the reference image, you MUST carefully analyze the reference image and describe its subject in high detail within the generated prompt (e.g., describe the exact shape, color, style, or the person's gender, approximate age, ethnicity, facial features, hair color and style, skin tone, facial expression, and posture). This detailed description ensures the image generator can recreate their likeness as closely as possible.

Focus on retaining the exact visual likeness, color palette, and identity of the subject from the reference image. Output ONLY the raw prompt text, no extra explanation or formatting.`;
          } else {
            descPrompt = `Write a detailed, highly descriptive English image generation prompt for a graphic generator (like Imagen 3 or Flux).
The prompt should combine the visual content, key subject, style, and colors of this uploaded reference image (if provided) with the following design task:
"${imagePromptSubject}"

CRITICAL INSTRUCTIONS for prompt creation:
1. Since the goal is a professional marketing or design asset, the output prompt MUST describe a fully realized, complete graphic design layout, but IT MUST NOT contain any added text, typography, letters, symbols, logos, catchphrases, labels, or slogans on the image itself.
2. It MUST describe elegant graphic layout partitions, modern background elements, geometric decorations, elegant borders, vector curves, or stylish frames, but everything must be purely visual with absolutely zero textual elements.
3. The image must be completely clean and textless, with no text overlays of any kind.
4. EXTREMELY IMPORTANT: To preserve the identity of the person or product in the reference image, you MUST carefully analyze the reference image and describe its subject in high detail within the generated prompt (e.g., describe the exact shape, color, style, or the person's gender, approximate age, ethnicity, facial features, hair color and style, skin tone, facial expression, and posture). This detailed description ensures the image generator can recreate their likeness as closely as possible.

Focus on retaining the essential identity of the subject from the reference image, but reimagined beautifully in the new context. Output ONLY the raw prompt text, no extra explanation or formatting.`;
          }

          const descContents = [];
          if (imageBase64) {
            descContents.push({
              inlineData: {
                mimeType: "image/jpeg",
                data: imageBase64
              }
            });
          }
          descContents.push({ text: descPrompt });

          const promptResponse = await callWithRetry(() => activeAi.models.generateContent({
            model: 'gemini-3.5-flash',
            contents: descContents
          }));

          const finalImagePrompt = promptResponse.text?.trim() || imagePromptSubject;

          // Map tool to aspectRatio
          let imageRatio = "1:1";
          if (toolId === "poster" || toolId === "booth") {
            imageRatio = "3:4";
          } else if (toolId === "banner" || toolId === "resize") {
            imageRatio = "16:9";
          } else if (toolId === "carousel") {
            imageRatio = "4:3";
          }

          try {
            // Attempt standard Gemini Imagen 3 generation first
            const imgGenResponse = await callWithRetry(() => activeAi.models.generateImages({
              model: 'imagen-3.0-generate-002',
              prompt: finalImagePrompt,
              config: {
                numberOfImages: 1,
                outputMimeType: 'image/jpeg',
                aspectRatio: imageRatio,
              }
            }));

            if (imgGenResponse) {
              if (imgGenResponse.url) {
                generatedImageUrl = imgGenResponse.url;
              } else if (imgGenResponse.generatedImages && imgGenResponse.generatedImages[0]) {
                const imageObj = imgGenResponse.generatedImages[0].image;
                if (imageObj.imageBytes) {
                  generatedImageUrl = saveImageToCache(imageObj.imageBytes);
                } else {
                  generatedImageUrl = imageObj.url || "";
                }
              }
            }
          } catch (imagenError) {
            console.warn("Imagen 3 failed, switching to Pollinations AI fallback:", imagenError);
            try {
              const fallbackResult = await generateImagesWithPollinations(finalImagePrompt, { aspectRatio: imageRatio });
              generatedImageUrl = fallbackResult.url;
            } catch (fallbackError) {
              console.error("Pollinations AI fallback image generation failed:", fallbackError);
            }
          }
        } catch (imgError) {
          console.error("Error generating image in process-ai background:", imgError);
        }
      }

      res.json({ text: textResponse, imageUrl: generatedImageUrl });
    } catch (error) {
      console.error("Error processing AI request on server:", error);
      res.status(500).json({ error: error.message || "Terjadi kesalahan internal." });
    }
  });

  // API Endpoint untuk merekonstruksi aset gambar berbasis Gemini AI
  app.post("/api/generate", async (req, res) => {
    try {
      if (!ai) {
        return res.status(500).json({ 
          error: "Kunci API Gemini tidak terkonfigurasi. Silakan tambahkan GEMINI_API_KEY di menu Secrets." 
        });
      }

      const { image, tool, option, customPrompt } = req.body;

      if (!image) {
        return res.status(400).json({ error: "Foto utama belum diunggah." });
      }

      // Susun panduan instruksi (Prompt) AI desainer
      let basePrompt = "";
      switch (tool) {
        case "poster":
          basePrompt = `Bertindaklah sebagai desainer grafis profesional. Ubah foto referensi utama ini menjadi sebuah karya poster iklan, event, promosi, atau poster pengumuman bertema: "${option}". Posisikan subjek dari foto dengan rapi sebagai fokus utama (hero element), lalu rancang latar belakang yang modern, dinamis, serta penuhi dengan elemen grafis dekoratif yang elegan yang sesuai dengan konsep poster tersebut tanpa menambahkan teks tulisan apapun.`;
          break;
        case "frame":
          basePrompt = `Ubah foto ini dengan menambahkan frame dekoratif, batas bingkai acara, atau twibbon meriah bertema: "${option}". Integrasikan frame tersebut dengan rapi di sekeliling subjek foto agar terlihat menyatu alami tanpa menutupi bagian wajah atau subjek utama.`;
          break;
        case "mockup":
          basePrompt = `Rancang produk mockup 3D yang sangat realistis untuk foto ini. Tempelkan subjek atau keseluruhan gambar ini ke produk fisik: "${option}" secara natural. Sesuaikan pencahayaan (lighting), bayangan (shadows), dan lekukan kain/kartu/permukaan agar terlihat sangat nyata seperti foto produk profesional asli.`;
          break;
        case "banner":
          basePrompt = `Ubah foto ini menjadi desain banner web horizontal beresolusi tinggi dengan rasio lebar untuk tema: "${option}". Rancang tata letak lanskap yang luas, perpanjang latar belakang secara artistik jika diperlukan, dan buat komposisi yang sangat cocok dipasang di header website atau cover media sosial.`;
          break;
        case "carousel":
          basePrompt = `Desain slide presentasi infografis mikro-konten bergaya korsel (carousel) sosial media dengan tema utama: "${option}". Sajikan tata letak visual berseri, diagram grafis, pembatas artistik, dan kartu informasi grafis estetik tanpa teks tulisan di sekitar subjek foto ini untuk membuat presentasi slide yang edukatif dan menarik.`;
          break;
        case "kolase":
          basePrompt = `Rangkai subjek foto ini ke dalam kompilasi layout kolase foto estetis berseni tinggi menggunakan konsep gaya: "${option}". Tambahkan aksen bingkai polaroid, selotip washi tape, grid geometris minimalis, atau penataan bersusun yang seimbang dan indah dilihat.`;
          break;
        case "edit":
          basePrompt = `Edit foto pengenal / foto potret wajah ini secara profesional: "${option}". Ganti pakaian subjek menjadi setelan jas resmi formal pria atau wanita yang rapi lengkap dengan kemeja dan dasi, atau ubah latar belakangnya menjadi background studio/warna polos formal secara sempurna. Jaga kemiripan wajah, rambut, dan posisi kepala subjek asli agar 100% mirip dan tidak berubah wajahnya.`;
          break;
        default:
          basePrompt = `Lakukan modifikasi kreatif yang indah dan profesional pada foto ini bertema: "${option || 'gaya estetik'}".`;
      }

      if (customPrompt && customPrompt.trim()) {
        basePrompt += ` Tambahkan juga instruksi khusus berikut dari pengguna: "${customPrompt}".`;
      }

      basePrompt += ` Pastikan output akhir HANYA berupa gambar hasil desain yang telah dimodifikasi (inlineData image). Pastikan kualitas gambar sangat bersih, beresolusi tinggi, tajam, dan memiliki kontras yang seimbang layaknya dibuat desainer profesional.`;

      // Ekstraksi format MIME dan raw base64 data
      let mimeType = "image/jpeg";
      let base64Data = image;
      if (image.startsWith("data:")) {
        const matches = image.match(/^data:([^;]+);base64,(.*)$/);
        if (matches && matches.length === 3) {
          mimeType = matches[1];
          base64Data = matches[2];
        }
      }

      // Memulai generasi konten model gambar menggunakan free tier gemini-3.5-flash & imagen-3.0-generate-002
      const descResponse = await callWithRetry(() => ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: [
          {
            inlineData: {
              data: base64Data,
              mimeType: mimeType,
            },
          },
          {
            text: `Write a detailed, highly descriptive English image generation prompt for Imagen 3.
The prompt should combine the visual content, key subject, style, and colors of this uploaded reference image with the following instruction:
"${basePrompt}"

Focus on retaining the essential identity of the subject from the reference image, but reimagined in the new context. Make it highly detailed and professional.
CRITICAL: The prompt MUST NOT ask for or describe any text, typography, letters, words, slogans, catchphrases, or labels on the image. The image must be completely clean and textless. Output ONLY the raw prompt text, no extra explanation or formatting.`,
          }
        ]
      }));

      const finalPrompt = descResponse.text?.trim() || basePrompt;

      // Map tool to aspectRatio
      let imageRatio = "1:1";
      if (tool === "poster") {
        imageRatio = "3:4";
      } else if (tool === "banner") {
        imageRatio = "16:9";
      } else if (tool === "carousel") {
        imageRatio = "4:3";
      }

      const imgGenResponse = await callWithRetry(() => ai.models.generateImages({
        model: 'imagen-3.0-generate-002',
        prompt: finalPrompt,
        config: {
          numberOfImages: 1,
          outputMimeType: 'image/jpeg',
          aspectRatio: imageRatio,
        }
      }));

      let generatedImageUrl = "";
      if (imgGenResponse) {
        if (imgGenResponse.url) {
          generatedImageUrl = imgGenResponse.url;
        } else if (imgGenResponse.generatedImages && imgGenResponse.generatedImages[0]) {
          const imageObj = imgGenResponse.generatedImages[0].image;
          if (imageObj.imageBytes) {
            generatedImageUrl = saveImageToCache(imageObj.imageBytes);
          } else {
            generatedImageUrl = imageObj.url || "";
          }
        }
      }

      if (!generatedImageUrl) {
        return res.status(500).json({
          error: "Kecerdasan Buatan (AI) gagal mengembalikan format gambar visual langsung. Silakan ganti foto atau modifikasi instruksi/concept Anda."
        });
      }

      return res.json({ success: true, url: generatedImageUrl });
    } catch (error) {
      console.error("Gemini processing error:", error);
      return res.status(500).json({ 
        error: getFriendlyErrorMessage(error)
      });
    }
  });

  // API Endpoint untuk Smart Resize Generator
  app.post("/api/smart-resize", async (req, res) => {
    try {
      if (!ai) {
        return res.status(500).json({ 
          error: "Kunci API Gemini tidak terkonfigurasi. Silakan tambahkan GEMINI_API_KEY di menu Secrets." 
        });
      }

      const { image, aspectRatio, fillMethod, customPrompt } = req.body;

      if (!image) {
        return res.status(400).json({ error: "Foto utama belum diunggah." });
      }

      let ratioDetails = "";
      switch (aspectRatio) {
        case "9:16":
          ratioDetails = "portrait Handphone Story / TikTok (1080x1920)";
          break;
        case "1:1":
          ratioDetails = "persegi Instagram Feed (1080x1080)";
          break;
        case "16:9":
          ratioDetails = "landscape Website Banner / YouTube Cover (1920x1080)";
          break;
        case "2:3":
          ratioDetails = "portrait Pinterest Pin / Poster Tinggi (1000x1500)";
          break;
        default:
          ratioDetails = "aspek rasio kustom (" + aspectRatio + ")";
      }

      let methodPrompt = "";
      switch (fillMethod) {
        case "generative-fill":
          methodPrompt = "Gunakan teknik Generative Fill dengan memperluas dan meregenerasi latar belakang foto asli secara halus agar menyatu dengan latar belakang baru yang diperluas, tanpa mendistorsi atau menarik subjek utama.";
          break;
        case "reposition":
          methodPrompt = "Posisikan subjek utama di tengah canvas secara presisi, lalu beri warna latar atau pola yang senada secara harmonis dengan palet warna draf asli untuk meratakan tepi yang kosong.";
          break;
        case "creative-framing":
          methodPrompt = "Gunakan framing artistik yang kaya dan hiasan dekoratif estetis di sekeliling subjek agar menutupi atau mengisi sisa ruang aspek rasio yang baru secara elegan.";
          break;
        default:
          methodPrompt = "Lakukan penyesuaian tata letak yang proporsional dan seimbang.";
      }

      let basePrompt = `Bertindaklah sebagai desainer tata letak grafis profesional. Ambil foto produk/subjek referensi ini dan lakukan pengaturan ulang tata letak (smart resize), pemosisian ulang, penskalaan, pengisian latar belakang secara pintar agar pas, rapi, dan estetis di dalam format dimensi aspek rasio target: ${aspectRatio} (${ratioDetails}).
      ${methodPrompt}
      Luruskan cakrawala visual, atur tata huruf/elemen jika ada agar visual solid, bersih, tajam, profesional, dan layaknya iklan majalah kelas atas.`;

      if (customPrompt && customPrompt.trim()) {
        basePrompt += ` Tambahkan juga preferensi khusus dari pengguna: "${customPrompt}".`;
      }

      basePrompt += ` Pastikan output akhir HANYA berupa gambar hasil desain baru yang telah disesuaikan dimensinya (inlineData image).`;

      // Extract format MIME and raw base64 data
      let mimeType = "image/jpeg";
      let base64Data = image;
      if (image.startsWith("data:")) {
        const matches = image.match(/^data:([^;]+);base64,(.*)$/);
        if (matches && matches.length === 3) {
          mimeType = matches[1];
          base64Data = matches[2];
        }
      }

      // Memulai generasi model gambar menggunakan free tier gemini-3.5-flash & imagen-3.0-generate-002
      const descResponse = await callWithRetry(() => ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: [
          {
            inlineData: {
              data: base64Data,
              mimeType: mimeType,
            },
          },
          {
            text: `Write a detailed, highly descriptive English image generation prompt for Imagen 3.
The prompt should describe how to resize, reposition, or extend the image elements to fit the target aspect ratio: ${aspectRatio}.
Instruction:
"${basePrompt}"

CRITICAL: The generated prompt MUST NOT include, describe, or request any text, typography, letters, words, slogans, catchphrases, or labels on the image. The image must be completely clean and textless. Output ONLY the raw prompt text, no extra explanation or formatting.`,
          }
        ]
      }));

      const finalPrompt = descResponse.text?.trim() || basePrompt;

      // Map aspect ratio to supported ones
      let supportedRatio = "1:1";
      if (["1:1", "3:4", "4:3", "9:16", "16:9"].includes(aspectRatio)) {
        supportedRatio = aspectRatio;
      } else if (aspectRatio === "2:3") {
        supportedRatio = "3:4";
      }

      const imgGenResponse = await callWithRetry(() => ai.models.generateImages({
        model: 'imagen-3.0-generate-002',
        prompt: finalPrompt,
        config: {
          numberOfImages: 1,
          outputMimeType: 'image/jpeg',
          aspectRatio: supportedRatio,
        }
      }));

      let generatedImageUrl = "";
      if (imgGenResponse) {
        if (imgGenResponse.url) {
          generatedImageUrl = imgGenResponse.url;
        } else if (imgGenResponse.generatedImages && imgGenResponse.generatedImages[0]) {
          const imageObj = imgGenResponse.generatedImages[0].image;
          if (imageObj.imageBytes) {
            generatedImageUrl = saveImageToCache(imageObj.imageBytes);
          } else {
            generatedImageUrl = imageObj.url || "";
          }
        }
      }

      if (!generatedImageUrl) {
        return res.status(500).json({
          error: "Model AI gagal me-resize gambar. Silakan ganti foto atau ubah pengaturannya."
        });
      }

      return res.json({ success: true, url: generatedImageUrl });
    } catch (error) {
      console.error("Smart Resize processing error:", error);
      return res.status(500).json({ 
        error: getFriendlyErrorMessage(error)
      });
    }
  });

  // API Endpoint untuk membuat Brand Kit otomatis (Logo SVG, Warna, Font, tagline)
  app.post("/api/brand-kit", async (req, res) => {
    try {
      if (!ai) {
        return res.status(500).json({ 
          error: "Kunci API Gemini tidak terkonfigurasi. Silakan tambahkan GEMINI_API_KEY di menu Secrets." 
        });
      }

      const { brandName, brandDesc, designStyle } = req.body;

      if (!brandName || !brandDesc) {
        return res.status(400).json({ error: "Nama Brand dan Deskripsi wajib diisi." });
      }

      const brandPrompt = `Ubah data brand ini menjadi Identitas Visual Brand Kit yang komprehensif.
      Nama Brand: "${brandName}"
      Deskripsi Bisnis: "${brandDesc}"
      Gaya Desain Pilihan: "${designStyle || "Modern Minimalis"}"

      Kembalikan respon DALAM FORMAT JSON BERIKUT (Pastikan valid JSON tanpa markdown wrappings):
      {
        "slogan": "Slogan pendek yang sangat memikat",
        "description": "Deskripsi filosofi identitas visual yang ditekankan",
        "logo_svg": "String XML SVG lengkap (berukuran viewBox='0 0 200 200' atau sejenisnya) yang berisi ikon logo minimalis elegan berkualitas tinggi yang mencerminkan nama atau bidang usaha dan berlatar transparan. Pastikan ia menggunakan warna HEX yang serasi dengan palet brand, dan kode SVG valid.",
        "colors": [
          { "name": "Warna Primer", "hex": "#123456", "desc": "Filosofi penggunaan warna ini" },
          { "name": "Warna Sekunder", "hex": "#abcdef", "desc": "Filosofi warna sekunder" },
          { "name": "Aksen", "hex": "#ff5500", "desc": "Filosofi warna aksen kontras" },
          { "name": "Latar Belakang", "hex": "#f8f9fa", "desc": "Filosofi warna latar belakang" }
        ],
        "typography": {
          "header_font": "Nama Font Utama Google Web Font yang disarankan untuk Headline",
          "body_font": "Nama Font Pendukung untuk teks panjang",
          "reason": "Alasan pemilihan kombinasi tipografi ini"
        },
        "instagram_prompt": "Prompt bahasa inggris instruktif untuk AI untuk mendesain postingan Instagram bagi brand ini"
      }

      Aturan penting: Kembalikan HANYA string JSON raw yang valid. Jangan gunakan blok kode markdown \`\`\`json ... \`\`\` dalam respon Anda.`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: brandPrompt,
        config: {
          responseMimeType: 'application/json'
        }
      });

      let jsonText = response.text || "";
      // Strip potentially remaining backticks if Gemini ignored instructions
      jsonText = jsonText.trim();
      if (jsonText.startsWith("```")) {
        jsonText = jsonText.replace(/^```json\s*/i, "").replace(/```$/, "");
      }

      const dataResult = JSON.parse(jsonText);
      return res.json({ success: true, brandKit: dataResult });

    } catch (error) {
      console.error("Brand Kit creation error:", error);
      // Fallback realistic response in case of API failure or JSON parse issue
      return res.status(500).json({ 
        error: error?.message || "Terjadi kesalahan saat memproses identitas brand lewat AI."
      });
    }
  });

  // API Endpoint untuk Analisis Gambar & Social Media Copywriting
  app.post("/api/copywriter", async (req, res) => {
    try {
      if (!ai) {
        return res.status(500).json({ 
          error: "Kunci API Gemini tidak terkonfigurasi." 
        });
      }

      const { image, productName, promoTheme } = req.body;

      if (!image) {
        return res.status(400).json({ error: "Silakan unggah atau gunakan gambar aktif untuk dianalisis." });
      }

      // Extract raw base64 data
      let mimeType = "image/jpeg";
      let base64Data = image;
      if (image.startsWith("data:")) {
        const matches = image.match(/^data:([^;]+);base64,(.*)$/);
        if (matches && matches.length === 3) {
          mimeType = matches[1];
          base64Data = matches[2];
        }
      }

      const copywriterPrompt = `Analisislah gambar produk berikut ini secara menyeluruh untuk platform e-commerce dan sosial media.
      Nama Produk/Context: "${productName || "Nama Produk"}"
      Tema Promosi: "${promoTheme || "Soft Selling & Edukasi"}"

      Berikan tanggapan yang mendalam DALAM FORMAT JSON BERIKUT (Pastikan valid JSON tanpa markdown wrappings):
      {
        "headline": "Judul copywriting promosi yang mencuri perhatian",
        "caption": "Teks caption promosional panjang, persuasif, memiliki tata bahasa Indonesia yang menarik, dilengkapi emoji yang relevan dan informatif",
        "hashtags": "#tag1 #tag2 #tag3 #tag4 #produk #umkmindonesia",
        "scores": {
          "composition": 92,
          "color": 85,
          "readability": 90
        },
        "design_feedback": "Penilaian ahli mengenai komposisi gambar ini (misal pencahayaan, posisi, dan saran estetika untuk feed media sosial)",
        "optimal_publish_time": "Hari ini jam 18:00 WIB (Saran jam tayang terbaik sosial media anda)"
      }

      Aturan penting: Kembalikan HANYA string JSON raw yang valid. Jangan gunakan blok kode markdown \`\`\`json ... \`\`\``;

      const response = await ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: [
          {
            inlineData: {
              data: base64Data,
              mimeType: mimeType,
            },
          },
          {
            text: copywriterPrompt,
          },
        ],
        config: {
          responseMimeType: 'application/json'
        }
      });

      let jsonText = response.text || "";
      jsonText = jsonText.trim();
      if (jsonText.startsWith("```")) {
        jsonText = jsonText.replace(/^```json\s*/i, "").replace(/```$/, "");
      }

      const writeResult = JSON.parse(jsonText);
      return res.json({ success: true, copywriting: writeResult });

    } catch (error) {
      console.error("Copywriter generation error:", error);
      return res.status(500).json({ 
        error: error?.message || "Gagal memproses analisis desain dan penulisan copywriting otomatis." 
      });
    }
  });

  // API Endpoint: AI Campaign Generator (Mega-Suite)
  app.post("/api/campaign-generator", async (req, res) => {
    try {
      if (!ai) {
        return res.status(500).json({ error: "Kunci API Gemini tidak terkonfigurasi." });
      }

      const { productName, targetMarket, price, vibeChoice, customPrompt } = req.body;

      if (!productName || !targetMarket) {
        return res.status(400).json({ error: "Nama produk dan target pasar wajib diisi untuk merancang kampanye." });
      }

      const campaignPrompt = `Bertindaklah sebagai Direktur Kampanye Pemasaran Digital Internasional dan Ahli Growth Hacking untuk UMKM.
      Rancang satu paket kampanye branding dan taktik pemasaran yang holistik dan solid untuk data produk berikut:
      Nama Produk: "${productName}"
      Target Pasar (Audiens): "${targetMarket}"
      Harga Produk: "${price || 'Harga bersaing'}"
      Gaya Estetis / Vibe: "${vibeChoice || 'Modern Minimalis'}"
      Instruksi Tambahan Pengguna: "${customPrompt || '-'}"

      Gunakan keahlian Anda untuk merancang seluruh aset tertulis kampanye ini secara mendalam dan terstruktur. Respon HARUS dalam format JSON berstruktur persis di bawah ini demi standardisasi pertukaran data (Pastikan valid JSON tanpa markdown block wrappers):
      {
        "slogan": "Slogan pemasaran pendek yang sangat catchy dan provokatif",
        "ig_headline": "Headline copywriting untuk postingan Instagram yang memikat perhatian dalam 3 detik",
        "ig_caption": "Caption Instagram persuasif lengkap dengan emoji relevan, keunggulan produk sesuai psikologi audiens target, kalimat CTA (Call to Action) mendalam untuk segera melunasi keranjang belanja",
        "hashtags": "#tag1_populer #tag2_trending #umkmberdaya",
        "youtube_concept": "Deskripsi visual concept dan thumbnail YouTube yang provokatif (melibatkan kontras warna, tulisan clickbait sehat, and focal point produk gila-gilaan)",
        "web_headline": "Kalimat Banner Utama Website (Headline Hero Section) yang memvisualisasikan solusi produk",
        "web_cta": "Label tombol beli di website (Contoh: 'Mulai Hidup Sehat Besok')",
        "video_script": [
          {
            "scene": "Scene 1 (0-3 Detik) - Hook Utama",
            "visual": "Keterangan visual scene, pergerakan kamera, visualisasi produk, dan kemunculan overlay teks modern",
            "audio": "Petunjuk suara latar (VO) atau sound effect (SFX) yang dramatis dan menarik telinga"
          },
          {
            "scene": "Scene 2 (3-15 Detik) - Masalah & Solusi",
            "visual": "Keterangan visual peraga, detail fungsional kemasan produk, transisi lincah",
            "audio": "Narasi utama menceritakan kemudahan solusi yang dibawa produk"
          },
          {
            "scene": "Scene 3 (15-30 Detik) - Call to Action",
            "visual": "Tampilan promo harga rincian khusus di layar, kontak pemesanan, logo brand transparan bergoyang manis",
            "audio": "VO bergetar semangat mengajak ambil promo diskon kilat terbatas"
          }
        ],
        "calendar_30days": [
          { "day": 1, "type": "PROMO", "topic": "Kabar peluncuran produk khusus dengan diskon harga spesial", "time": "18.00 WIB" },
          { "day": 2, "type": "EDUKASI", "topic": "Mengapa bahan utama produk Anda adalah rahasia kenyamanan terbaik dunia", "time": "12.00 WIB" },
          { "day": 3, "type": "INTERAKSI", "topic": "Tanya jawab (QnA) di story: 'Mana warna kesukaanmu? Komen di bawah!'", "time": "15.00 WIB" },
          { "day": 4, "type": "TESTIMONI", "topic": "Review jujur pelanggan pertama mengenai rasa atau ketebalan produk", "time": "19.00 WIB" },
          { "day": 5, "type": "TIPS", "topic": "3 gaya padu padan menggunakan produk ini untuk acara formal", "time": "10.00 WIB" },
          { "day": 6, "type": "BEHIND THE SCENES", "topic": "Video pendek memperlihatkan rapi dan higienisnya proses pengemasan", "time": "16.00 WIB" },
          { "day": 7, "type": "PROMO", "topic": "Flash Sale Weekend: Tersisa tinggal 15 slot produk rakitan!", "time": "19.00 WIB" }
        ]
      }

      Aturan penting: Berikan JSON raw murni yang 100% valid dan langsung bisa diparse. Jangan menambahkan pembungkus kode \`\`\`json ... \`\`\``;

      const response = await ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: campaignPrompt,
        config: { responseMimeType: 'application/json' }
      });

      let jsonText = response.text || "";
      jsonText = jsonText.trim();
      if (jsonText.startsWith("```")) {
        jsonText = jsonText.replace(/^```json\s*/i, "").replace(/```$/, "");
      }

      const campaignResult = JSON.parse(jsonText);
      return res.json({ success: true, campaign: campaignResult });

    } catch (error) {
      console.error("Campaign Generator API error:", error);
      return res.status(500).json({ 
        error: error?.message || "Gagal menyusun strategi paket kampanye pemasaran otomatis." 
      });
    }
  });

  // API Endpoint: AI Creative Assistant Chat (Sembang Kreatif)
  app.post("/api/assistant-chat", async (req, res) => {
    try {
      if (!ai) {
        return res.status(500).json({ error: "Kunci API Gemini tidak terkonfigurasi secara terpusat." });
      }

      const { message, history } = req.body;

      if (!message) {
        return res.status(400).json({ error: "Pesan kosong tidak bisa diproses oleh AI." });
      }

      // Format simple conversation structure for Gemini
      let sysInstruction = `Anda adalah AI Creative Assistant Chat di platform "AI Design Studio". Anda adalah gabungan dari Senior Designer, Branding Guru, dan Copywriter handal bertaraf dunia yang humoris, bijaksana, ramah, dan sangat ahli mendukung UMKM lokal maupun profesional.
      Tugas utama Anda:
      - Menjawab keluhan pengguna seputar tata letak desain, kombinasi warna kontras, and strategi postingan media sosial.
      - Memberikan solusi fungsional konkrit, ide tagline kreatif, saran gaya visual (seperti Korean Style, Brutalist, Apple Minimalist).
      - Menghasilkan Prompt siap guna jika diminta.
      - Berbahasa Indonesia yang suportif, profesional, penuh optimisme, dan diselingi emoji yang cerdas.
      Jagalah percakapan agar tetap ringkas, bernas, dan mudah dibaca (gunakan list rincian bullet points jika berisi tips).`;

      // Construct content context
      let contextualContents = [];
      if (history && Array.isArray(history)) {
        // Keep last 5 messages to avoid blowing up memory limits
        const sliceHist = history.slice(-5);
        sliceHist.forEach(msg => {
          contextualContents.push({
            role: msg.role === "user" ? "user" : "model",
            parts: [{ text: msg.text }]
          });
        });
      }

      // Add actual final message
      contextualContents.push({
        role: "user",
        parts: [{ text: `${message}` }]
      });

      const response = await ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: contextualContents,
        config: {
          systemInstruction: sysInstruction
        }
      });

      const replyText = response.text || "Saya di sini untuk membantu Anda dalam merancang kampanye terbaik. Bisakah Anda mengulangi pertanyaan Anda?";
      return res.json({ success: true, reply: replyText });

    } catch (error) {
      console.error("Assistant Chat error:", error);
      return res.status(500).json({ 
        error: error?.message || "Koneksi terputus. AI Creative Assistant sedang beristirahat." 
      });
    }
  });

  // API Endpoint: AI Visual Consistency Checker & Brand Audit (Vision-based)
  app.post("/api/brand-checker", async (req, res) => {
    try {
      if (!ai) {
        return res.status(500).json({ error: "Kunci API Gemini tidak terkonfigurasi." });
      }

      const { image, brandName, targetVibe } = req.body;

      if (!image) {
        return res.status(400).json({ error: "Wajib mengunggah gambar desain atau foto produk untuk diperiksa konsistensinya." });
      }

      let mimeType = "image/jpeg";
      let base64Data = image;
      if (image.startsWith("data:")) {
        const matches = image.match(/^data:([^;]+);base64,(.*)$/);
        if (matches && matches.length === 3) {
          mimeType = matches[1];
          base64Data = matches[2];
        }
      }

      const brandCheckerPrompt = `Bertindaklah sebagai Senior Brand Auditor & Principal UI/UX Desainer.
      Analisislah gambar visual atau poster desain yang diunggah pengguna berikut ini. Bandingkan ia dengan profil target brand ini:
      Profil Nama Brand: "${brandName || "Brand Umum UMKM"}"
      Vibe Gaya Target Konsistensi: "${targetVibe || "Modern Minimalist"}"

      Periksa secara teliti aspek berikut ini dari gambar:
      1. Konsistensi warna: Apakah warna selaras dengan citra brand atau model target yang diinginkan?
      2. Keterbacaan (Readability): Apakah teks kontras terhadap latar belakang? Apakah font dapat terbaca sempurna dalam ukuran kecil?
      3. Profesionalitas: Apakah tatanan elemen, tata letak logo, penempatan margin seimbang dan rapi?

      Berikan penilaian Anda yang jujur dan bantu mereka agar layak dipresentasikan dalam lomba atau e-commerce profesional.
      Respon HARUS dikembalikan dalam format struktur JSON persis berikut demi standardisasi integrasi (Pastikan valid JSON tanpa markdown block wrappers):
      {
        "consistency_score": 85,
        "readability_score": 90,
        "professionalism_score": 88,
        "overall_grade": "A-",
        "colors_extracted": [
          { "hex": "#123456", "name": "Deep Ocean Blue", "use_case": "Warna dominan latar belakang, memberikan nuansa tenang dan kokoh" },
          { "hex": "#FFFFFF", "name": "Pure White", "use_case": "Kontras teks utama, sangat mudah dibaca" }
        ],
        "fonts_read": [
          { "group": "Headline", "style": "Sans-serif Bold", "verdict": "Keterbacaan sangat tinggi, memberikan impresi modern dan lugas" }
        ],
        "strengths": [
          "Focal point produk diletakkan di tengah dengan pencahayaan yang sangat mumpuni",
          "Keseimbangan simetri kiri dan kanan memberikan ritme visual yang menenangkan"
        ],
        "room_for_improvements": [
          "Kontras bayangan di pojok kiri atas agak tipis, tingkatkan gelapnya agar produk lebih menonjol",
          "Garis tepi logo sebaiknya tidak melebihi margin pengaman luar agar seimbang saat dirender di layar handphone"
        ],
        "expert_summary": "Secara keseluruhan, desain ini sangat menjanjikan dengan porsi visual produk yang ideal. Cukup naikkan kontras tipografi sekunder untuk lulus sertifikasi desain marketplace global."
      }

      Aturan penting: Berikan HANYA string JSON raw yang valid. Jangan gunakan blok kode markdown \`\`\`json ... \`\`\``;

      const response = await ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: [
          {
            inlineData: {
              data: base64Data,
              mimeType: mimeType,
            },
          },
          {
            text: brandCheckerPrompt,
          },
        ],
        config: { responseMimeType: 'application/json' }
      });

      let jsonText = response.text || "";
      jsonText = jsonText.trim();
      if (jsonText.startsWith("```")) {
        jsonText = jsonText.replace(/^```json\s*/i, "").replace(/```$/, "");
      }

      const auditResult = JSON.parse(jsonText);
      return res.json({ success: true, audit: auditResult });

    } catch (error) {
      console.error("Brand checker API error:", error);
      return res.status(500).json({ 
        error: error?.message || "Gagal memproses audit visual dan pemeriksaan konsistensi brand." 
      });
    }
  });

  // API Endpoint: AI Creator Lab & Workflow Core Suite (Multi-Mode Cognitive Suite)
  app.post("/api/creator-lab", async (req, res) => {
    try {
      if (!ai) {
        return res.status(500).json({ error: "Kunci API Gemini tidak terkonfigurasi di server." });
      }

      const { action, image, challengeTheme, modeChoice } = req.body;

      if (!action) {
        return res.status(400).json({ error: "Parameter aksi (action) harus ditentukan." });
      }

      // Convert image if provided
      let mimeType = "image/jpeg";
      let base64Data = null;
      if (image) {
        base64Data = image;
        if (image.startsWith("data:")) {
          const matches = image.match(/^data:([^;]+);base64,(.*)$/);
          if (matches && matches.length === 3) {
            mimeType = matches[1];
            base64Data = matches[2];
          }
        }
      }

      let prompt = "";
      if (action === "reverse") {
        if (!base64Data) {
          return res.status(400).json({ error: "Unggah gambar referensi terlebih dahulu untuk didekonstruksi." });
        }
        prompt = `Bertindaklah sebagai Senior Reverse Design Engineer & Ahli Forensik Visual. 
        Bongkar dan bedahlah gambar desain poster/flyer rujukan berikut ini secara sangat teliti.
        Ekstrak informasi gaya visualnya dan kembalikan respon berstruktur JSON murni persis seperti di bawah ini tanpa penjelasan teks tambahan di luar JSON:
        {
          "colors": [
            { "hex": "#HEX_CODE", "name": "Nama Warna Kreatif Bahasa Indonesia", "proportion": "persen % kontribusi visual", "vibe": "psikologi warna ini saat dipandang pembeli" }
          ],
          "fonts": [
            { "role": "Fungsi (misal: Judul Utama, Body text, Badge Harga)", "approx_google_font": "Nama Google Font terdekat yang mirip", "category": "Kategori Font (Serif, Sans-serif, Slab, Handwriting, Display)", "size_ratio": "Rekomendasi rasio ketebalan/ukuran dalam px" }
          ],
          "layout_grid": [
            { "section": "Area Desain (misal: Header, Center Hero, Footer, Left Corner)", "alignment": "Posisional (Kiri atau Tengah atau Kanan)", "composition_weight": "Beban Visual %", "description": "Uraian singkat penempatan dan keterkaitan komponen" }
          ],
          "structural_concept": "Penjelasan konseptual mengapa layout rujukan ini terlihat profesional bagi audiens modern, dalam 2 kalimat."
        }`;
      } else if (action === "coach") {
        if (!base64Data) {
          return res.status(400).json({ error: "Harap unggah draft desain Anda terlebih dahulu agar mentor asisten kami bisa menilainya." });
        }
        prompt = `Bertindaklah sebagai AI Design Coach, mentor desain pribadi yang jujur, peduli, dan berwawasan artistik tinggi.
        Analisislah draf gambar visual/desain yang diunggah pengguna ini. Berikan ulasan perbaikan (critique) yang konstruktif dan bimbinglah mereka langkah demi langkah agar menjadi desainer mandiri yang andal.
        Respon Anda HARUS dikembalikan dalam format struktur JSON murni persis berikut tanpa markdown wrappers:
        {
          "typography_score": 4,
          "contrast_score": 3,
          "margin_score": 5,
          "color_harmony_score": 4,
          "overall_critique": "Satu paragraf ulasan kritik yang bernada memotivasi namun secara detail tegas menunjukkan kelemahan utama draf desain saat ini serta keunggulannya.",
          "actionable_tips": [
            { "category": "Bagian (pilih dari: Kategori Huruf / Rasio Gelap-Terang / Margin Aman / Tata Letak)", "issue": "Penjelasan kritis apa masalahnya di gambar saat ini", "solution": "Panduan perbaikan spesifik secara taktis" }
          ]
        }`;
      } else if (action === "challenge") {
        if (!base64Data) {
          return res.status(400).json({ error: "Anda wajib mencantumkan draf poster buatan Anda atau melampirkan gambar untuk divalidasi oleh juri AI." });
        }
        prompt = `Bertindaklah sebagai Dewan Juri Tingkat Tinggi dalam Kompetisi Desain Kreatif.
        Nilailah seberapa hebat gambar draf yang diunggah pengguna dalam menjawab tantangan mingguan: "${challengeTheme || "Desain Kreatif Poster Seni Klasik"}".
        Tentukan kelulusan karya draf bersangkutan, berikan skor serta lencana penghargaan digital (badge) yang relevan atas jerih payah desainer.
        Respon Anda HARUS dikembalikan dalam bentuk struktur JSON murni berikut tanpa markdown wrappers:
        {
          "final_score": 85,
          "verdict": "Status kelulusan (Contoh: LULUS DENGAN APRESIASI EMAS)",
          "feedback_text": "Satu paragraf evaluasi mendalam mengenai keunikan karya ini dalam menafsirkan tema tantangan mingguan.",
          "unlocked_badges": ["Rustic Champion", "Color Alchemist"],
          "stars_awarded": 4
        }`;
      } else {
        return res.status(400).json({ error: "Aksi tidak dikenali di platform." });
      }

      // Execute Gemini model with Vision capability
      const response = await ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: [
          {
            inlineData: {
              data: base64Data,
              mimeType: mimeType,
            },
          },
          {
            text: prompt,
          },
        ],
        config: { responseMimeType: 'application/json' }
      });

      let jsonText = response.text || "{}";
      jsonText = jsonText.trim();
      if (jsonText.startsWith("```")) {
        jsonText = jsonText.replace(/^```json\s*/i, "").replace(/```$/, "");
      }

      const resultParse = JSON.parse(jsonText);
      return res.json({ success: true, result: resultParse });

    } catch (error) {
      console.error("AI Creator Lab API Error:", error);
      return res.status(500).json({ 
        error: error?.message || "Gagal memproses aksi multimedia intelijen di Creator Lab." 
      });
    }
  });

  // API Endpoint: AI Market Analyzer
  app.post("/api/market-analyzer", async (req, res) => {
    try {
      if (!ai) return res.status(500).json({ error: "Kunci API Gemini tidak terkonfigurasi." });
      const { businessType, customPrompt } = req.body;
      if (!businessType) return res.status(400).json({ error: "Jenis usaha wajib diisi untuk menganalisis pasar." });

      const prompt = `Bertindaklah sebagai Ahli Riset Pasar dan Strategi Bisnis UMKM. Analisislah jenis usaha: "${businessType}". 
      ${customPrompt ? `Sertakan instruksi khusus tambahan: "${customPrompt}".` : ""}
      Berikan rekomendasi komprehensif dalam format JSON berikut (Pastikan valid JSON tanpa markdown wrappers):
      {
        "target_market": "Penjelasan target pasar utama secara spesifik dan demografinya",
        "age_range": "Rentang usia target konsumen (misal: 18 - 35 tahun)",
        "matching_colors": [
          { "hex": "#HEX_CODE", "name": "Nama Warna", "psychology": "Penjelasan psikologi warna untuk usaha ini" }
        ],
        "latest_trends": ["Tren visual/desain terbaru 1", "Tren visual/desain terbaru 2", "Tren promosi terbaru 3"],
        "competitors": ["Jenis kompetitor umum 1", "Jenis kompetitor umum 2", "Jenis kompetitor umum 3"],
        "strategies": ["Strategi jualan taktis 1", "Strategi jualan taktis 2", "Strategi jualan taktis 3"]
      }`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: prompt,
        config: { responseMimeType: 'application/json' }
      });

      let jsonText = response.text || "{}";
      jsonText = jsonText.trim();
      if (jsonText.startsWith("```")) {
        jsonText = jsonText.replace(/^```json\s*/i, "").replace(/```$/, "");
      }
      return res.json({ success: true, result: JSON.parse(jsonText) });
    } catch (error) {
      console.error("Market Analyzer API Error:", error);
      return res.status(500).json({ error: error?.message || "Gagal melakukan analisis pasar lewat AI." });
    }
  });

  // API Endpoint: AI Promo & Discount Planner
  app.post("/api/promo-planner", async (req, res) => {
    try {
      if (!ai) return res.status(500).json({ error: "Kunci API Gemini tidak terkonfigurasi." });
      const { productName, productPrice, customPrompt } = req.body;
      if (!productName || !productPrice) {
        return res.status(400).json({ error: "Nama produk dan harga dasar wajib diisi untuk merencanakan promo." });
      }

      const prompt = `Bertindaklah sebagai Konsultan Finansial, Pricing Analyst, dan Strategi Promosi UMKM. Hitung dan rencanakan skema promo terbaik untuk produk: "${productName}" dengan harga dasar: "${productPrice}". 
      ${customPrompt ? `Sertakan pertimbangan tambahan: "${customPrompt}".` : ""}
      Berikan analisis matang dalam format JSON berikut (Pastikan valid JSON tanpa markdown wrappers):
      {
        "diskon_10": { "harga_baru": "Harga setelah diskon 10%", "keuntungan_simulasi": "Prediksi profitabilitas, perputaran stok, dan dampak volume penjualan" },
        "beli_2_gratis_1": { "harga_efektif": "Harga efektif per item", "keuntungan_simulasi": "Bagaimana skema beli 2 gratis 1 meningkatkan cash flow dan margin" },
        "bundling": { "nama_bundle": "Nama paket bundling menarik", "harga_bundle": "Harga paket bundle", "keuntungan_simulasi": "Ulasan kenaikan keuntungan total" },
        "prediksi_keuntungan": "Penjelasan keuntungan jangka panjang jika menggunakan strategi harga di atas",
        "tips_promosi": ["Tips taktis promosi 1", "Tips taktis promosi 2", "Tips taktis promosi 3"]
      }`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: prompt,
        config: { responseMimeType: 'application/json' }
      });

      let jsonText = response.text || "{}";
      jsonText = jsonText.trim();
      if (jsonText.startsWith("```")) {
        jsonText = jsonText.replace(/^```json\s*/i, "").replace(/```$/, "");
      }
      return res.json({ success: true, result: JSON.parse(jsonText) });
    } catch (error) {
      console.error("Promo Planner API Error:", error);
      return res.status(500).json({ error: error?.message || "Gagal merencanakan promo lewat AI." });
    }
  });

  // API Endpoint: Social Media Content Factory
  app.post("/api/content-factory", async (req, res) => {
    try {
      if (!ai) return res.status(500).json({ error: "Kunci API Gemini tidak terkonfigurasi." });
      const { productName, vibeChoice, customPrompt } = req.body;
      if (!productName) return res.status(400).json({ error: "Nama produk wajib diisi untuk membuat konten pabrik." });

      const prompt = `Bertindaklah sebagai Senior Social Media Manager dan Copywriter viral. Buatlah paket konten media sosial lengkap dalam sekali klik untuk produk: "${productName}" dengan vibe gaya: "${vibeChoice || 'Modern Minimalist'}".
      ${customPrompt ? `Tambahkan instruksi kustom: "${customPrompt}".` : ""}
      Kembalikan respon JSON berikut (Pastikan valid JSON tanpa markdown wrappers):
      {
        "feed_instagram": "Copywriting lengkap untuk Postingan Feed Instagram (menarik, ber-emoji, ada CTA)",
        "story_instagram": "Ide konsep visual & teks singkat interaktif untuk Instagram Story",
        "whatsapp_status": "Copywriting santai bersahabat untuk promosi lewat WhatsApp Status",
        "facebook_post": "Copywriting persuasif panjang untuk Facebook Group atau Page",
        "tiktok_caption": "Caption pendek berenergi tinggi dengan hashtag viral untuk video TikTok",
        "shopee_banner": "Ide teks grafis tebal, penawaran kilat, dan elemen visual utama untuk banner toko e-commerce"
      }`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: prompt,
        config: { responseMimeType: 'application/json' }
      });

      let jsonText = response.text || "{}";
      jsonText = jsonText.trim();
      if (jsonText.startsWith("```")) {
        jsonText = jsonText.replace(/^```json\s*/i, "").replace(/```$/, "");
      }
      return res.json({ success: true, result: JSON.parse(jsonText) });
    } catch (error) {
      console.error("Content Factory API Error:", error);
      return res.status(500).json({ error: error?.message || "Gagal memproduksi konten pabrik lewat AI." });
    }
  });

  // API Endpoint: AI Color Palette Lab
  app.post("/api/color-palette-lab", async (req, res) => {
    try {
      if (!ai) return res.status(500).json({ error: "Kunci API Gemini tidak terkonfigurasi." });
      const { brandConcept, moodKeyword } = req.body;
      if (!brandConcept) return res.status(400).json({ error: "Konsep brand/usaha wajib diisi." });

      const prompt = `Bertindaklah sebagai Color Theorist dan Brand Specialist kelas dunia. Rancang skema warna profesional untuk konsep brand: "${brandConcept}" dengan mood: "${moodKeyword || 'Modern Clean'}".
      Kembalikan respon JSON berikut (Pastikan valid JSON tanpa markdown wrappers):
      {
        "palette": [
          { "hex": "#HEX_CODE", "name": "Nama Warna Kreatif", "psychology": "Ulasan psikologi warna ini dalam konteks brand" }
        ],
        "harmony_score": 95,
        "accessibility_rating": "AAA / AA rating kontras keterbacaan teks",
        "color_blindness_simulation": "Ulasan kejelasan palet ini bagi penderita buta warna (protanopia/deuteranopia)",
        "psychological_verdict": "Kesimpulan mengapa kombinasi warna ini memikat psikologi pembeli sasaran"
      }`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: prompt,
        config: { responseMimeType: 'application/json' }
      });

      let jsonText = response.text || "{}";
      jsonText = jsonText.trim();
      if (jsonText.startsWith("```")) {
        jsonText = jsonText.replace(/^```json\s*/i, "").replace(/```$/, "");
      }
      return res.json({ success: true, result: JSON.parse(jsonText) });
    } catch (error) {
      console.error("Color Palette Lab API Error:", error);
      return res.status(500).json({ error: error?.message || "Gagal memproses palet warna lewat AI." });
    }
  });

  // API Endpoint: AI PKL Portfolio Builder
  app.post("/api/pkl-portfolio", async (req, res) => {
    try {
      if (!ai) return res.status(500).json({ error: "Kunci API Gemini tidak terkonfigurasi." });
      const { studentName, schoolName, companyName, internshipPeriod, completedDesignsCount } = req.body;
      if (!studentName || !schoolName) {
        return res.status(400).json({ error: "Nama siswa dan sekolah wajib diisi untuk merakit portofolio PKL." });
      }

      const prompt = `Bertindaklah sebagai Pembimbing Lapangan PKL (Praktik Kerja Lapangan) dan Kurator Desain Lomba. Buatlah draf rekap portofolio PKL dan laporan kegiatan profesional untuk siswa bernama: "${studentName}" dari sekolah: "${schoolName}" yang magang di: "${companyName || 'AI Design Studio'}" selama periode: "${internshipPeriod || '3 Bulan'}".
      Kembalikan respon JSON berikut (Pastikan valid JSON tanpa markdown wrappers):
      {
        "laporan_kegiatan": "Ringkasan resmi laporan kegiatan PKL selama magang yang berfokus pada perancangan aset digital menggunakan AI",
        "dokumentasi": [
          "Draf Jurnal Hari 1-10: Riset identitas visual brand lokal",
          "Draf Jurnal Hari 11-20: Produksi poster pemasaran digital menggunakan AI",
          "Draf Jurnal Hari 21-30: Evaluasi konsistensi visual, layouting, & audit brand"
        ],
        "rekap_desain": "Siswa telah berhasil merancang ${completedDesignsCount || 8} poster iklan kreatif dengan peningkatan efisiensi produksi hingga 200% menggunakan AI",
        "sertifikat_pencapaian": {
          "nomor": "REG/PKL-AI/2026/${Math.floor(100 + Math.random() * 900)}",
          "predikat": "SANGAT BAIK (A)",
          "keahlian": "Generative AI Design, Brand Strategy, & Digital Copywriting"
        },
        "portfolio_summary": "Siswa ini sangat mahir mengawinkan teori desain grafis tradisional dengan teknologi kecerdasan buatan masa kini."
      }`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: prompt,
        config: { responseMimeType: 'application/json' }
      });

      let jsonText = response.text || "{}";
      jsonText = jsonText.trim();
      if (jsonText.startsWith("```")) {
        jsonText = jsonText.replace(/^```json\s*/i, "").replace(/```$/, "");
      }
      return res.json({ success: true, result: JSON.parse(jsonText) });
    } catch (error) {
      console.error("PKL Portfolio API Error:", error);
      return res.status(500).json({ error: error?.message || "Gagal merakit portofolio PKL lewat AI." });
    }
  });

  // API Endpoint: AI PKL Assistant
  app.post("/api/pkl-assistant", async (req, res) => {
    try {
      if (!ai) return res.status(500).json({ error: "Kunci API Gemini tidak terkonfigurasi." });
      const { studentName, dailyTask, customPrompt } = req.body;
      if (!studentName || !dailyTask) {
        return res.status(400).json({ error: "Nama siswa dan tugas harian wajib diisi." });
      }

      const prompt = `Bertindaklah sebagai Asisten Pribadi Siswa PKL dan Pembimbing Akademik. Siswa: "${studentName}" sedang mengerjakan tugas harian: "${dailyTask}".
      ${customPrompt ? `Sertakan instruksi khusus: "${customPrompt}".` : ""}
      Bantu otomatis membuat jurnal harian, draf laporan, outline presentasi, surat izin, atau ringkasan kegiatan.
      Kembalikan respon JSON berikut (Pastikan valid JSON tanpa markdown wrappers):
      {
        "jurnal_harian": "Teks lengkap jurnal harian PKL formal yang rapi dan detail",
        "laporan_kegiatan": "Draf laporan kegiatan mingguan formal berdasarkan tugas tersebut",
        "presentasi_outline": ["Slide 1: Judul & Latar Belakang", "Slide 2: Deskripsi Masalah UMKM", "Slide 3: Solusi AI Studio", "Slide 4: Hasil & Dampak Visual", "Slide 5: Kesimpulan"],
        "surat_izin_template": "Draf surat izin ketidakhadiran PKL formal yang rapi jika berhalangan",
        "ringkasan": "Ringkasan eksekutif kegiatan yang siap diserahkan ke guru pamong"
      }`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: prompt,
        config: { responseMimeType: 'application/json' }
      });

      let jsonText = response.text || "{}";
      jsonText = jsonText.trim();
      if (jsonText.startsWith("```")) {
        jsonText = jsonText.replace(/^```json\s*/i, "").replace(/```$/, "");
      }
      return res.json({ success: true, result: JSON.parse(jsonText) });
    } catch (error) {
      console.error("PKL Assistant API Error:", error);
      return res.status(500).json({ error: error?.message || "Gagal menyusun bantuan PKL lewat AI." });
    }
  });

  // API Endpoint: AI Trend Scanner
  app.post("/api/trend-scanner", async (req, res) => {
    try {
      if (!ai) return res.status(500).json({ error: "Kunci API Gemini tidak terkonfigurasi." });
      const { industry } = req.body;
      if (!industry) return res.status(400).json({ error: "Sektor industri wajib diisi." });

      const prompt = `Bertindaklah sebagai AI Trend Forecaster dan Digital Strategist. Temukan tren desain grafis dan promosi terbaru tahun 2026 untuk industri: "${industry}".
      Kembalikan respon JSON berikut (Pastikan valid JSON tanpa markdown wrappers):
      {
        "visual_trends": ["Tren warna/visual 1", "Tren warna/visual 2", "Tren warna/visual 3"],
        "promotion_trends": ["Taktik promosi viral 1", "Taktik promosi viral 2", "Taktik promosi viral 3"],
        "viral_hashtags": "#tag1 #tag2 #tag3 #tag4 #trend2026",
        "competitor_insights": "Analisis perilaku kompetitor saat ini di industri bersangkutan",
        "visual_recommendation": "Rekomendasi visual konkrit untuk memenangkan persaingan"
      }`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: prompt,
        config: { responseMimeType: 'application/json' }
      });

      let jsonText = response.text || "{}";
      jsonText = jsonText.trim();
      if (jsonText.startsWith("```")) {
        jsonText = jsonText.replace(/^```json\s*/i, "").replace(/```$/, "");
      }
      return res.json({ success: true, result: JSON.parse(jsonText) });
    } catch (error) {
      console.error("Trend Scanner API Error:", error);
      return res.status(500).json({ error: error?.message || "Gagal memindai tren lewat AI." });
    }
  });

  // API Endpoint: AI Design Battle
  app.post("/api/design-battle", async (req, res) => {
    try {
      if (!ai) return res.status(500).json({ error: "Kunci API Gemini tidak terkonfigurasi." });
      const { imageA, imageB } = req.body;
      if (!imageA || !imageB) {
        return res.status(400).json({ error: "Silakan unggah kedua gambar desain untuk dibandingkan." });
      }

      const parseImage = (img) => {
        let mimeType = "image/jpeg";
        let base64Data = img;
        if (img.startsWith("data:")) {
          const matches = img.match(/^data:([^;]+);base64,(.*)$/);
          if (matches && matches.length === 3) {
            mimeType = matches[1];
            base64Data = matches[2];
          }
        }
        return { data: base64Data, mimeType };
      };

      const imgAParsed = parseImage(imageA);
      const imgBParsed = parseImage(imageB);

      const prompt = `Bertindaklah sebagai Juri Ahli Desain Grafis Internasional. Bandingkan dua desain ini (Desain A sebagai gambar pertama, Desain B sebagai gambar kedua) secara objektif.
      Tentukan desain mana yang lebih menarik, lebih profesional, dan berpotensi tinggi meningkatkan penjualan (konversi).
      Kembalikan respon JSON berikut (Pastikan valid JSON tanpa markdown wrappers):
      {
        "winner": "Desain A" atau "Desain B",
        "visual_appeal_comparison": "Perbandingan mendalam mengenai daya tarik visual kedua gambar",
        "professionalism_comparison": "Perbandingan mendalam mengenai tingkat profesionalitas dan kerapian elemen",
        "conversion_potential": "Ulasan mengenai mana yang lebih memicu tindakan pembelian",
        "scores": {
          "design_a": { "appeal": 85, "prof": 82, "sales": 80 },
          "design_b": { "appeal": 90, "prof": 92, "sales": 95 }
        },
        "verdict_summary": "Ulasan kesimpulan mendalam mengapa desain pemenang lebih unggul dan apa yang bisa diperbaiki dari desain yang kalah."
      }`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: [
          { inlineData: { data: imgAParsed.data, mimeType: imgAParsed.mimeType } },
          { inlineData: { data: imgBParsed.data, mimeType: imgBParsed.mimeType } },
          { text: prompt }
        ],
        config: { responseMimeType: 'application/json' }
      });

      let jsonText = response.text || "{}";
      jsonText = jsonText.trim();
      if (jsonText.startsWith("```")) {
        jsonText = jsonText.replace(/^```json\s*/i, "").replace(/```$/, "");
      }
      return res.json({ success: true, result: JSON.parse(jsonText) });
    } catch (error) {
      console.error("Design Battle API Error:", error);
      return res.status(500).json({ error: error?.message || "Gagal menjalankan perbandingan desain lewat AI." });
    }
  });

  // API Endpoint: AI Sales Prediction
  app.post("/api/sales-prediction", async (req, res) => {
    try {
      if (!ai) return res.status(500).json({ error: "Kunci API Gemini tidak terkonfigurasi." });
      const { image, productName } = req.body;
      if (!image) return res.status(400).json({ error: "Foto desain wajib diunggah." });

      let mimeType = "image/jpeg";
      let base64Data = image;
      if (image.startsWith("data:")) {
        const matches = image.match(/^data:([^;]+);base64,(.*)$/);
        if (matches && matches.length === 3) {
          mimeType = matches[1];
          base64Data = matches[2];
        }
      }

      const prompt = `Bertindaklah sebagai Pakar Riset Pemasaran Digital dan Neuro-Marketing. Analisislah draf gambar desain produk/poster ini untuk memperkirakan efektivitas penjualannya.
      Nama Produk: "${productName || 'Produk UMKM'}"
      Kembalikan respon JSON berikut (Pastikan valid JSON tanpa markdown wrappers):
      {
        "visual_appeal_score": 88,
        "engagement_potential_score": 82,
        "conversion_potential_score": 78,
        "overall_sales_rating": "Sangat Tinggi / Tinggi / Sedang",
        "visual_strengths": ["Daya tarik visual positif 1", "Daya tarik visual positif 2"],
        "cta_effectiveness": "Penilaian efektivitas kalimat ajakan bertindak (CTA) pada draf desain ini",
        "optimization_suggestions": ["Saran optimasi jualan 1", "Saran optimasi jualan 2"]
      }`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: [
          { inlineData: { data: base64Data, mimeType } },
          { text: prompt }
        ],
        config: { responseMimeType: 'application/json' }
      });

      let jsonText = response.text || "{}";
      jsonText = jsonText.trim();
      if (jsonText.startsWith("```")) {
        jsonText = jsonText.replace(/^```json\s*/i, "").replace(/```$/, "");
      }
      return res.json({ success: true, result: JSON.parse(jsonText) });
    } catch (error) {
      console.error("Sales Prediction API Error:", error);
      return res.status(500).json({ error: error?.message || "Gagal melakukan prediksi penjualan lewat AI." });
    }
  });

  // API Endpoint: AI Packaging Designer
  app.post("/api/packaging-designer", async (req, res) => {
    try {
      if (!ai) return res.status(500).json({ error: "Kunci API Gemini tidak terkonfigurasi." });
      const { image, productName, packagingType } = req.body;
      if (!image) return res.status(400).json({ error: "Foto produk/desain wajib diunggah." });

      let mimeType = "image/jpeg";
      let base64Data = image;
      if (image.startsWith("data:")) {
        const matches = image.match(/^data:([^;]+);base64,(.*)$/);
        if (matches && matches.length === 3) {
          mimeType = matches[1];
          base64Data = matches[2];
        }
      }

      // 1. Generate text specifications
      const specPrompt = `Rancanglah spesifikasi desain kemasan bertipe: "${packagingType || "Stiker Produk"}" untuk produk: "${productName || "Produk Lokal"}" dari foto referensi ini. Kembalikan analisis dalam format JSON valid (Pastikan valid JSON tanpa markdown wrappers):
      {
        "recommended_materials": "Bahan kemasan yang disarankan (misal: Art Paper 260gr, Stiker Vinyl Matte, Kraft Paper)",
        "dimensions": "Rekomendasi ukuran/dimensi kemasan yang pas",
        "design_elements": {
          "layout": "Saran penempatan logo, nama produk, informasi legalitas",
          "colors": "Saran palette warna dominan & aksen",
          "fonts": "Saran jenis font pelengkap"
        },
        "legal_requirements": "Informasi legalitas yang wajib dicantumkan (misal: P-IRT, Logo Halal, Expired Date, Netto)",
        "professional_tips": ["Tips pengemasan profesional 1", "Tips pengemasan profesional 2"]
      }`;

      const specResponse = await callWithRetry(() => ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: [
          { inlineData: { data: base64Data, mimeType } },
          { text: specPrompt }
        ],
        config: { responseMimeType: 'application/json' }
      }));

      let jsonText = specResponse.text || "{}";
      jsonText = jsonText.trim();
      if (jsonText.startsWith("```")) {
        jsonText = jsonText.replace(/^```json\s*/i, "").replace(/```$/, "");
      }
      const specifications = JSON.parse(jsonText);

      // 2. Generate packing mockup image using free tier gemini-3.5-flash & imagen-3.0-generate-002
      const imagePrompt = `Bertindaklah sebagai packaging designer profesional. Rancanglah visual mockup 3D yang sangat indah, realistis, dan beresolusi tinggi untuk tipe kemasan: "${packagingType || "Stiker Produk"}" dari produk "${productName || "Produk Lokal"}", menggunakan logo/subjek produk dari foto referensi ini. Tampilkan kemasan dalam kondisi siap jual, dengan background studio netral, lighting dramatis, dan shadows realistis.`;
      
      const descResponse = await callWithRetry(() => ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: [
          { inlineData: { data: base64Data, mimeType } },
          { text: `Write a detailed, highly descriptive English image generation prompt for Imagen 3.
The prompt should combine the logo, label, design, or graphics from this reference image into a 3D packaging mockup of: "${packagingType || "Stiker Produk"}" for "${productName || "Produk Lokal"}".
Instruction:
"${imagePrompt}"

CRITICAL: The generated prompt MUST NOT include, describe, or request any added text, typography, letters, words, slogans, or labels on the packaging mockup, unless they are already present as a graphical logo element in the reference image. The output mockup should be clean, textless, and highly realistic. Output ONLY the raw prompt text, no extra explanation or formatting.` }
        ]
      }));

      const finalPrompt = descResponse.text?.trim() || imagePrompt;

      const imgGenResponse = await callWithRetry(() => ai.models.generateImages({
        model: 'imagen-3.0-generate-002',
        prompt: finalPrompt,
        config: {
          numberOfImages: 1,
          outputMimeType: 'image/jpeg',
          aspectRatio: '1:1',
        }
      }));

      let generatedImageUrl = "";
      if (imgGenResponse) {
        if (imgGenResponse.url) {
          generatedImageUrl = imgGenResponse.url;
        } else if (imgGenResponse.generatedImages && imgGenResponse.generatedImages[0]) {
          const imageObj = imgGenResponse.generatedImages[0].image;
          if (imageObj.imageBytes) {
            generatedImageUrl = saveImageToCache(imageObj.imageBytes);
          } else {
            generatedImageUrl = imageObj.url || "";
          }
        }
      }

      return res.json({ success: true, specifications, imageUrl: generatedImageUrl });
    } catch (error) {
      console.error("Packaging Designer API Error:", error);
      return res.status(500).json({ error: getFriendlyErrorMessage(error) });
    }
  });

  // API Endpoint: AI Booth & Store Mockup
  app.post("/api/booth-mockup", async (req, res) => {
    try {
      if (!ai) return res.status(500).json({ error: "Kunci API Gemini tidak terkonfigurasi." });
      const { image, boothType } = req.body;
      if (!image) return res.status(400).json({ error: "Foto desain poster/produk wajib diunggah." });

      let mimeType = "image/jpeg";
      let base64Data = image;
      if (image.startsWith("data:")) {
        const matches = image.match(/^data:([^;]+);base64,(.*)$/);
        if (matches && matches.length === 3) {
          mimeType = matches[1];
          base64Data = matches[2];
        }
      }

      // 1. Generate specifications
      const descPrompt = `Analisis bagaimana poster/desain yang diunggah dipasang pada lingkungan: "${boothType || "Booth Bazar"}". Berikan analisis dalam format JSON valid (Pastikan valid JSON tanpa markdown wrappers):
      {
        "fitting_description": "Bagaimana cara terbaik memasang/menempelkan poster ini agar terlihat mencolok dan rapi",
        "lighting_considerations": "Saran pencahayaan yang pas di lokasi bersangkutan agar warna poster tetap keluar",
        "physical_size_recommendation": "Rekomendasi ukuran fisik cetak spanduk/poster di lokasi ini",
        "visual_impact_review": "Analisis dampak psikologis bagi pengunjung/pejalan kaki yang melewati lokasi ini"
      }`;

      const descResponse = await callWithRetry(() => ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: [
          { inlineData: { data: base64Data, mimeType } },
          { text: descPrompt }
        ],
        config: { responseMimeType: 'application/json' }
      }));

      let jsonText = descResponse.text || "{}";
      jsonText = jsonText.trim();
      if (jsonText.startsWith("```")) {
        jsonText = jsonText.replace(/^```json\s*/i, "").replace(/```$/, "");
      }
      const descriptions = JSON.parse(jsonText);

      // 2. Generate booth mockup image using free tier gemini-3.5-flash & imagen-3.0-generate-002
      const imagePrompt = `Bertindaklah sebagai desainer ruang 3D dan visual merchandiser. Tampilkan draf desain poster dari foto referensi ini terpasang secara rapi, presisi, dan proporsional pada: "${boothType || "Booth Bazar"}". Pastikan poster terlihat menyatu dengan background booth bazaar, etalase toko, stand pameran, atau spanduk jalan, lengkap dengan lighting, bayangan ambient realistis, dan lingkungan komersial yang ramai atau modern.`;
      
      const descImageResponse = await callWithRetry(() => ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: [
          { inlineData: { data: base64Data, mimeType } },
          { text: `Write a detailed, highly descriptive English image generation prompt for Imagen 3.
The prompt should show how to place the design/poster from this reference image inside a: "${boothType || "Booth Bazar"}".
Instruction:
"${imagePrompt}"

CRITICAL: The generated prompt MUST NOT include, describe, or request any added text, typography, letters, words, slogans, or labels in the booth or environment. The output mockup should be completely clean and textless. Output ONLY the raw prompt text, no extra explanation or formatting.` }
        ]
      }));

      const finalPrompt = descImageResponse.text?.trim() || imagePrompt;

      const imgGenResponse = await callWithRetry(() => ai.models.generateImages({
        model: 'imagen-3.0-generate-002',
        prompt: finalPrompt,
        config: {
          numberOfImages: 1,
          outputMimeType: 'image/jpeg',
          aspectRatio: '4:3',
        }
      }));

      let generatedImageUrl = "";
      if (imgGenResponse) {
        if (imgGenResponse.url) {
          generatedImageUrl = imgGenResponse.url;
        } else if (imgGenResponse.generatedImages && imgGenResponse.generatedImages[0]) {
          const imageObj = imgGenResponse.generatedImages[0].image;
          if (imageObj.imageBytes) {
            generatedImageUrl = saveImageToCache(imageObj.imageBytes);
          } else {
            generatedImageUrl = imageObj.url || "";
          }
        }
      }

      return res.json({ success: true, descriptions, imageUrl: generatedImageUrl });
    } catch (error) {
      console.error("Booth Mockup API Error:", error);
      return res.status(500).json({ error: getFriendlyErrorMessage(error) });
    }
  });

  // Mode Middleware integrasi static asset
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on host 0.0.0.0 port ${PORT}`);
  });
}

startServer().catch(err => {
  console.error("Fatal startup error:", err);
});
