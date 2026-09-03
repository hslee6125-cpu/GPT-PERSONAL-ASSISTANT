(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.RecipeUtils = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function deleteRecipeFromState(state, recipeId) {
    const source = state && typeof state === 'object' ? state : {};
    const recipes = Array.isArray(source.recipes) ? source.recipes : [];
    const cooking = Array.isArray(source.cooking) ? source.cooking : [];

    return {
      recipes: recipes.filter(recipe => recipe?.id !== recipeId),
      cooking: cooking.map(project => ({
        ...project,
        recipes: Array.isArray(project?.recipes)
          ? project.recipes.filter(use => use?.recipeId !== recipeId)
          : []
      }))
    };
  }

  return { deleteRecipeFromState };
});
