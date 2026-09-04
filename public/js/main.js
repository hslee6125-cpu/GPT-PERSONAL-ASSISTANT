(function(root){
  const GPA=root.GPA,$=GPA.$;
  async function apiConfig(){try{const r=await fetch('/api/config'),d=await r.json();const version=d.version||'?';$('appTitle').textContent=`GPT Personal Assistant v${version}`;document.title=`GPT Personal Assistant v${version}`;$('apiBadge').textContent=d.configured?`GPT 연결됨 · ${d.model} · v${version}`:`API 키 필요 · v${version}`;$('apiBadge').className=`badge ${d.configured?'ok':'bad'}`;}catch{$('apiBadge').textContent='서버 연결 실패';$('apiBadge').className='badge bad';}}
  GPA.showView=(view)=>{
    const target=document.querySelector(`.tab[data-view="${view}"]`);const section=$(view);if(!target||!section)return false;
    document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));document.querySelectorAll('.view').forEach(x=>x.classList.remove('active'));target.classList.add('active');section.classList.add('active');return true;
  };
  function bindTabs(){document.querySelectorAll('.tab').forEach(b=>b.addEventListener('click',()=>GPA.showView(b.dataset.view)));document.querySelectorAll('.subtab').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('.subtab').forEach(x=>x.classList.remove('active'));document.querySelectorAll('.recipe-source').forEach(x=>x.classList.remove('active'));b.classList.add('active');$(b.dataset.source).classList.add('active');}));}
  GPA.renderAll=()=>{GPA.dashboard.render();GPA.assistant.render();GPA.cooking.render();GPA.recipes.renderLibrary();};
  bindTabs();GPA.search.bind();GPA.dashboard.bind();GPA.assistant.bind();GPA.documents.bind();GPA.recipes.bind();GPA.cooking.bind();GPA.systemSettings.bind();apiConfig();GPA.systemSettings.load();GPA.renderAll();GPA.initializeOneDriveData();GPA.documents.loadArchive();
})(window);
