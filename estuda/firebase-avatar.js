// SVG avatar renderer, local to this application.
const defaultAvatar={skin:'#f2c29c',hair:'#543527',hairStyle:'curto',eyes:'normais',mouth:'sorriso',outfit:'camisola',shirt:'#3484d2',background:'#dbeafe',accessory:'nenhum',pants:'#253c65',shoes:'#f8fafc'};
const avatarOf=data=>({...defaultAvatar,...(data||{})});
const choices=[
 ['skin','Tom de pele',[['#f9d8bb','Claro'],['#edb88e','Mel'],['#ca8b61','Moreno'],['#985a3a','Castanho'],['#613b2b','Escuro']]],
 ['hairStyle','Cabelo',[['curto','Curto'],['comprido','Comprido'],['caracois','Caracóis'],['rapado','Rapado'],['franja','Franja'],['rabo','Rabo de cavalo'],['ondulado','Ondulado'],['afro','Afro'],['trancas','Tranças'],['coque','Coque'],['duas_marias','Duas marias-chiquinhas'],['espetado','Espetado'],['lado','Risco ao lado'],['bob','Bob'],['moicano','Moicano'],['pixie','Pixie']]],
 ['hair','Cor do cabelo',[['#231b1b','Preto'],['#543527','Castanho'],['#b17a45','Loiro escuro'],['#f0c86c','Loiro'],['#b95730','Ruivo'],['#b8b8c1','Grisalho'],['#7040a0','Roxo'],['#e879f9','Rosa pastel'],['#ff4d8d','Rosa vivo'],['#3b82f6','Azul fantasia']]],
 ['eyes','Olhos',[['normais','Normais'],['grandes','Grandes'],['felizes','Felizes']]],
 ['mouth','Expressão',[['sorriso','Sorriso'],['aberto','Contente'],['serio','Sério']]],
 ['outfit','Roupa',[['camisola','T-shirt'],['camisa','Camisa'],['casaco','Casaco'],['vestido','Vestido'],['hoodie','Sweatshirt']]],
 ['shirt','Cor da roupa',[['#3484d2','Azul'],['#e45a73','Rosa'],['#ff69b4','Rosa vivo'],['#ffc0cb','Rosa claro'],['#ff69b4','Rosa vivo'],['#ffc0cb','Rosa claro'],['#db2777','Rosa forte'],['#14a37f','Verde'],['#f2a33b','Laranja'],['#8156bf','Roxo'],['#29344a','Escuro'],['#f8f8fa','Branco']]],
 ['pants','Calças',[['#253c65','Azul escuro'],['#151c2c','Preto'],['#a78bfa','Lilás'],['#d8b487','Bege'],['#e45a73','Rosa'],['#ff69b4','Rosa vivo'],['#ffc0cb','Rosa claro']]],
 ['shoes','Calçado',[['#f8fafc','Branco'],['#1e293b','Preto'],['#f97316','Laranja'],['#e45a73','Rosa'],['#ff69b4','Rosa vivo'],['#ffc0cb','Rosa claro']]],
 ['background','Fundo',[['#dbeafe','Azul claro'],['#fde4ec','Rosa'],['#ddf8ea','Verde claro'],['#fff0cd','Amarelo'],['#e9e2ff','Lilás']]],
 ['accessory','Acessórios',[['nenhum','Nenhum'],['oculos','Óculos'],['sol','Óculos de sol'],['laco','Laço'],['bone','Boné']]]
];
let draft={...defaultAvatar};
const avsafe=(v,allowed,fallback)=>allowed.includes(v)?v:fallback;
// Hair must be fully opaque: semi-transparent gradient stops caused hairstyles to look stacked.
function lightenHair(hex,amount){
 const n=parseInt(hex.slice(1),16);
 const vals=[(n>>16)&255,(n>>8)&255,n&255].map(v=>Math.max(0,Math.min(255,Math.round(amount>=0?v+(255-v)*amount:v*(1+amount)))));
 return '#'+vals.map(v=>v.toString(16).padStart(2,'0')).join('');
}
function avSvg(input,large=false){
 const a={...defaultAvatar,...input};
 for(const [field,,opts] of choices)a[field]=avsafe(a[field],opts.map(x=>x[0]),defaultAvatar[field]);
 const id='av'+[a.skin,a.hair,a.hairStyle,a.eyes,a.mouth,a.outfit,a.shirt,a.background,a.accessory,a.pants,a.shoes].join('').replace(/[^a-z0-9]/gi,'');
 const p=[];const add=v=>p.push(v);
 const path=(d,fill,extra='')=>add(`<path d="${d}" fill="${fill}" ${extra}/>`);
 const ellipse=(x,y,rx,ry,fill,extra='')=>add(`<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${fill}" ${extra}/>`);
 add(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 320" width="${large?210:42}" height="${large?280:56}" role="img" aria-label="Avatar de frente com aspeto tridimensional" style="display:block;flex-shrink:0;max-width:100%"><defs>
 <linearGradient id="${id}skin" x1="0" y1="0" x2="1" y2=".35"><stop stop-color="${a.skin}"/><stop offset=".40" stop-color="${a.skin}"/><stop offset=".83" stop-color="${a.skin}"/><stop offset="1" stop-color="${a.skin}"/></linearGradient>
 <linearGradient id="${id}shirt" x1="0" y1="0" x2="1" y2=".3"><stop stop-color="${a.shirt}"/><stop offset=".25" stop-color="${a.shirt}"/><stop offset=".8" stop-color="${a.shirt}"/><stop offset="1" stop-color="${a.shirt}"/></linearGradient>
 <linearGradient id="${id}hair" x1="0" y1="0" x2="1" y2=".5"><stop stop-color="${lightenHair(a.hair,.24)}"/><stop offset=".32" stop-color="${a.hair}"/><stop offset="1" stop-color="${lightenHair(a.hair,-.35)}"/></linearGradient>
 <linearGradient id="${id}pants" x1="0" y1="0" x2="1" y2=".25"><stop stop-color="${a.pants}"/><stop offset=".25" stop-color="${a.pants}"/><stop offset=".8" stop-color="${a.pants}"/><stop offset="1" stop-color="${a.pants}"/></linearGradient>
 <linearGradient id="${id}shoe" x1="0" y1="0" x2="1" y2=".25"><stop stop-color="${a.shoes}"/><stop offset=".35" stop-color="${a.shoes}"/><stop offset="1" stop-color="${a.shoes}"/></linearGradient>
 <radialGradient id="${id}bg" cx=".5" cy=".28" r=".75"><stop stop-color="#fff" stop-opacity=".85"/><stop offset="1" stop-color="${a.background}"/></radialGradient>
 <filter id="${id}shadow" x="-30%" y="-30%" width="160%" height="180%"><feDropShadow dx="0" dy="4" stdDeviation="4" flood-opacity=".20"/></filter></defs>`);
 // O fundo do avatar grande pertence ao painel de pré-visualização, não ao SVG.
 if(!large) add(`<rect x="0" y="0" width="240" height="320" rx="20" fill="url(#${id}bg)"/>`);
 ellipse(120,299,72,9,'#263449','opacity=".18"');
 // Legs and sneakers with shading, all facing forward
 path('M80 207 L112 207 L111 278 Q111 284 105 286 L81 286 Q76 282 77 274Z',`url(#${id}pants)`,'stroke="#17213a" stroke-opacity=".14" stroke-width="1.5"');
 path('M128 207 L160 207 L164 274 Q164 284 158 286 L134 286 Q128 282 129 277Z',`url(#${id}pants)`,'stroke="#17213a" stroke-opacity=".14" stroke-width="1.5"');
 path('M77 278 Q92 282 110 278 L111 289 Q113 294 100 296 L72 296 Q66 295 68 288Z',`url(#${id}shoe)`,'stroke="#64748b" stroke-opacity=".4" stroke-width="1"');
 path('M131 278 Q146 282 164 278 L172 290 Q174 295 161 296 L130 296 Q123 295 125 288Z',`url(#${id}shoe)`,'stroke="#64748b" stroke-opacity=".4" stroke-width="1"');
 path('M69 290 Q89 295 111 290 M126 290 Q151 295 172 290','none','stroke="white" stroke-opacity=".8" stroke-width="2.5"');
 for(const x of [84,141])for(const y of [284,288])path(`M${x} ${y} l15 0`,'none','stroke="#64748b" stroke-opacity=".5" stroke-width="1"');
 // Symmetric, solid block-style body: sleeves cover shoulders; hands below sleeves.
 path('M75 151 Q60 148 54 163 L47 191 L48 219 Q51 230 61 230 Q71 229 73 218 L83 177Z',`url(#${id}skin)`);
 path('M165 151 Q180 148 186 163 L193 191 L192 219 Q189 230 179 230 Q169 229 167 218 L157 177Z',`url(#${id}skin)`);
 path('M77 151 Q60 148 54 163 L48 190 Q60 196 76 191 L84 165Z',`url(#${id}shirt)`);
 path('M163 151 Q180 148 186 163 L192 190 Q180 196 164 191 L156 165Z',`url(#${id}shirt)`);
 path('M108 126 L108 153 Q120 164 132 153 L132 126Z',`url(#${id}skin)`);
 path('M84 148 Q101 143 108 150 L120 158 L132 150 Q140 143 156 148 L162 157 L164 219 Q120 225 76 219 L78 157Z',`url(#${id}shirt)`,'stroke="#152238" stroke-opacity=".12" stroke-width="1.3"');
 if(a.outfit==='camisa'){path('M105 145 L120 161 L135 145 L128 146 L120 154 L112 146Z','#fff','stroke="#cbd5e1" stroke-width="1"');path('M120 162 L120 220','none','stroke="#fff" stroke-width="2"');for(const y of [173,188,203])ellipse(122,y,1.7,1.7,'#dce5f0');}
 if(a.outfit==='casaco'){path('M82 148 L103 144 L118 165 L111 219 L75 215Z','#273b54');path('M158 148 L137 144 L122 165 L129 219 L165 215Z','#273b54');path('M120 165 L120 220','none','stroke="#f0f6ff" stroke-width="3"');}
 if(a.outfit==='vestido')path('M83 186 L157 186 L176 248 Q120 259 64 248Z',`url(#${id}shirt)`,'stroke="#fff" stroke-opacity=".5" stroke-width="2"');
 if(a.outfit==='hoodie'){path('M92 145 Q120 177 148 145','none','stroke="#e7ebf2" stroke-width="8"');path('M115 167 L113 189 M125 167 L127 189','none','stroke="#fff" stroke-width="2.5"');path('M98 201 Q120 208 142 201','none','stroke="#000" stroke-opacity=".14" stroke-width="2"');}
 // Ears belong behind the hair, never on top of side locks
 ellipse(75,102,10,16,`url(#${id}skin)`);ellipse(165,102,10,16,`url(#${id}skin)`);
 // Long hairstyles behind face
 if(['comprido','rabo'].includes(a.hairStyle))path('M72 78 Q66 31 117 28 Q173 24 174 84 L180 159 Q163 175 145 153 L145 90 L96 91 L93 158 Q75 176 59 158Z',`url(#${id}hair)`,'filter="url(#'+id+'shadow)"');
 // Head rounded 3D face with ears and gentle shading

 path('M78 75 Q78 46 120 44 Q162 46 162 75 L161 117 Q159 145 120 151 Q81 145 79 117Z',`url(#${id}skin)`,'stroke="#66391c" stroke-opacity=".15" stroke-width="1.2" filter="url(#'+id+'shadow)"');
 ellipse(91,117,12,6,'#ff7891','opacity=".12"');ellipse(149,117,12,6,'#ff7891','opacity=".12"');
 // Additional hairstyles: rendered as layered shapes with the same lighting gradient
 if(a.hairStyle==='ondulado')path('M70 91 Q59 65 77 42 Q93 24 119 29 Q151 24 166 53 Q178 75 167 104 Q156 92 161 78 Q150 89 141 70 Q123 87 111 66 Q91 85 80 75 Q83 90 70 91Z',`url(#${id}hair)`);
 if(a.hairStyle==='afro'){for(const [x,y,r] of [[70,86,18],[70,65,22],[84,44,22],[106,33,24],[131,32,24],[155,44,23],[170,67,21],[169,88,18],[95,48,19],[144,51,20]])ellipse(x,y,r,r,`url(#${id}hair)`);}
 if(a.hairStyle==='trancas'){for(const x of [72,160]){for(let y=83;y<172;y+=12)ellipse(x+(y%24===0?3:-3),y,9,11,`url(#${id}hair)`);}path('M74 83 Q66 45 93 36 Q124 22 154 41 Q169 59 163 84 Q145 65 133 60 Q106 75 94 59 Q85 79 74 83Z',`url(#${id}hair)`);}
 if(a.hairStyle==='coque'){ellipse(121,28,26,23,`url(#${id}hair)`);path('M75 91 Q63 53 87 40 Q118 25 151 42 Q171 56 165 90 Q149 75 142 63 Q120 72 103 60 Q92 82 75 91Z',`url(#${id}hair)`);}
 if(a.hairStyle==='duas_marias'){ellipse(63,56,19,22,`url(#${id}hair)`);ellipse(177,56,19,22,`url(#${id}hair)`);path('M74 90 Q62 55 88 40 Q122 26 153 42 Q169 56 164 91 Q145 68 130 64 Q104 75 93 64 Q83 85 74 90Z',`url(#${id}hair)`);}
 if(a.hairStyle==='espetado')path('M75 93 L70 64 L62 55 L80 55 L78 30 L96 44 L108 21 L120 39 L139 20 L144 43 L163 35 L159 59 L174 62 L162 93 L150 72 L130 64 L110 76 L92 66Z',`url(#${id}hair)`);
 if(a.hairStyle==='lado')path('M75 93 Q61 58 85 41 Q116 23 148 38 Q170 49 165 88 Q155 67 150 61 Q122 73 102 62 Q86 77 75 93Z',`url(#${id}hair)`); 
 if(a.hairStyle==='bob')path('M71 117 Q61 64 82 42 Q107 24 141 37 Q171 52 168 116 L151 123 L151 77 Q134 66 119 69 Q96 77 86 72 L87 121Z',`url(#${id}hair)`);
 if(a.hairStyle==='moicano')path('M105 58 L108 17 L119 28 L132 14 L135 52 Q120 43 105 58Z',`url(#${id}hair)`);
 if(a.hairStyle==='pixie')path('M76 83 Q65 51 91 40 Q119 28 146 40 Q159 49 159 68 Q142 56 130 61 Q106 52 91 76Z',`url(#${id}hair)`);
 // Sculpted hair in front
 if(a.hairStyle==='curto')path('M76 94 Q65 70 75 52 Q84 33 112 32 Q151 25 166 58 Q170 73 162 93 L156 74 Q146 77 136 68 Q115 84 99 70 Q89 89 76 94Z',`url(#${id}hair)`,'stroke="#000" stroke-opacity=".08" stroke-width="1"');
 if(a.hairStyle==='comprido')path('M75 91 Q65 62 83 42 Q105 22 136 33 Q161 37 165 75 L160 95 Q154 72 147 66 Q123 78 101 63 Q88 81 75 91Z',`url(#${id}hair)`);
 if(a.hairStyle==='franja')path('M74 91 Q65 55 88 39 Q109 25 142 37 Q165 46 165 88 Q148 68 138 62 Q131 83 117 83 Q108 69 100 70 Q89 92 74 91Z',`url(#${id}hair)`);
 if(a.hairStyle==='rabo')path('M75 91 Q67 59 89 40 Q110 27 140 37 Q160 46 164 84 Q144 72 132 63 Q107 78 92 68 Q84 86 75 91Z',`url(#${id}hair)`);
 if(a.hairStyle==='caracois'){for(const [x,y,r] of [[79,72,18],[84,52,19],[103,40,18],[124,38,20],[145,46,19],[159,64,18],[74,91,13],[163,91,13]])ellipse(x,y,r,r*.88,`url(#${id}hair)`,'stroke="#000" stroke-opacity=".08" stroke-width="1"');}
 if(a.hairStyle==='rapado')path('M79 70 Q77 43 107 41 Q146 33 162 66 Q124 47 79 70Z',`url(#${id}hair)`);
 // Brows and bright eyes
 path('M91 91 Q100 87 107 92 M133 92 Q141 87 150 91','none','stroke="#30251f" stroke-width="2.5" stroke-linecap="round"');
 if(a.eyes==='felizes')path('M92 104 Q101 96 110 104 M130 104 Q139 96 148 104','none','stroke="#272331" stroke-width="3.5" stroke-linecap="round"');
 else for(const x of [101,139]){ellipse(x,104,a.eyes==='grandes'?9:7,a.eyes==='grandes'?10:8,'#fff');ellipse(x+1,105,4.3,5.5,'#34435a');ellipse(x,102,1.8,2,'#fff');}
 path('M120 107 Q116 119 122 119','none','stroke="#7c4933" stroke-opacity=".45" stroke-width="2" stroke-linecap="round"');
 if(a.mouth==='sorriso')path('M106 128 Q120 143 134 128','none','stroke="#994a51" stroke-width="3.5" stroke-linecap="round"');
 if(a.mouth==='aberto'){ellipse(120,132,11,8,'#8e3f4b');path('M112 129 Q120 133 128 129','none','stroke="white" stroke-width="3"');}
 if(a.mouth==='serio')path('M111 132 L130 132','none','stroke="#994a51" stroke-width="3" stroke-linecap="round"');
 if(a.accessory==='oculos'||a.accessory==='sol'){for(const x of [86,126])add(`<rect x="${x}" y="95" width="29" height="21" rx="8" fill="${a.accessory==='sol'?'#283c55':'#dff6ff'}" fill-opacity="${a.accessory==='sol'?'.85':'.25'}" stroke="#26354a" stroke-width="3"/>`);path('M115 100 Q120 97 126 100','none','stroke="#26354a" stroke-width="3"');}
 if(a.accessory==='laco'){path('M145 52 Q124 33 132 61 Q120 71 145 62 Q168 73 160 57 Q171 32 145 52Z','#ed4c8e');ellipse(146,58,5,5,'#ffc0d7');}
 if(a.accessory==='bone'){path('M73 73 L73 56 Q78 29 120 28 Q161 28 167 60 L167 74Z','#3457c7');path('M69 73 Q120 60 181 75 Q170 88 120 82 Q85 84 69 73Z','#29459b');}
 add('</svg>');return p.join('');
}
const avHtml=(a,large=false)=>'<span class="epavatar'+(large?' large':'')+'">'+avSvg(a,large)+'</span>';
const avatarStyle=document.createElement('style');
avatarStyle.textContent=`.epavatar{display:inline-flex;align-items:center;justify-content:center;vertical-align:middle;flex-shrink:0}.epavatar.large{display:flex;margin:auto;min-height:220px}.epavataropts{display:flex;gap:7px;flex-wrap:wrap;margin:6px 0 12px}.epavataropts button{border:2px solid #cbd9eb!important;border-radius:10px!important;background:#ffffff!important;color:#19314f!important;-webkit-text-fill-color:#19314f!important;appearance:none!important;-webkit-appearance:none!important;font-size:14px!important;padding:7px 10px!important;cursor:pointer}.epavataropts button[aria-pressed=true]{border-color:#1464b2!important;background:#e6f1ff!important;color:#123e73!important;-webkit-text-fill-color:#123e73!important}.epavfield{margin:12px 0;border:1px solid #d6e0eb;border-radius:12px;padding:10px}.epavfield legend{font-weight:700}.epavpreview{text-align:center;background:#f3f7fc;padding:14px;border-radius:12px}.epcolorbtn{height:36px;width:36px;border-radius:50%!important;min-width:36px!important;padding:0!important}.epavatarline{display:inline-flex;align-items:center;gap:7px}.epavlabel{display:block;font-size:12px}`;
document.head.appendChild(avatarStyle);
avatarStyle.textContent+=`.epavlayout{display:grid;grid-template-columns:minmax(170px,210px) minmax(0,1fr);gap:16px;align-items:start;height:min(52vh,430px);min-height:290px;overflow:hidden}.epavlayout .epavpreview{position:relative;height:100%;display:flex;align-items:center;justify-content:center;box-sizing:border-box}.epavlayout #epavfields{height:100%;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:0 7px 12px 0;box-sizing:border-box}.epavlayout .epavfield:first-child{margin-top:0}@media(max-width:540px){.epavlayout{grid-template-columns:1fr;height:min(65vh,570px);grid-template-rows:210px minmax(0,1fr);gap:10px}.epavlayout .epavpreview{padding:4px}.epavlayout .epavpreview svg{height:195px;width:auto}.epavlayout #epavfields{overflow-y:auto}#epauth .epbox{padding:15px}}`;

export {defaultAvatar,choices,avSvg,avHtml};
