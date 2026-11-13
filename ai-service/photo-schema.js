export function validateWorksheet(x, count) {
 const text=(v,n)=>typeof v==='string'&&v.trim().length>0&&v.length<=n;
 if(!x||!text(x.title,150)||!text(x.sourceText,16000)||!Array.isArray(x.questions)||x.questions.length<2||x.questions.length>15||(count&&x.questions.length!==count))throw Error('A resposta não contém uma ficha completa. Tenta fotografias mais nítidas.');
 const seen=new Set();
 for(const q of x.questions){if(!text(q.prompt,1200)||!Array.isArray(q.options)||q.options.length!==4||!q.options.every(v=>text(v,500))||new Set(q.options.map(v=>v.trim().toLocaleLowerCase())).size!==4||!Number.isInteger(q.correct)||q.correct<0||q.correct>3||!text(q.explanation,1600)||seen.has(q.prompt.trim().toLocaleLowerCase()))throw Error('Revê as perguntas: cada uma precisa de quatro opções diferentes, uma resposta certa e uma explicação.');seen.add(q.prompt.trim().toLocaleLowerCase());}
 return {title:x.title.trim(),sourceText:x.sourceText.trim(),questions:x.questions.map(q=>({prompt:q.prompt.trim(),options:q.options.map(v=>v.trim()),correct:q.correct,explanation:q.explanation.trim()}))};
}
