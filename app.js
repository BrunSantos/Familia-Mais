import {extrasView,extrasSubmit,extrasDelete} from './familia-extras.js?v=48';
import {startLanches,setLunchChildren,lanchesView,lunchSubmit,lunchClick} from './lanches.js?v=66-family-catalog';
import {initializeApp,deleteApp} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import {getAuth,onAuthStateChanged,signInWithEmailAndPassword,createUserWithEmailAndPassword,sendPasswordResetEmail,signOut,deleteUser} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {getFirestore,doc,getDoc,setDoc,collection,getDocs,query,where,updateDoc,deleteDoc,deleteField,serverTimestamp,runTransaction,writeBatch} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
import {firebaseConfig,ADMIN_UID} from './firebase-settings-v3.js';
const app=initializeApp(firebaseConfig),auth=getAuth(app),db=getFirestore(app),$=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const normalize=s=>String(s||'').trim().toLowerCase();
let user=null,profile=null,people=[],invites=[],tasks=[],claims=[],rewards=[],redemptions=[],tab='familia';
const isAdmin=()=>!!user&&!!ADMIN_UID&&user.uid===ADMIN_UID;
let toastTimer;
const notice=(message,kind)=>{
 const text=String(message||'');
 const legacy=$('feedback');if(legacy){legacy.textContent='';legacy.hidden=true;}
 const toast=$('appToast');if(!toast)return;
 clearTimeout(toastTimer);
 if(!text){toast.hidden=true;toast.textContent='';return;}
 const error=kind==='error'||(!kind&&/erro|falha|recus|não foi possível|sem autorização|permiss|incorret|inválid|demasiad|aguarda alguns minutos|seleciona|verifica|introduz primeiro/i.test(text));
 const working=kind==='working'||/^(a guardar|a entrar|a criar|a pedir)/i.test(text);
 toast.className='app-toast '+(error?'toast-error':working?'toast-working':'toast-success');
 toast.replaceChildren();
 const msg=document.createElement('span');msg.textContent=text;toast.append(msg);
 const close=document.createElement('button');close.type='button';close.className='toast-close';close.setAttribute('aria-label','Fechar notificação');close.textContent='×';close.addEventListener('click',()=>{clearTimeout(toastTimer);toast.hidden=true});toast.append(close);
 toast.hidden=false;
 if(!error&&!working)toastTimer=setTimeout(()=>{toast.hidden=true},4000);
};
const avatarMarkup=(p,cls='')=>`<span class="kid-avatar ${cls}" aria-label="Fotografia de ${esc(p.name)}">${p.photoData?`<img src="${esc(p.photoData)}" alt="" loading="lazy">`:`<img src="./avatar-default.svg" alt="Avatar genérico" loading="lazy">`}</span>`;
function hydrateAvatars(){} // Fotografias incluídas nos perfis carregados do Firestore.
function allowedPhoto(id){return !!user&&(isAdmin()||((profile?.role==='guardian'||isAdmin())&&profile?.status==='active'&&myKids().some(k=>k.uid===id)));}
async function processPhoto(file,id){
 if(!allowedPhoto(id))throw Error('Sem autorização para alterar esta fotografia.');
 if(!file||!file.type.startsWith('image/'))throw Error('Seleciona uma imagem válida.');
 if(file.size>12*1024*1024)throw Error('A imagem deve ter menos de 12 MB.');
 const bitmap=typeof createImageBitmap==='function'?await createImageBitmap(file).catch(()=>null):null;
 const img=bitmap||await new Promise((resolve,reject)=>{const im=new Image(),url=URL.createObjectURL(file);im.onload=()=>{URL.revokeObjectURL(url);resolve(im)};im.onerror=()=>{URL.revokeObjectURL(url);reject(Error('Não foi possível abrir a imagem.'))};im.src=url});
 const canvas=document.createElement('canvas');canvas.width=192;canvas.height=192;
 const ctx=canvas.getContext('2d'),side=Math.min(img.width,img.height);
 ctx.drawImage(img,(img.width-side)/2,(img.height-side)/2,side,side,0,0,192,192);
 if(bitmap)bitmap.close();
 let quality=.75,data=canvas.toDataURL('image/jpeg',quality);
 while(data.length>65000&&quality>.3){quality-=.1;data=canvas.toDataURL('image/jpeg',quality);}
 if(data.length>100000)throw Error('A fotografia é demasiado grande. Tenta outra imagem.');
 await updateDoc(doc(db,'profiles',id),{photoData:data,photoPath:deleteField()});
 await load();render();notice('Fotografia atualizada.');
}
async function removePhoto(id){
 if(!allowedPhoto(id))throw Error('Sem autorização.');
 await updateDoc(doc(db,'profiles',id),{photoData:deleteField(),photoPath:deleteField()});
 await load();render();notice('Fotografia removida.');
}
const personName=id=>people.find(p=>p.uid===id)?.name||'Conta pendente';
const associated=id=>isAdmin()||((profile?.role==='guardian'||isAdmin())&&profile?.status==='active'&&(people.some(p=>p.uid===id&&p.role==='child'&&(p.guardianIds||[]).includes(user.uid))));
const myKids=()=>people.filter(p=>p.role==='child'&&p.status==='active'&&(isAdmin()||(p.guardianIds||[]).includes(user.uid)));
const earned=id=>claims.filter(c=>c.childId===id&&c.status==='approved').reduce((n,c)=>n+Number(c.points||0),0);
const spent=id=>redemptions.filter(r=>r.childId===id&&r.status==='approved').reduce((n,r)=>n+Number(r.cost||0),0);
const score=id=>earned(id)-spent(id);
const isoDay=d=>d.toISOString().slice(0,10);
function period(t){const d=new Date(),start=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()));if(t.frequency==='weekly')start.setUTCDate(start.getUTCDate()-(start.getUTCDay()+6)%7);return t.frequency==='once'?{key:'once',start:null}:{key:isoDay(start),start};}
const taskTitle=id=>tasks.find(t=>t.id===id)?.title||'Tarefa';
const PRESETS=[
 ['Fazer a cama','Responsabilidade','Manhã',5,'daily'],['Lavar os dentes','Responsabilidade','Manhã',5,'daily'],['Vestir-me sozinho','Responsabilidade','Manhã',5,'daily'],['Tomar o pequeno-almoço','Responsabilidade','Manhã',5,'daily'],['Preparar a mochila','Responsabilidade','Noite',10,'daily'],['Fazer os trabalhos de casa','Responsabilidade','Depois da escola',15,'daily'],['Estudar 20 minutos','Responsabilidade','Depois da escola',15,'daily'],['Ler 15 minutos','Responsabilidade','Noite',10,'daily'],['Preparar a roupa para amanhã','Responsabilidade','Noite',5,'daily'],['Deitar-me a horas','Responsabilidade','Noite',10,'daily'],
 ['Arrumar o quarto','Tarefa doméstica','Outro',15,'daily'],['Arrumar os brinquedos','Tarefa doméstica','Outro',10,'daily'],['Pôr a mesa','Tarefa doméstica','Outro',10,'daily'],['Levantar a mesa','Tarefa doméstica','Outro',10,'daily'],['Colocar a loiça na máquina','Tarefa doméstica','Outro',10,'daily'],['Tirar a loiça da máquina','Tarefa doméstica','Outro',10,'daily'],['Levar o lixo','Tarefa doméstica','Outro',10,'weekly'],['Separar a reciclagem','Tarefa doméstica','Outro',10,'weekly'],['Regar as plantas','Tarefa doméstica','Outro',10,'weekly'],['Dobrar a roupa','Tarefa doméstica','Outro',15,'weekly'],['Aspirar o quarto','Tarefa doméstica','Outro',20,'weekly'],['Limpar o pó','Tarefa doméstica','Outro',15,'weekly'],['Ajudar a preparar uma refeição','Tarefa doméstica','Outro',15,'weekly'],['Dar comida ao animal de estimação','Tarefa doméstica','Outro',10,'daily']
];
const PRESET_GROUPS={
 'Higiene pessoal':['Lavar os dentes','Vestir-me sozinho','Tomar o pequeno-almoço','Deitar-me a horas'],
 'Responsabilidades diárias':['Fazer a cama','Preparar a mochila','Preparar a roupa para amanhã'],
 'Escola e estudo':['Fazer os trabalhos de casa','Estudar 20 minutos','Ler 15 minutos'],
 'Organização e arrumação':['Arrumar o quarto','Arrumar os brinquedos','Dobrar a roupa'],
 'Tarefas domésticas':['Pôr a mesa','Levantar a mesa','Colocar a loiça na máquina','Tirar a loiça da máquina','Levar o lixo','Separar a reciclagem','Regar as plantas','Aspirar o quarto','Limpar o pó','Ajudar a preparar uma refeição','Dar comida ao animal de estimação']
};
const presetGroupFor=name=>Object.entries(PRESET_GROUPS).find(([,names])=>names.includes(name))?.[0]||'Responsabilidades diárias';
const WEEKDAYS=['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'];
const weekdayIndex=()=>{const d=new Date().getDay();return (d+6)%7;};
const scheduledToday=t=>t.frequency!=='daily'||!Array.isArray(t.weekdays)||t.weekdays.includes(weekdayIndex());
const scheduleLabel=t=>t.frequency==='daily'&&Array.isArray(t.weekdays)?' · '+t.weekdays.map(i=>WEEKDAYS[i]).join(', '):'';
const activeTask=t=>t.active!==false;
const approvalModes=[['approval','Filho assinala; encarregado aprova'],['automatic','Filho conclui e recebe pontos'],['parent','Só o encarregado confirma']];
const approvalMode=t=>['approval','automatic','parent'].includes(t.approvalMode)?t.approvalMode:'approval';
const taskTime=t=>/^([01]\d|2[0-3]):[0-5]\d$/.test(t.taskTime||'')?t.taskTime:'';
const daySchedule=(t,i)=>t.customSchedule&&t.daySchedules?.[i]?t.daySchedules[i]:{start:taskTime(t),end:t.deadline||'',period:t.period||'Manhã'};
const dayTime=(t,i)=>daySchedule(t,i).start||'';
const dayPeriod=(t,i)=>dayTime(t,i)?timePeriod(dayTime(t,i)):(daySchedule(t,i).period||'Manhã');
const timePeriod=time=>time<'12:00'?'Manhã':time<'18:00'?'Tarde':'Noite';
const displayPeriod=t=>taskTime(t)?timePeriod(taskTime(t)):(t.period==='Depois da escola'?'Tarde':t.period==='Outro'?'Tarde':t.period||'Manhã');
const periodOptions=selected=>['Manhã','Tarde','Noite'].map(x=>`<option ${x===selected?'selected':''}>${x}</option>`).join('');
const modeOptions=selected=>approvalModes.map(([v,label])=>`<option value="${v}" ${v===selected?'selected':''}>${label}</option>`).join('');
const scheduleFields=(t={})=>`<label>Como programar a tarefa?<select name="timingMode" data-timing><option value="period" ${!taskTime(t)?'selected':''}>Apenas período (sem hora)</option><option value="time" ${taskTime(t)?'selected':''}>Com hora definida</option></select></label><label data-period-field>Período da tarefa<select name="period">${periodOptions(displayPeriod(t))}</select></label><label data-time-field>Hora da tarefa (não é a hora limite)<input type="time" name="taskTime" value="${esc(taskTime(t))}"></label><p class="muted" data-schedule-hint>Para guardar uma hora, seleciona «Com hora definida». O período é calculado automaticamente. A hora limite de conclusão é independente.</p><label>Hora de fim / limite geral (opcional)<input type="time" name="scheduleEnd" value="${esc(t.scheduleEnd||t.deadline||'')}"></label><label class="check"><input type="checkbox" name="customSchedule" data-custom-schedule ${t.customSchedule?'checked':''}> Personalizar horários por dia da semana</label><div data-custom-days ${t.customSchedule?'':'hidden'}><p class="muted">Os horários individuais só se aplicam quando esta opção está ativa. Os dias sem personalização mantêm o horário geral.</p>${WEEKDAYS.map((day,i)=>{const x=t.daySchedules?.[i]||{};return `<div class="day-schedule-row"><strong>${day}</strong><label>Início<input type="time" name="dayStart${i}" value="${esc(x.start||'')}"></label><label>Fim<input type="time" name="dayEnd${i}" value="${esc(x.end||'')}"></label></div>`}).join('')}</div><label>Quem valida a tarefa?<select name="approvalMode">${modeOptions(approvalMode(t))}</select></label>`;
function syncScheduleControls(form){
 const mode=form?.querySelector('[name="timingMode"]');if(!mode)return;
 const usingTime=mode.value==='time';
 const periodField=form.querySelector('[data-period-field]'),timeField=form.querySelector('[data-time-field]');
 const time=form.querySelector('[name="taskTime"]'),period=form.querySelector('[name="period"]');
 if(periodField)periodField.hidden=usingTime;
 // Keep the time control visible and enabled: typing a time automatically selects timed scheduling.
 if(timeField)timeField.hidden=false;
 if(time)time.disabled=false;
 if(period)period.disabled=usingTime;
 const hint=form.querySelector('[data-schedule-hint]');
 if(hint)hint.textContent=usingTime?'A hora introduzida determina automaticamente o período. A hora limite é independente.':'Sem hora definida. Se introduzires uma hora abaixo, a tarefa muda automaticamente para «Com hora definida».';
}
const scheduleValues=f=>{const time=String(f.get('taskTime')||'').trim(),timing=f.get('timingMode');if(timing==='time'&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))throw Error('Indica uma hora válida para a tarefa.');const taskTime=timing==='time'?time:'';const period=taskTime?timePeriod(taskTime):String(f.get('period')||'');if(!['Manhã','Tarde','Noite'].includes(period))throw Error('Escolhe um período válido.');const customSchedule=f.get('customSchedule')==='on';const scheduleEnd=String(f.get('scheduleEnd')||'');const valid=x=>!x||/^([01]\d|2[0-3]):[0-5]\d$/.test(x);if(!valid(scheduleEnd))throw Error('Hora de fim inválida.');const daySchedules={};if(customSchedule){for(let i=0;i<7;i++){const start=String(f.get('dayStart'+i)||'');const end=String(f.get('dayEnd'+i)||'');if(!valid(start)||!valid(end))throw Error('Horário inválido em '+WEEKDAYS[i]);if(start&&end&&end<=start)throw Error('A hora de fim deve ser posterior ao início em '+WEEKDAYS[i]);daySchedules[i]={start:start||taskTime,end:end||scheduleEnd,period:start?timePeriod(start):period};}}return {taskTime,period,scheduleEnd,customSchedule,daySchedules,approvalMode:f.get('approvalMode')};};
const calendarDays=t=>t.frequency==='daily'?(Array.isArray(t.weekdays)&&t.weekdays.length?t.weekdays:[0,1,2,3,4,5,6]):t.frequency==='weekly'?[0,1,2,3,4,5,6]:[];
function calendarMarkup(visible,kids){const children=kids.filter(k=>visible.some(t=>t.childId===k.uid&&activeTask(t)));return `<div class="calendar-toolbar"><button type="button" class="alt" data-action="printCalendar">🖨️ Imprimir calendário familiar (A4 horizontal)</button><p class="muted">As tarefas com hora aparecem primeiro em cada período. A impressão inclui quadrados para assinalar.</p></div><div id="familyCalendar" class="family-calendar"><h3>⭐ Missão+ · Calendário da família</h3>${children.map(k=>`<section class="family-child"><h4>${esc(k.name)}</h4><div class="weekly-calendar">${WEEKDAYS.map((day,i)=>`<section class="weekly-day"><b>${day}</b>${['Manhã','Tarde','Noite'].map(pr=>{const items=visible.filter(t=>activeTask(t)&&t.childId===k.uid&&calendarDays(t).includes(i)&&dayPeriod(t,i)===pr).sort((a,b)=>Number(!!dayTime(b,i))-Number(!!dayTime(a,i))||dayTime(a,i).localeCompare(dayTime(b,i))||String(a.title).localeCompare(String(b.title),'pt'));return items.length?`<div class="calendar-period"><strong>${pr}</strong>${items.map(t=>`<div class="calendar-entry"><span class="print-check">□</span><span>${dayTime(t,i)?`<b>${esc(dayTime(t,i))}</b> `:''}${esc(t.title)}${daySchedule(t,i).end?' (até '+esc(daySchedule(t,i).end)+')':''}</span></div>`).join('')}</div>`:''}).join('')}</section>`).join('')}</div></section>`).join('')||'<p>Sem tarefas programadas.</p>'}</div>`;}
const claimLabel=c=>c.status==='pending'?'Pendente':c.status==='approved'?'Aprovada':'Rejeitada';


