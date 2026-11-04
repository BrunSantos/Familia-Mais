import {initializeApp} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import {getAuth,onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {getFirestore,doc,getDoc,getDocs,collection,query,where,runTransaction,serverTimestamp} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
import {firebaseConfig,ADMIN_UID} from './firebase-settings-v3.js';
const app=initializeApp(firebaseConfig),auth=getAuth(app),db=getFirestore(app);
let current;
const ready=new Promise(resolve=>onAuthStateChanged(auth,user=>{current=user;resolve();}));
const valid=s=>typeof s==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(s);
window.addEventListener('message',async event=>{
 if(event.origin!==location.origin||event.source!==parent||event.data?.type!=='family-request')return;
 const {id,action,email,estudaOwnerUid,student,childId}=event.data;
 const reply=data=>parent.postMessage({type:'family-response',id,...data},location.origin);
 try{
  await ready;
  const user=current;
  if(!user)throw Error('Entra primeiro na Família+ para carregar a lista central de filhos.');
  if(!email||user.email?.toLowerCase()!==email.toLowerCase())throw Error('As sessões da Família+ e do Estuda+ pertencem a emails diferentes. Entra com o mesmo email nos dois espaços.');
  const profile=await getDoc(doc(db,'profiles',user.uid)),admin=user.uid===ADMIN_UID;
  if(!admin&&!(profile.data()?.role==='guardian'&&profile.data()?.status==='active'))throw Error('É necessário um encarregado ativo na Família+.');
  if(!valid(estudaOwnerUid))throw Error('Conta escolar inválida.');
  const snapshot=await getDocs(admin?collection(db,'profiles'):query(collection(db,'profiles'),where('guardianIds','array-contains',user.uid)));
  const kids=snapshot.docs.map(d=>({...d.data(),uid:d.id})).filter(p=>p.role==='child'&&p.status==='active');
  const links=await getDocs(collection(db,'familyAppLinks',user.uid,'estuda'));
  const mapped=links.docs.map(d=>d.data()).filter(l=>l.estudaOwnerUid===estudaOwnerUid&&kids.some(k=>k.uid===l.childId));
  if(action==='catalog'){reply({ok:true,kids:kids.map(k=>({uid:k.uid,name:k.name,schoolYear:k.schoolYear||''})),links:mapped});return;}
  if(action!=='associate'||!valid(student?.id)||typeof student.name!=='string'||!student.name.trim())throw Error('Associação inválida.');
  const target=childId?kids.find(k=>k.uid===childId):null;
  if(childId&&!target)throw Error('Seleciona um filho ativo da tua família.');
  const ref=doc(db,'familyAppLinks',user.uid,'estuda',estudaOwnerUid+'_'+student.id);
  // A deterministic link plus a transaction makes repeated imports idempotent.
  const newRef=doc(collection(db,'profiles'));
  const result=await runTransaction(db,async tx=>{
   const old=await tx.get(ref);
   if(old.exists()){
    if(childId&&old.data().childId!==childId)throw Error('Esta conta escolar já está associada a outro perfil. A associação não foi alterada.');
    return old.data().childId;
   }
   const chosen=target?.uid||newRef.id;
   if(!target)tx.set(newRef,{name:student.name.trim().slice(0,100),role:'child',status:'active',guardianIds:[user.uid],schoolYear:String(student.year||'').slice(0,40),accountType:'managed',createdBy:user.uid,createdAt:serverTimestamp()});
   tx.set(ref,{childId:chosen,estudaOwnerUid,estudaChildUid:student.id});
   return chosen;
  });
  reply({ok:true,childId:result});
 }catch(error){reply({ok:false,error:error.message||'Não foi possível carregar os filhos.'});}
});
