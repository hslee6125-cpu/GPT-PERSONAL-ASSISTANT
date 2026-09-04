(function(root){
  const GPA=root.GPA,$=GPA.$;
  async function apiConfig(){try{const r=await fetch('/api/config'),d=await r.json();$('apiBadge').textContent=d.configured?`GPT 연결됨 · ${d.model} · v${d.version||'?'}`:`API 키 필요 · v${d.version||'?'}`;$('apiBadge').className=`badge ${d.configured?'ok':'bad'}`;}catch{$('apiBadge').textContent='서버 연결 실패';$('apiBadge').className='badge bad';}}
  function bindTabs(){document.querySelectorAll('.tab').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));document.querySelectorAll('.view').forEach(x=>x.classList.remove('active'));b.classList.add('active');$(b.dataset.view).classList.add('active');}));document.querySelectorAll('.subtab').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('.subtab').forEach(x=>x.classList.remove('active'));document.querySelectorAll('.recipe-source').forEach(x=>x.classList.remove('active'));b.classList.add('active');$(b.dataset.source).classList.add('active');}));}
  GPA.renderAll=()=>{GPA.assistant.render();GPA.cooking.render();GPA.recipes.renderLibrary();};
  bindTabs();GPA.assistant.bind();GPA.documents.bind();GPA.recipes.bind();GPA.cooking.bind();apiConfig();GPA.renderAll();GPA.initializeOneDriveData();GPA.documents.loadArchive();
})(window);
