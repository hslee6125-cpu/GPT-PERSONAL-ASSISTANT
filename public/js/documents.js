(function(root){
  const GPA=root.GPA,s=GPA.state,$=GPA.$,esc=GPA.esc;
  function formatBytes(bytes){const n=Number(bytes)||0;if(n<1024)return `${n} B`;if(n<1024*1024)return `${(n/1024).toFixed(1)} KB`;return `${(n/1024/1024).toFixed(2)} MB`;}
  function downloadUrl(storedName){return `/api/documents/download?name=${encodeURIComponent(storedName||'')}`;}
  async function loadArchive(){
    const box=$('documentArchive');if(!box)return;
    try{const r=await fetch('/api/documents',{cache:'no-store'}),d=await r.json();if(!r.ok)throw new Error(d.error||'원본 보관함을 불러오지 못했습니다.');s.originalDocuments=Array.isArray(d.documents)?d.documents:[];render();}
    catch(e){box.innerHTML=`<div class="empty">${esc(e.message)}</div>`;}
  }
  async function remove(index){
    const doc=s.originalDocuments[index];if(!doc)return;const filename=doc.originalName||'Word 파일';
    if(!confirm(`원본 Word 파일을 삭제할까요?\n\n${filename}\n\n삭제하면 복구할 수 없습니다.`))return;
    try{const r=await fetch(`/api/documents?name=${encodeURIComponent(doc.storedName||'')}`,{method:'DELETE'}),d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'원본 Word 파일을 삭제하지 못했습니다.');s.recipes=RecipeUtils.unlinkSourceDocumentFromRecipes(s.recipes,doc.storedName);s.originalDocuments=s.originalDocuments.filter((_,i)=>i!==index);GPA.persist();render();}
    catch(e){alert(e.message||'원본 Word 파일을 삭제하지 못했습니다.');}
  }
  function render(){
    const box=$('documentArchive');if(!box)return;
    box.innerHTML=s.originalDocuments.length?s.originalDocuments.map((d,index)=>`<div class="item"><div class="itemrow"><div><div class="title">${esc(d.originalName||'Word 파일')}</div><div class="details">${esc(formatBytes(d.size))}${d.savedAt?` · ${esc(new Date(d.savedAt).toLocaleString())}`:''}</div></div><div class="actions"><a class="btnlink" href="${downloadUrl(d.storedName)}">다운로드</a><button class="small ghost danger" data-doc-delete="${index}">삭제</button></div></div></div>`).join(''):'<div class="empty">보관된 Word 원본이 없습니다.</div>';
  }
  function bind(){
    $('refreshDocuments').addEventListener('click',loadArchive);
    $('documentArchive').addEventListener('click',e=>{const b=e.target.closest('[data-doc-delete]');if(b)remove(Number(b.dataset.docDelete));});
  }
  GPA.documents={loadArchive,render,downloadUrl,bind};
})(window);
