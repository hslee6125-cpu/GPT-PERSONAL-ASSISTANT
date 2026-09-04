(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.RecipeUtils = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const clone = value => JSON.parse(JSON.stringify(value));

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

  function unlinkSourceDocumentFromRecipes(recipes, storedName) {
    const source = Array.isArray(recipes) ? recipes : [];
    return source.map(recipe => {
      if (recipe?.sourceDocument?.storedName !== storedName) return recipe;
      const next = { ...recipe };
      delete next.sourceDocument;
      return next;
    });
  }

  function getAssignedRecipeIds(cooking) {
    const ids = new Set();
    for (const project of Array.isArray(cooking) ? cooking : []) {
      for (const use of Array.isArray(project?.recipes) ? project.recipes : []) {
        if (use?.recipeId) ids.add(use.recipeId);
      }
    }
    return ids;
  }

  function getUnassignedRecipes(recipes, cooking) {
    const assigned = getAssignedRecipeIds(cooking);
    return (Array.isArray(recipes) ? recipes : []).filter(recipe => recipe?.id && !assigned.has(recipe.id));
  }

  function assignRecipeToProject(state, projectId, recipeId, targetServings) {
    const source = state && typeof state === 'object' ? state : {};
    const recipes = clone(Array.isArray(source.recipes) ? source.recipes : []);
    const cooking = clone(Array.isArray(source.cooking) ? source.cooking : []);
    const project = cooking.find(item => item?.id === projectId);
    if (!project || !recipes.some(recipe => recipe?.id === recipeId)) return { recipes, cooking };
    project.recipes = Array.isArray(project.recipes) ? project.recipes : [];
    if (project.recipes.some(use => use?.recipeId === recipeId)) return { recipes, cooking };
    const servings = Number(targetServings);
    project.recipes.push({recipeId,targetServings:Number.isFinite(servings)&&servings>=0?servings:0});
    return { recipes, cooking };
  }

  function unlinkRecipeFromProject(state, projectId, recipeId) {
    const source = state && typeof state === 'object' ? state : {};
    const recipes = clone(Array.isArray(source.recipes) ? source.recipes : []);
    const cooking = clone(Array.isArray(source.cooking) ? source.cooking : []);
    const project = cooking.find(item => item?.id === projectId);
    if (project) {
      project.recipes = (Array.isArray(project.recipes) ? project.recipes : [])
        .filter(use => use?.recipeId !== recipeId);
    }
    return { recipes, cooking };
  }

  function moveProjectRecipe(cooking, projectId, recipeId, delta) {
    const next = clone(Array.isArray(cooking) ? cooking : []);
    const project = next.find(item => item?.id === projectId);
    if (!project || !Array.isArray(project.recipes)) return next;
    const from = project.recipes.findIndex(use => use?.recipeId === recipeId);
    if (from < 0) return next;
    const to = Math.max(0, Math.min(project.recipes.length - 1, from + Number(delta || 0)));
    if (to === from) return next;
    const [item] = project.recipes.splice(from, 1);
    project.recipes.splice(to, 0, item);
    return next;
  }

  function formatIngredientLines(ingredients) {
    return (Array.isArray(ingredients) ? ingredients : []).map(ingredient => {
      const raw = ingredient?.amount ?? ingredient?.rawAmount ?? '';
      return [ingredient?.name ?? '', raw, ingredient?.unit ?? '', ingredient?.prep ?? ''].join(' | ');
    }).join('\n');
  }

  function parseIngredientLines(text) {
    return String(text || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean).map(line => {
      const [nameRaw='', amountRaw='', unitRaw='', ...prepParts] = line.split('|').map(part => part.trim());
      const amountNumber = amountRaw === '' ? null : Number(amountRaw.replace(/,/g,''));
      const ingredient = {
        name:nameRaw,
        amount:Number.isFinite(amountNumber)?amountNumber:null,
        unit:unitRaw,
        prep:prepParts.join(' | ').trim()
      };
      if (amountRaw && !Number.isFinite(amountNumber)) ingredient.rawAmount = amountRaw;
      return ingredient;
    }).filter(ingredient => ingredient.name);
  }

  return {
    deleteRecipeFromState,
    unlinkSourceDocumentFromRecipes,
    getAssignedRecipeIds,
    getUnassignedRecipes,
    assignRecipeToProject,
    unlinkRecipeFromProject,
    moveProjectRecipe,
    formatIngredientLines,
    parseIngredientLines
  };
});
