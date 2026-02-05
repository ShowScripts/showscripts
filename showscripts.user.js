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

    /* ================= STATE ================= */
    state: {
      tropasAtivas: {},
      manterCasa: {},
      ordemEnvio: [],
      categoriasAtivas: [true, true, true, true],
      priorizarAlta: true,
      tempo: { off: 4, def: 3 },

      squads: [],
      squadsPremium: [],
      grupos: {},
      gruposP: {},

      serverDate: 0,
      duracao: { fator: 0, expoente: 0, inicial: 0 },
      urls: [],
      info: []
    },

    /* ================= UI ================= */
    ui: {
      init() {

        if ($("#st-ui").length) return;

        const units = game_data.units.filter(
          u => !["militia","snob","ram","catapult","spy","knight"].includes(u)
        );

        let html = `
        <div id="st-ui" style="
          position:fixed;top:80px;right:30px;
          background:#0b0b0b;border:1px solid #d4af37;
          color:#fff;padding:10px;z-index:99999;width:280px;
          font-family:Arial;font-size:12px">
          <b>ScavageTime</b><hr>

          <b>Tropas</b><br>`;

        units.forEach(u => {
          html += `
            <label>
              <input type="checkbox" data-unit="${u}" checked> ${u}
            </label>
            <input type="number" data-keep="${u}" value="0" style="width:40px"><br>`;
        });

        html += `<hr><b>Categorias</b><br>`;
        ["Pequena","Média","Grande","Extrema"].forEach((n,i)=>{
          html += `<label>
            <input type="checkbox" data-cat="${i}" checked> ${n}
          </label><br>`;
        });

        html += `<hr>
          <b>Tempo (horas)</b><br>
          Off <input id="st-off" type="number" value="4" style="width:40px">
          Def <input id="st-def" type="number" value="3" style="width:40px"><br>

          <hr>
          <label><input type="radio" name="prio" value="0"> Balanceado</label><br>
          <label><input type="radio" name="prio" value="1" checked> Priorizar maior</label><br>

          <hr>
          <button id="st-run" style="width:100%">CALCULAR SAQUES</button>
        </div>`;

        $("body").append(html);

        $("#st-run").on("click", () => {
          this.sync();
          ShowScripts.scavagetime.logic.run();
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

      run() {
        this.initServerTime();
        this.coletar();
      },

      initServerTime() {
        const S = ShowScripts.scavagetime.state;
        let t = $("#serverDate").text() + " " + $("#serverTime").text();
        let m = t.match(/^([0-3]\d)[\/\-]([0-1]\d)[\/\-](\d{4})(.*)$/);
        S.serverDate = Date.parse(`${m[3]}/${m[2]}/${m[1]}${m[4]}`);
      },

      coletar() {
        const S = ShowScripts.scavagetime.state;
        S.squads = [];
        S.squadsPremium = [];
        S.urls = [];

        let base = game_data.player.sitter > 0
          ? `game.php?t=${game_data.player.id}&screen=place&mode=scavenge_mass`
          : `game.php?&screen=place&mode=scavenge_mass`;

        $.get(base, d => {
          let p = $(".paged-nav-item");
          let max = p.length ? parseInt(p.last().attr("href").match(/page=(\d+)/)[1]) : 0;
          for (let i=0;i<=max;i++) S.urls.push(`${base}&page=${i}`);

          let temp = JSON.parse(
            $(d).find('script:contains("ScavengeMassScreen")')
              .html().match(/\{.*\:\{.*\:.*\}\}/)[0]
          );

          S.duracao.expoente = temp[1].duration_exponent;
          S.duracao.fator = temp[1].duration_factor;
          S.duracao.inicial = temp[1].duration_initial_seconds;
        }).done(()=>{
          let acc="[";
          $.getAll(S.urls,(i,d)=>{
            acc+= $(d).find('script:contains("ScavengeMassScreen")')
              .html().match(/\{.*\:\{.*\:.*\}\}/g)[2]+",";
          },()=>{
            S.info = JSON.parse(acc.slice(0,-1)+"]");
            S.info.forEach(v=>this.calcular(v));
            this.montarEnvio();
          },e=>console.error(e));
        });
      },

      calcular(d) {
        const S = ShowScripts.scavagetime.state;
        if (!d.has_rally_point) return;

        let mapa = { spear:25,sword:15,axe:10,archer:10,light:80,marcher:50,heavy:50,knight:100 };
        let permitidas = {};

        for (let u in S.tropasAtivas) {
          if (S.tropasAtivas[u]) {
            let q = d.unit_counts_home[u] - S.manterCasa[u];
            permitidas[u] = q > 0 ? q : 0;
          }
        }

        let loot=0;
        for (let u in permitidas) loot += permitidas[u]*mapa[u]*d.unit_carry_factor;
        if (!loot) return;

        let off = (permitidas.axe||0)+(permitidas.light||0)+(permitidas.marcher||0);
        let h = ((off?S.tempo.off:S.tempo.def)*3600/S.duracao.fator - S.duracao.inicial);
        let haul = parseInt((h**(1/S.duracao.expoente))/100)**0.5;

        let rates=[0,0,0,0,0];
        [0.1,0.25,0.5,0.75].forEach((r,i)=>{
          let o=d.options[i+1];
          rates[i+1]=(!o.is_locked&&!o.scavenging_squad&&S.categoriasAtivas[i])?haul/r:0;
        });

        let packs=[{},{},{},{}];
        for(let i=3;i>=0;i--){
          let reach=rates[i+1];
          S.ordemEnvio.forEach(u=>{
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
            S.squads.push({village_id:d.village_id,candidate_squad:cs,option_id:i+1,use_premium:false});
            S.squadsPremium.push({village_id:d.village_id,candidate_squad:cs,option_id:i+1,use_premium:true});
          }
        });
      },

      montarEnvio() {
        const S = ShowScripts.scavagetime.state;
        let g=0,c=0;
        S.grupos={}; S.gruposP={};
        S.grupos[g]=[]; S.gruposP[g]=[];

        S.squads.forEach((s,i)=>{
          if(c===200){g++;c=0;S.grupos[g]=[];S.gruposP[g]=[];}
          S.grupos[g].push(s);
          S.gruposP[g].push(S.squadsPremium[i]);
          c++;
        });

        console.log("[ScavageTime] Grupos prontos:", S.grupos);
      }
    },

    init() {
      this.ui.init();
    }
  };

  /* ================= START (NÃO EXECUTA LÓGICA) ================= */
  ShowScripts[ShowScripts.active].init();

})();
