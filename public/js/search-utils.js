(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.SearchUtils=api;
})(typeof window!=='undefined'?window:globalThis,function(){
  function normalizeText(value){
    return String(value??'').normalize('NFKC').toLocaleLowerCase('ko-KR').replace(/\s+/g,' ').trim();
  }

  function parseCommand(text){
    const raw=String(text??'').trim();
    const match=raw.match(/^(\/search|\/s)(?=\s|$)/i);
    if(!match)return{isSearch:false,query:'',alias:null};
    return{isSearch:true,query:raw.slice(match[0].length).trim(),alias:match[1].toLowerCase()};
  }

  function queryTerms(query){
    return normalizeText(query).split(' ').filter(Boolean);
  }

  function assistantRecord(item){
    if(!item||item.deletedAt)return null;
    const kind=item.scheduleOnly?'schedule':item.activityOnly?'activity':(item.type||'todo');
    const tags=Array.isArray(item.tags)?item.tags:[];
    const fields=[item.title,item.details,item.projectTitle,item.dueDate,...tags];
    return{
      kind,id:item.id,title:String(item.title||'제목 없음'),snippet:String(item.details||''),projectTitle:String(item.projectTitle||''),
      dueDate:item.dueDate||null,done:!!item.done,createdAt:item.createdAt||'',fields
    };
  }

  function recipeRecord(recipe,cookingProjects){
    if(!recipe)return null;
    const linked=(cookingProjects||[]).filter(p=>(p.recipes||[]).some(use=>use?.recipeId===recipe.id));
    const ingredientFields=[];
    for(const ingredient of recipe.ingredients||[]){
      if(typeof ingredient==='string')ingredientFields.push(ingredient);
      else if(ingredient)ingredientFields.push(ingredient.name,ingredient.prep,ingredient.amount,ingredient.rawAmount,ingredient.unit);
    }
    const steps=(recipe.steps||[]).map(step=>typeof step==='string'?step:(step?.text||step?.description||JSON.stringify(step||'')));
    const linkedNames=linked.map(p=>p.name);
    const fields=[recipe.name,recipe.notes,recipe.sourceFilename,recipe.baseServings,...ingredientFields,...steps,...linkedNames];
    const snippet=String(recipe.notes||ingredientFields.filter(Boolean).slice(0,4).join(' · ')||'');
    return{
      kind:'recipe',id:recipe.id,title:String(recipe.name||'이름 없는 레시피'),snippet,projectTitle:linkedNames.join(', '),
      dueDate:null,done:false,createdAt:recipe.createdAt||'',fields
    };
  }

  function cookingRecord(project,recipes){
    if(!project)return null;
    const linkedNames=(project.recipes||[]).map(use=>(recipes||[]).find(r=>r.id===use?.recipeId)?.name).filter(Boolean);
    const fields=[project.name,project.note,project.date,project.servings,...linkedNames];
    return{
      kind:'cooking',id:project.id,title:String(project.name||'이름 없는 요리 프로젝트'),snippet:String(project.note||linkedNames.join(' · ')),projectTitle:'',
      dueDate:project.date||null,done:false,createdAt:project.createdAt||'',fields
    };
  }

  function rankRecord(record,normalizedQuery,terms){
    const title=normalizeText(record.title);
    const combined=normalizeText((record.fields||[]).filter(v=>v!==null&&v!==undefined).join(' '));
    if(!terms.length||!terms.every(term=>combined.includes(term)))return 0;
    if(title===normalizedQuery)return 400;
    if(title.startsWith(normalizedQuery))return 300;
    if(title.includes(normalizedQuery))return 200;
    return 100;
  }

  function searchAll(state,query,options={}){
    const normalizedQuery=normalizeText(query);
    const terms=queryTerms(query);
    const requested=Number(options.limit);
    const limit=Number.isFinite(requested)&&requested>=0?Math.min(50,Math.floor(requested)):50;
    if(!normalizedQuery||!terms.length)return{total:0,results:[]};
    const assistant=Array.isArray(state?.assistant)?state.assistant:[];
    const recipes=Array.isArray(state?.recipes)?state.recipes:[];
    const cooking=Array.isArray(state?.cooking)?state.cooking:[];
    const records=[
      ...assistant.map(assistantRecord),
      ...recipes.map(recipe=>recipeRecord(recipe,cooking)),
      ...cooking.map(project=>cookingRecord(project,recipes))
    ].filter(Boolean);
    const matches=records.map(record=>({...record,score:rankRecord(record,normalizedQuery,terms)})).filter(record=>record.score>0);
    matches.sort((a,b)=>{
      if(b.score!==a.score)return b.score-a.score;
      const timeB=Date.parse(b.createdAt||'')||0,timeA=Date.parse(a.createdAt||'')||0;
      if(timeB!==timeA)return timeB-timeA;
      return String(a.title).localeCompare(String(b.title),'ko-KR');
    });
    return{total:matches.length,results:matches.slice(0,limit)};
  }

  return{parseCommand,searchAll,normalizeText};
});
