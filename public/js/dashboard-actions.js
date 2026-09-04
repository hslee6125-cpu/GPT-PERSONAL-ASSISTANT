(function(root,factory){
  const nodeAssistantUtils=typeof require==='function'?(()=>{try{return require('./assistant-utils.js');}catch{return null;}})():null;
  const api=factory(root?.AssistantUtils,nodeAssistantUtils);
  if(typeof module!=='undefined'&&module.exports) module.exports=api;
  if(root) root.DashboardActions=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(browserAssistantUtils,nodeAssistantUtils){
  const AU=browserAssistantUtils||nodeAssistantUtils;
  if(!AU) throw new Error('AssistantUtils가 필요합니다.');
  function updateDate(items,id,dueDate){return AU.updateAssistantItem(items,id,{dueDate});}
  function updateProject(items,id,projectTitle){return AU.updateAssistantItem(items,id,{projectTitle});}
  function updateTime(items,id,dueTime){return AU.updateAssistantItem(items,id,{dueTime});}
  function softDelete(items,id,deletedAt){return AU.softDeleteAssistantItem(items,id,deletedAt);}
  return {updateDate,updateProject,updateTime,softDelete};
});
