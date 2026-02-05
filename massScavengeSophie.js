(function(){
"use strict";
if(window.ScavageTime){console.warn("ScavageTime já carregado");return;}
const ST=window.ScavageTime={};

/* ================= CONFIG ================= */
ST.config={nome:"ScavageTime",versao:"1.0",limiteGrupo:200,delay:200};

/* ================= TEXTOS (PT) ================= */
ST.txt={
titulo:"Saque em Massa",
tropas:"Selecione as tropas e a ordem de envio",
categorias:"Selecione as categorias",
retorno:"Quando os saques devem retornar?",
tempoAqui:"Tempo de duração",
calcular:"Calcular saques",
criador:"Criador:",
por50:"Saque em massa: enviar por 50 aldeias",
enviarGrupo:"Enviar grupo ",
grupoEnviado:"Grupo enviado com sucesso",
reset:"Configurações redefinidas",
tempoPassado:"O tempo informado está no passado",
semRally:"Aldeia sem ponto de reunião",
erroConfig:"Configuração incompleta",
premiumAviso:"ATENÇÃO: usar premium pode consumir MUITOS PP. Tem certeza?"
};

/* ================= ESTADO ================= */
ST.state={
tropasAtivas:{},
manterCasa:{},
ordemEnvio:[],
categoriasAtivas:[],
priorizarAlta:false,
tempo:{off:4,def:3},
squads:[],
squadsPremium:[]
};

/* ================= DADOS ================= */
ST.data={
urls:[],
info:[],
duracao:{fator:0,expoente:0,inicial:0},
serverDate:0
};

/* ================= UTILS ================= */
ST.u={
pad:v=>v<10?"0"+v:v,
tempo:s=>{
if(s<0)return ST.txt.tempoPassado;
let h=~~(s/3600),m=~~((s%3600)/60),se=~~(s%60);
return`Máx: ${h}:${ST.u.pad(m)}:${ST.u.pad(se)}`;
},
log:m=>console.log(`[ScavageTime] ${m}`)
};

/* ================= INIT SERVER TIME ================= */
let t=$("#serverDate")[0].innerText+" "+$("#serverTime")[0].innerText;
let m=t.match(/^([0-3]\d)[\/\-]([0-1]\d)[\/\-](\d{4})( (?:[01]?\d|2[0-3]):[0-5]\d(?::[0-5]\d)?)?$/);
ST.data.serverDate=Date.parse(`${m[3]}/${m[2]}/${m[1]}${m[4]||""}`);

/* ================= STORAGE ================= */
const LS=localStorage;
ST.state.tropasAtivas=JSON.parse(LS.getItem("st_tropas")||"{}");
ST.state.manterCasa=JSON.parse(LS.getItem("st_manter")||`{"spear":0,"sword":0,"axe":0,"archer":0,"light":0,"marcher":0,"heavy":0}`);
ST.state.ordemEnvio=JSON.parse(LS.getItem("st_ordem")||JSON.stringify(game_data.units.filter(u=>!["militia","snob","ram","catapult","spy","knight"].includes(u))));
ST.state.categoriasAtivas=JSON.parse(LS.getItem("st_categorias")||"[true,true,true,true]");
ST.state.priorizarAlta=JSON.parse(LS.getItem("st_prioridade")||"false");
ST.state.tempo=JSON.parse(LS.getItem("st_tempo")||'{"off":4,"def":3}');

/* ================= AJAX SEQUENCIAL ================= */
$.getAll=function(urls,onLoad,onDone,onErr){
let i=0,last=0;
(function next(){
if(i>=urls.length){onDone();return;}
let now=Date.now();
if(now-last<ST.config.delay){setTimeout(next,ST.config.delay-(now-last));return;}
last=now;
$.get(urls[i]).done(d=>{onLoad(i,d);i++;next();}).fail(onErr);
})();
};

/* ================= LOGICA PRINCIPAL ================= */
ST.logic={};

/* ---- COLETA DE DADOS ---- */
ST.logic.coletar=function(){
ST.state.squads=[];ST.state.squadsPremium=[];ST.data.urls=[];
let base=game_data.player.sitter>0?`game.php?t=${game_data.player.id}&screen=place&mode=scavenge_mass`:`game.php?&screen=place&mode=scavenge_mass`;
$.get(base,d=>{
let p=$(".paged-nav-item");let max=p.length?parseInt(p.last()[0].href.match(/page=(\d+)/)[1]):0;
for(let i=0;i<=max;i++)ST.data.urls.push(`${base}&page=${i}`);
let temp=JSON.parse($(d).find('script:contains("ScavengeMassScreen")').html().match(/\{.*\:\{.*\:.*\}\}/)[0]);
ST.data.duracao.expoente=temp[1].duration_exponent;
ST.data.duracao.fator=temp[1].duration_factor;
ST.data.duracao.inicial=temp[1].duration_initial_seconds;
}).done(()=>{
let acc="[";
$.getAll(ST.data.urls,(i,d)=>{
acc+= $(d).find('script:contains("ScavengeMassScreen")').html().match(/\{.*\:\{.*\:.*\}\}/g)[2]+",";
},()=>{
ST.data.info=JSON.parse(acc.slice(0,-1)+"]");
ST.data.info.forEach(v=>ST.logic.calcular(v));
ST.logic.montarEnvio();
},e=>console.error(e));
});
};

/* ---- CALCULO POR ALDEIA ---- */
ST.logic.calcular=function(d){
if(!d.has_rally_point)return;
let permitidas={},mapa={spear:25,sword:15,axe:10,archer:10,light:80,marcher:50,heavy:50,knight:100};
for(let u in ST.state.tropasAtivas){
if(ST.state.tropasAtivas[u]){
let qtd=d.unit_counts_home[u]-ST.state.manterCasa[u];
permitidas[u]=qtd>0?qtd:0;
}}
let loot=0;
for(let u in permitidas)loot+=permitidas[u]*mapa[u]*d.unit_carry_factor;
if(!loot)return;
let tipoOff=permitidas.axe+permitidas.light+permitidas.marcher;
let h=((tipoOff?ST.state.tempo.off:ST.state.tempo.def)*3600/ST.data.duracao.fator-ST.data.duracao.inicial);
let haul=parseInt((h**(1/ST.data.duracao.expoente))/100)**0.5;
let rates=[0,0,0,0,0];
[0.1,0.25,0.5,0.75].forEach((r,i)=>{
let o=d.options[i+1];
rates[i+1]=(!o.is_locked&&!o.scavenging_squad&&ST.state.categoriasAtivas[i])?haul/r:0;
});
let total=rates.reduce((a,b)=>a+b,0);
let packs=[{},{},{},{}];
for(let i=3;i>=0;i--){
let reach=rates[i+1];
ST.state.ordemEnvio.forEach(u=>{
if(permitidas[u]>0&&reach>0){
let need=Math.floor(reach/mapa[u]);
let send=Math.min(need,permitidas[u]);
if(send>0){
packs[i][u]=send;
permitidas[u]-=send;
reach-=send*mapa[u];
}
}
});
}
packs.forEach((p,i)=>{
if(Object.keys(p).length&&!d.options[i+1].is_locked){
let cs={unit_counts:p,carry_max:999999999};
ST.state.squads.push({village_id:d.village_id,candidate_squad:cs,option_id:i+1,use_premium:false});
ST.state.squadsPremium.push({village_id:d.village_id,candidate_squad:cs,option_id:i+1,use_premium:true});
}
});
};

/* ---- AGRUPAMENTO ---- */
ST.logic.montarEnvio=function(){
let grupos={},gruposP={},g=0,c=0;
grupos[g]=[];gruposP[g]=[];
ST.state.squads.forEach((s,i)=>{
if(c===ST.config.limiteGrupo){g++;c=0;grupos[g]=[];gruposP[g]=[];}
grupos[g].push(s);gruposP[g].push(ST.state.squadsPremium[i]);c++;
});
ST.logic.renderEnvio(grupos,gruposP);
};

/* ---- ENVIO ---- */
ST.logic.enviar=function(id,prem){
let lista=prem?ST.logic.gruposP[id]:ST.logic.grupos[id];
if(prem&&!confirm(ST.txt.premiumAviso))lista=ST.logic.grupos[id];
TribalWars.post("scavenge_api",{ajaxaction:"send_squads"},{squad_requests:lista},()=>UI.SuccessMessage(ST.txt.grupoEnviado),false);
};

/* ================= START ================= */
ST.u.log("ScavageTime carregado");
ST.logic.coletar();

})();
