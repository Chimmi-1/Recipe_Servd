"use server";

import { GoogleGenerativeAI } from "@google/generative-ai";
import { checkUser } from "@/lib/checkUser";
import { freeMealRecommendations, proMealRecommendations } from "@/lib/arcjet";
import { request } from "@arcjet/next";

const STRAPI_URL = process.env.NEXT_PUBLIC_STRAPI_URL || "http://localhost:1337";
const STRAPI_API_TOKEN = process.env.STRAPI_API_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const UNSPLASH_ACCESS_KEY = process.env.UNSPLASH_ACCESS_KEY;

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

export async function getRecipesByPantryIngredients() {
  try {
    const user = await checkUser();
    if (!user) {
      throw new Error("User not authenticated");
    }

    const isPro = user.subscriptionTier === "pro";

    const arcjetClient = isPro ? proMealRecommendations : freeMealRecommendations;
    const req = await request();

    const decision = await arcjetClient.protect(req, {
      userId: user.clerkId,
      requested: 1,
    });

    if (decision.isDenied()) {
      if (decision.reason.isRateLimit()) {
        return {
          success: false,
          status: "rate_limit",
          recommendationsLimit: isPro ? "unlimited" : 5,
          message: isPro
            ? "Monthly recipe limit reached. Please contact support if you need more recommendations."
            : "Monthly recipe limit reached. Upgrade to Pro for unlimited recommendations!",
        };
      }
      throw new Error("Request denied by security system");
    }

    const pantryQueries = [
      `pagination[pageSize]=100&filters[$or][0][owner][id][$eq]=${user.id}&filters[$or][1][owner][clerkId][$eq]=${user.clerkId}`,
      `pagination[pageSize]=100&filters[$or][0][user][id][$eq]=${user.id}&filters[$or][1][user][clerkId][$eq]=${user.clerkId}`,
      `pagination[pageSize]=100&filters[clerkId][$eq]=${user.clerkId}`,
      `pagination[pageSize]=100`,
    ];

    let pantryData = { data: [] };
    let hasSuccessfulPantryFetch = false;

    for (const query of pantryQueries) {
      const pantryResponse = await fetch(
        `${STRAPI_URL}/api/pantry-items?${query}`,
        {
          headers: { Authorization: `Bearer ${STRAPI_API_TOKEN}` },
          cache: "no-store",
        }
      );

      if (!pantryResponse.ok) continue;

      hasSuccessfulPantryFetch = true;
      const candidate = await pantryResponse.json();
      const candidateItems = Array.isArray(candidate?.data) ? candidate.data : [];

      if (candidateItems.length > 0) {
        console.log("✅ Pantry item sample:", JSON.stringify(candidateItems[0], null, 2));
        pantryData = candidate;
        break;
      }
    }

    if (!hasSuccessfulPantryFetch) {
      throw new Error("Failed to fetch pantry items");
    }

    if (!pantryData.data || pantryData.data.length === 0) {
      return {
        success: false,
        status: "empty_pantry",
        recommendationsLimit: isPro ? "unlimited" : 5,
        message: "Your pantry is empty. Add ingredients first!",
      };
    }

    const ingredients = pantryData.data
      .map((item) => {
        const attrs = item?.attributes || item || {};
        return attrs.name || attrs.ingredientName || attrs.title || attrs.ingredient || "";
      })
      .filter(Boolean)
      .join(", ");

    if (!ingredients) {
      return {
        success: false,
        status: "empty_pantry",
        recommendationsLimit: isPro ? "unlimited" : 5,
        message: "No valid pantry ingredients found. Please add ingredients first!",
      };
    }

    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });

    const prompt = `
You are a professional chef and recipe expert. Generate exactly 5 different recipe suggestions using these available ingredients: "${ingredients}"

Return ONLY a valid JSON array containing exactly 5 recipe objects (no markdown, no explanations, no wrapping object).
Each recipe object must follow this exact structure:

[
  {
    "title": "Creative recipe name using the available ingredients",
    "description": "Brief 2-3 sentence description of the dish",
    "category": "Must be ONE of these EXACT values: breakfast, lunch, dinner, snack, dessert",
    "cuisine": "Must be ONE of these EXACT values: italian, chinese, mexican, indian, american, thai, japanese, mediterranean, french, korean, vietnamese, spanish, greek, turkish, moroccan, brazilian, caribbean, middle-eastern, british, german, portuguese, other",
    "prepTime": 15,
    "cookTime": 30,
    "servings": 4,
    "ingredients": [{"item": "ingredient name", "amount": "quantity with unit", "category": "Protein|Vegetable|Spice|Dairy|Grain|Other"}],
    "instructions": [{"step": 1, "title": "Brief step title", "instruction": "Detailed step instruction", "tip": "Optional cooking tip"}],
    "nutrition": {"calories": "350", "protein": "12", "carbs": "45", "fat": "10"},
    "tips": ["General cooking tip 1", "General cooking tip 2"],
    "substitutions": [{"original": "ingredient name", "alternatives": ["substitute 1", "substitute 2"]}]
  }
]

IMPORTANT RULES:
- Return EXACTLY 5 recipes in a JSON array
- prepTime, cookTime, servings must be numbers (not strings)
- nutrition values must be strings of numbers only (e.g. "350")
- category must be one of: breakfast, lunch, dinner, snack, dessert
- cuisine must be lowercase and from the allowed list
`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    let recipeSuggestions;
    try {
      const cleanText = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      recipeSuggestions = JSON.parse(cleanText);
    } catch (parseError) {
      console.error("Failed to parse Gemini response:", text);
      throw new Error("Failed to generate recipe suggestions. Please try again.");
    }

    const recipesArray = Array.isArray(recipeSuggestions) ? recipeSuggestions : [recipeSuggestions];

    return {
      success: true,
      status: "ok",
      recipes: recipesArray,
      ingredientsUsed: ingredients,
      recommendationsLimit: isPro ? "unlimited" : 5,
      message: "Recipe suggestions generated successfully!",
    };
  } catch (error) {
    console.error("❌ Error in generating recipe suggestions:", error);
    throw new Error(error.message || "Failed to get recipe suggestions");
  }
}

