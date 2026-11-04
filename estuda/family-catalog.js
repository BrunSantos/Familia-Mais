let frame,frameReady;
export function familyRequest(payload){
 if(!frame){
  frame=document.createElement('iframe');frame.hidden=true;frame.title='Lista central da família';
  frameReady=new Promise(resolve=>frame.addEventListener('load',resolve,{once:true}));
  frame.src=new URL('../family-bridge.html',import.meta.url).href;document.body.appendChild(frame);
 }
 return new Promise((resolve,reject)=>{
  const id=crypto.randomUUID();
  const cleanup=()=>{clearTimeout(timer);window.removeEventListener('message',receive);};
  const receive=event=>{
   if(event.origin!==location.origin||event.source!==frame.contentWindow||event.data?.type!=='family-response'||event.data.id!==id)return;
   cleanup();event.data.ok?resolve(event.data):reject(Error(event.data.error));
  };
  const timer=setTimeout(()=>{cleanup();reject(Error('Não foi possível carregar a Família+. Confirma a sessão e tenta atualizar.'));},20000);
  window.addEventListener('message',receive);
  frameReady.then(()=>frame.contentWindow.postMessage({type:'family-request',id,...payload},location.origin));
 });
}
