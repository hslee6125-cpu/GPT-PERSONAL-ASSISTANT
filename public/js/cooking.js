(function(root){
  const GPA=root.GPA,s=GPA.state,$=GPA.$,esc=GPA.esc;
  function currentProject(){const pid=$('activeCookingProject')?.value;return s.cooking.find(p=>p.id===pid)||null;}
  function showMode(mode){
    const target=mode==='projects'?'projects':'library';
    document.querySelectorAll('[data-cooking-mode]').forEach(btn=>btn.classList.toggle('active',btn.dataset.cookingMode===target));
    $('recipeLibraryPanel')?.classList.toggle('active',target==='library');
    $('cookingProjectsPanel')?.classList.toggle('active',target==='projects');
  }
  function createProject(){
    const name=$('cookingProjectName').value.trim();if(!name)return alert('프로젝트명을 입력하세요.');
    const servings=Number($('cookingProjectServings').value);
    const project={id:GPA.uid(),name,date:$('cookingProjectDate').value||null,servings:Number.isFinite(servings)&&servings>0?servings:null,note:$('cookingProjectNote').value.trim(),recipes:[],createdAt:new Date().toISOString()};
    s.cooking.unshift(project);$('cookingProjectName').value='';$('cookingProjectDate').value='';$('cookingProjectServings').value='';$('cookingProjectNote').value='';GPA.persist('cooking-project-create');
    requestAnimationFrame(()=>{if($('activeCookingProject')){$('activeCookingProject').value=project.id;renderEditor();showMode('projects');}});
  }
  function removeProject(id){if(!confirm('요리 프로젝트를 삭제할까요?\n연결된 레시피는 삭제되지 않고 레시피 보관함에 그대로 남습니다.'))return;s.cooking=s.cooking.filter(p=>p.id!==id);GPA.persist('cooking-project-delete');}
  function openProject(id){const sel=$('activeCookingProject');if(!sel||!s.cooking.some(p=>p.id===id))return;sel.value=id;renderEditor();showMode('projects');}
  function unlinkRecipe(projectId,recipeId){if(!confirm('이 프로젝트에서 레시피를 빼시겠습니까?\n레시피는 보관함에 그대로 남습니다.'))return;const next=RecipeUtils.unlinkRecipeFromProject({recipes:s.recipes,cooking:s.cooking},projectId,recipeId);s.recipes=next.recipes;s.cooking=next.cooking;GPA.persist('recipe-unlink');}
  function moveRecipe(projectId,recipeId,delta){s.cooking=RecipeUtils.moveProjectRecipe(s.cooking,projectId,recipeId,delta);GPA.persist('recipe-order');}
  function setTarget(projectId,recipeId,value){const p=s.cooking.find(x=>x.id===projectId),u=(p?.recipes||[]).find(x=>x.recipeId===recipeId);if(u){u.targetServings=Math.max(0,Number(value)||0);GPA.persist('recipe-servings');}}
  function projectMeta(p){const bits=[];if(p.date)bits.push(p.date);if(Number(p.servings)>0)bits.push(`${p.servings}인`);bits.push(`레시피 ${(p.recipes||[]).length}개`);return bits.join(' · ');}
  function renderProjects(){
    const count=$('cookingProjectCount'),list=$('cookingProjectList'),sel=$('activeCookingProject');if(!count||!list||!sel)return;
    count.textContent=`${s.cooking.length}개`;
    list.innerHTML=s.cooking.length?s.cooking.map(p=>`<div class="project-card"><div class="itemrow"><button class="project-open-button" data-project-open="${p.id}"><div class="title">${esc(p.name)}</div><div class="recipe-sub">${esc(projectMeta(p))}</div><div class="details">${esc(p.note||'')}</div></button><button class="small ghost danger" data-cooking-delete="${p.id}">삭제</button></div></div>`).join(''):'<div class="empty">요리 프로젝트가 없습니다.</div>';
    const prev=sel.value;sel.innerHTML=s.cooking.length?s.cooking.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join(''):'<option value="">프로젝트 없음</option>';if(s.cooking.some(p=>p.id===prev))sel.value=prev;else if(s.cooking[0])sel.value=s.cooking[0].id;
    GPA.recipes?.updateProjectSaveSelect();renderEditor();
  }
  function renderEditor(){
    const box=$('projectEditor');if(!box)return;const p=currentProject();if(!p){box.innerHTML='<div class="empty">프로젝트를 먼저 만들어 주세요.</div>';return;}
    const uses=Array.isArray(p.recipes)?p.recipes:[];
    box.innerHTML=`<div class="project-summary"><span class="chip">${esc(p.date||'날짜 미정')}</span><span class="chip">${Number(p.servings)>0?`${esc(p.servings)}인`:'인원 미정'}</span><span class="chip">코스 ${uses.length}개</span></div>${p.note?`<div class="details" style="margin-bottom:12px">${esc(p.note)}</div>`:''}<div class="project-editor-heading"><h3>코스 레시피</h3><button class="small ghost" data-project-open-library>레시피 보관함 열기</button></div><div class="project-course-list">${uses.length?uses.map((use,index)=>{const r=s.recipes.find(x=>x.id===use.recipeId);if(!r)return`<div class="empty">삭제된 레시피 링크</div>`;return`<div class="course-recipe-card"><div class="course-recipe-top"><div class="course-index">${index+1}</div><div><div class="recipe-title">${esc(r.name)}</div><div class="recipe-sub">기준 ${esc(r.baseServings??'-')}인분 · 재료 ${(r.ingredients||[]).length}개${r.sourceFilename?` · Word: ${esc(r.sourceFilename)}`:''}</div></div><div class="target-serving-field"><span>목표 인분</span><input type="number" min="0" step="1" value="${esc(use.targetServings)}" data-target-project="${p.id}" data-target-recipe="${r.id}" title="목표 인분"></div><div class="course-actions"><button class="small ghost" data-recipe-move="-1" data-project-id="${p.id}" data-recipe-id="${r.id}" ${index===0?'disabled':''}>↑</button><button class="small ghost" data-recipe-move="1" data-project-id="${p.id}" data-recipe-id="${r.id}" ${index===uses.length-1?'disabled':''}>↓</button><button class="small ghost" data-recipe-open-library="${r.id}">보관함에서 열기</button><button class="small ghost" data-cooking-remove="${p.id}" data-recipe-id="${r.id}">프로젝트에서 빼기</button></div></div></div>`;}).join(''):'<div class="empty">이 프로젝트에 지정된 레시피가 없습니다.<br>레시피 보관함에서 프로젝트를 선택하면 여기에 자동으로 나타납니다.</div>'}</div>`;
  }
  function bind(){
    document.querySelectorAll('[data-cooking-mode]').forEach(btn=>btn.addEventListener('click',()=>showMode(btn.dataset.cookingMode)));
    $('createCookingProject').addEventListener('click',createProject);$('activeCookingProject').addEventListener('change',renderEditor);
    $('cookingProjectList').addEventListener('click',e=>{const del=e.target.closest('[data-cooking-delete]');if(del)return removeProject(del.dataset.cookingDelete);const open=e.target.closest('[data-project-open]');if(open)return openProject(open.dataset.projectOpen);});
    $('projectEditor').addEventListener('click',e=>{const library=e.target.closest('[data-project-open-library]');if(library)return showMode('library');const open=e.target.closest('[data-recipe-open-library]');if(open)return GPA.recipes.openRecipe(open.dataset.recipeOpenLibrary);const move=e.target.closest('[data-recipe-move]');if(move)return moveRecipe(move.dataset.projectId,move.dataset.recipeId,Number(move.dataset.recipeMove));const rm=e.target.closest('[data-cooking-remove]');if(rm)return unlinkRecipe(rm.dataset.cookingRemove,rm.dataset.recipeId);});
    $('projectEditor').addEventListener('change',e=>{const el=e.target.closest('[data-target-project]');if(el)setTarget(el.dataset.targetProject,el.dataset.targetRecipe,el.value);});
  }
  GPA.cooking={render:renderProjects,renderEditor,bind,showMode,openProject};
})(window);
