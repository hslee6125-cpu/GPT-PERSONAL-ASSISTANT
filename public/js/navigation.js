(function(root){
  const GPA=root.GPA;
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
  function open(target){
    if(target==='memo'){GPA.showView('assistant');GPA.assistant.openFilter('memo');}
    else if(target==='trash'){GPA.showView('assistant');GPA.assistant.openFilter('trash');}
    else if(target==='assistant'){GPA.showView('assistant');GPA.assistant.openFilter('todo');}
    else if(target==='calendar')GPA.showView('calendar');
    else if(target==='settings')GPA.showView('settings');
    else GPA.showView(target);
    renderActive();
  }
  function bind(){document.getElementById('appSidebar')?.addEventListener('click',e=>{const button=e.target.closest('[data-nav-target]');if(button)open(button.dataset.navTarget);});renderActive();}
  GPA.navigation={bind,renderActive,open};
})(window);
