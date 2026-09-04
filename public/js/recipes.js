(function(root){
  const GPA=root.GPA,s=GPA.state,$=GPA.$,esc=GPA.esc;
  function showErr(msg){GPA.showRecipeError(msg);} function hideErr(){GPA.hideRecipeError();}
  function nullableNumber(value){if(value===null||value===undefined||String(value).trim()==='')return null;const n=Number(value);return Number.isFinite(n)?n:null;}
  function parseSteps(text){return String(text||'').split(/\r?\n/).map(line=>line.trim()).filter(Boolean).map(line=>line.replace(/^\d+[.)]\s*/,''));}
  function formatSteps(steps){return (Array.isArray(steps)?steps:[]).map((step,index)=>`${index+1}. ${step}`).join('\n');}
  function projectOptions(selectedId='',includeMultiple=false){
    const first=includeMultiple?'<option value="__multiple" disabled selected>여러 프로젝트</option>':'';
    return `${first}<option value="" ${!selectedId&&!includeMultiple?'selected':''}>프로젝트 없음</option>${s.cooking.map(p=>`<option value="${p.id}" ${p.id===selectedId?'selected':''}>${esc(p.name)}</option>`).join('')}`;
  }
  function updateProjectSaveSelect(){const sel=$('saveToProject');if(!sel)return;const prev=sel.value;sel.innerHTML=projectOptions(s.cooking.some(p=>p.id===prev)?prev:'');if(s.cooking.some(p=>p.id===prev))sel.value=prev;}

  async function parseTextRecipes(){
    const text=$('recipeText').value.trim();if(!text)return showErr('레시피 내용을 입력해 주세요.');
    hideErr();$('parseRecipeText').disabled=true;
    try{const r=await fetch('/api/parse-recipes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text})}),d=await r.json();if(!r.ok)throw new Error(d.error||'레시피 분석 실패');s.pendingRecipes={...d,sourceFilename:null};renderPreview();}
    catch(e){showErr(e.message);}finally{$('parseRecipeText').disabled=false;}
  }
  function setDocxFile(file){
    if(!file)return;if(!file.name.toLowerCase().endsWith('.docx')){s.selectedDocx=null;$('fileInfo').style.display='none';return showErr('.docx Word 파일만 선택해 주세요.');}
    if(file.size>20*1024*1024){s.selectedDocx=null;$('fileInfo').style.display='none';return showErr('Word 파일은 20MB 이하로 업로드해 주세요.');}
    hideErr();s.selectedDocx=file;$('fileInfo').textContent=`선택됨: ${file.name} · ${(file.size/1024/1024).toFixed(2)} MB`;$('fileInfo').style.display='block';
  }
  function fileToBase64(file){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]||'');reader.onerror=reject;reader.readAsDataURL(file);});}
  async function parseDocx(){
    if(!s.selectedDocx)return showErr('Word 파일을 먼저 선택해 주세요.');hideErr();const btn=$('parseDocx');btn.disabled=true;btn.textContent='Word 분석 중...';
    try{const base64=await fileToBase64(s.selectedDocx);const r=await fetch('/api/parse-docx',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({filename:s.selectedDocx.name,base64})}),d=await r.json();if(!r.ok)throw new Error(d.error||'Word 분석 실패');s.pendingRecipes=d;renderPreview();}
    catch(e){showErr(e.message);}finally{btn.disabled=false;btn.textContent='Word에서 레시피 찾기';GPA.documents?.loadArchive();}
  }
  function renderPreview(){
    if(!s.pendingRecipes)return;const rs=s.pendingRecipes.recipes||[];updateProjectSaveSelect();$('foundCount').textContent=`${rs.length}개 발견`;$('documentSummary').textContent=(s.pendingRecipes.sourceFilename?`${s.pendingRecipes.sourceFilename} · `:'')+(s.pendingRecipes.documentSummary||'');
    $('recipePreviewList').innerHTML=rs.map((r,i)=>`<div class="recipe-select-card"><div class="recipe-select-top"><input id="recipeCheck-${i}" class="recipe-check" type="checkbox" checked><div><div class="recipe-title">${esc(r.name||'이름 없음')}</div><div class="recipe-sub">기준 ${esc(r.baseServings??'-')}인분${r.yieldAmount?` · 완성량 ${esc(r.yieldAmount)}${esc(r.yieldUnit||'')}`:''} · 재료 ${(r.ingredients||[]).length}개 · 조리 ${(r.steps||[]).length}단계</div></div></div><div class="tablewrap" style="margin-top:8px"><table><thead><tr><th>재료</th><th>양</th><th>단위</th><th>전처리</th></tr></thead><tbody>${(r.ingredients||[]).map(ing=>`<tr><td>${esc(ing.name)}</td><td>${esc(ing.amount??ing.rawAmount??'')}</td><td>${esc(ing.unit||'')}</td><td>${esc(ing.prep||'')}</td></tr>`).join('')}</tbody></table></div>${(r.steps||[]).length?`<div class="recipe-preview-steps">${r.steps.map((step,n)=>`<div><b>${n+1}.</b> ${esc(step)}</div>`).join('')}</div>`:''}${r.notes?`<div class="details" style="margin-top:8px"><b>메모:</b> ${esc(r.notes)}</div>`:''}</div>`).join('');
    $('recipePreview').style.display='block';
  }
  function cancelPreview(){s.pendingRecipes=null;$('recipePreview').style.display='none';}
  function resetCapture(){s.pendingRecipes=null;$('recipePreview').style.display='none';$('recipeText').value='';s.selectedDocx=null;$('docxFile').value='';$('fileInfo').style.display='none';}
  function saveSelected(){
    if(!s.pendingRecipes)return;const selected=(s.pendingRecipes.recipes||[]).filter((_,i)=>$(`recipeCheck-${i}`)?.checked);if(!selected.length)return alert('저장할 레시피를 하나 이상 선택해 주세요.');
    const projectId=$('saveToProject')?.value||'';hideErr();
    for(const r of selected){
      const newId=GPA.uid();const base=Number(r.baseServings)||1;
      s.recipes.unshift({id:newId,...r,sourceFilename:s.pendingRecipes.sourceFilename||null,sourceDocument:s.pendingRecipes.sourceDocument||null,createdAt:new Date().toISOString()});
      if(projectId){const project=s.cooking.find(p=>p.id===projectId);const next=RecipeUtils.setRecipeProject({recipes:s.recipes,cooking:s.cooking},newId,projectId,Number(project?.servings)||base);s.recipes=next.recipes;s.cooking=next.cooking;}
    }
    const count=selected.length,project=s.cooking.find(p=>p.id===projectId);resetCapture();GPA.persist('recipe-library-save');alert(`${count}개 레시피를 보관함에 저장했습니다${project?` · ${project.name} 프로젝트 지정`:''}.`);
  }

  function projectStateText(recipeId){const st=RecipeUtils.getRecipeProjectState(s.cooking,recipeId);if(st.kind==='none')return'프로젝트 없음';if(st.kind==='multiple')return'여러 프로젝트';return s.cooking.find(p=>p.id===st.projectId)?.name||'프로젝트 없음';}
  function recipeEditor(recipe){
    return `<div class="recipe-editor library-recipe-editor">
      ${recipe.sourceFilename?`<div class="source-note"><b>업로드 원본</b><span>${esc(recipe.sourceFilename)}</span>${recipe.sourceDocument?.storedName?`<a class="btnlink" href="${GPA.documents.downloadUrl(recipe.sourceDocument.storedName)}">원본 다운로드</a>`:''}</div>`:''}
      <div class="mini-grid"><div><label>레시피명</label><input id="recipeEditName" value="${esc(recipe.name||'')}"></div><div><label>기준 인분</label><input id="recipeEditBaseServings" type="number" min="1" step="1" value="${esc(recipe.baseServings||1)}"></div></div>
      <div class="mini-grid"><div class="mini-grid"><div><label>완성량</label><input id="recipeEditYieldAmount" type="number" step="any" value="${esc(recipe.yieldAmount??'')}"></div><div><label>단위</label><input id="recipeEditYieldUnit" value="${esc(recipe.yieldUnit||'')}" placeholder="g / ml / 개"></div></div><div class="mini-grid"><div><label>1인 사용량</label><input id="recipeEditPortionAmount" type="number" step="any" value="${esc(recipe.portionAmount??'')}"></div><div><label>단위</label><input id="recipeEditPortionUnit" value="${esc(recipe.portionUnit||'')}"></div></div></div>
      <label>재료 <span class="recipe-sub">한 줄에 재료 | 양 | 단위 | 전처리</span></label><textarea id="recipeEditIngredients" class="ingredients-editor">${esc(RecipeUtils.formatIngredientLines(recipe.ingredients||[]))}</textarea>
      <label>조리법 <span class="recipe-sub">한 줄에 한 단계</span></label><textarea id="recipeEditSteps" class="steps-editor">${esc(formatSteps(recipe.steps||[]))}</textarea>
      <label>메모</label><textarea id="recipeEditNotes" style="min-height:100px">${esc(recipe.notes||'')}</textarea>
      <div class="actions edit-actions"><button class="ghost" data-recipe-edit-cancel>취소</button><button class="primary" data-recipe-edit-save="${recipe.id}">저장</button></div>
    </div>`;
  }
  function startEdit(recipeId){s.editingRecipeId=recipeId;renderLibrary();}
  function cancelEdit(){s.editingRecipeId=null;renderLibrary();}
  function saveEdit(recipeId){
    const recipe=s.recipes.find(r=>r.id===recipeId);if(!recipe)return;const name=$('recipeEditName')?.value.trim();if(!name)return alert('레시피명을 입력하세요.');
    const base=Number($('recipeEditBaseServings')?.value);recipe.name=name;recipe.baseServings=Number.isFinite(base)&&base>0?base:1;
    recipe.yieldAmount=nullableNumber($('recipeEditYieldAmount')?.value);recipe.yieldUnit=$('recipeEditYieldUnit')?.value.trim()||null;recipe.portionAmount=nullableNumber($('recipeEditPortionAmount')?.value);recipe.portionUnit=$('recipeEditPortionUnit')?.value.trim()||null;
    recipe.ingredients=RecipeUtils.parseIngredientLines($('recipeEditIngredients')?.value||'');recipe.steps=parseSteps($('recipeEditSteps')?.value||'');recipe.notes=$('recipeEditNotes')?.value.trim()||'';recipe.updatedAt=new Date().toISOString();s.editingRecipeId=null;GPA.persist('recipe-edit');
  }
  function changeProject(recipeId,projectId){
    if(projectId==='__multiple')return;const state=RecipeUtils.getRecipeProjectState(s.cooking,recipeId);if(state.kind==='single'&&state.projectId===projectId)return;
    const recipe=s.recipes.find(r=>r.id===recipeId),project=s.cooking.find(p=>p.id===projectId);const target=projectId?(Number(project?.servings)||Number(recipe?.baseServings)||1):undefined;
    const next=RecipeUtils.setRecipeProject({recipes:s.recipes,cooking:s.cooking},recipeId,projectId,target);s.recipes=next.recipes;s.cooking=next.cooking;GPA.persist('recipe-project-change');
  }
  function duplicate(recipeId){
    const recipe=s.recipes.find(r=>r.id===recipeId);if(!recipe)return;const newId=GPA.uid();s.recipes=RecipeUtils.duplicateRecipe(s.recipes,recipeId,newId,new Date().toISOString());s.editingRecipeId=newId;GPA.persist('recipe-duplicate');
  }
  function remove(recipeId){
    const recipe=s.recipes.find(r=>r.id===recipeId);if(!recipe)return;if(!confirm(`레시피 '${recipe.name}'를 완전히 삭제할까요?\n모든 프로젝트에서 제거되며 원본 Word 파일은 유지됩니다.`))return;
    const next=RecipeUtils.deleteRecipeFromState({recipes:s.recipes,cooking:s.cooking},recipeId);s.recipes=next.recipes;s.cooking=next.cooking;if(s.editingRecipeId===recipeId)s.editingRecipeId=null;GPA.persist('recipe-delete');
  }
  function recipeSearchText(recipe){const st=RecipeUtils.getRecipeProjectState(s.cooking,recipe.id);const projects=st.projectIds.map(id=>s.cooking.find(p=>p.id===id)?.name||'').join(' ');return [recipe.name,recipe.notes,recipe.sourceFilename,projects,...(recipe.ingredients||[]).map(i=>`${i.name} ${i.prep||''}`)].join(' ').toLowerCase();}
  function renderLibrary(){
    const list=$('recipeLibraryList'),count=$('recipeLibraryCount');if(!list||!count)return;updateProjectSaveSelect();const query=String($('recipeLibrarySearch')?.value||'').trim().toLowerCase();const rows=s.recipes.filter(recipe=>!query||recipeSearchText(recipe).includes(query));count.textContent=query?`${rows.length}/${s.recipes.length}개`:`${s.recipes.length}개`;
    list.innerHTML=rows.length?rows.map(recipe=>{const state=RecipeUtils.getRecipeProjectState(s.cooking,recipe.id),editing=s.editingRecipeId===recipe.id,projectLabel=projectStateText(recipe.id);return `<div class="recipe-library-item" id="recipe-card-${recipe.id}">
      <div class="recipe-library-item-head"><div class="recipe-library-main"><div class="recipe-title">${esc(recipe.name)}</div><div class="recipe-sub">기준 ${esc(recipe.baseServings??'-')}인분 · 재료 ${(recipe.ingredients||[]).length}개 · 조리 ${(recipe.steps||[]).length}단계${recipe.sourceFilename?` · Word: ${esc(recipe.sourceFilename)}`:''}</div></div><div class="recipe-library-actions"><button class="small ghost" data-recipe-edit="${recipe.id}">${editing?'편집 중':'수정'}</button><button class="small ghost" data-recipe-duplicate="${recipe.id}">복제</button><button class="small ghost danger" data-recipe-delete="${recipe.id}">삭제</button></div></div>
      <div class="recipe-project-row"><div><span class="field-label">프로젝트</span><div class="recipe-project-status">${esc(projectLabel)}</div></div><select data-recipe-project="${recipe.id}">${projectOptions(state.projectId||'',state.kind==='multiple')}</select></div>
      ${editing?recipeEditor(recipe):`<div class="recipe-library-summary">${(recipe.ingredients||[]).slice(0,6).map(i=>`<span>${esc(i.name)}${i.amount??i.rawAmount?` · ${esc(i.amount??i.rawAmount)}${esc(i.unit||'')}`:''}</span>`).join('')}${(recipe.ingredients||[]).length>6?`<span>+${(recipe.ingredients||[]).length-6}개</span>`:''}</div>`}
    </div>`;}).join(''):'<div class="empty">조건에 맞는 레시피가 없습니다.</div>';
  }
  function openRecipe(recipeId){
    if(!s.recipes.some(r=>r.id===recipeId))return;GPA.cooking?.showMode('library');const search=$('recipeLibrarySearch');if(search)search.value='';s.editingRecipeId=recipeId;renderLibrary();requestAnimationFrame(()=>document.getElementById(`recipe-card-${recipeId}`)?.scrollIntoView({behavior:'smooth',block:'start'}));
  }
  function bind(){
    $('parseRecipeText').addEventListener('click',parseTextRecipes);$('parseDocx').addEventListener('click',parseDocx);$('cancelRecipePreview').addEventListener('click',cancelPreview);$('saveSelectedRecipes').addEventListener('click',saveSelected);
    $('docxFile').addEventListener('change',e=>setDocxFile(e.target.files[0]));$('dropzone').addEventListener('click',()=>$('docxFile').click());$('dropzone').addEventListener('dragover',e=>{e.preventDefault();$('dropzone').classList.add('drag');});$('dropzone').addEventListener('dragleave',()=>$('dropzone').classList.remove('drag'));$('dropzone').addEventListener('drop',e=>{e.preventDefault();$('dropzone').classList.remove('drag');setDocxFile(e.dataTransfer.files[0]);});
    $('recipeLibrarySearch').addEventListener('input',renderLibrary);
    $('recipeLibraryList').addEventListener('click',e=>{const edit=e.target.closest('[data-recipe-edit]');if(edit)return startEdit(edit.dataset.recipeEdit);const cancel=e.target.closest('[data-recipe-edit-cancel]');if(cancel)return cancelEdit();const save=e.target.closest('[data-recipe-edit-save]');if(save)return saveEdit(save.dataset.recipeEditSave);const copy=e.target.closest('[data-recipe-duplicate]');if(copy)return duplicate(copy.dataset.recipeDuplicate);const del=e.target.closest('[data-recipe-delete]');if(del)return remove(del.dataset.recipeDelete);});
    $('recipeLibraryList').addEventListener('change',e=>{const select=e.target.closest('[data-recipe-project]');if(select)changeProject(select.dataset.recipeProject,select.value);});
  }
  GPA.recipes={bind,renderPreview,cancelPreview,saveSelected,renderLibrary,openRecipe,updateProjectSaveSelect};
})(window);