// ✅ FIX 1: normalizeTitle is a FUNCTION — call it with (title) every time
function normalizeTitle(title) {
  return title
    .trim()
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

async function fetchRecipeImage(recipeName) {
  try {
    if (!UNSPLASH_ACCESS_KEY) {
      console.warn("⚠️ UNSPLASH_ACCESS_KEY not set, skipping image fetch");
      return "";
    }

    const response = await fetch(
      `https://api.unsplash.com/search/photos?query=${encodeURIComponent(recipeName)}&per_page=1&orientation=landscape`,
      { headers: { Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}` } }
    );

    if (!response.ok) {
      console.error("❌ Unsplash API error:", response.statusText);
      return "";
    }

    const data = await response.json();
    if (data.results && data.results.length > 0) {
      console.log("✅ Found Unsplash image:", data.results[0].urls.regular);
      return data.results[0].urls.regular;
    }

    return "";
  } catch (error) {
    console.error("❌ Error fetching Unsplash image:", error);
    return "";
  }
}

export async function getOrGenerateRecipe(formData) {
  try {
    const user = await checkUser();
    if (!user) throw new Error("User not authenticated");

    const recipeName = formData.get("recipeName");
    if (!recipeName) throw new Error("Recipe name is required");

    const isPro = user.subscriptionTier === "pro";

    // ✅ FIX 1: Call normalizeTitle as a FUNCTION (was missing parentheses in original)
    const normalizedTitle = normalizeTitle(recipeName);

    // Step 1: Check if recipe already exists in DB
    const searchResponse = await fetch(
      // ✅ FIX 1 (cont): Use normalizedTitle (the string), not normalizeTitle (the function)
      `${STRAPI_URL}/api/recipes?filters[title][$eqi]=${encodeURIComponent(normalizedTitle)}&populate=*`,
      {
        headers: { Authorization: `Bearer ${STRAPI_API_TOKEN}` },
        cache: "no-store",
      }
    );

    if (searchResponse.ok) {
      const searchData = await searchResponse.json();

      if (searchData.data && searchData.data.length > 0) {
        const savedRecipeResponse = await fetch(
          `${STRAPI_URL}/api/saved-recipes?filters[user][id][$eq]=${user.id}&filters[recipe][id][$eq]=${searchData.data[0].id}`,
          {
            headers: { Authorization: `Bearer ${STRAPI_API_TOKEN}` },
            cache: "no-store",
          }
        );

        let isSaved = false;
        if (savedRecipeResponse.ok) {
          const savedData = await savedRecipeResponse.json();
          isSaved = savedData.data && savedData.data.length > 0;
        }

        return {
          success: true,
          recipe: searchData.data[0],
          recipeId: searchData.data[0].id,
          isSaved,
          fromDatabase: true,
          isPro,
          message: "Recipe loaded from database",
        };
      }
    }

    // Step 2: Generate with Gemini
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });

    const prompt = `
You are a professional chef and recipe expert. Generate a detailed recipe for: "${normalizedTitle}"

CRITICAL: The "title" field MUST be EXACTLY: "${normalizedTitle}"

Return ONLY a valid JSON object (no markdown, no explanations):
{
  "title": "${normalizedTitle}",
  "description": "Brief 2-3 sentence description",
  "category": "ONE of: breakfast, lunch, dinner, snack, dessert",
  "cuisine": "ONE of: italian, chinese, mexican, indian, american, thai, japanese, mediterranean, french, korean, vietnamese, spanish, greek, turkish, moroccan, brazilian, caribbean, middle-eastern, british, german, portuguese, other",
  "prepTime": 15,
  "cookTime": 30,
  "servings": 4,
  "ingredients": [{"item": "name", "amount": "qty with unit", "category": "Protein|Vegetable|Spice|Dairy|Grain|Other"}],
  "instructions": [{"step": 1, "title": "Step title", "instruction": "Detailed instruction", "tip": "Optional tip"}],
  "nutrition": {"calories": "350", "protein": "12g", "carbs": "45g", "fat": "10g"},
  "tips": ["tip 1", "tip 2", "tip 3"],
  "substitutions": [{"original": "ingredient", "alternatives": ["sub1", "sub2"]}]
}

RULES:
- prepTime, cookTime, servings must be NUMBERS not strings
- Include 6-10 steps
- category and cuisine must be lowercase from the allowed list
`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    let recipeData;
    try {
      const cleanText = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      recipeData = JSON.parse(cleanText);
    } catch (parseError) {
      console.error("Failed to parse Gemini response:", text);
      throw new Error("Failed to generate recipe. Please try again.");
    }

    // ✅ FIX 1 (cont): normalizedTitle is the string value
    recipeData.title = normalizedTitle;

    const category = recipeData.category?.toLowerCase() || "dinner";
    const cuisine = recipeData.cuisine?.toLowerCase() || "other";

    // Step 3: Fetch image
    // ✅ FIX 1 (cont): Pass normalizedTitle (string) to fetchRecipeImage
    const imageUrl = await fetchRecipeImage(normalizedTitle);

    // ✅ FIX 2: Stringify JSON fields before sending to Strapi
    // Strapi stores complex objects as JSON — they must be sent as JSON strings
    // OR your Strapi schema fields must be of type "JSON"
    // If you get "Invalid key" errors, these fields are missing from your Strapi schema.
    // Go to Strapi Admin → Content-Type Builder → Recipe → Add these as JSON fields:
    // ingredients, instructions, nutrition, tips, substitutions
    const strapiRecipeData = {
      data: {
        title: normalizedTitle,
        description: recipeData.description,
        cuisine,
        category,
        prepTime: Number(recipeData.prepTime),
        cookTime: Number(recipeData.cookTime),
        servings: Number(recipeData.servings),
        imageUrl: imageUrl || "",
        isPublic: true,
        author: user.id,
        // ✅ These fields must exist as JSON type in your Strapi Recipe schema
        ingredients: recipeData.ingredients,
        instructions: recipeData.instructions,
        nutrition: recipeData.nutrition,
        tips: recipeData.tips,
        substitutions: recipeData.substitutions,
      },
    };

    const createRecipeResponse = await fetch(`${STRAPI_URL}/api/recipes`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${STRAPI_API_TOKEN}`,
      },
      body: JSON.stringify(strapiRecipeData),
    });

    if (!createRecipeResponse.ok) {
      const errorText = await createRecipeResponse.text();
      console.error("❌ Failed to save recipe to Strapi:", errorText);

      // ✅ FIX 3: Even if Strapi save fails, still return the recipe to the user
      // so the page doesn't show an error — the recipe was generated successfully
      console.warn("⚠️ Returning generated recipe despite Strapi save failure");
      return {
        success: true,
        recipe: {
          ...recipeData,
          title: normalizedTitle,
          category,
          cuisine,
          imageUrl: imageUrl || "",
        },
        recipeId: null,
        isSaved: false,
        fromDatabase: false,
        recommendationsLimit: isPro ? "unlimited" : 5,
        isPro,
        message: "Recipe generated (note: could not save to database)",
      };
    }

    const createdRecipe = await createRecipeResponse.json();

    return {
      success: true,
      recipe: {
        ...recipeData,
        title: normalizedTitle,
        category,
        cuisine,
        imageUrl: imageUrl || "",
      },
      recipeId: createdRecipe.data.id,
      isSaved: false,
      fromDatabase: false,
      recommendationsLimit: isPro ? "unlimited" : 5,
      isPro,
      message: "Recipe generated and saved successfully!",
    };
  } catch (error) {
    console.error("❌ Error in getOrGenerateRecipe:", error);
    throw new Error(error.message || "Failed to load recipe");
  }
}

