(function(root){
  const GPA=root.GPA,s=GPA.state,$=GPA.$,esc=GPA.esc;
  function showErr(msg){GPA.showRecipeError(msg);} function hideErr(){GPA.hideRecipeError();}
  async function parseTextRecipes(){
    const text=$('recipeText').value.trim();if(!text)return showErr('레시피 내용을 입력해 주세요.');hideErr();$('parseRecipeText').disabled=true;
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
    if(!s.pendingRecipes)return;const rs=s.pendingRecipes.recipes||[];$('foundCount').textContent=`${rs.length}개 발견`;$('documentSummary').textContent=(s.pendingRecipes.sourceFilename?`${s.pendingRecipes.sourceFilename} · `:'')+(s.pendingRecipes.documentSummary||'');
    $('recipePreviewList').innerHTML=rs.map((r,i)=>`<div class="recipe-select-card"><div class="recipe-select-top"><input id="recipeCheck-${i}" class="recipe-check" type="checkbox" checked><div><div class="recipe-title">${esc(r.name||'이름 없음')}</div><div class="recipe-sub">기준 ${esc(r.baseServings??'-')}인분${r.yieldAmount?` · 완성량 ${esc(r.yieldAmount)}${esc(r.yieldUnit||'')}`:''} · 재료 ${(r.ingredients||[]).length}개</div></div></div><div class="tablewrap" style="margin-top:8px"><table><thead><tr><th>재료</th><th>양</th><th>단위</th><th>전처리</th></tr></thead><tbody>${(r.ingredients||[]).map(ing=>`<tr><td>${esc(ing.name)}</td><td>${esc(ing.amount??ing.rawAmount??'')}</td><td>${esc(ing.unit||'')}</td><td>${esc(ing.prep||'')}</td></tr>`).join('')}</tbody></table></div>${r.notes?`<div class="details" style="margin-top:8px"><b>메모:</b> ${esc(r.notes)}</div>`:''}</div>`).join('');
    updateProjectSaveSelect();$('recipePreview').style.display='block';
  }
  function updateProjectSaveSelect(){const sel=$('saveToProject'),prev=sel.value;sel.innerHTML='<option value="">연결 안 함</option>'+s.cooking.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('');if(s.cooking.some(p=>p.id===prev))sel.value=prev;}
  function cancelPreview(){s.pendingRecipes=null;$('recipePreview').style.display='none';}
  function saveSelected(){
    if(!s.pendingRecipes)return;const selected=(s.pendingRecipes.recipes||[]).filter((_,i)=>$(`recipeCheck-${i}`)?.checked);if(!selected.length)return alert('저장할 레시피를 하나 이상 선택해 주세요.');
    const projectId=$('saveToProject').value,project=s.cooking.find(p=>p.id===projectId);
    for(const r of selected){const newId=GPA.uid();s.recipes.unshift({id:newId,...r,sourceFilename:s.pendingRecipes.sourceFilename||null,sourceDocument:s.pendingRecipes.sourceDocument||null,createdAt:new Date().toISOString()});if(project){project.recipes=project.recipes||[];project.recipes.push({recipeId:newId,targetServings:Number(r.baseServings)||1});}}
    const count=selected.length;s.pendingRecipes=null;$('recipePreview').style.display='none';$('recipeText').value='';s.selectedDocx=null;$('docxFile').value='';$('fileInfo').style.display='none';GPA.persist();alert(`${count}개 레시피를 저장했습니다${project?` · ${project.name} 프로젝트에 연결했습니다`:''}.`);
  }
  function remove(id){if(!confirm('레시피를 삭제할까요?\n\n원본 Word 파일은 삭제되지 않고 계속 보관됩니다.'))return;const next=RecipeUtils.deleteRecipeFromState({recipes:s.recipes,cooking:s.cooking},id);s.recipes=next.recipes;s.cooking=next.cooking;GPA.persist();}
  function render(){
    $('recipeCount').textContent=`${s.recipes.length}개`;$('recipeList').innerHTML=s.recipes.length?s.recipes.map(r=>`<div class="recipe-card"><div class="recipe-head"><div><div class="recipe-title">${esc(r.name)}</div><div class="recipe-sub">기준 ${esc(r.baseServings??'-')}인분${r.yieldAmount?` · 완성량 ${esc(r.yieldAmount)}${esc(r.yieldUnit||'')}`:''}${r.sourceFilename?` · ${esc(r.sourceFilename)}`:''}</div></div><div class="actions">${r.sourceDocument?.storedName?`<a class="btnlink" href="${GPA.documents.downloadUrl(r.sourceDocument.storedName)}">원본 다운로드</a>`:''}<button class="small ghost danger" data-recipe-delete="${r.id}">삭제</button></div></div><div class="tablewrap" style="margin-top:8px"><table><thead><tr><th>재료</th><th>기준량</th><th>전처리</th></tr></thead><tbody>${(r.ingredients||[]).map(i=>`<tr><td>${esc(i.name)}</td><td>${esc(i.amount??i.rawAmount??'')} ${esc(i.unit||'')}</td><td>${esc(i.prep||'')}</td></tr>`).join('')}</tbody></table></div></div>`).join(''):'<div class="empty">등록된 레시피가 없습니다.</div>';
  }
  function bind(){
    $('parseRecipeText').addEventListener('click',parseTextRecipes);$('parseDocx').addEventListener('click',parseDocx);$('cancelRecipePreview').addEventListener('click',cancelPreview);$('saveSelectedRecipes').addEventListener('click',saveSelected);
    $('docxFile').addEventListener('change',e=>setDocxFile(e.target.files[0]));$('dropzone').addEventListener('click',()=>$('docxFile').click());$('dropzone').addEventListener('dragover',e=>{e.preventDefault();$('dropzone').classList.add('drag');});$('dropzone').addEventListener('dragleave',()=>$('dropzone').classList.remove('drag'));$('dropzone').addEventListener('drop',e=>{e.preventDefault();$('dropzone').classList.remove('drag');setDocxFile(e.dataTransfer.files[0]);});
    $('recipeList').addEventListener('click',e=>{const b=e.target.closest('[data-recipe-delete]');if(b)remove(b.dataset.recipeDelete);});
  }
  GPA.recipes={render,bind,updateProjectSaveSelect,renderPreview};
})(window);