async function load(){
  const snap=await getDoc(doc(db,'profiles',user.uid));profile=snap.exists()?{uid:user.uid,...snap.data()}:null;
  if(isAdmin()){
    const [p,i]=await Promise.all([getDocs(collection(db,'profiles')),getDocs(collection(db,'invitations'))]);
    people=p.docs.map(d=>({uid:d.id,...d.data()}));invites=i.docs.map(d=>({email:d.id,...d.data()}));
  }else if((profile?.role==='guardian'||isAdmin())&&profile?.status==='active'){
    const q=await getDocs(query(collection(db,'profiles'),where('guardianIds','array-contains',user.uid)));
    people=[profile,...q.docs.map(d=>({uid:d.id,...d.data()}))];invites=[];
  }else{people=profile?[profile]:[];invites=[];}
  const ids=isAdmin()?[]:profile?.role==='child'?[user.uid]:myKids().map(p=>p.uid);
  const fetch=async col=>isAdmin()?(await getDocs(collection(db,col))).docs.map(d=>({id:d.id,...d.data()})):(await Promise.all(ids.map(id=>getDocs(query(collection(db,col),where('childId','==',id)))))).flatMap(q=>q.docs.map(d=>({id:d.id,...d.data()})));
  tasks=await fetch('tasks');claims=await fetch('claims');rewards=await fetch('rewards');redemptions=await fetch('redemptions');
}
async function bootstrap(){
  if(isAdmin()){
    const ref=doc(db,'profiles',user.uid),snap=await getDoc(ref);
    if(!snap.exists())await setDoc(ref,{name:user.email,email:normalize(user.email),role:'admin',status:'active',guardianIds:[],balance:0,createdAt:serverTimestamp()});
    else if(snap.data().role!=='admin'||snap.data().status!=='active')await updateDoc(ref,{role:'admin',status:'active'});
    return;
  }
  const email=normalize(user.email),ref=doc(db,'profiles',user.uid);
  if((await getDoc(ref)).exists())return;
  const invitation=await getDoc(doc(db,'invitations',email));
  if(!invitation.exists())return;
  const inv=invitation.data();
  await setDoc(ref,{name:inv.name,email,role:inv.role,status:'pending',guardianIds:inv.role==='child'?(inv.guardianIds||[]):[],balance:0,createdAt:serverTimestamp()});
}
function familyLanding(allowed){
 const cards=[['inicio','⭐ Missão+','Tarefas, pontos e recompensas'],['estuda','📚 Estuda+','Fichas e evolução escolar'],['lanches','🥪 Lanches+','Planear lanches da manhã e da tarde'],['agenda','📅 Agenda+','Compromissos e atividades'],['compras','🛒 Compras+','Listas de compras'],['refeicoes','🍽️ Refeições+','Planear refeições']];
 return `<div class="family-landing"><h1>Olá, ${esc(profile?.name||user.email?.split('@')[0]||'família')}!</h1><p class="muted">Escolhe o que queres organizar hoje.</p><div class="family-module-grid">${cards.filter(c=>allowed.includes(c[0])).map(([id,title,desc])=>`<button type="button" class="family-module" data-go="${id}"><strong>${title}</strong><span>${desc}</span></button>`).join('')}</div>${isAdmin()?'<div class="family-admin"><h3>🛡️ Administração</h3><p>Gerir perfis, acessos e configurações existentes.</p><button type="button" data-go="pessoas">Gerir família e acessos</button></div>':''}</div>`;
}
function estudaFamilyView(){
 const kids=myKids();
 return `<section><h2>📚 Estuda+</h2><p>Escolhe um filho da Família+ para consultar a evolução no Estuda+. Os filhos autorizados no Estuda+ são importados para a lista da família quando abres o painel escolar.</p>${kids.length?`<form id="estudaFamilyForm"><label>Filho<select name="kid" required>${kids.map(k=>`<option value="${esc(k.uid)}">${esc(k.name)}</option>`).join('')}</select></label><button>Abrir Estuda+ para este filho</button></form>`:'<button type="button" class="alt" data-go="pessoas">Gerir filhos em Pessoas</button>'}<p><a class="family-estuda-link" href="./estuda/index.html">Abrir Estuda+ completo ↗</a></p></section>`;
}
$('screen').addEventListener('submit',e=>{
 if(e.target.id!=='estudaFamilyForm')return;
 e.preventDefault();
 const kid=myKids().find(k=>k.uid===new FormData(e.target).get('kid'));
 if(!kid)return;
 try{
  sessionStorage.setItem('familia-estuda-selection',JSON.stringify({owner:user.uid,id:kid.uid,name:kid.name,expires:Date.now()+1800000}));
  location.assign('./estuda/index.html');
 }catch{notice('Não foi possível abrir o Estuda+ para este filho.','error');}
});
function render(){
 $('login').hidden=!!user;$('workspace').hidden=!user;$('logout').hidden=!user;
 if(!user)return;
 $('identity').textContent=(profile?.name||user.email)+(isAdmin()?' · Administrador':'');
 const allowed=isAdmin()?['familia','inicio','painel','pessoas','tarefas','aprovações','recompensas','lanches','estuda','agenda','compras','refeicoes']:profile?.status==='active'&&profile?.role==='guardian'?['familia','inicio','painel','pessoas','tarefas','aprovações','recompensas','lanches','estuda','agenda','compras','refeicoes']:profile?.status==='active'&&profile?.role==='child'?['familia','inicio','painel','tarefas','recompensas']:['familia'];
 if(!allowed.includes(tab))tab='familia';
 const kidIds=new Set((isAdmin()||profile?.role==='guardian'?myKids():[]).map(k=>k.uid));
 const pendingApprovals=claims.filter(c=>c.status==='pending'&&kidIds.has(c.childId)).length;
 const pendingPrizes=redemptions.filter(r=>r.status==='pending'&&kidIds.has(r.childId)).length;
 const appEntries=[['inicio','⭐ Missão+'],['estuda','📚 Estuda+'],['lanches','🥪 Lanches+'],['agenda','📅 Agenda+'],['compras','🛒 Compras+'],['refeicoes','🍽️ Refeições+']].filter(([id])=>allowed.includes(id));
 const subnav=['inicio','painel','pessoas','tarefas','aprovações','recompensas'];
 const navItems=['familia',...(subnav.includes(tab)?subnav.filter(t=>allowed.includes(t)):[])];
 const navLabel=t=>({familia:'🏠 Família+',inicio:'Início',painel:'Painel',pessoas:'Família',tarefas:'Tarefas',aprovações:'Aprovações',recompensas:'Recompensas'})[t];
 $('tabs').innerHTML=navItems.filter(t=>allowed.includes(t)).map(t=>`<button type="button" class="${tab===t?'':'alt'}" data-tab="${t}">${navLabel(t)}${t==='aprovações'&&pendingApprovals?` <span class="nav-alert" aria-label="${pendingApprovals} tarefas pendentes">${pendingApprovals}</span>`:t==='recompensas'&&pendingPrizes?` <span class="nav-alert" aria-label="${pendingPrizes} recompensas pendentes">${pendingPrizes}</span>`:''}</button>`).join('')+(appEntries.length?`<select id="familyAppSelect" aria-label="Aplicações"><option value="" disabled ${appEntries.some(([id])=>id===tab)?'':'selected'}>☰ Aplicações</option>${appEntries.map(([id,label])=>`<option value="${id}" ${id===tab?'selected':''}>${label}</option>`).join('')}</select>`:'');
 $('screen').innerHTML=tab==='familia'?familyLanding(allowed):tab==='pessoas'?members():tab==='inicio'?home():tab==='painel'?familyPanel():tab==='tarefas'?taskScreen():tab==='aprovações'?approvalScreen():tab==='lanches'?(setLunchChildren(myKids()),lanchesView()):tab==='estuda'?estudaFamilyView():['agenda','compras','refeicoes'].includes(tab)?extrasView(tab,myKids()):rewardScreen();
 if(tab==='tarefas')filterPresetGroup();
 hydrateAvatars();
}