export async function saveRecipeToCollection(formData) {
  try {
    const user = await checkUser();
    if (!user) throw new Error("User not authenticated");

    const recipeId = formData.get("recipeId");
    if (!recipeId) throw new Error("RecipeID is required");

    const existingResponse = await fetch(
      `${STRAPI_URL}/api/saved-recipes?filters[user][id][$eq]=${user.id}&filters[recipe][id][$eq]=${recipeId}`,
      {
        headers: { Authorization: `Bearer ${STRAPI_API_TOKEN}` },
        cache: "no-store",
      }
    );

    if (existingResponse.ok) {
      const existingData = await existingResponse.json();
      if (existingData.data && existingData.data.length > 0) {
        return { success: true, alreadySaved: true, message: "Recipe is already in your collection" };
      }
    }

    const saveResponse = await fetch(`${STRAPI_URL}/api/saved-recipes`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${STRAPI_API_TOKEN}`,
      },
      body: JSON.stringify({
        data: { user: user.id, recipe: recipeId, savedAt: new Date().toISOString() },
      }),
    });

    if (!saveResponse.ok) {
      const errorText = await saveResponse.text();
      console.error("❌ Failed to save recipe:", errorText);
      throw new Error("Failed to save recipe to collection");
    }

    const savedRecipe = await saveResponse.json();
    return { success: true, alreadySaved: false, savedRecipe: savedRecipe.data, message: "Recipe saved to your collection!" };
  } catch (error) {
    console.error("❌ Error saving recipe to collection:", error);
    throw new Error(error.message || "Failed to save recipe");
  }
}

export async function removeReccipeFromCollection(formData) {
  try {
    const user = await checkUser();
    if (!user) throw new Error("User not authenticated");

    const recipeId = formData.get("recipeId");
    if (!recipeId) throw new Error("Recipe ID is required");

    const searchResponse = await fetch(
      `${STRAPI_URL}/api/saved-recipes?filters[user][id][$eq]=${user.id}&filters[recipe][id][$eq]=${recipeId}`,
      {
        headers: { Authorization: `Bearer ${STRAPI_API_TOKEN}` },
        cache: "no-store",
      }
    );

    if (!searchResponse.ok) throw new Error("Failed to find saved recipe");

    const searchData = await searchResponse.json();

    if (!searchData.data || searchData.data.length === 0) {
      return { success: true, message: "Recipe was not in your collection" };
    }

    const savedRecipeId = searchData.data[0].id;
    const deleteResponse = await fetch(`${STRAPI_URL}/api/saved-recipes/${savedRecipeId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${STRAPI_API_TOKEN}` },
    });

    if (!deleteResponse.ok) throw new Error("Failed to remove recipe from collection");

    return { success: true, message: "Recipe removed from your collection" };
  } catch (error) {
    console.error("❌ Error removing recipe from collection:", error);
    throw new Error(error.message || "Failed to remove recipe");
  }
}


//Get user's saved recipes
export async function getSavedRecipes(){
  try {
    const user = await checkUser();
    if(!user){
      throw new Error("User not authenticated");
    }

     // Fetch saved recipes with populated recipe data
    const response = await fetch(
      `${STRAPI_URL}/api/saved-recipes?filters[user][id][$eq]=${user.id}&populate[recipe][populate]=*&sort=savedAt:desc`,
      {
        headers: {
          Authorization: `Bearer ${STRAPI_API_TOKEN}`,
        },
        cache: "no-store",
      }
    );

    if (!response.ok) {
      throw new Error("Failed to fetch saved recipes");
    }

    const data = await response.json();

    // Extract recipes from saved-recipes relations
    const recipes = data.data
      .map((savedRecipe) => savedRecipe.recipe)
      .filter(Boolean); // Remove any null recipes

    return {
      success: true,
      recipes,
      count: recipes.length,
    };
    
  } catch (error) {
     console.error("Error fetching saved recipes:", error);
    throw new Error(error.message || "Failed to load saved recipes");
  }
}