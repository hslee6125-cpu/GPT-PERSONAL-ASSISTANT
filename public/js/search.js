(function(root){
  const GPA=root.GPA,$=GPA.$,esc=GPA.esc,SearchUtils=root.SearchUtils;
  const kindLabels={todo:'할 일',memo:'메모',project:'프로젝트',schedule:'일정',activity:'활동',recipe:'레시피',cooking:'요리 프로젝트'};
  let lastResults=[];

  function hideFeedback(){
    const result=$('inboxResult'),error=$('inboxError');
    if(result){result.classList.remove('show');result.textContent='';}
    if(error){error.style.display='none';error.textContent='';}
  }

  function renderMessage(message){
    const panel=$('searchResults');if(!panel)return;
    panel.innerHTML=`<div class="search-empty">${esc(message)}</div>`;panel.classList.add('show');lastResults=[];
  }

  function resultMeta(result){
    const parts=[];
    if(result.projectTitle)parts.push(`프로젝트 · ${result.projectTitle}`);
    if(result.dueDate)parts.push(result.dueDate);
    if(result.done)parts.push('완료');
    return parts;
  }

  function renderResults(query,response){
    const panel=$('searchResults');if(!panel)return;
    lastResults=response.results||[];
    if(!response.total){renderMessage(`“${query}” 검색 결과가 없습니다.`);return;}
    const countText=response.total>lastResults.length?`${lastResults.length}개 표시 / 전체 ${response.total}개`:`${response.total}개`;
    panel.innerHTML=`<div class="search-head"><b>검색 결과 · “${esc(query)}”</b><span>${esc(countText)}</span></div>${lastResults.map((result,index)=>{
      const meta=resultMeta(result);
      return `<button type="button" class="search-result-row" data-search-index="${index}"><span class="search-type">${esc(kindLabels[result.kind]||result.kind)}</span><span class="search-result-main"><span class="search-result-title">${esc(result.title)}</span>${result.snippet?`<span class="search-result-snippet">${esc(result.snippet)}</span>`:''}${meta.length?`<span class="search-result-meta">${meta.map(x=>`<span>${esc(x)}</span>`).join('')}</span>`:''}</span></button>`;
    }).join('')}`;
    panel.classList.add('show');
  }

  function handleSubmit(text){
    const parsed=SearchUtils.parseCommand(text);
    if(!parsed.isSearch)return false;
    hideFeedback();
    if(!parsed.query){renderMessage('검색어를 입력해 주세요. 예: /search BMW 사고');return true;}
    const response=SearchUtils.searchAll(GPA.state,parsed.query);
    renderResults(parsed.query,response);
    return true;
  }

  function clear(){
    const panel=$('searchResults');if(panel){panel.classList.remove('show');panel.innerHTML='';}lastResults=[];
  }

  function refreshButtonMode(){
    const input=$('inboxText'),button=$('analyzeInbox');if(!input||!button)return;
    const parsed=SearchUtils.parseCommand(input.value);
    if(!button.disabled)button.textContent=parsed.isSearch?'통합 검색':'GPT로 정리해서 저장';
  }

  function navigate(result){
    if(!result)return false;
    if(['todo','memo','project','schedule','activity'].includes(result.kind)){
      GPA.showView('assistant');
      return Boolean(GPA.assistant.openItem(result.id));
    }
    if(result.kind==='recipe'){
      if(!GPA.state.recipes.some(recipe=>recipe.id===result.id))return false;
      GPA.showView('cooking');GPA.cooking.showMode('library');GPA.recipes.openRecipe(result.id);return true;
    }
    if(result.kind==='cooking'){
      if(!GPA.state.cooking.some(project=>project.id===result.id))return false;
      GPA.showView('cooking');GPA.cooking.showMode('projects');GPA.cooking.openProject(result.id);return true;
    }
    return false;
  }

  function bind(){
    const input=$('inboxText'),panel=$('searchResults');
    input?.addEventListener('input',refreshButtonMode);
    panel?.addEventListener('click',event=>{
      const row=event.target.closest('[data-search-index]');if(!row)return;
      const result=lastResults[Number(row.dataset.searchIndex)];
      if(result&&!navigate(result))renderMessage('항목을 찾을 수 없습니다.');
    });
    refreshButtonMode();
  }

  GPA.search={bind,handleSubmit,clear,refreshButtonMode,navigate};
})(window);