// Ilustrações locais por tipo de tarefa; não são guardadas no Firebase.
const TASK_IMAGES=[['auto','Automática (pelo nome)'],['geral','Genérica'],['dentes','Lavar os dentes'],['vestir','Vestir-se'],['refeicao','Refeições'],['cama','Fazer a cama'],['banho','Banho e higiene'],['escola','Escola e estudos'],['arrumar','Arrumar e limpar']];
function imagePicker(t={}){
 const selected=t.imageKey||'auto';
 return `<label>Imagem da tarefa<select name="imageKey" class="task-image-select">${TASK_IMAGES.map(([id,label])=>`<option value="${id}" ${selected===id?'selected':''}>${esc(label)}</option>`).join('')}</select></label><div class="task-image-preview"><img src="illustrations/${selected==='auto'?autoTaskImage(t.title):selected}.svg" alt="Pré-visualização da ilustração" onerror="this.onerror=null;this.src='illustrations/geral.svg'"><small>Podes escolher outra imagem, mesmo para tarefas predefinidas.</small></div>`;
}
function autoTaskImage(title){
 const name=String(title||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 const types=[[/dente|escov|boca/,'dentes'],[/vestir|roupa|pijama|calcar|sapato/,'vestir'],[/pequeno.almo|almoc|jantar|comer|lanche|refeic/,'refeicao'],[/cama|dormir|deitar/,'cama'],[/banho|duche|lavar.*mao|higiene/,'banho'],[/mochila|escola|estudar|trabalhos|livro|ler/,'escola'],[/arrumar|limpar|brinquedo|quarto/,'arrumar']];
 return types.find(([pattern])=>pattern.test(name))?.[1]||'geral';
}
function imageValue(form){const v=new FormData(form).get('imageKey')||'auto';if(!TASK_IMAGES.some(([id])=>id===v))throw Error('Imagem inválida.');return v;}
function panelIllustration(task){
 const type=TASK_IMAGES.some(([id])=>id===task.imageKey)&&task.imageKey!=='auto'?task.imageKey:autoTaskImage(task.title);
 return `<img class="panel-task-art" src="illustrations/${type}.svg" alt="Ilustração da tarefa: ${esc(task.title)}" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='illustrations/geral.svg'">`;
}

let panelChildId=null;
function familyPanel(){
 const adult=isAdmin()||(profile?.role==='guardian'&&profile?.status==='active');
 const kids=adult?myKids():people.filter(p=>p.uid===user.uid&&p.role==='child');
 if(panelChildId&&!kids.some(k=>k.uid===panelChildId))panelChildId=null;
 const chosen=kids.find(k=>k.uid===panelChildId);
 const title='<div class="panel-heading"><h2>🏡 Painel de Tarefas</h2><p class="muted">Tarefas de hoje · Seleciona um filho para consultar as suas missões.</p><button type="button" class="alt" data-action="panelFullScreen">⛶ Ecrã completo</button></div>';
 if(!chosen)return title+'<div class="family-panel-kids">'+kids.map(k=>{const remaining=tasks.filter(t=>t.childId===k.uid&&activeTask(t)&&scheduledToday(t)&&!claims.some(c=>c.taskId===t.id&&c.childId===k.uid&&c.periodKey===period(t).key&&c.status==='approved')).length;return `<button type="button" class="panel-kid" data-action="panelChoose" data-id="${esc(k.uid)}">${avatarMarkup(k)}<strong>${esc(k.name)}</strong><span>${remaining} tarefas por concluir</span></button>`;}).join('')+'</div>';
 const today=weekdayIndex();const todays=tasks.filter(t=>t.childId===chosen.uid&&activeTask(t)&&scheduledToday(t));
 const sections=['Manhã','Tarde','Noite'].map(pr=>{const group=todays.filter(t=>{const v=dayPeriod(t,today);return (v==='Depois da escola'||v==='Outro'?'Tarde':v)===pr}).sort((a,b)=>Number(!!dayTime(b,today))-Number(!!dayTime(a,today))||dayTime(a,today).localeCompare(dayTime(b,today))||a.title.localeCompare(b.title,'pt'));
 return `<section class="panel-period"><h3>${pr==='Manhã'?'🌅':pr==='Tarde'?'☀️':'🌙'} ${pr}</h3>${group.length?group.map(t=>{const c=claims.find(x=>x.taskId===t.id&&x.childId===chosen.uid&&x.periodKey===period(t).key);const status=c?.status==='approved'?'done':c?.status==='pending'?'pending':'todo';const label=status==='done'?'Concluída':status==='pending'?'Aguarda aprovação':'Por realizar';const action=adult?'panelParentComplete':'panelChildComplete';const allowed=status==='todo'&&(adult||approvalMode(t)!=='parent');return `<article class="panel-task">${panelIllustration(t)}<div class="panel-task-info"><strong>${esc(t.title)}</strong><small>${dayTime(t,today)?esc(dayTime(t,today)):'Sem hora'}${daySchedule(t,today).end?' · até '+esc(daySchedule(t,today).end):''} · ${Number(t.points)} ⭐</small><small>${esc(label)}${approvalMode(t)==='parent'?' · Só encarregado':approvalMode(t)==='approval'?' · Sujeita a aprovação':''}</small></div><button type="button" class="panel-check ${status}" data-action="${action}" data-id="${esc(t.id)}" ${allowed?'':'disabled'} aria-label="${esc(allowed?'Marcar '+t.title+' como concluída':label)}">${status==='done'?'✔':status==='pending'?'◷':'✓'}</button></article>`;}).join(''):'<p class="muted">Sem tarefas neste período.</p>'}</section>`;}).join('');
 return title+`<button type="button" class="alt" data-action="panelBack">← Todos os filhos</button><div class="panel-selected">${avatarMarkup(chosen)}<h2>${esc(chosen.name)}</h2></div>${adult?'<p class="muted">Modo encarregado: para concluir uma tarefa é necessária confirmação. Para o filho assinalar as suas tarefas, deve iniciar sessão na própria conta.</p>':''}`+sections;
}
function weeklyProgress(kidId){
 const now=new Date(),monday=new Date(now.getFullYear(),now.getMonth(),now.getDate()-((now.getDay()+6)%7));
 const sunday=new Date(monday);sunday.setDate(sunday.getDate()+7);
 const dated=claims.filter(c=>c.childId===kidId).filter(c=>{
   const stamp=c.submittedAt||c.reviewedAt;
   const date=stamp?.toDate?.();
   return date instanceof Date&&date>=monday&&date<sunday;
 });
 const approved=dated.filter(c=>c.status==='approved');
 const points=approved.reduce((total,c)=>total+Number(c.points||0),0);
 return {completed:approved.length,points,pending:dated.filter(c=>c.status==='pending').length};
}
function home(){
 const adult=isAdmin()||profile?.role==='guardian';
 const kids=adult?myKids():profile?.role==='child'?[profile]:[];
 const ids=new Set(kids.map(k=>k.uid));
 const pendingClaims=claims.filter(c=>c.status==='pending'&&ids.has(c.childId));
 const pendingRewards=redemptions.filter(r=>r.status==='pending'&&ids.has(r.childId));
 const cards=kids.map(k=>{
   const kidTasks=tasks.filter(t=>t.childId===k.uid&&activeTask(t)&&scheduledToday(t));
   const pending=pendingClaims.filter(c=>c.childId===k.uid).length;
   const week=weeklyProgress(k.uid);
   return `<article class="card"><h3 class="kid-heading">${avatarMarkup(k)} ${esc(k.name)}</h3>${adult&&allowedPhoto(k.uid)?`<details class="photo-menu"><summary>📷 Fotografia <span class="menu-chevron">⌄</span></summary><div class="photo-actions"><label class="photo-button">📷 Câmara<input type="file" accept="image/*" capture="environment" data-photo="${esc(k.uid)}"></label><label class="photo-button">🖼️ Galeria<input type="file" accept="image/*" data-photo="${esc(k.uid)}"></label>${k.photoData?`<button type="button" class="alt" data-action="removePhoto" data-id="${esc(k.uid)}">Remover foto</button>`:''}</div></details>`:''}<div class="points">${score(k.uid)} ⭐</div><p class="muted">${kidTasks.length} tarefas previstas hoje · ${pending} por aprovar</p><div class="week-stats"><b>Esta semana</b><span>${week.completed} tarefas aprovadas</span><span>+${week.points} ⭐ conquistados</span>${week.pending?`<span>${week.pending} a aguardar aprovação</span>`:''}</div></article>`;
 }).join('');
 if(!isAdmin()&&(!profile||profile.status!=='active'))return `<h2>Bem-vindo à Missão+</h2><p>${!profile?'Ainda não existe um convite para este email. Pede ao administrador que te adicione.':'A tua conta foi criada. Aguarda a autorização do administrador.'}</p><p class="muted">Se esta deveria ser a tua conta de administrador, verifica se entraste com o email original. O acesso administrativo está associado ao identificador da conta no Firebase Authentication, não ao nome ou email apresentado.</p>`;
 const summary=adult?`<div class="grid"><article class="card"><h3>Tarefas por aprovar</h3><div class="points">${pendingClaims.length}</div></article><article class="card"><h3>Recompensas pedidas</h3><div class="points">${pendingRewards.length}</div></article><article class="card"><h3>Filhos associados</h3><div class="points">${kids.length}</div></article></div>`:'';
 const actions=`<div class="home-desktop-actions login-actions"><button type="button" data-go="tarefas">Ver tarefas</button>${adult?'<button type="button" class="alt" data-go="aprovações">Ver aprovações</button>':''}<button type="button" class="alt" data-go="recompensas">Ver recompensas</button><button type="button" class="alt" data-action="refreshData">Atualizar dados</button></div><details class="home-mobile-menu"><summary>☰ Menu de ações <span class="menu-chevron">⌄</span></summary><div class="home-menu-items"><button type="button" data-go="tarefas">Ver tarefas</button>${adult?'<button type="button" class="alt" data-go="aprovações">Ver aprovações</button>':''}<button type="button" class="alt" data-go="recompensas">Ver recompensas</button><button type="button" class="alt" data-action="refreshData">Atualizar dados</button></div></details>`;
 const alerts=adult&&(pendingClaims.length||pendingRewards.length)?`<article class="card attention-summary"><h3>🔔 Notificações pendentes</h3>${pendingClaims.length?`<p><strong>${pendingClaims.length}</strong> tarefa(s) a aguardar aprovação. <button type="button" class="alt" data-go="aprovações">Rever tarefas</button></p>`:''}${pendingRewards.length?`<p><strong>${pendingRewards.length}</strong> recompensa(s) a aguardar decisão. <button type="button" class="alt" data-go="recompensas">Rever recompensas</button></p>`:''}</article>`:'';
 return `<h2>O teu painel</h2><p class="muted">Resumo das missões e recompensas</p>${alerts}${summary}<h3>${adult?'Pontos dos filhos':'Os meus pontos e tarefas'}</h3><div class="grid">${cards||'<p>Ainda não existem filhos associados.</p>'}</div>${actions}`;
}

function members(){
 const guardians=isAdmin()?[{uid:user.uid,name:profile?.name||user.email,email:user.email,role:'admin',status:'active'},...people.filter(p=>p.uid!==user.uid&&p.role==='guardian'&&p.status==='active')]:[profile];
 const children=people.filter(p=>p.role==='child'&&(isAdmin()||(p.guardianIds||[]).includes(user.uid)));
 const childOptions=guardians.map(g=>`<label class="check"><input type="checkbox" name="guardian" value="${esc(g.uid)}" ${g.uid===user.uid?'checked':''}> ${esc(g.name)} (${esc(g.email)})</label>`).join('');
 const invitations=(isAdmin()?invites:[]).map(i=>`<article class="item"><div><b>${esc(i.name)}</b><p class="muted">${esc(i.email)} · ${i.role==='guardian'?'Encarregado':'Filho'} · Convite criado</p></div><button class="alt" data-action="deleteInvite" data-id="${esc(i.email)}">Remover convite</button></article>`).join('');
 const accounts=people.filter(p=>p.uid!==ADMIN_UID&&(isAdmin()||p.role==='child'&&(p.guardianIds||[]).includes(user.uid))).map(p=>`<article class="item"><div>${p.role==='child'?avatarMarkup(p):''}<b>${esc(p.name)}</b><p class="muted">${esc(p.email||'Sem email')} · ${p.role==='guardian'?'Encarregado':'Filho'} · ${p.status==='active'?'Ativo':'Aguarda aprovação'}</p>${p.role==='child'?`<p class="muted">Encarregados: ${(p.guardianIds||[]).map(id=>esc(personName(id))).join(', ')||'Nenhum'}</p><div class="photo-actions"><label class="photo-button">📷 Câmara<input type="file" accept="image/*" capture="environment" data-photo="${esc(p.uid)}"></label><label class="photo-button">🖼️ Galeria<input type="file" accept="image/*" data-photo="${esc(p.uid)}"></label>${p.photoData?`<button type="button" class="alt" data-action="removePhoto" data-id="${esc(p.uid)}">Remover foto</button>`:''}</div><div class="login-actions child-management"><button type="button" class="alt" data-action="editChild" data-id="${esc(p.uid)}">Editar perfil</button>${(p.accountType==='managed'||(!p.email&&!p.accountType))?`<button type="button" class="alt" data-action="unlinkChild" data-id="${esc(p.uid)}">Desassociar</button>${isAdmin()?`<button type="button" class="red" data-action="deleteChild" data-id="${esc(p.uid)}">Eliminar perfil</button>`:''}`:''}</div>`:''}</div>${(isAdmin()||(p.role==='child'&&(p.guardianIds||[]).includes(user.uid)))&&p.status==='pending'?`<button data-action="approve" data-id="${esc(p.uid)}">Autorizar</button>`:''}</article>`).join('');
 return `<h2>Família e acessos</h2><p class="muted">${isAdmin()?'Como administrador, também podes ser encarregado dos teus filhos.':'Podes criar diretamente os perfis dos teus filhos.'} Os perfis sem email continuam disponíveis. Para acesso próprio, cria uma conta com email e password.</p>
 <div class="grid">${isAdmin()?`<article class="card"><h3>Adicionar encarregado</h3><form id="guardianForm"><label>Nome<input name="name" required maxlength="100"></label><label>Email<input name="email" type="email" required></label><button>Criar convite</button></form></article>`:""}
 <article class="card"><h3>Adicionar filho</h3><p class="muted">Cria imediatamente um perfil, sem email nem convite. O encarregado gere as tarefas e recompensas.</p><form id="childForm"><label>Nome do filho<input name="name" required maxlength="100"></label><label>Ano escolar (opcional)<select name="schoolYear"><option value="">Selecionar ano</option><option value="Pré-escolar">Pré-escolar</option>${Array.from({length:12},(_,i)=>`<option value="${i+1}">${i+1}.º ano</option>`).join('')}</select></label><fieldset><legend>Encarregados responsáveis</legend>${isAdmin()?childOptions:`<label class="check"><input type="checkbox" checked disabled> Eu (${esc(profile?.name||'Encarregado')})</label><input type="hidden" name="guardian" value="${esc(user.uid)}">`}</fieldset><button>Criar perfil do filho</button></form></article><article class="card"><h3>Criar acesso do filho</h3><p class="muted">Cria a conta com email e password sem sair da tua sessão. O acesso precisa de autorização do encarregado.</p><form id="childAccessForm"><label>Nome<input name="name" required maxlength="100"></label><label>Email do filho<input name="email" type="email" required></label><label>Password inicial<input name="password" type="password" minlength="8" autocomplete="new-password" required></label><button>Criar conta com password</button></form><p class="muted">O PIN não substitui a autenticação por email. Não está ativado nesta versão.</p></article></div>
 ${isAdmin()?`<article class="card"><h3>Convites</h3>${invitations||'<p class="muted">Ainda não existem convites.</p>'}<p class="muted">Partilha com cada pessoa o endereço da Missão+ e pede-lhe que clique em «Criar conta» com o email convidado. O convite não envia emails automaticamente.</p></article>`:''}
 <div id="childEditor"></div><article class="card"><h3>Utilizadores registados</h3>${accounts||'<p class="muted">Ainda não existem utilizadores.</p>'}</article>`;
}
function taskScreen(){
 const adult=isAdmin()||profile?.role==='guardian',kids=myKids();
 const groups=Object.keys(PRESET_GROUPS),groupOptions=`<option value="all">Todas as categorias</option>`+groups.map(g=>`<option value="${esc(g)}">${esc(g)}</option>`).join('');
 const weekdayControls=WEEKDAYS.map((day,i)=>`<label class="day-check"><input type="checkbox" name="weekday" value="${i}" checked><span>${day}</span></label>`).join('');
 const form=adult?`<article class="card"><h3>Nova tarefa</h3><p class="muted">Seleciona uma categoria e pesquisa diretamente na lista. Também podes escrever uma tarefa nova.</p><form id="taskForm"><label>Tipo de tarefa<select id="taskPresetGroup" aria-label="Tipo de tarefa">${groupOptions}</select></label><label>Escolher ou pesquisar tarefa<div class="combo" id="taskCombo"><input id="taskPresetSearch" type="text" autocomplete="off" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="presetChoices" placeholder="Escreve para pesquisar ou escolhe uma tarefa…"><button type="button" class="combo-arrow" id="taskComboToggle" aria-label="Mostrar tarefas">⌄</button><div id="presetChoices" class="combo-options" role="listbox" hidden></div></div></label><label>Nome da tarefa (podes editar)<input name="title" id="taskTitle" required maxlength="120" placeholder="Escreve uma tarefa personalizada"></label><label>Descrição<textarea name="description" maxlength="600" placeholder="Instruções opcionais"></textarea></label><label>Tipo<select name="category" id="taskCategory"><option value="Responsabilidade">Responsabilidade diária</option><option value="Tarefa doméstica">Tarefa doméstica</option></select></label>${imagePicker()}${scheduleFields()}<label>Pontos<input name="points" id="taskPoints" type="number" min="1" max="500" required value="10"></label><label>Frequência<select name="frequency" id="taskFrequency"><option value="daily">Diária</option><option value="weekly">Semanal (uma vez por semana)</option><option value="once">Pontual</option></select></label><fieldset id="weekdayField"><legend>Dias da semana em que a tarefa se repete</legend><div class="weekday-grid">${weekdayControls}</div><p class="muted">Seleciona os dias pretendidos. Em cada dia selecionado, a tarefa pode ser concluída uma vez.</p></fieldset><fieldset><legend>Filhos associados</legend>${kids.map(k=>`<label class="check"><input type="checkbox" name="child" value="${esc(k.uid)}">${esc(k.name)}</label>`).join('')||'<p>Primeiro associa um filho ativo.</p>'}</fieldset><button>Criar tarefa</button></form></article>`:'';
 const visible=tasks.filter(t=>t.deleted!==true&&(adult?kids.some(k=>k.uid===t.childId):t.childId===user.uid));
 return `<h2>Tarefas e responsabilidades</h2><p class="muted">Escolhe uma sugestão ou escreve a tua própria tarefa. Cada tarefa pode ter a sua própria regra de aprovação.</p>${adult?copyTasksPanel(kids):''}${form}<article class="card"><div class="filterbar"><label>Pesquisar tarefas<input id="taskSearch" type="search" placeholder="Nome ou descrição"></label><label>Mostrar<select id="taskStatusFilter"><option value="active">Ativas</option><option value="archived">Arquivadas</option><option value="all">Todas</option></select></label></div><p class="muted" id="taskCount"></p></article><div id="editTaskContainer"></div><article class="card"><h3>Calendário semanal por filho e período</h3>${calendarMarkup(visible,kids)}</article><div class="grid" id="taskList">${visible.map(t=>{const per=period(t),claim=claims.find(c=>c.taskId===t.id&&c.childId===t.childId&&c.periodKey===per.key);return `<article class="card task-card" data-search="${esc((t.title+' '+(t.description||'')+' '+personName(t.childId)).toLowerCase())}" data-active="${activeTask(t)?'yes':'no'}"><div class="row"><h3>${esc(t.title)}</h3><span class="pill">${Number(t.points)} ⭐</span></div><p>${esc(t.description||'')}</p><p class="muted">${esc(t.category)} · ${esc(displayPeriod(t))} · ${esc(t.frequency==='daily'?'Diária':t.frequency==='weekly'?'Semanal':'Pontual')}${scheduleLabel(t)}${taskTime(t)?' · '+esc(taskTime(t)):''} · ${esc(approvalModes.find(m=>m[0]===approvalMode(t))?.[1]||'')}</p>${adult?`<p>Para: ${esc(personName(t.childId))}</p><p class="muted">${activeTask(t)?'Ativa':'Arquivada'}</p><div class="task-actions"><button class="alt" data-action="editTask" data-id="${esc(t.id)}">Editar</button><button class="red" data-action="deleteTask" data-id="${esc(t.id)}">Eliminar</button>${activeTask(t)?`<button class="alt" data-action="completeByParent" data-id="${esc(t.id)}">✓ Concluir</button><button class="alt" data-action="archiveTask" data-id="${esc(t.id)}">Arquivar</button>`:`<button class="alt" data-action="restoreTask" data-id="${esc(t.id)}">Reativar</button>`}</div>`:`<p>${claim?'Estado: '+(claim.status==='pending'?'A aguardar aprovação':claim.status==='approved'?'Aprovada':'Rejeitada — podes tentar novamente'):'Ainda não submetida'}</p>${!scheduledToday(t)?'<p class="muted">Não está prevista para hoje.</p>':''}${activeTask(t)&&scheduledToday(t)&&approvalMode(t)!=='parent'&&(!claim||claim.status==='rejected')?`<button data-action="submitTask" data-id="${esc(t.id)}">Marcar como concluída</button>`:''}`}</article>`}).join('')}</div>`;
}
function openTaskEditor(id){
 const t=tasks.find(x=>x.id===id),target=$('editTaskContainer');
 if(!t||!target||!(isAdmin()||myKids().some(k=>k.uid===t.childId)))throw Error('Sem autorização.');
 const opts=(values,selected)=>values.map(v=>`<option value="${esc(v[0])}" ${v[0]===selected?'selected':''}>${esc(v[1])}</option>`).join('');
 const days=WEEKDAYS.map((day,i)=>`<label class="day-check"><input type="checkbox" name="weekday" value="${i}" ${!Array.isArray(t.weekdays)||t.weekdays.includes(i)?'checked':''}><span>${day}</span></label>`).join('');
 target.innerHTML=`<article class="card"><h3>Editar tarefa — ${esc(t.title)}</h3><form id="editTaskForm" data-id="${esc(t.id)}"><label>Nome<input name="title" required maxlength="120" value="${esc(t.title)}"></label><label>Descrição<textarea name="description" maxlength="600">${esc(t.description||'')}</textarea></label><label>Tipo<select name="category">${opts([['Responsabilidade','Responsabilidade diária'],['Tarefa doméstica','Tarefa doméstica']],t.category)}</select></label>${imagePicker(t)}${scheduleFields(t)}<label>Pontos<input name="points" type="number" min="1" max="500" required value="${Number(t.points)}"></label><label>Frequência<select name="frequency" id="editTaskFrequency">${opts([['daily','Diária'],['weekly','Semanal'],['once','Pontual']],t.frequency)}</select></label><fieldset id="editWeekdayField" ${t.frequency!=='daily'?'hidden':''}><legend>Dias da semana</legend><div class="weekday-grid">${days}</div></fieldset><p class="muted">Associada a ${esc(personName(t.childId))}. O histórico de conclusões e os pontos anteriores são preservados.</p><div class="task-actions"><button type="submit">Guardar alterações</button><button type="button" class="alt" data-action="cancelEdit">Cancelar</button></div></form></article>`;
 syncScheduleControls(target.querySelector('form'));
 target.scrollIntoView({behavior:'smooth',block:'start'});
}
async function saveTaskEdit(form){
 const t=tasks.find(x=>x.id===form.dataset.id);if(!t||!(isAdmin()||myKids().some(k=>k.uid===t.childId)))throw Error('Sem autorização.');
 syncScheduleControls(form);const f=new FormData(form),title=String(f.get('title')||'').trim(),points=Number(f.get('points')),frequency=f.get('frequency');
 const weekdays=[...new Set(f.getAll('weekday').map(Number))].sort((a,b)=>a-b);
 if(!title||!Number.isInteger(points)||points<1||points>500)throw Error('Verifica o nome e os pontos.');
 if(frequency==='daily'&&!weekdays.length)throw Error('Seleciona pelo menos um dia.');
 await updateDoc(doc(db,'tasks',t.id),{title,description:String(f.get('description')||'').trim(),category:f.get('category'),imageKey:imageValue(form),...scheduleValues(f),points,frequency,weekdays:frequency==='daily'?weekdays:[],deadline:f.get('scheduleEnd')||''});
 await load();render();applyTaskFilters();notice('Tarefa atualizada. O calendário já reflete o período guardado.');
}
function applyTaskFilters(){if($('copyChoices')&&!$('copyChoices').children.length)refreshCopyChoices();
 const search=normalize($('taskSearch')?.value),filter=$('taskStatusFilter')?.value||'active';let count=0;
 document.querySelectorAll('.task-card').forEach(card=>{const active=card.dataset.active==='yes',show=(!search||card.dataset.search.includes(search))&&(filter==='all'||(filter==='active'?active:!active));card.hidden=!show;if(show)count++;});
 if($('taskCount'))$('taskCount').textContent=count+' tarefa(s) encontrada(s)';
}
function filterPresetGroup(open=false){
 const group=$('taskPresetGroup')?.value||'all', input=$('taskPresetSearch'), list=$('presetChoices');
 if(!input||!list)return;
 const search=normalize(input.value);
 const matches=PRESETS.map((t,i)=>({t,i})).filter(({t})=>(group==='all'||presetGroupFor(t[0])===group)&&(!search||normalize(t[0]).includes(search)));
 list.innerHTML=matches.map(({t,i})=>`<button type="button" role="option" class="combo-option" data-preset-index="${i}">${esc(t[0])}${group==='all'?` <small>· ${esc(presetGroupFor(t[0]))}</small>`:''}</button>`).join('')+'<button type="button" role="option" class="combo-option custom" data-preset-index="">✏️ Usar tarefa personalizada</button>';
 list.hidden=!open;input.setAttribute('aria-expanded',String(open));
 if(!matches.length)list.innerHTML='<div class="combo-empty">Sem sugestões. Podes utilizar o texto escrito como tarefa personalizada.</div>'+list.innerHTML;
}
function choosePreset(idx){
 const input=$('taskPresetSearch');if(!input)return;
 if(idx===''){
  const typed=input.value.trim();$('taskTitle').value=typed;input.value=typed;
 }else{
  const t=PRESETS[Number(idx)];if(!t)return;
  input.value=t[0];$('taskTitle').value=t[0];$('taskCategory').value=t[1];document.querySelector('#taskForm [name=period]').value=t[2]==='Depois da escola'||t[2]==='Outro'?'Tarde':t[2];$('taskPoints').value=t[3];$('taskFrequency').value=t[4];
 }
 filterPresetGroup(false);
}
function approvalScreen(){
 if(!(isAdmin()||profile?.role==='guardian'))return '<p>Sem acesso.</p>';
 const accessible=claims.filter(c=>myKids().some(k=>k.uid===c.childId));
 const pending=accessible.filter(c=>c.status==='pending'),history=accessible.filter(c=>c.status!=='pending').sort((a,b)=>(b.reviewedAt?.seconds||0)-(a.reviewedAt?.seconds||0)).slice(0,40);
 return `<h2>Aprovar tarefas</h2><p class="muted">Só a aprovação adiciona pontos ao total do filho.</p><h3>Pendentes (${pending.length})</h3><div class="grid">${pending.map(c=>`<article class="card"><h3>${esc(taskTitle(c.taskId))}</h3><p>${esc(personName(c.childId))} · ${Number(c.points)} ⭐</p><div class="login-actions"><button data-action="approveClaim" data-id="${esc(c.id)}">Aprovar</button><button class="red" data-action="rejectClaim" data-id="${esc(c.id)}">Rejeitar</button></div></article>`).join('')||'<p>Não há tarefas pendentes.</p>'}</div><h3>Histórico de decisões</h3><div class="grid">${history.map(c=>`<article class="card"><b>${esc(taskTitle(c.taskId))}</b><p>${esc(personName(c.childId))} · ${Number(c.points)} ⭐ · ${claimLabel(c)}</p></article>`).join('')||'<p>Ainda não há decisões.</p>'}</div>`;
}
async function createTask(form){
 if(!(isAdmin()||profile?.role==='guardian'))throw Error('Sem autorização.');
 syncScheduleControls(form);
 const f=new FormData(form),ids=f.getAll('child'),points=Number(f.get('points'));
 if(!ids.length||ids.some(id=>!myKids().some(k=>k.uid===id)))throw Error('Seleciona filhos associados e ativos.');
 if(!Number.isInteger(points)||points<1||points>500)throw Error('Pontos inválidos.');
 const title=String(f.get('title')||'').trim();if(!title)throw Error('Indica o nome da tarefa.');
 const weekdays=f.get('frequency')==='daily'?[...new Set(f.getAll('weekday').map(Number))].sort((a,b)=>a-b):[];
 if(f.get('frequency')==='daily'&&(!weekdays.length||weekdays.some(n=>!Number.isInteger(n)||n<0||n>6)))throw Error('Seleciona pelo menos um dia da semana.');
 for(const childId of ids){const ref=doc(collection(db,'tasks'));await setDoc(ref,{title,description:String(f.get('description')||'').trim(),category:f.get('category'),imageKey:imageValue(form),...scheduleValues(f),points,frequency:f.get('frequency'),weekdays,deadline:f.get('deadline'),childId,active:true,createdBy:user.uid,createdAt:serverTimestamp()});}
 await load();render();applyTaskFilters();notice('Tarefa criada.');
}
async function taskAction(action,id){
 if(action==='submitTask'){
   const t=tasks.find(t=>t.id===id);if(!t||!activeTask(t)||!scheduledToday(t)||profile?.role!=='child'||t.childId!==user.uid||approvalMode(t)==='parent')throw Error('Tarefa não disponível.');
   const p=period(t),claimId=`${id}_${user.uid}_${p.key}`,ref=doc(db,'claims',claimId);
   await runTransaction(db,async tx=>{const old=await tx.get(ref);if(old.exists()&&old.data().status!=='rejected')throw Error('Já submeteste esta tarefa.');const data={taskId:id,childId:user.uid,periodKey:p.key,periodStart:p.start,points:t.points,status:approvalMode(t)==='automatic'?'approved':'pending',submittedAt:serverTimestamp()};if(old.exists())tx.update(ref,{status:approvalMode(t)==='automatic'?'approved':'pending',submittedAt:serverTimestamp()});else tx.set(ref,data);});
 }else{
   const c=claims.find(c=>c.id===id);if(!c||!myKids().some(k=>k.uid===c.childId))throw Error('Sem autorização.');
   await runTransaction(db,async tx=>{const ref=doc(db,'claims',id),snap=await tx.get(ref);if(!snap.exists()||snap.data().status!=='pending')throw Error('Pedido já tratado.');tx.update(ref,{status:action==='approveClaim'?'approved':'rejected',reviewedBy:user.uid,reviewedAt:serverTimestamp()});});
 }
 await load();render();if(tab==='tarefas'){applyTaskFilters();refreshCopyChoices()};notice('Alteração guardada.');
}



// v36: as cópias são novos documentos; nunca se copiam conclusões ou pontos acumulados.
let copyDrafts=[];
function copyTasksPanel(kids){
 if(kids.length<2)return '<article class="card"><h3>Copiar tarefas para outro filho</h3><p class="muted">Associa pelo menos dois filhos ativos para utilizar esta opção.</p></article>';
 const options=kids.map(k=>`<option value="${esc(k.uid)}">${esc(k.name)}</option>`).join('');
 return `<article class="card"><h3>Copiar tarefas para outro filho</h3><p class="muted">Seleciona a origem e o destino. Revê e edita cada cópia antes de guardar. As tarefas e os pontos originais não são alterados.</p><div class="copy-pickers"><label>Filho de origem<select id="copySource">${options}</select></label><label>Filho de destino<select id="copyTarget">${kids.map((k,i)=>`<option value="${esc(k.uid)}" ${i===1?'selected':''}>${esc(k.name)}</option>`).join('')}</select></label></div><div class="task-actions"><button type="button" class="alt" data-action="copySelectAll">Selecionar todas</button><button type="button" class="alt" data-action="copyClear">Desmarcar todas</button></div><div id="copyChoices"></div><button type="button" data-action="copyPrepare">Rever e editar as selecionadas</button><div id="copyDraftArea"></div></article>`;
}
function refreshCopyChoices(){
 const source=$('copySource')?.value,area=$('copyChoices');if(!area)return;
 const candidates=tasks.filter(t=>t.childId===source&&activeTask(t));
 area.innerHTML=candidates.length?candidates.map(t=>`<label class="check copy-choice"><input type="checkbox" name="copyChoice" value="${esc(t.id)}"><span><b>${esc(t.title)}</b> · ${Number(t.points)} ⭐ · ${esc(t.frequency==='daily'?'Diária':t.frequency==='weekly'?'Semanal':'Pontual')}</span></label>`).join(''):'<p class="muted">Este filho não tem tarefas ativas.</p>';
 copyDrafts=[];if($('copyDraftArea'))$('copyDraftArea').innerHTML='';
}
function copyEditorMarkup(t,i){
 const opts=(values,selected)=>values.map(v=>`<option value="${esc(v[0])}" ${v[0]===selected?'selected':''}>${esc(v[1])}</option>`).join('');
 const days=WEEKDAYS.map((d,n)=>`<label class="day-check"><input type="checkbox" name="weekday" value="${n}" ${(t.weekdays||[]).includes(n)?'checked':''}><span>${d}</span></label>`).join('');
 return `<article class="card"><h4>Cópia ${i+1}: ${esc(t.title)}</h4><form class="copy-draft" data-source-id="${esc(t.id)}"><label>Nome<input name="title" required maxlength="120" value="${esc(t.title)}"></label><label>Descrição<textarea name="description" maxlength="600">${esc(t.description||'')}</textarea></label><label>Tipo<select name="category">${opts([['Responsabilidade','Responsabilidade diária'],['Tarefa doméstica','Tarefa doméstica']],t.category)}</select></label>${imagePicker(t)}${scheduleFields(t)}<label>Pontos<input name="points" type="number" min="1" max="500" required value="${Number(t.points)}"></label><label>Frequência<select name="frequency" data-copy-frequency>${opts([['daily','Diária'],['weekly','Semanal'],['once','Pontual']],t.frequency)}</select></label><fieldset data-copy-weekdays ${t.frequency!=='daily'?'hidden':''}><legend>Dias da semana</legend><div class="weekday-grid">${days}</div></fieldset></form></article>`;
}
function prepareCopies(){
 const source=$('copySource')?.value,target=$('copyTarget')?.value;
 if(!source||!target||source===target)throw Error('Escolhe dois filhos diferentes.');
 const ids=[...document.querySelectorAll('[name=copyChoice]:checked')].map(x=>x.value);
 if(!ids.length)throw Error('Seleciona pelo menos uma tarefa.');
 copyDrafts=ids.map(id=>tasks.find(t=>t.id===id&&t.childId===source&&activeTask(t))).filter(Boolean);
 const area=$('copyDraftArea');area.innerHTML=`<h3>Rever cópias para ${esc(personName(target))}</h3><p class="muted">Altera os horários, dias, pontos e aprovação antes de guardar. Cada tarefa será criada de forma independente.</p>${copyDrafts.map(copyEditorMarkup).join('')}<div class="task-actions"><button type="button" data-action="copySave">Guardar ${copyDrafts.length} cópia(s)</button><button type="button" class="alt" data-action="copyCancel">Cancelar</button></div>`;
 area.querySelectorAll('.copy-draft').forEach(syncScheduleControls);
 area.scrollIntoView({behavior:'smooth',block:'start'});
}
async function saveCopies(){
 const source=$('copySource')?.value,target=$('copyTarget')?.value,kids=myKids();
 if(source===target||!kids.some(k=>k.uid===source)||!kids.some(k=>k.uid===target))throw Error('Origem ou destino inválido.');
 const forms=[...document.querySelectorAll('.copy-draft')];if(!forms.length||forms.length!==copyDrafts.length)throw Error('Prepara primeiro as cópias.');
 const payloads=forms.map(form=>{
  syncScheduleControls(form);if(!form.reportValidity())throw Error('Verifica os campos obrigatórios.');
  const f=new FormData(form),original=tasks.find(t=>t.id===form.dataset.sourceId&&t.childId===source&&activeTask(t));
  if(!original)throw Error('A tarefa de origem já não está disponível.');
  const title=String(f.get('title')||'').trim(),description=String(f.get('description')||'').trim(),points=Number(f.get('points')),frequency=f.get('frequency');
  const weekdays=frequency==='daily'?[...new Set(f.getAll('weekday').map(Number))].sort((a,b)=>a-b):[];
  if(!title||title.length>120||description.length>600||!Number.isInteger(points)||points<1||points>500||frequency==='daily'&&!weekdays.length)throw Error('Verifica os dados de «'+title+'».');
  const sch=scheduleValues(f);
  return {title,description,category:f.get('category'),imageKey:imageValue(form),...sch,points,frequency,weekdays,deadline:sch.scheduleEnd||'',childId:target,active:true,createdBy:user.uid,createdAt:serverTimestamp()};
 });
 // Evita duplicações involuntárias; o utilizador pode cancelar a operação.
 const existing=tasks.filter(t=>t.childId===target&&activeTask(t));
 const duplicates=payloads.filter(p=>existing.some(t=>normalize(t.title)===normalize(p.title)));
 if(duplicates.length&&!confirm('O filho de destino já tem '+duplicates.length+' tarefa(s) com o mesmo nome: '+duplicates.map(x=>x.title).join(', ')+'. Queres criar as cópias na mesma?'))return;
 if(payloads.length>1&&!confirm('Criar '+payloads.length+' tarefas para '+personName(target)+'? As originais serão preservadas.'))return;
 // Gravação atómica: ou todas as cópias são criadas, ou nenhuma.
 const batch=writeBatch(db);for(const payload of payloads)batch.set(doc(collection(db,'tasks')),payload);
 await batch.commit();await load();render();applyTaskFilters();notice(payloads.length+' tarefa(s) copiadas com sucesso.');
}

function rewardScreen(){
 const adult=isAdmin()||profile?.role==='guardian',kids=myKids();
 const form=adult?`<article class="card"><h3>Nova recompensa</h3><form id="rewardForm"><label>Nome da recompensa<input name="title" required maxlength="120" placeholder="Ex.: Escolher o filme da noite"></label><label>Descrição (opcional)<textarea name="description" maxlength="500"></textarea></label><label>Custo em pontos<input name="cost" type="number" min="1" max="100000" value="50" required></label><fieldset><legend>Disponível para</legend>${kids.map(k=>`<label class="check"><input type="checkbox" name="child" value="${esc(k.uid)}">${esc(k.name)}</label>`).join('')||'<p>Associa primeiro um filho.</p>'}</fieldset><button>Criar recompensa</button></form></article>`:'';
 const accessible=rewards.filter(r=>adult?kids.some(k=>k.uid===r.childId):r.childId===user.uid);
 const pending=redemptions.filter(r=>r.status==='pending'&&(adult?kids.some(k=>k.uid===r.childId):r.childId===user.uid));
 const cards=accessible.map(r=>{const req=redemptions.find(x=>x.rewardId===r.id&&x.childId===r.childId&&x.status==='pending');return `<article class="card"><h3>${esc(r.title)}</h3><p>${esc(r.description||'')}</p><div class="points">${Number(r.cost)} ⭐</div><p class="muted">${esc(personName(r.childId))} · ${r.active===false?'Arquivada':'Disponível'}</p>${adult?(r.active!==false?`<button class="alt" data-action="archiveReward" data-id="${esc(r.id)}">Arquivar</button>`:''):(r.active!==false?`<button data-action="requestReward" data-id="${esc(r.id)}" ${req||score(user.uid)<r.cost?'disabled':''}>${req?'Pedido pendente':score(user.uid)<r.cost?'Pontos insuficientes':'Pedir recompensa'}</button>`:'')}</article>`}).join('');
 const approvals=adult?`<h3>Pedidos de recompensa pendentes (${pending.length})</h3><div class="grid">${pending.map(r=>`<article class="card"><b>${esc(r.title)}</b><p>${esc(personName(r.childId))} · ${Number(r.cost)} ⭐ · Saldo atual: ${score(r.childId)} ⭐</p><div class="login-actions"><button data-action="approveReward" data-id="${esc(r.id)}">Aprovar</button><button class="red" data-action="rejectReward" data-id="${esc(r.id)}">Rejeitar</button></div></article>`).join('')||'<p>Não existem pedidos pendentes.</p>'}</div>`:'';
 const history=redemptions.filter(r=>r.status!=='pending'&&(adult?kids.some(k=>k.uid===r.childId):r.childId===user.uid)).sort((a,b)=>(b.reviewedAt?.seconds||0)-(a.reviewedAt?.seconds||0)).slice(0,30);
 return `<h2>Recompensas</h2><p class="muted">Os filhos pedem recompensas com os pontos acumulados. Só são descontados após aprovação.</p>${!adult?`<div class="points">Saldo: ${score(user.uid)} ⭐</div>`:''}${form}<h3>Catálogo</h3><div class="grid">${cards||'<p>Ainda não existem recompensas.</p>'}</div>${approvals}<h3>Histórico de recompensas</h3><div class="grid">${history.map(r=>`<article class="card"><b>${esc(r.title)}</b><p>${esc(personName(r.childId))} · ${r.cost} ⭐ · ${r.status==='approved'?'Aprovada':'Rejeitada'}</p></article>`).join('')||'<p>Sem histórico.</p>'}</div>`;
}
async function createReward(form){
 if(!(isAdmin()||profile?.role==='guardian'))throw Error('Sem autorização.');
 const f=new FormData(form),ids=f.getAll('child'),title=String(f.get('title')||'').trim(),description=String(f.get('description')||'').trim(),cost=Number(f.get('cost'));
 if(!title||title.length>120||description.length>500||!Number.isInteger(cost)||cost<1||cost>100000)throw Error('Verifica os dados da recompensa.');
 if(!ids.length||ids.some(id=>!myKids().some(k=>k.uid===id)))throw Error('Seleciona pelo menos um filho associado.');
 for(const childId of ids)await setDoc(doc(collection(db,'rewards')),{title,description,cost,childId,active:true,createdBy:user.uid,createdAt:serverTimestamp()});
 await load();render();notice('Recompensa criada.');
}
async function rewardAction(action,id){
 if(action==='requestReward'){
  const r=rewards.find(r=>r.id===id);if(!r||r.active===false||profile?.role!=='child'||r.childId!==user.uid)throw Error('Recompensa indisponível.');
  if(score(user.uid)<r.cost)throw Error('Pontos insuficientes.');
  if(redemptions.some(x=>x.rewardId===id&&x.childId===user.uid&&x.status==='pending'))throw Error('Já tens um pedido pendente.');
  await setDoc(doc(collection(db,'redemptions')),{rewardId:id,childId:user.uid,title:r.title,cost:r.cost,status:'pending',requestedAt:serverTimestamp()});
 }else if(action==='archiveReward'){
  const r=rewards.find(r=>r.id===id);if(!r||r.active===false||!(isAdmin()||myKids().some(k=>k.uid===r.childId)))throw Error('Sem autorização.');
  await updateDoc(doc(db,'rewards',id),{active:false});
 }else{
  const r=redemptions.find(r=>r.id===id);if(!r||r.status!=='pending'||!myKids().some(k=>k.uid===r.childId))throw Error('Pedido não disponível.');
  if(action==='approveReward'&&score(r.childId)<r.cost)throw Error('Saldo insuficiente para aprovar.');
  await runTransaction(db,async tx=>{const ref=doc(db,'redemptions',id),snap=await tx.get(ref);if(!snap.exists()||snap.data().status!=='pending')throw Error('Pedido já tratado.');tx.update(ref,{status:action==='approveReward'?'approved':'rejected',reviewedBy:user.uid,reviewedAt:serverTimestamp()});});
 }
 await load();render();notice('Recompensa atualizada.');
}


function childEditor(id){
 const p=people.find(x=>x.uid===id&&x.role==='child');if(!p||!associated(id))throw Error('Filho não associado.');
 $('childEditor').innerHTML=`<article class="card"><h3>Editar ${esc(p.name)}</h3><form id="editChildForm"><input type="hidden" name="uid" value="${esc(p.uid)}"><label>Nome<input name="name" required maxlength="100" value="${esc(p.name)}"></label><label>Ano escolar<input name="schoolYear" maxlength="40" value="${esc(p.schoolYear||'')}"></label><div class="login-actions"><button>Guardar alterações</button><button type="button" class="alt" data-action="cancelChildEdit">Cancelar</button></div></form><p class="muted">A configuração de email/password de um perfil sem conta ainda não está disponível. Não cries uma conta duplicada.</p></article>`;
 $('childEditor').scrollIntoView({block:'nearest',behavior:'smooth'});
}
async function saveChild(form){
 const f=new FormData(form),id=String(f.get('uid')),p=people.find(x=>x.uid===id&&x.role==='child');
 if(!p||!associated(id))throw Error('Sem autorização.');
 const name=String(f.get('name')||'').trim(),schoolYear=String(f.get('schoolYear')||'').trim();
 if(!name||name.length>100||schoolYear.length>40)throw Error('Verifica os dados do perfil.');
 await updateDoc(doc(db,'profiles',id),{name,schoolYear});await load();render();notice('Perfil atualizado.');
}
async function unlinkChild(id){
 const p=people.find(x=>x.uid===id&&x.role==='child'&&(x.accountType==='managed'||(!x.email&&!x.accountType)));
 if(!p||!associated(id))throw Error('Esta opção só está disponível para perfis sem conta própria.');
 if(!confirm('Desassociar '+p.name+'? As tarefas e pontos ficam guardados, mas o perfil deixa de aparecer na tua família.'))return;
 const remaining=(p.guardianIds||[]).filter(uid=>uid!==user.uid);
 await updateDoc(doc(db,'profiles',id),{guardianIds:remaining});await load();render();notice('Filho desassociado. O histórico foi preservado.');
}
async function deleteChildProfile(id){
 const p=people.find(x=>x.uid===id&&x.role==='child'&&(x.accountType==='managed'||(!x.email&&!x.accountType)));
 if(!p||!associated(id))throw Error('Só podes eliminar perfis sem conta de autenticação.');
 if([...tasks,...claims,...rewards,...redemptions].some(x=>x.childId===id))throw Error('Este filho tem tarefas ou histórico. Para preservar os dados, utiliza Desassociar.');
 if(!confirm('Eliminar definitivamente o perfil de '+p.name+'? Esta operação não pode ser anulada.'))return;
 if(prompt('Para confirmar, escreve ELIMINAR:')!=='ELIMINAR')return;
 await deleteDoc(doc(db,'profiles',id));await load();render();notice('Perfil eliminado.');
}

async function createChildProfile(form){
 const data=new FormData(form),name=String(data.get('name')||'').trim(),schoolYear=String(data.get('schoolYear')||'');
 const guardianIds=[...new Set(data.getAll('guardian'))];
 if(!name)throw Error('Indica o nome do filho.');
 if(!guardianIds.length)throw Error('Seleciona pelo menos um encarregado.');
 if(!guardianIds.includes(user.uid))throw Error('O teu perfil tem de estar associado ao filho.');
 if(!isAdmin()&&!(profile?.role==='guardian'&&profile?.status==='active'))throw Error('Sem autorização.');
 if(guardianIds.some(id=>id!==user.uid&&!(isAdmin()&&people.some(p=>p.uid===id&&p.role==='guardian'&&p.status==='active'))))throw Error('Encarregado inválido.');
 const ref=doc(collection(db,'profiles'));
 await setDoc(ref,{name,role:'child',status:'active',guardianIds,schoolYear,accountType:'managed',createdBy:user.uid,createdAt:serverTimestamp()});
 await load();render();notice('Perfil de '+name+' criado com sucesso, sem email.');
}
async function createChildAccess(form){
 if(!(isAdmin()||(profile?.role==='guardian'&&profile?.status==='active')))throw Error('Sem autorização.');
 const data=new FormData(form),name=String(data.get('name')||'').trim(),email=normalize(data.get('email')),password=String(data.get('password')||'');
 if(!name||!email.includes('@')||password.length<8)throw Error('Indica nome, email válido e password de pelo menos 8 caracteres.');
 if(people.some(p=>normalize(p.email)===email))throw Error('Já existe um perfil com este email.');
 const invitationRef=doc(db,'invitations',email);
 if((await getDoc(invitationRef)).exists())throw Error('Já existe um convite para este email.');
 // A instância secundária evita terminar a sessão do encarregado.
 await setDoc(invitationRef,{name,email,role:'child',guardianIds:[user.uid],createdBy:user.uid,createdAt:serverTimestamp()});
 const secondary=initializeApp(firebaseConfig,'child-registration-'+Date.now());
 const childAuth=getAuth(secondary);
 let credential=null;
 try{
   credential=await createUserWithEmailAndPassword(childAuth,email,password);
   const childDb=getFirestore(secondary);
   await setDoc(doc(childDb,'profiles',credential.user.uid),{name,email,role:'child',status:'pending',guardianIds:[user.uid],balance:0,createdAt:serverTimestamp()});
   await signOut(childAuth);
   await load();render();notice('Conta criada. Autoriza agora o filho na lista de utilizadores.');
 }catch(err){
   if(credential?.user){try{await deleteUser(credential.user)}catch(_){}}
   throw Error('Não foi possível concluir a criação da conta: '+err.message);
 }finally{try{await deleteApp(secondary)}catch(_){}}
}
async function invite(form,role){
 const data=new FormData(form),name=String(data.get('name')||'').trim(),email=normalize(data.get('email'));
 if(!name||!email.includes('@'))throw Error('Preenche um nome e um email válido.');
 const guardianIds=role==='child'?data.getAll('guardian'):[];
 if(role==='child'&&!guardianIds.length)throw Error('Seleciona pelo menos um encarregado.');
 if(role==='child'&&guardianIds.some(id=>!(isAdmin()?(id===user.uid||people.some(p=>p.uid===id&&(p.role==='guardian'||p.role==='admin')&&p.status==='active')):id===user.uid)))throw Error('Encarregado inválido.');
 if(people.some(p=>normalize(p.email)===email))throw Error('Este email já tem uma conta registada.');
 await setDoc(doc(db,'invitations',email),{name,email,role,guardianIds,createdBy:user.uid,createdAt:serverTimestamp()});
 notice('Convite guardado. A pessoa já pode criar a sua conta com este email.');await load();render();
}
$('authform').addEventListener('submit',async e=>{e.preventDefault();try{notice('A entrar…');await signInWithEmailAndPassword(auth,$('email').value,$('password').value);notice('');}catch(err){notice(({'auth/invalid-credential':'Email ou password incorretos. Podes usar «Recuperar password» para definir uma nova.','auth/invalid-email':'O email não é válido.','auth/too-many-requests':'Demasiadas tentativas. Aguarda alguns minutos.','auth/network-request-failed':'Sem ligação à Internet.'}[err.code])||('Não foi possível entrar: '+err.message))}});
$('resetPassword').addEventListener('click',async()=>{const email=$('email').value.trim();if(!email){notice('Introduz primeiro o email da tua conta para receberes a ligação de recuperação.');$('email').focus();return;}try{notice('A pedir recuperação de password…');await sendPasswordResetEmail(auth,email);notice('Pedido enviado. Se existir uma conta associada a este email, receberás uma mensagem com uma ligação para redefinir a password. Verifica também o spam.');}catch(err){const messages={'auth/invalid-email':'O endereço de email não é válido.','auth/too-many-requests':'Demasiadas tentativas. Aguarda alguns minutos e volta a tentar.','auth/network-request-failed':'Falha de ligação à Internet. Tenta novamente.','auth/operation-not-allowed':'A recuperação por email não está ativada no Firebase Authentication.'};notice(messages[err.code]||('Não foi possível pedir a recuperação: '+err.message));}});
$('register').addEventListener('click',async()=>{try{notice('A criar conta…');await createUserWithEmailAndPassword(auth,$('email').value,$('password').value);notice('Conta criada. Aguarda autorização do administrador.');}catch(err){notice('Não foi possível criar conta: '+err.message)}});
$('logout').addEventListener('click',()=>signOut(auth));
$('tabs').addEventListener('change',e=>{if(e.target.id==='familyAppSelect'){tab=e.target.value;render();$('familyAppSelect')?.focus();}});
$('tabs').addEventListener('click',e=>{const t=e.target.closest('[data-tab]');if(t){tab=t.dataset.tab;render();if(tab==='tarefas'){applyTaskFilters();refreshCopyChoices()}}});
$('screen').addEventListener('change',async e=>{if(e.target.id==='copySource'||e.target.id==='copyTarget'){refreshCopyChoices();return;}if(e.target.matches('[data-copy-frequency]')){const f=e.target.closest('form');const days=f?.querySelector('[data-copy-weekdays]');if(days)days.hidden=e.target.value!=='daily';return;}if(e.target.matches('[data-custom-schedule]')){const panel=e.target.closest('form')?.querySelector('[data-custom-days]');if(panel)panel.hidden=!e.target.checked;return;}if(e.target.matches('[data-timing]')){const form=e.target.closest('form');if(e.target.value==='period'){const time=form?.querySelector('[name=taskTime]');if(time)time.value='';}syncScheduleControls(form);return;}if(e.target.matches('[name=taskTime]')){const form=e.target.closest('form');if(e.target.value){form.querySelector('[name=timingMode]').value='time';}syncScheduleControls(form);return;}if(e.target.matches('[data-photo]')){try{notice('A guardar fotografia…');await processPhoto(e.target.files?.[0],e.target.dataset.photo);}catch(err){notice('Não foi possível guardar: '+err.message)}return;}if(e.target.id==='taskPresetGroup'){if($('taskPresetSearch'))$('taskPresetSearch').value='';filterPresetGroup(false);}if(e.target.id==='taskStatusFilter')applyTaskFilters();if(e.target.id==='taskFrequency'&&$('weekdayField'))$('weekdayField').hidden=e.target.value!=='daily';if(e.target.id==='editTaskFrequency'&&$('editWeekdayField'))$('editWeekdayField').hidden=e.target.value!=='daily';});
$('screen').addEventListener('input',e=>{if(e.target.matches('[name=taskTime]')&&e.target.value){const form=e.target.closest('form');if(form){form.querySelector('[name=timingMode]').value='time';syncScheduleControls(form);}}if(e.target.matches('[name=title]')){const form=e.target.closest('form');const picker=form?.querySelector('[name=imageKey]');const img=form?.querySelector('.task-image-preview img');if(picker?.value==='auto'&&img)img.src='illustrations/'+autoTaskImage(e.target.value)+'.svg';}if(e.target.id==='taskSearch')applyTaskFilters();if(e.target.id==='taskPresetSearch'){if($('taskTitle'))$('taskTitle').value=e.target.value;filterPresetGroup(true);}});
$('screen').addEventListener('change',e=>{if(e.target.matches('.task-image-select')){const form=e.target.closest('form');const img=form?.querySelector('.task-image-preview img');if(img){const title=form.querySelector('[name=title]')?.value||'';img.src='illustrations/'+(e.target.value==='auto'?autoTaskImage(title):e.target.value)+'.svg';}}});
$('screen').addEventListener('focusin',e=>{if(e.target.closest('#taskForm,#editTaskForm'))syncScheduleControls(e.target.closest('form'));});
$('screen').addEventListener('submit',async e=>{if(!['guardianForm','childForm','childAccessForm','editChildForm','taskForm','editTaskForm','rewardForm'].includes(e.target.id))return;e.preventDefault();try{if(e.target.id==='editChildForm')await saveChild(e.target);else if(e.target.id==='taskForm')await createTask(e.target);else if(e.target.id==='editTaskForm'){const button=e.target.querySelector('button[type=submit]');if(button)button.disabled=true;notice('A guardar alterações…','working');try{await saveTaskEdit(e.target);}catch(error){throw error;}finally{if(button&&button.isConnected)button.disabled=false;}}else if(e.target.id==='rewardForm')await createReward(e.target);else if(e.target.id==='childForm')await createChildProfile(e.target);else if(e.target.id==='childAccessForm')await createChildAccess(e.target);else await invite(e.target,'guardian')}catch(err){notice(err.code==='permission-denied'?'O Firebase recusou a gravação. Verifica as permissões do Firestore.':'Não foi possível guardar: '+(err.message||String(err)),'error')}});
$('screen').addEventListener('click',async e=>{if(e.target.closest('[data-lunch-remove],[data-lunch-print],[data-lunch-whatsapp],[data-lunch-edit],[data-lunch-cancel],[data-lunch-clear],[data-plan-edit],[data-plan-cancel]')){try{await lunchClick(e,render)}catch(err){notice(err.message,'error')}return;}const go=e.target.closest('[data-go]');if(go){tab=go.dataset.go;render();if(tab==='tarefas'){applyTaskFilters();refreshCopyChoices()};return;}if(e.target.closest('[data-preset-index]')){choosePreset(e.target.closest('[data-preset-index]').dataset.presetIndex);return;}if(e.target.id==='taskComboToggle'){filterPresetGroup($('presetChoices')?.hidden);$('taskPresetSearch')?.focus();return;}if(e.target.id==='taskPresetSearch'){filterPresetGroup(true);return;}const btn=e.target.closest('[data-action]');if(!btn)return;try{btn.disabled=true;if(btn.dataset.action==='panelChoose'){panelChildId=btn.dataset.id;render();return;}if(btn.dataset.action==='panelBack'){panelChildId=null;render();return;}if(btn.dataset.action==='panelFullScreen'){const el=$('workspace');if(document.fullscreenElement)await document.exitFullscreen();else if(el.requestFullscreen)await el.requestFullscreen();btn.disabled=false;return;}if(btn.dataset.action==='panelChildComplete'){await taskAction('submitTask',btn.dataset.id);return;}if(btn.dataset.action==='panelParentComplete'){const t=tasks.find(x=>x.id===btn.dataset.id);if(!t||!myKids().some(k=>k.uid===t.childId)||!activeTask(t)||!scheduledToday(t))throw Error('Sem autorização.');if(!confirm('Confirmar como encarregado a conclusão de «'+t.title+'» para '+personName(t.childId)+'?')){btn.disabled=false;return;}const p=period(t),ref=doc(db,'claims',`${t.id}_${t.childId}_${p.key}`);await runTransaction(db,async tx=>{const old=await tx.get(ref);if(old.exists()&&old.data().status==='approved')throw Error('Tarefa já aprovada.');if(old.exists())tx.update(ref,{status:'approved',reviewedBy:user.uid,reviewedAt:serverTimestamp()});else tx.set(ref,{taskId:t.id,childId:t.childId,periodKey:p.key,periodStart:p.start,points:t.points,status:'approved',submittedAt:serverTimestamp(),reviewedBy:user.uid,reviewedAt:serverTimestamp()});});await load();render();notice('Tarefa concluída e pontos atribuídos.');return;}if(btn.dataset.action==='copySelectAll'||btn.dataset.action==='copyClear'){document.querySelectorAll('[name=copyChoice]').forEach(x=>x.checked=btn.dataset.action==='copySelectAll');btn.disabled=false;return;}if(btn.dataset.action==='copyPrepare'){prepareCopies();btn.disabled=false;return;}if(btn.dataset.action==='copyCancel'){copyDrafts=[];$('copyDraftArea').innerHTML='';btn.disabled=false;return;}if(btn.dataset.action==='copySave'){await saveCopies();return;}if(btn.dataset.action==='editChild'){childEditor(btn.dataset.id);btn.disabled=false;return;}if(btn.dataset.action==='cancelChildEdit'){$('childEditor').innerHTML='';return;}if(btn.dataset.action==='unlinkChild'){await unlinkChild(btn.dataset.id);btn.disabled=false;return;}if(btn.dataset.action==='deleteChild'){await deleteChildProfile(btn.dataset.id);btn.disabled=false;return;}if(btn.dataset.action==='removePhoto'){if(confirm('Remover a fotografia deste filho?'))await removePhoto(btn.dataset.id);else btn.disabled=false;return;}if(btn.dataset.action==='refreshData'){await load();render();notice('Dados atualizados.');return;}if(btn.dataset.action==='cancelEdit'){$('editTaskContainer').innerHTML='';return;}if(btn.dataset.action==='editTask'){openTaskEditor(btn.dataset.id);btn.disabled=false;return;}if(btn.dataset.action==='printCalendar'){const el=$('familyCalendar');if(!el)throw Error('Calendário indisponível.');const w=window.open('','_blank');if(!w)throw Error('Permite janelas pop-up para imprimir.');const css=`@page{size:A4 landscape;margin:8mm}body{font-family:Arial,sans-serif;color:#173b35;font-size:9px}h3{margin:0 0 8px}h4{margin:8px 0 4px}.weekly-calendar{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px}.weekly-day{border:1px solid #9cbdb4;border-radius:5px;padding:5px;min-width:0;overflow-wrap:anywhere}.calendar-period{margin-top:5px}.calendar-period strong{display:block;background:#e6f2ee;padding:3px}.calendar-entry{display:flex;gap:3px;padding:3px 0;border-bottom:1px solid #eee}.print-check{font-size:13px}.family-child{break-inside:avoid;margin-bottom:10px}button{display:none}`;w.document.write('<!doctype html><html lang="pt"><head><meta charset="utf-8"><title>Missão+ · Calendário familiar</title><style>'+css+'</style></head><body>'+el.outerHTML+'</body></html>');w.document.close();w.focus();setTimeout(()=>w.print(),300);btn.disabled=false;return;}
if(btn.dataset.action==='completeByParent'){const t=tasks.find(x=>x.id===btn.dataset.id);if(!t||!activeTask(t)||!myKids().some(k=>k.uid===t.childId))throw Error('Sem autorização.');const p=period(t),ref=doc(db,'claims',`${t.id}_${t.childId}_${p.key}`);if(!confirm('Confirmar a conclusão de «'+t.title+'» para '+personName(t.childId)+'?')){btn.disabled=false;return;}await runTransaction(db,async tx=>{const old=await tx.get(ref);if(old.exists()&&old.data().status==='approved')throw Error('Esta ocorrência já foi aprovada.');if(old.exists())tx.update(ref,{status:'approved',reviewedBy:user.uid,reviewedAt:serverTimestamp()});else tx.set(ref,{taskId:t.id,childId:t.childId,periodKey:p.key,periodStart:p.start,points:t.points,status:'approved',submittedAt:serverTimestamp(),reviewedBy:user.uid,reviewedAt:serverTimestamp()});});await load();render();applyTaskFilters();notice('Tarefa concluída e pontos atribuídos.');return;}
if(['requestReward','archiveReward','approveReward','rejectReward'].includes(btn.dataset.action)){await rewardAction(btn.dataset.action,btn.dataset.id);return;}if(['submitTask','approveClaim','rejectClaim'].includes(btn.dataset.action)){await taskAction(btn.dataset.action,btn.dataset.id);return;}if(btn.dataset.action==='duplicateTask'){const t=tasks.find(t=>t.id===btn.dataset.id);if(!t||!(isAdmin()||myKids().some(k=>k.uid===t.childId)))throw Error('Sem autorização.');if(!confirm('Criar uma cópia de «'+t.title+'» para '+personName(t.childId)+'?')){btn.disabled=false;return;}await setDoc(doc(collection(db,'tasks')),{title:t.title,description:t.description||'',category:t.category,imageKey:t.imageKey||'auto',period:t.period,points:Number(t.points),frequency:t.frequency,weekdays:Array.isArray(t.weekdays)?t.weekdays:[],deadline:t.deadline||'',childId:t.childId,active:true,createdBy:user.uid,createdAt:serverTimestamp()});await load();render();applyTaskFilters();notice('Cópia criada. Podes arquivar a original quando quiseres.');return;}if(btn.dataset.action==='restoreTask'){const t=tasks.find(t=>t.id===btn.dataset.id);if(!t||activeTask(t)||!(isAdmin()||myKids().some(k=>k.uid===t.childId)))throw Error('Sem autorização.');await updateDoc(doc(db,'tasks',t.id),{active:true});await load();render();applyTaskFilters();notice('Tarefa reativada.');return;}if(btn.dataset.action==='deleteTask'){const t=tasks.find(t=>t.id===btn.dataset.id);if(!t||t.deleted===true||!(isAdmin()||myKids().some(k=>k.uid===t.childId)))throw Error('Sem autorização.');const history=claims.some(c=>c.taskId===t.id);if(!confirm('Eliminar a tarefa «'+t.title+'» de '+personName(t.childId)+'?\n\nDeixará de aparecer nas tarefas e no calendário.'+(history?'\nO histórico e os pontos já atribuídos serão preservados.':''))) {btn.disabled=false;return;}await updateDoc(doc(db,'tasks',t.id),{deleted:true,active:false});await load();render();applyTaskFilters();notice('Tarefa eliminada da lista e do calendário. O histórico, se existir, foi preservado.');return;}if(btn.dataset.action==='archiveTask'){const t=tasks.find(t=>t.id===btn.dataset.id);if(!t||!activeTask(t)||!(isAdmin()||myKids().some(k=>k.uid===t.childId)))throw Error('Sem autorização.');if(!confirm('Arquivar esta tarefa? O histórico e os pontos aprovados serão mantidos.')){btn.disabled=false;return;}await updateDoc(doc(db,'tasks',t.id),{active:false});await load();render();applyTaskFilters();notice('Tarefa arquivada.');return;}if(!isAdmin()&&!(btn.dataset.action==='approve'&&people.some(p=>p.uid===btn.dataset.id&&p.role==='child'&&(p.guardianIds||[]).includes(user.uid))))throw Error('Sem autorização.');if(btn.dataset.action==='approve')await updateDoc(doc(db,'profiles',btn.dataset.id),{status:'active',approvedBy:user.uid,approvedAt:serverTimestamp()});if(btn.dataset.action==='deleteInvite')await deleteDoc(doc(db,'invitations',btn.dataset.id));await load();render();notice('Alteração guardada.')}catch(err){notice('Não foi possível concluir a operação: '+(err.message||String(err)),'error');btn.disabled=false}});
document.addEventListener('click',e=>{if($('taskCombo')&&!e.target.closest('#taskCombo'))filterPresetGroup(false);});
$('screen').addEventListener('submit',async e=>{if(['lunchFoodForm','lunchGenerateForm','lunchManualForm'].includes(e.target.id)){e.preventDefault();try{await lunchSubmit(e,render)}catch(err){notice(err.message,'error')}}});
onAuthStateChanged(auth,async current=>{user=current;profile=null;people=[];invites=[];try{if(user){await bootstrap();await load();if(isAdmin()||(profile?.role==='guardian'&&profile?.status==='active'))await startLanches(db,user.uid,myKids(),notice);}render();}catch(err){render();notice('Erro ao carregar os dados: '+err.message)}});

// Módulos familiares adicionais: registos locais, sem modificar os dados da Missão+.
document.addEventListener('submit',e=>{if(e.target.id==='familyExtraForm'){e.preventDefault();if(extrasSubmit(e.target,myKids())){render();notice('Registo guardado neste navegador.')}}});
document.addEventListener('click',e=>{const b=e.target.closest('[data-family-delete]');if(b&&confirm('Eliminar este registo?')){if(extrasDelete(b.dataset.familyDelete)){render();notice('Registo eliminado.')}}});

let familyRefreshing=false;
document.addEventListener('visibilitychange',async()=>{
 if(document.hidden||!user||familyRefreshing)return;
 familyRefreshing=true;
 try{await load();render();}catch(error){notice('Não foi possível atualizar a família: '+error.message,'error');}
 finally{familyRefreshing=false;}
});
