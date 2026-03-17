"use server";

import { GoogleGenerativeAI } from "@google/generative-ai";
import { checkUser } from "@/lib/checkUser";
import { freePantryScans, proPantryScans } from "@/lib/arcjet";
import { request } from "@arcjet/next";

const STRAPI_URL = process.env.NEXT_PUBLIC_STRAPI_URL || "http://localhost:1337";
const STRAPI_API_TOKEN = process.env.STRAPI_API_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const STRAPI_NAME_FIELD = process.env.STRAPI_NAME_FIELD || "name";
const STRAPI_QUANTITY_FIELD = process.env.STRAPI_QUANTITY_FIELD || "quantity";
const STRAPI_NAME_FIELD_CANDIDATES = Array.from(
  new Set([STRAPI_NAME_FIELD, "name", "ingredientName", "title", "Name"])
);
const GEMINI_MODEL_CANDIDATES = Array.from(
  new Set([
    process.env.GEMINI_MODEL,
    "gemini-2.0-flash",
    "gemini-2.0-flash-lite",
  ].filter(Boolean))
);

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

function resolveNameFromAttributes(attributes) {
  for (const key of STRAPI_NAME_FIELD_CANDIDATES) {
    const value = attributes?.[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return "";
}

function normalizePantryItem(rawItem) {
  const attributes = rawItem?.attributes || rawItem || {};
  return {
    id: rawItem?.id ?? rawItem?.documentId ?? attributes?.id ?? null,
    documentId: rawItem?.documentId ?? rawItem?.id ?? attributes?.documentId ?? null,
    name: resolveNameFromAttributes(attributes),
    quantity: attributes?.[STRAPI_QUANTITY_FIELD] ?? attributes?.quantity ?? "",
    createdAt: attributes?.createdAt ?? rawItem?.createdAt ?? null,
  };
}

async function writePantryItemWithFallback({ method, itemId, name, quantity, owner }) {
  const endpoint = itemId
    ? `${STRAPI_URL}/api/pantry-items/${itemId}`
    : `${STRAPI_URL}/api/pantry-items`;

  let lastErrorData = null;

  for (const nameField of STRAPI_NAME_FIELD_CANDIDATES) {
    const dataPayload = {
      [nameField]: name,
      [STRAPI_QUANTITY_FIELD]: quantity,
    };

    if (owner !== undefined) {
      dataPayload.owner = owner;
    }

    const response = await fetch(endpoint, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${STRAPI_API_TOKEN}`,
      },
      body: JSON.stringify({ data: dataPayload }),
    });

    if (response.ok) {
      const json = await response.json();
      return json;
    }

    let errorData = null;
    try {
      errorData = await response.json();
    } catch {
      errorData = null;
    }

    lastErrorData = errorData;
    const invalidKey = errorData?.error?.details?.key;
    const shouldRetry = response.status === 400 && invalidKey === nameField;

    if (!shouldRetry) {
      console.error("Strapi Detailed Error:", errorData);
      throw new Error(errorData?.error?.message || "Failed to write pantry item");
    }
  }

  console.error("Strapi Detailed Error:", lastErrorData);
  throw new Error(lastErrorData?.error?.message || "Failed to write pantry item");
}

function extractIngredientsFromAiText(text) {
  const cleanText = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  try {
    return JSON.parse(cleanText);
  } catch {
    const start = cleanText.indexOf("[");
    const end = cleanText.lastIndexOf("]");
    if (start === -1 || end === -1 || end <= start) {
      throw new Error("AI response parsing failed.");
    }
    return JSON.parse(cleanText.slice(start, end + 1));
  }
}

function isModelNotFoundError(error) {
  const message = String(error?.message || "").toLowerCase();

  return (
    message.includes("404") ||
    message.includes("not found") ||
    message.includes("not supported") ||
    message.includes("no supported gemini model") ||
    message.includes("model") && message.includes("available")
  );
}

function isQuotaExceededError(error) {
  const message = String(error?.message || "");
  return (
    message.includes("429") &&
    (message.includes("Too Many Requests") ||
      message.includes("Quota exceeded") ||
      message.includes("quota"))
  );
}

function extractRetryDelaySeconds(message) {
  const text = String(message || "");
  const inlineMatch = text.match(/Please retry in\s+([0-9.]+)s/i);
  if (inlineMatch?.[1]) return Math.ceil(Number(inlineMatch[1]));

  const protoMatch = text.match(/"retryDelay":"(\d+)s"/i);
  if (protoMatch?.[1]) return Number(protoMatch[1]);

  return null;
}

function isGeminiAccessError(message) {
  const text = String(message || "").toLowerCase();
  return (
    text.includes("does not have access to any supported models") ||
    text.includes("no supported gemini model") ||
    text.includes("quota exceeded") ||
    text.includes("too many requests") ||
    text.includes("set up billing")
  );
}

async function generateIngredientsFromImage(imageFile, base64Image) {
  const prompt = `
You are a professional chef and ingredient recognition expert.
Analyze this image of a pantry/fridge and identify all visible food ingredients.

Return ONLY a valid JSON array:
[{"name": "ingredient name", "quantity": "estimated quantity", "confidence": 0.95}]
`;

  let lastError = null;

  for (const modelName of GEMINI_MODEL_CANDIDATES) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });

      const result = await model.generateContent([
        prompt,
        {
          inlineData: {
            mimeType: imageFile.type || "image/jpeg",
            data: base64Image,
          },
        },
      ]);

      const response = await result.response;
      const text = response.text();

      const ingredients = extractIngredientsFromAiText(text);

      return Array.isArray(ingredients) ? ingredients : [];
    } catch (error) {
      lastError = error;

      if (!isModelNotFoundError(error) && !isQuotaExceededError(error)) {
        throw error;
      }

      // Try next model
    }
  }

  if (isQuotaExceededError(lastError)) {
    throw new Error(
      "Gemini quota exceeded. Enable billing or use another API key."
    );
  }

  if (isModelNotFoundError(lastError)) {
    throw new Error(
      "Your Gemini API key does not have access to any supported models. Check billing or create a new API key from Google AI Studio."
    );
  }

  throw new Error("AI scan failed unexpectedly.");
}

export async function scanPantryImage(formData) {
  try {
    const user = await checkUser();
    if (!user) throw new Error("User not authenticated");

    const isPro = user.subscriptionTier === "pro";
    const arcjetClient = isPro ? proPantryScans : freePantryScans;
    const req = await request();

    const decision = await arcjetClient.protect(req, {
      userId: user.clerkId,
      requested: 1,
    });

    if (decision.isDenied()) {
      if (decision.reason.isRateLimit()) {
        throw new Error(
          isPro
            ? "Scan limit reached. Please contact support."
            : "Monthly scan limit reached. Upgrade to Pro for more scans."
        );
      }
      throw new Error("Request denied by security system");
    }

    const imageFile = formData.get("image");
    if (!imageFile) throw new Error("No image provided");

    const bytes = await imageFile.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const base64Image = buffer.toString("base64");

    const ingredients = await generateIngredientsFromImage(imageFile, base64Image);

    return {
      success: true,
      ingredients: ingredients.slice(0, 20),
      scansLimit: isPro ? "unlimited" : 10,
    };
  } catch (error) {
    const message = error?.message || "Failed to scan image";
    if (isGeminiAccessError(message)) {
      return {
        success: false,
        ingredients: [],
        scansLimit: 0,
        error: "AI scan is unavailable for this API key. Please enable billing in Google AI Studio or use Add Manually.",
      };
    }
    throw new Error(message);
  }
}

export async function saveToPantry(formData) {
  try {
    const user = await checkUser();
    if (!user) throw new Error("User not authenticated");

    const ingredientsJson = formData.get("ingredients");
    const ingredients = JSON.parse(ingredientsJson);
    const savedItems = [];

    for (const ingredient of ingredients) {
      const result = await writePantryItemWithFallback({
        method: "POST",
        name: String(ingredient.name || "").trim(),
        quantity: String(ingredient.quantity || "").trim(),
        owner: user.id,
      });

      savedItems.push(normalizePantryItem(result.data));
    }

    return { success: true, savedItems };
  } catch (error) {
    throw new Error(error.message || "Failed to save items");
  }
}

export async function addPantryItemManually(formData) {
  try {
    const user = await checkUser();
    if (!user) throw new Error("User not authenticated");

    const nameValue = formData.get("name");
    const quantityValue = formData.get("quantity");

    if (!nameValue || !quantityValue) {
      throw new Error("Name and quantity are required");
    }

    const data = await writePantryItemWithFallback({
      method: "POST",
      name: String(nameValue).trim(),
      quantity: String(quantityValue).trim(),
      owner: user.id,
    });

    return { success: true, item: normalizePantryItem(data.data) };
  } catch (error) {
    console.error("Manual add error:", error);
    throw new Error(error.message || "Failed to add item");
  }
}

export async function getPantryItems() {
  try {
    const user = await checkUser();
    if (!user) throw new Error("User not authenticated");

    const response = await fetch(
      `${STRAPI_URL}/api/pantry-items?filters[owner][id][$eq]=${user.id}&sort=createdAt:desc`,
      {
        headers: { Authorization: `Bearer ${STRAPI_API_TOKEN}` },
        cache: "no-store",
      }
    );

    if (!response.ok) throw new Error("Failed to fetch pantry items");
    const data = await response.json();
    const items = Array.isArray(data.data) ? data.data.map(normalizePantryItem) : [];
    return { success: true, items };
  } catch (error) {
    throw new Error(error.message || "Failed to load pantry");
  }
}

export async function deletePantryItems(formData) {
  try {
    const user = await checkUser();
    if (!user) throw new Error("User not authenticated");

    const itemId = formData.get("itemId");
    const response = await fetch(`${STRAPI_URL}/api/pantry-items/${itemId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${STRAPI_API_TOKEN}` },
    });

    if (!response.ok) throw new Error("Failed to delete item");
    return { success: true, message: "Item removed" };
  } catch (error) {
    throw new Error(error.message || "Failed to delete item");
  }
}

export async function updatePantryItems(formData) {
  try {
    const user = await checkUser();
    if (!user) throw new Error("User not authenticated");

    const itemId = formData.get("itemId");
    if (!itemId) throw new Error("Item id is required");

    const nameValue = formData.get("name");
    const quantityValue = formData.get("quantity");
    if (!nameValue || !quantityValue) {
      throw new Error("Name and quantity are required");
    }

    const data = await writePantryItemWithFallback({
      method: "PUT",
      itemId,
      name: String(nameValue).trim(),
      quantity: String(quantityValue).trim(),
    });

    return { success: true, item: normalizePantryItem(data.data) };
  } catch (error) {
    throw new Error(error.message || "Failed to update item");
  }
}
