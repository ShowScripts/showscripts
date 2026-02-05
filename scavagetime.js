(function () {
  "use strict";

  /* =====================================================
     SHOWSCRIPTS ROOT
  ===================================================== */
  window.ShowScripts = window.ShowScripts || {};
  ShowScripts.active = "scavagetime";

  /* =====================================================
     SCAVAGETIME
  ===================================================== */
  ShowScripts.scavagetime = {

    /* ================= CONFIG ================= */
    config: {
      nome: "ScavageTime",
      versao: "1.0",
      limiteGrupo: 200,
      delay: 200
    },

    /* ================= STATE ================= */
    state: {
      tropasAtivas: {},
      manterCasa: {},
      ordemEnvio: [],
      categoriasAtivas: [true, true, true, true],
      priorizarAlta: false,
      tempo: { off: 1, def: 1 },
      squads: [],
      squadsPremium: []
    },

    /* ================= DATA ================= */
    data: {
      urls: [],
      info: [],
      duracao: { fator: 0, expoente: 0, inicial: 0 },
      serverDate: 0
    },

    /* ================= UI ================= */
ui: {
  init() {
    if ($("#st-ui").length) return;

    const units = game_data.units.filter(
      u => !["militia","snob","ram","catapult","spy","knight"].includes(u)
    );

    const nomesPT = {
      spear: "Lanceiro",
      sword: "Espadachim",
      axe: "Bárbaro",
      light: "Cavalaria Leve",
      heavy: "Cavalaria Pesada",
      archer: "Arqueiro",
      marcher: "Arqueiro a Cavalo"
    };

    let html = `
    <div id="st-ui" style="
      position:fixed;top:90px;right:30px;width:300px;
      background:#050505;
      border:2px solid #d4af37;
      box-shadow:0 0 20px rgba(212,175,55,0.4);
      color:#f5d98b;
      font-family:Arial;
      font-size:12px;
      z-index:99999;
      padding:12px">

  <div style="
  display:flex;
  align-items:center;
  justify-content:center;
  gap:8px;
  font-weight:bold;
  font-size:16px;
  letter-spacing:2px">
  
  <img src="https://raw.githubusercontent.com/ShowScripts/showscripts/main/ShowScriptsLogo.png"
       style="width:64px;height:64px">
  COLETA TIME<br>
  </div>
      <div style="text-align:center;font-size:12px;color:#aaa;margin-bottom:6px">
        Coleta em massa inteligente!
      </div>
      <hr style="border-color:#d4af37"><br>

      <b>Tropas</b><br>`;

    units.forEach(u => {
      html += `
        <label style="display:inline-block;width:120px">
          <input type="checkbox" data-unit="${u}" checked> ${nomesPT[u] || u}
        </label>
        <input type="number" data-keep="${u}" value="0"
          style="width:45px;background:#000;border:1px solid #d4af37;color:#d4af37"><br>`;
    });

    html += `
      <hr style="border-color:#d4af37">
      <b>Categorias</b><br>`;

    ["Habilitar Pequena Coleta","Habilitar Média Coleta","Habilitar Grande Coleta","Habilitar Extrema Coleta"].forEach((n,i)=>{
      html += `
        <label>
          <input type="checkbox" data-cat="${i}" checked> ${n}
        </label><br>`;
    });

    html += `
      <hr style="border-color:#d4af37">
      <b>Horas Máxima Desejadas</b><br>
      Aldeias Ofensivas<br>
      <input id="st-off" type="number" value="2" style="width:40px"><br><br>
      Aldeias Defensivas<br>
      <input id="st-def" type="number" value="2" style="width:40px"><br>

      <hr style="border-color:#d4af37">
      <label><input type="radio" name="prio" value="0" checked> Balanceado</label><br>
      <label><input type="radio" name="prio" value="1"> Priorizar maior</label><br>

      <hr style="border-color:#d4af37">
      <button id="st-run" style="
        width:100%;
        background:#d4af37;
        color:#000;
        border:none;
        font-weight:bold;
        padding:6px;
        cursor:pointer">
        Iniciar Coletas
      </button>
    </div>`;

    $("body").append(html);

    $("#st-run").on("click", () => {
      this.sync();
      ShowScripts.scavagetime.logic.start();
    });
  },

  sync() {
    const S = ShowScripts.scavagetime.state;
    S.tropasAtivas = {};
    S.manterCasa = {};
    S.ordemEnvio = [];

    $("[data-unit]").each(function(){
      const u = $(this).data("unit");
      S.tropasAtivas[u] = this.checked;
      S.ordemEnvio.push(u);
    });

    $("[data-keep]").each(function(){
      S.manterCasa[$(this).data("keep")] = parseInt(this.value || 0);
    });

    S.categoriasAtivas = [false,false,false,false];
    $("[data-cat]").each(function(){
      S.categoriasAtivas[$(this).data("cat")] = this.checked;
    });

    S.tempo.off = parseFloat($("#st-off").val());
    S.tempo.def = parseFloat($("#st-def").val());
    S.priorizarAlta = $("input[name=prio]:checked").val() === "1";
  }
},


    /* ================= LOGIC ================= */
    logic: {

      start() {
        this.initServerTime();
        this.redirectIfNeeded();
      },

      redirectIfNeeded() {
        if (game_data.screen !== "place" || game_data.mode !== "scavenge_mass") {
          const url = game_data.player.sitter > 0
            ? `game.php?t=${game_data.player.id}&screen=place&mode=scavenge_mass`
            : `game.php?&screen=place&mode=scavenge_mass`;
          window.location.href = url;
          return;
        }
        this.coletar();
      },

      initServerTime() {
        let t = $("#serverDate").text() + " " + $("#serverTime").text();
        let m = t.match(/^([0-3]\d)[\/\-]([0-1]\d)[\/\-](\d{4})(.*)$/);
        ShowScripts.scavagetime.data.serverDate =
          Date.parse(`${m[3]}/${m[2]}/${m[1]}${m[4]}`);
      },

      coletar() {
        const ST = ShowScripts.scavagetime;
        ST.state.squads = [];
        ST.state.squadsPremium = [];
        ST.data.urls = [];

        let base = game_data.player.sitter > 0
          ? `game.php?t=${game_data.player.id}&screen=place&mode=scavenge_mass`
          : `game.php?&screen=place&mode=scavenge_mass`;

        $.get(base, d => {
          let p = $(".paged-nav-item");
          let max = p.length ? parseInt(p.last()[0].href.match(/page=(\d+)/)[1]) : 0;
          for (let i=0;i<=max;i++) ST.data.urls.push(`${base}&page=${i}`);

          let temp = JSON.parse(
            $(d).find('script:contains("ScavengeMassScreen")')
              .html().match(/\{.*\:\{.*\:.*\}\}/)[0]
          );

          ST.data.duracao = {
            expoente: temp[1].duration_exponent,
            fator: temp[1].duration_factor,
            inicial: temp[1].duration_initial_seconds
          };
        }).done(() => {
          let acc = "[";
          $.getAll(ST.data.urls,(i,d)=>{
            acc += $(d).find('script:contains("ScavengeMassScreen")')
              .html().match(/\{.*\:\{.*\:.*\}\}/g)[2] + ",";
          },()=>{
            ST.data.info = JSON.parse(acc.slice(0,-1)+"]");
            ST.data.info.forEach(v => ST.logic.calcular(v));
            console.log("[ScavageTime] Saques calculados:", ST.state.squads);
          });
        });
      },

      calcular(d) {
        const ST = ShowScripts.scavagetime;
        if (!d.has_rally_point) return;

        let mapa = { spear:25,sword:15,axe:10,archer:10,light:80,marcher:50,heavy:50 };
        let permitidas = {};

        for (let u in ST.state.tropasAtivas) {
          if (ST.state.tropasAtivas[u]) {
            let q = d.unit_counts_home[u] - (ST.state.manterCasa[u]||0);
            permitidas[u] = q > 0 ? q : 0;
          }
        }

        let loot=0;
        for (let u in permitidas) loot += permitidas[u]*mapa[u]*d.unit_carry_factor;
        if (!loot) return;

        let off = (permitidas.axe||0)+(permitidas.light||0)+(permitidas.marcher||0);
        let h = ((off?ST.state.tempo.off:ST.state.tempo.def)*3600/ST.data.duracao.fator - ST.data.duracao.inicial);
        let haul = parseInt((h**(1/ST.data.duracao.expoente))/100)**0.5;

        let rates=[0,0,0,0,0];
        [0.1,0.25,0.5,0.75].forEach((r,i)=>{
          let o=d.options[i+1];
          rates[i+1]=(!o.is_locked&&!o.scavenging_squad&&ST.state.categoriasAtivas[i])?haul/r:0;
        });

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
      }
    },

    init() {
      this.ui.init();
    }
  };

  /* ================= START ================= */
  (function wait(){
    if(window.jQuery && document.body){
      ShowScripts.scavagetime.init();
    } else {
      setTimeout(wait,100);
    }
  })();

})();
