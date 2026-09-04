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

  function getRecipeProjectIds(cooking, recipeId) {
    const ids = [];
    for (const project of Array.isArray(cooking) ? cooking : []) {
      if (!project?.id) continue;
      if ((Array.isArray(project.recipes) ? project.recipes : []).some(use => use?.recipeId === recipeId)) ids.push(project.id);
    }
    return ids;
  }

  function getRecipeProjectState(cooking, recipeId) {
    const projectIds = getRecipeProjectIds(cooking, recipeId);
    if (!projectIds.length) return { kind:'none', projectId:null, projectIds };
    if (projectIds.length === 1) return { kind:'single', projectId:projectIds[0], projectIds };
    return { kind:'multiple', projectId:null, projectIds };
  }

  function setRecipeProject(state, recipeId, projectId, targetServings) {
    const source = state && typeof state === 'object' ? state : {};
    const recipes = clone(Array.isArray(source.recipes) ? source.recipes : []);
    const cooking = clone(Array.isArray(source.cooking) ? source.cooking : []);
    const recipe = recipes.find(item => item?.id === recipeId);
    if (!recipe) return { recipes, cooking };

    const previousUses = [];
    for (const project of cooking) {
      for (const use of Array.isArray(project?.recipes) ? project.recipes : []) {
        if (use?.recipeId === recipeId) previousUses.push({ projectId:project.id, use });
      }
      project.recipes = (Array.isArray(project?.recipes) ? project.recipes : []).filter(use => use?.recipeId !== recipeId);
    }

    const target = cooking.find(project => project?.id === projectId);
    if (!target) return { recipes, cooking };

    const explicit = Number(targetServings);
    const priorInTarget = previousUses.find(item => item.projectId === projectId)?.use?.targetServings;
    const priorAny = previousUses[0]?.use?.targetServings;
    const fallback = Number(target.servings) || Number(recipe.baseServings) || 1;
    const servings = Number.isFinite(explicit) && explicit >= 0
      ? explicit
      : Number.isFinite(Number(priorInTarget)) && Number(priorInTarget) >= 0
        ? Number(priorInTarget)
        : Number.isFinite(Number(priorAny)) && Number(priorAny) >= 0
          ? Number(priorAny)
          : fallback;
    target.recipes = Array.isArray(target.recipes) ? target.recipes : [];
    target.recipes.push({ recipeId, targetServings:servings });
    return { recipes, cooking };
  }

  function duplicateRecipe(recipes, recipeId, newId, createdAt) {
    const source = Array.isArray(recipes) ? recipes : [];
    const recipe = source.find(item => item?.id === recipeId);
    if (!recipe || !newId) return clone(source);
    const copy = clone(recipe);
    copy.id = newId;
    copy.name = `${String(recipe.name || '레시피').trim() || '레시피'} 복사본`;
    copy.createdAt = createdAt || new Date().toISOString();
    delete copy.updatedAt;
    return [copy, ...clone(source)];
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
    getRecipeProjectIds,
    getRecipeProjectState,
    setRecipeProject,
    duplicateRecipe,
    assignRecipeToProject,
    unlinkRecipeFromProject,
    moveProjectRecipe,
    formatIngredientLines,
    parseIngredientLines
  };
});
