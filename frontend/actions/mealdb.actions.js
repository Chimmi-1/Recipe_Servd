"use server";

const MEALDB_BASE = "https://www.themealdb.com/api/json/v1/1";

/* ===========================
   Recipe of the Day
=========================== */
export async function getRecipeOfTheDay() {
  try {
    const response = await fetch(`${MEALDB_BASE}/random.php`, {
      next: { revalidate: 86400 }, // 24 hours
    });

    if (!response.ok) {
      throw new Error("Failed to fetch recipe of the day");
    }

    const data = await response.json();

    return {
      success: true,
      recipe: data.meals?.[0] || null,
    };
  } catch (error) {
    console.error("Recipe fetch error:", error);
    return { success: false, recipe: null };
  }
}

/* ===========================
   Categories
=========================== */
export async function getCategories() {
  try {
    const response = await fetch(`${MEALDB_BASE}/list.php?c=list`, {
      next: { revalidate: 604800 }, // 1 week
    });

    if (!response.ok) {
      throw new Error("Failed to fetch categories");
    }

    const data = await response.json();

    return {
      success: true,
      categories: data.meals || [],
    };
  } catch (error) {
    console.error("Categories fetch error:", error);
    return { success: false, categories: [] };
  }
}

/* ===========================
   Areas
=========================== */
export async function getAreas() {
  try {
    const response = await fetch(`${MEALDB_BASE}/list.php?a=list`, {
      next: { revalidate: 604800 }, // 1 week
    });

    if (!response.ok) {
      throw new Error("Failed to fetch areas");
    }

    const data = await response.json();

    return {
      success: true,
      areas: data.meals || [],
    };
  } catch (error) {
    console.error("Areas fetch error:", error);
    return { success: false, areas: [] };
  }
}

/* ===========================
   Meals by Category
=========================== */
export async function getMealsByCategory(category) {
  try {
    const response = await fetch(
      `${MEALDB_BASE}/filter.php?c=${encodeURIComponent(category)}`
    );

    if (!response.ok) {
      throw new Error("Failed to fetch meals by category");
    }

    const data = await response.json();

    return {
      success: true,
      meals: data.meals || [],
    };
  } catch (error) {
    console.error("Meals by category error:", error);
    return { success: false, meals: [] };
  }
}

/* ===========================
   Meals by Area
=========================== */
export async function getMealsByArea(area) {
  try {
    const response = await fetch(
      `${MEALDB_BASE}/filter.php?a=${encodeURIComponent(area)}`
    );

    if (!response.ok) {
      throw new Error("Failed to fetch meals by area");
    }

    const data = await response.json();

    return {
      success: true,
      meals: data.meals || [],
    };
  } catch (error) {
    console.error("Meals by area error:", error);
    return { success: false, meals: [] };
  }
}
