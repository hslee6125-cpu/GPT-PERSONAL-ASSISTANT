(function(root){
  const GPA=root.GPA=root.GPA||{};
  GPA.KEYS={assistant:'gpt_pa_v4_assistant',recipes:'gpt_pa_v4_recipes',cooking:'gpt_pa_v4_cooking'};
  const parse=(key)=>{try{const v=JSON.parse(localStorage.getItem(key)||'[]');return Array.isArray(v)?v:[];}catch{return [];}};
  GPA.state={
    assistant:parse(GPA.KEYS.assistant),recipes:parse(GPA.KEYS.recipes),cooking:parse(GPA.KEYS.cooking),
    pendingRecipes:null,selectedDocx:null,originalDocuments:[],editingAssistantId:null,
    oneDriveAvailable:false,oneDriveReady:false,oneDrivePath:'',saveTimer:null,saveChain:Promise.resolve()
  };
  GPA.$=id=>document.getElementById(id);
  GPA.uid=()=>crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random()}`;
  GPA.esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
  GPA.today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
  GPA.showRecipeError=msg=>{const el=GPA.$('recipeError');if(el){el.textContent=msg;el.style.display='block';}};
  GPA.hideRecipeError=()=>{const el=GPA.$('recipeError');if(el)el.style.display='none';};
})(window);
