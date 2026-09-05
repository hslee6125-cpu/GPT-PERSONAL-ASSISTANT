(function(root){
  const GPA=root.GPA;
  const COLLAPSE_KEY='gpt_pa_sidebar_collapsed';
  const mobileQuery=()=>root.matchMedia('(max-width: 900px)');
  function currentTarget(){
    const activeView=document.querySelector('.view.active')?.id||'today';
    if(activeView==='assistant'){
      const filter=GPA.assistant?.getActiveFilter?.();
      if(filter==='memo')return'memo';
      if(filter==='trash')return'trash';
      return'assistant';
    }
    return activeView;
  }
  function renderActive(){
    const active=currentTarget();
    document.querySelectorAll('[data-nav-target]').forEach(button=>{
      const selected=button.dataset.navTarget===active;
      button.classList.toggle('active',selected);
      if(selected)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');
    });
  }
  function isMobile(){return mobileQuery().matches;}
  function readCollapsed(){try{return localStorage.getItem(COLLAPSE_KEY)==='1';}catch{return false;}}
  function saveCollapsed(value){try{localStorage.setItem(COLLAPSE_KEY,value?'1':'0');}catch{}}
  function setExpanded(expanded){
    const menu=document.getElementById('sidebarMenuButton');
    if(menu)menu.setAttribute('aria-expanded',expanded?'true':'false');
  }
  function applyBaseState(){
    const collapsed=isMobile()||readCollapsed();
    document.body.classList.toggle('sidebar-collapsed',collapsed);
    if(!collapsed)document.body.classList.remove('sidebar-overlay-open');
    setExpanded(document.body.classList.contains('sidebar-overlay-open'));
  }
  function openOverlay(){
    document.body.classList.add('sidebar-collapsed','sidebar-overlay-open');
    setExpanded(true);
  }
  function closeOverlay(){
    document.body.classList.remove('sidebar-overlay-open');
    setExpanded(false);
  }
  function collapseSidebar(){
    saveCollapsed(true);
    document.body.classList.add('sidebar-collapsed');
    closeOverlay();
  }
  function open(target){
    if(target==='memo'){GPA.showView('assistant');GPA.assistant.openFilter('memo');}
    else if(target==='trash'){GPA.showView('assistant');GPA.assistant.openFilter('trash');}
    else if(target==='assistant'){GPA.showView('assistant');GPA.assistant.openFilter('todo');}
    else if(target==='calendar')GPA.showView('calendar');
    else if(target==='settings')GPA.showView('settings');
    else GPA.showView(target);
    renderActive();
    if(document.body.classList.contains('sidebar-overlay-open'))closeOverlay();
  }
  function bind(){
    document.getElementById('appSidebar')?.addEventListener('click',e=>{const button=e.target.closest('[data-nav-target]');if(button)open(button.dataset.navTarget);});
    document.getElementById('sidebarMenuButton')?.addEventListener('click',()=>{document.body.classList.contains('sidebar-overlay-open')?closeOverlay():openOverlay();});
    document.getElementById('sidebarCloseButton')?.addEventListener('click',collapseSidebar);
    document.getElementById('sidebarBackdrop')?.addEventListener('click',closeOverlay);
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&document.body.classList.contains('sidebar-overlay-open'))closeOverlay();});
    mobileQuery().addEventListener?.('change',()=>{closeOverlay();applyBaseState();});
    applyBaseState();renderActive();
  }
  GPA.navigation={bind,renderActive,open,openOverlay,closeOverlay};
})(window);
