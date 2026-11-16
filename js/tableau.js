/*
 * Rendu d'un tableau de bord au DSFR : indicateurs, graphiques (Apache ECharts), tableaux, textes.
 *
 * Tableau.monter(conteneur, { tableau, donnees, interactif, titreNiveau, surChangement })
 *   tableau  : réglages d'un tableau de bord (titre, introduction, filtres, blocs, moisDebut)
 *   donnees  : { NomTable: { lignes, colonnes } } (voir donnees.js)
 * Renvoie { rendre(), detruire(), etat }.
 *
 * Tableau.rendreBloc(element, bloc, donnees, options) : un seul bloc (aperçu de l'éditeur).
 */
(function (global) {
  "use strict";

  var C = global.Calcul;

  // Couleurs illustratives du DSFR (contrastes vérifiés sur fond blanc pour les éléments graphiques).
  var PALETTES = {
    dsfr: ["#000091", "#009081", "#E4794A", "#A558A0", "#C3992A", "#417DC4", "#CE614A", "#68A532", "#C08C65", "#465F9D", "#E18B76", "#009099"],
    bleus: ["#000091", "#313178", "#465F9D", "#417DC4", "#6A6AF4", "#8585F6", "#A1A1F8", "#BCBCFA", "#CACAFB", "#E3E3FD"],
    verts: ["#00A95F", "#009081", "#68A532", "#009099", "#447049", "#37635F", "#3A7A5A", "#B7A73F", "#7D8B3A", "#5E7B5E"],
    chauds: ["#CE614A", "#E4794A", "#C3992A", "#C8AA39", "#E18B76", "#C08C65", "#BD987A", "#D1B781", "#A94645", "#8D533E"],
    contraste: ["#000091", "#E1000F", "#18753C", "#B34000", "#6E445A", "#0063CB", "#695240", "#3A3A3A", "#9C0000", "#007C7C"]
  };
  var PALETTES_LIBELLES = [["dsfr", "Couleurs du DSFR (variées)"], ["bleus", "Camaïeu de bleus"], ["verts", "Camaïeu de verts"], ["chauds", "Tons chauds"], ["contraste", "Contraste renforcé"]];

  var FORMES = [
    ["barres", "Barres verticales"], ["barres-h", "Barres horizontales"], ["lignes", "Courbes"], ["aires", "Aires"],
    ["combine", "Barres et courbe combinées"], ["secteurs", "Secteurs (camembert)"], ["anneau", "Anneau"],
    ["entonnoir", "Entonnoir"], ["treemap", "Carte proportionnelle (treemap)"], ["radar", "Radar"],
    ["carte-chaleur", "Carte de chaleur"], ["nuage", "Nuage de points"], ["jauge", "Jauge"]
  ];

  var POLICE = "Marianne, arial, sans-serif";
  var GRIS = "#3a3a3a", GRIS_CLAIR = "#666666", TRAIT = "#dddddd";

  /* ---------- Utilitaires ---------- */

  function esc(s) {
    return String(s === null || s === undefined ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c];
    });
  }
  function el(tag, cls, html) { var n = document.createElement(tag); if (cls) { n.className = cls; } if (html !== undefined) { n.innerHTML = html; } return n; }
  function couleurSure(c) { return /^#[0-9a-f]{3,8}$/i.test(String(c || "")) ? c : ""; }
  var nId = 0;
  function uid(p) { return (p || "tb") + "-" + (++nId); }

  // Texte simple : paragraphes, **gras**, *italique*, listes « - », titres « ### », liens [texte](https://…).
  function texteRiche(t) {
    var html = "", liste = false;
    String(t || "").split(/\r?\n/).forEach(function (l) {
      var x = esc(l)
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/\*(.+?)\*/g, "<em>$1</em>")
        .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, "<a href=\"$2\" target=\"_blank\" rel=\"noopener\">$1</a>");
      if (/^\s*[-•]\s+/.test(l)) {
        if (!liste) { html += "<ul>"; liste = true; }
        html += "<li>" + x.replace(/^\s*[-•]\s+/, "") + "</li>";
        return;
      }
      if (liste) { html += "</ul>"; liste = false; }
      if (/^###\s+/.test(l)) { html += "<h3 class=\"fr-h6\">" + x.replace(/^###\s+/, "") + "</h3>"; }
      else if (l.trim()) { html += "<p>" + x + "</p>"; }
    });
    if (liste) { html += "</ul>"; }
    return html;
  }

  function telecharger(nom, contenu, type) {
    var a = document.createElement("a");
    a.href = typeof contenu === "string" && contenu.indexOf("data:") === 0 ? contenu : URL.createObjectURL(new Blob([contenu], { type: type || "text/plain" }));
    a.download = nom;
    document.body.appendChild(a); a.click(); a.remove();
  }
  function nomFichier(s) { return String(s || "graphique").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "graphique"; }
  function csv(lignes) {
    return "﻿" + lignes.map(function (l) {
      return l.map(function (v) { var s = v === null || v === undefined ? "" : String(v); return /[;"\n]/.test(s) ? "\"" + s.replace(/"/g, "\"\"") + "\"" : s; }).join(";");
    }).join("\r\n");
  }

  /* ---------- Réglages par défaut ---------- */

  function completerTableau(t) {
    t = JSON.parse(JSON.stringify(t || {}));
    t.titre = t.titre === undefined ? "Tableau de bord" : t.titre;
    t.filtres = t.filtres || [];
    t.blocs = t.blocs || [];
    t.blocs.forEach(function (b, i) { if (!b.id) { b.id = "b" + (i + 1) + "-" + Math.random().toString(36).slice(2, 6); } });
    return t;
  }

  /* ---------- Filtres du tableau de bord ---------- */

  // Applique les filtres globaux (sélecteurs, clics sur les graphiques) aux lignes d'un bloc.
  function filtresGlobaux(lignes, colonnes, etat, ctx) {
    var out = lignes;
    Object.keys(etat.selections).forEach(function (k) {
      var s = etat.selections[k];
      if (!s || !colonnes[s.colonne]) { return; }
      if (s.periode) {
        out = C.filtrer(out, [{ colonne: s.colonne, operateur: "periode", valeur: s.periode, du: s.du, au: s.au }], colonnes, ctx);
      } else if (s.valeurs && s.valeurs.length) {
        out = C.filtrer(out, [{ colonne: s.colonne, operateur: "parmi", valeur: s.valeurs }], colonnes, ctx);
      }
    });
    etat.croises.forEach(function (f) {
      if (!colonnes[f.axe.colonne]) { return; }
      out = out.filter(function (r) {
        return C.clesAxe(r, f.axe, colonnes).some(function (k) { return String(k.cle) === String(f.cle); });
      });
    });
    return out;
  }

  function lignesDuBloc(b, donnees, etat, ctx) {
    var t = donnees[b.table];
    if (!t) { return null; }
    var l = C.filtrer(t.lignes, b.filtres, t.colonnes, ctx);
    return etat ? filtresGlobaux(l, t.colonnes, etat, ctx) : l;
  }

  /* ---------- Couleurs ---------- */

  function couleurs(b, libelles, colonne, t) {
    var pal = PALETTES[b.palette] || PALETTES.dsfr;
    var perso = b.couleurs || {};
    var grist = b.couleursGrist !== false && t && t.colonnes[colonne] ? (t.colonnes[colonne].couleurs || {}) : {};
    var i = 0;
    return libelles.map(function (l) {
      if (couleurSure(perso[l])) { return perso[l]; }
      if (couleurSure(grist[l]) && !/^#(f+|e[0-9a-f]e[0-9a-f]e[0-9a-f])$/i.test(grist[l])) { return grist[l]; }
      if (l === C.VIDE || l === "Autres") { return "#929292"; }
      return pal[(i++) % pal.length];
    });
  }

  /* ---------- Options ECharts ---------- */

  function base(b) {
    return {
      animationDuration: 400,
      textStyle: { fontFamily: POLICE, color: GRIS },
      aria: { enabled: true, decal: { show: !!b.motifs } },
      grid: { left: 12, right: 24, top: b.legende === "haut" ? 48 : 16, bottom: b.legende === "bas" ? 48 : 12, containLabel: true },
      tooltip: { confine: true, textStyle: { fontFamily: POLICE } },
      toolbox: { show: false }
    };
  }
  function legende(b, n) {
    if (b.legende === "aucune" || (b.legende === undefined && n < 2)) { return { show: false }; }
    var bas = b.legende === "bas" || b.legende === undefined;
    return { show: true, type: "scroll", top: bas ? undefined : 0, bottom: bas ? 0 : undefined, textStyle: { fontFamily: POLICE, color: GRIS }, itemGap: 16 };
  }
  function fmt(b) {
    var f = Object.assign({}, b.format || {});
    if (b.pourcentage) { f.unite = "%"; if (f.decimales === undefined) { f.decimales = 0; } }
    return f;
  }
  function etiquette(b, position) {
    return { show: !!b.etiquettes, position: position || "top", fontFamily: POLICE, color: GRIS, formatter: function (p) { return C.format(Array.isArray(p.value) ? p.value[p.value.length - 1] : p.value, fmt(b)); } };
  }

  function axeLibelle(rot) {
    return { color: GRIS, fontFamily: POLICE, hideOverlap: true, rotate: rot || 0, width: 140, overflow: "truncate" };
  }

  function optionCategories(b, g, t) {
    var f = fmt(b);
    var horizontal = b.forme === "barres-h";
    var empile = b.empile === "oui" || b.empile === "100";
    var noms = g.series.map(function (s) { return s.nom; });
    var cols = g.series.length > 1 || !b.couleurParCategorie ?
      couleurs(b, noms, b.series && b.series.colonne, t) : null;
    var colsCat = g.series.length === 1 && b.couleurParCategorie ? couleurs(b, g.categories.map(function (c) { return c.libelle; }), b.axe && b.axe.colonne, t) : null;
    var o = base(b);
    var catAxe = {
      type: "category", data: g.categories.map(function (c) { return c.libelle; }),
      axisLabel: axeLibelle(!horizontal && g.categories.length > 8 ? 30 : 0), axisLine: { lineStyle: { color: "#929292" } }, axisTick: { alignWithLabel: true },
      inverse: horizontal, boundaryGap: b.forme !== "lignes" && b.forme !== "aires" ? true : false
    };
    var valAxes = [{ type: "value", name: b.titreAxe || "", nameTextStyle: { color: GRIS_CLAIR }, axisLabel: { color: GRIS_CLAIR, formatter: function (v) { return C.format(v, Object.assign({}, f, { compact: true })); } }, splitLine: { lineStyle: { color: TRAIT } }, max: b.empile === "100" ? 100 : undefined }];
    var droit = b.forme === "combine" && (b.mesures || []).some(function (m) { return m.axeDroit; });
    if (droit) { valAxes.push({ type: "value", position: "right", axisLabel: { color: GRIS_CLAIR }, splitLine: { show: false } }); }
    o.xAxis = horizontal ? valAxes : catAxe;
    o.yAxis = horizontal ? catAxe : valAxes;
    o.tooltip.trigger = "axis";
    o.tooltip.axisPointer = { type: b.forme === "lignes" || b.forme === "aires" ? "line" : "shadow" };
    o.tooltip.valueFormatter = function (v) { return C.format(v, f); };
    o.legend = legende(b, g.series.length);
    if (g.categories.length > 30 && !horizontal) { o.dataZoom = [{ type: "inside" }, { type: "slider", height: 18, bottom: o.legend.show ? 32 : 4 }]; o.grid.bottom += 32; }
    o.series = g.series.map(function (s, i) {
      var m = (b.mesures || [])[i] || {};
      var type = b.forme === "lignes" || b.forme === "aires" ? "line" : "bar";
      if (b.forme === "combine") { type = m.forme === "lignes" || (i > 0 && m.forme !== "barres") ? "line" : "bar"; }
      var serie = {
        name: s.nom, type: type, data: s.valeurs.map(function (v, j) {
          return colsCat ? { value: v, itemStyle: { color: colsCat[j] } } : v;
        }),
        stack: empile && type === "bar" || (empile && b.forme === "aires") ? "pile" : undefined,
        label: etiquette(b, horizontal ? "right" : (empile ? "inside" : "top")),
        emphasis: { focus: "series" },
        barMaxWidth: 56,
        yAxisIndex: droit && m.axeDroit && !horizontal ? 1 : 0
      };
      if (cols) { serie.itemStyle = { color: cols[i] }; serie.lineStyle = { width: 3, color: cols[i] }; }
      if (type === "line") { serie.smooth = !!b.lisse; serie.symbolSize = 7; serie.connectNulls = true; }
      if (b.forme === "aires") { serie.areaStyle = { opacity: empile ? 0.85 : 0.25 }; }
      if (empile && b.etiquettes) { serie.label.color = "#fff"; }
      return serie;
    });
    if (b.objectif !== undefined && b.objectif !== null && b.objectif !== "" && o.series[0]) {
      o.series[0].markLine = { symbol: "none", silent: true, lineStyle: { color: "#E1000F", type: "dashed", width: 2 }, label: { formatter: (b.libelleObjectif || "Objectif") + " : " + C.format(Number(b.objectif), f), color: "#E1000F", fontFamily: POLICE }, data: [horizontal ? { xAxis: Number(b.objectif) } : { yAxis: Number(b.objectif) }] };
    }
    return o;
  }

  function optionParts(b, g, t) {
    var f = fmt(b);
    var s = g.series[0] || { valeurs: [] };
    var libs = g.categories.map(function (c) { return c.libelle; });
    var cols = couleurs(b, libs, b.axe && b.axe.colonne, t);
    var data = g.categories.map(function (c, i) { return { name: c.libelle, value: s.valeurs[i], itemStyle: { color: cols[i] } }; }).filter(function (d) { return d.value; });
    var total = data.reduce(function (a, d) { return a + (d.value || 0); }, 0);
    var o = base(b);
    o.tooltip.trigger = "item";
    o.tooltip.formatter = function (p) { return esc(p.name) + "<br><strong>" + esc(C.format(p.value, f)) + "</strong> (" + C.format(total ? 100 * p.value / total : 0, { decimales: 0, unite: "%" }) + ")"; };
    o.legend = legende(Object.assign({}, b, { legende: b.legende || "bas" }), 2);
    if (b.forme === "entonnoir") {
      o.series = [{ type: "funnel", data: data, sort: "descending", gap: 2, left: "10%", width: "80%", top: 8, bottom: o.legend.show ? 40 : 8, label: { show: true, position: "inside", color: "#fff", fontFamily: POLICE, formatter: function (p) { return C.format(p.value, f); } } }];
      return o;
    }
    if (b.forme === "treemap") {
      o.legend = { show: false };
      o.series = [{ type: "treemap", data: data, roam: false, nodeClick: false, breadcrumb: { show: false }, top: 0, left: 0, right: 0, bottom: 0, label: { show: true, fontFamily: POLICE, formatter: function (p) { return p.name + "\n" + C.format(p.value, f); } }, itemStyle: { borderColor: "#fff", borderWidth: 2, gapWidth: 2 } }];
      return o;
    }
    var anneau = b.forme === "anneau";
    o.series = [{
      type: "pie", data: data, radius: anneau ? ["45%", "72%"] : [0, "72%"], center: ["50%", o.legend.show ? "45%" : "50%"],
      avoidLabelOverlap: true, itemStyle: { borderColor: "#fff", borderWidth: 2 },
      label: { show: b.etiquettes !== false, fontFamily: POLICE, color: GRIS, formatter: function (p) { return p.name + " : " + C.format(b.pourcentage ? p.percent : p.value, b.pourcentage ? { unite: "%", decimales: 0 } : f); } },
      labelLine: { length: 8, length2: 8 }
    }];
    if (anneau && b.totalAuCentre !== false) {
      o.title = { text: C.format(total, Object.assign({}, f, { compact: true })), subtext: b.libelleTotal || "au total", left: "center", top: o.legend.show ? "37%" : "42%", textStyle: { fontFamily: POLICE, fontSize: 24, fontWeight: 700, color: GRIS }, subtextStyle: { fontFamily: POLICE, color: GRIS_CLAIR } };
    }
    return o;
  }

  function optionRadar(b, g, t) {
    var f = fmt(b);
    var max = 0;
    g.series.forEach(function (s) { s.valeurs.forEach(function (v) { if (v > max) { max = v; } }); });
    var cols = couleurs(b, g.series.map(function (s) { return s.nom; }), b.series && b.series.colonne, t);
    var o = base(b);
    o.legend = legende(b, g.series.length);
    o.tooltip.trigger = "item";
    o.radar = { indicator: g.categories.map(function (c) { return { name: c.libelle, max: b.empile === "100" ? 100 : (Number(b.max) || max * 1.1 || 1) }; }), axisName: { color: GRIS, fontFamily: POLICE }, splitLine: { lineStyle: { color: TRAIT } }, radius: "65%" };
    o.series = [{ type: "radar", data: g.series.map(function (s, i) { return { name: s.nom, value: s.valeurs.map(function (v) { return v || 0; }), itemStyle: { color: cols[i] }, lineStyle: { width: 2, color: cols[i] }, areaStyle: { opacity: 0.12 } }; }), tooltip: { valueFormatter: function (v) { return C.format(v, f); } } }];
    return o;
  }

  function optionChaleur(b, g) {
    var f = fmt(b);
    var data = [], max = 0;
    g.series.forEach(function (s, y) { s.valeurs.forEach(function (v, x) { data.push([x, y, v || 0]); if (v > max) { max = v; } }); });
    var o = base(b);
    o.tooltip.trigger = "item";
    o.tooltip.formatter = function (p) { return esc(g.categories[p.value[0]].libelle) + " · " + esc(g.series[p.value[1]].nom) + "<br><strong>" + esc(C.format(p.value[2], f)) + "</strong>"; };
    o.grid.bottom = 56;
    o.xAxis = { type: "category", data: g.categories.map(function (c) { return c.libelle; }), axisLabel: axeLibelle(g.categories.length > 8 ? 30 : 0), splitArea: { show: true } };
    o.yAxis = { type: "category", data: g.series.map(function (s) { return s.nom; }), axisLabel: axeLibelle(), splitArea: { show: true } };
    var pal = PALETTES[b.palette] || PALETTES.bleus;
    o.visualMap = { min: 0, max: max || 1, calculable: true, orient: "horizontal", left: "center", bottom: 0, itemHeight: 120, inRange: { color: ["#F5F5FE", b.palette && b.palette !== "dsfr" ? pal[0] : "#000091"] }, textStyle: { fontFamily: POLICE, color: GRIS_CLAIR } };
    o.series = [{ type: "heatmap", data: data, label: { show: b.etiquettes !== false, fontFamily: POLICE, formatter: function (p) { return C.format(p.value[2], Object.assign({}, f, { compact: true })); } }, itemStyle: { borderColor: "#fff", borderWidth: 1 } }];
    return o;
  }

  function optionNuage(b, lignes, t) {
    var f = fmt(b);
    var x = (b.nuage || {}).x, y = (b.nuage || {}).y, taille = (b.nuage || {}).taille, coul = (b.nuage || {}).couleur, lib = (b.nuage || {}).libelle;
    var groupes = {}, ordre = [];
    var maxT = 0;
    lignes.forEach(function (r) {
      var vx = C.nombre(r[x]), vy = C.nombre(r[y]);
      if (vx === null || vy === null) { return; }
      var k = coul ? C.cles(r[coul], (t.colonnes[coul] || {}).type)[0] : "Points";
      if (!groupes[k]) { groupes[k] = []; ordre.push(k); }
      var vt = taille ? C.nombre(r[taille]) || 0 : 0;
      if (vt > maxT) { maxT = vt; }
      groupes[k].push({ value: [vx, vy, vt], name: lib ? String(r[lib] === null || r[lib] === undefined ? "" : r[lib]) : "" });
    });
    var cols = couleurs(b, ordre, coul, t);
    var o = base(b);
    o.legend = legende(b, ordre.length);
    o.tooltip.trigger = "item";
    o.tooltip.formatter = function (p) {
      return (p.name ? "<strong>" + esc(p.name) + "</strong><br>" : "") + esc(libCol(t, x)) + " : " + esc(C.format(p.value[0])) + "<br>" + esc(libCol(t, y)) + " : " + esc(C.format(p.value[1], f)) + (taille ? "<br>" + esc(libCol(t, taille)) + " : " + esc(C.format(p.value[2])) : "");
    };
    o.xAxis = { type: "value", name: libCol(t, x), nameLocation: "middle", nameGap: 28, scale: true, axisLabel: { color: GRIS_CLAIR }, splitLine: { lineStyle: { color: TRAIT } } };
    o.yAxis = { type: "value", name: libCol(t, y), scale: true, axisLabel: { color: GRIS_CLAIR }, splitLine: { lineStyle: { color: TRAIT } } };
    o.grid.bottom += 24;
    o.series = ordre.map(function (k, i) {
      return { name: k, type: "scatter", data: groupes[k], itemStyle: { color: cols[i], opacity: 0.8 }, symbolSize: taille ? function (v) { return 6 + 34 * Math.sqrt((v[2] || 0) / (maxT || 1)); } : 10 };
    });
    return { option: o, donnees: ordre.reduce(function (a, k) { return a.concat(groupes[k].map(function (p) { return [k, p.name, p.value[0], p.value[1], p.value[2]]; })); }, []) };
  }

  function optionJauge(b, valeur) {
    var f = fmt(b);
    var max = Number(b.objectif) || Number(b.max) || 100;
    var o = base(b);
    o.series = [{
      type: "gauge", min: 0, max: max, progress: { show: true, width: 18, itemStyle: { color: (PALETTES[b.palette] || PALETTES.dsfr)[0] } },
      axisLine: { lineStyle: { width: 18, color: [[1, "#EEEEEE"]] } }, axisTick: { show: false }, splitLine: { show: false },
      axisLabel: { show: true, distance: 24, color: GRIS_CLAIR, fontFamily: POLICE, formatter: function (v) { return v === 0 || v === max ? C.format(v, Object.assign({}, f, { compact: true })) : ""; } },
      pointer: { show: false }, anchor: { show: false }, title: { show: false },
      detail: { valueAnimation: true, offsetCenter: [0, "10%"], fontSize: 30, fontWeight: 700, fontFamily: POLICE, color: GRIS, formatter: function (v) { return C.format(v, f); } },
      data: [{ value: valeur === null ? 0 : valeur, name: b.titre || "" }]
    }];
    return o;
  }

  function libCol(t, c) { return t && t.colonnes[c] ? (t.colonnes[c].libelle || c) : (c || ""); }

  /* ---------- Blocs ---------- */

  // Calcule le contenu d'un bloc graphique : option ECharts et table des données (accessibilité, export).
  function calculerGraphique(b, lignes, t, ctx) {
    var forme = b.forme || "barres";
    if (forme === "nuage") {
      var n = optionNuage(b, lignes, t);
      return { option: n.option, entetes: [libCol(t, (b.nuage || {}).couleur) || "Groupe", libCol(t, (b.nuage || {}).libelle) || "Libellé", libCol(t, (b.nuage || {}).x), libCol(t, (b.nuage || {}).y), libCol(t, (b.nuage || {}).taille) || "Taille"], lignes: n.donnees };
    }
    if (forme === "jauge") {
      var v = C.agreger(lignes, (b.mesures || [])[0], t.colonnes, ctx);
      return { option: optionJauge(b, v), entetes: ["Mesure", "Valeur"], lignes: [[C.libelleMesure((b.mesures || [])[0], t.colonnes), C.format(v, fmt(b))]] };
    }
    var parts = ["secteurs", "anneau", "entonnoir", "treemap"].indexOf(forme) >= 0;
    var opts = {
      axe: Object.assign({ moisDebut: ctx.moisDebut }, b.axe || {}),
      series: parts ? null : (b.series && b.series.colonne ? b.series : null),
      mesures: parts || (b.series && b.series.colonne) ? [(b.mesures || [])[0] || { fonction: "nombre" }] : b.mesures,
      cumul: b.cumul, pourcentage: b.empile === "100" ? "categorie" : (b.pourcentage && !parts ? true : false)
    };
    if (forme === "carte-chaleur" && !(opts.series)) { opts.series = null; }
    var g = C.grouper(lignes, opts, t.colonnes, ctx);
    var option = parts ? optionParts(b, g, t) : forme === "radar" ? optionRadar(b, g, t) : forme === "carte-chaleur" && g.series.length ? optionChaleur(b, g) : optionCategories(b, g, t);
    var f = fmt(b);
    return {
      option: option, groupes: g,
      entetes: [libCol(t, (b.axe || {}).colonne) || ""].concat(g.series.map(function (s) { return s.nom || "Valeur"; })),
      lignes: g.categories.map(function (c, i) { return [c.libelle].concat(g.series.map(function (s) { return C.format(s.valeurs[i], f); })); }),
      brutes: g.categories.map(function (c, i) { return [c.libelle].concat(g.series.map(function (s) { return s.valeurs[i] === null || s.valeurs[i] === undefined ? "" : Math.round(s.valeurs[i] * 1000) / 1000; })); })
    };
  }

  function tableHtml(entetes, lignes, legende, totaux) {
    return "<div class=\"fr-table fr-table--sm fr-table--no-caption tb-table\"><div class=\"fr-table__wrapper\"><div class=\"fr-table__container\"><div class=\"fr-table__content\"><table>" +
      "<caption>" + esc(legende || "Données") + "</caption><thead><tr>" + entetes.map(function (h) { return "<th scope=\"col\">" + esc(h) + "</th>"; }).join("") + "</tr></thead><tbody>" +
      lignes.map(function (l) { return "<tr>" + l.map(function (v, i) { return i === 0 ? "<th scope=\"row\">" + esc(v) + "</th>" : "<td class=\"tb-num\">" + esc(v) + "</td>"; }).join("") + "</tr>"; }).join("") +
      "</tbody>" + (totaux ? "<tfoot><tr>" + totaux.map(function (v, i) { return i === 0 ? "<th scope=\"row\">" + esc(v) + "</th>" : "<td class=\"tb-num\"><strong>" + esc(v) + "</strong></td>"; }).join("") + "</tr></tfoot>" : "") +
      "</table></div></div></div></div>";
  }

  function indicateur(corps, b, lignes, t, ctx, toutes) {
    var f = fmt(b);
    var m = (b.mesures || [])[0] || { fonction: "nombre" };
    var v = C.agreger(lignes, m, t.colonnes, ctx);
    var h = "<p class=\"tb-kpi__valeur\">" + esc(C.format(v, f)) + "</p>";
    if (b.libelleValeur) { h += "<p class=\"tb-kpi__libelle\">" + esc(b.libelleValeur) + "</p>"; }
    // Évolution par rapport à la période précédente.
    var cmp = b.comparaison || {};
    if (cmp.colonne && cmp.periode && t.colonnes[cmp.colonne]) {
      var pairs = { "annee": "annee-precedente", "mois": "mois-precedent" };
      var actuel = C.filtrer(lignes, [{ colonne: cmp.colonne, operateur: "periode", valeur: cmp.periode }], t.colonnes, ctx);
      var avant = C.filtrer(toutes, [{ colonne: cmp.colonne, operateur: "periode", valeur: pairs[cmp.periode] || "annee-precedente" }], t.colonnes, ctx);
      var va = C.agreger(actuel, m, t.colonnes, ctx), vp = C.agreger(avant, m, t.colonnes, ctx);
      h = "<p class=\"tb-kpi__valeur\">" + esc(C.format(va, f)) + "</p>" + (b.libelleValeur ? "<p class=\"tb-kpi__libelle\">" + esc(b.libelleValeur) + "</p>" : "");
      if (vp) {
        var d = 100 * (va - vp) / Math.abs(vp);
        var hausse = d > 0, bon = b.sensFavorable === "baisse" ? !hausse : hausse;
        h += "<p class=\"fr-badge fr-badge--sm fr-badge--no-icon " + (Math.abs(d) < 0.5 ? "" : bon ? "fr-badge--success" : "fr-badge--error") + "\">" +
          (hausse ? "▲ +" : d < 0 ? "▼ " : "") + esc(C.format(d, { decimales: 0 })) + " % <span class=\"fr-sr-only\">par rapport à la période précédente</span></p>" +
          " <span class=\"fr-text--xs tb-kpi__comparaison\">vs " + esc((C.PERIODES.find(function (p) { return p[0] === (pairs[cmp.periode] || "annee-precedente"); }) || [0, ""])[1].toLowerCase()) + " (" + esc(C.format(vp, f)) + ")</span>";
      }
      v = va;
    }
    // Objectif : barre de progression.
    if (b.objectif !== undefined && b.objectif !== null && b.objectif !== "" && Number(b.objectif)) {
      var p = Math.max(0, Math.min(100, 100 * (v || 0) / Number(b.objectif)));
      h += "<div class=\"tb-progression\" role=\"img\" aria-label=\"" + esc(C.format(p, { decimales: 0, unite: "%" })) + " de l'objectif\"><span style=\"width:" + p.toFixed(1) + "%\"></span></div>" +
        "<p class=\"fr-text--xs tb-kpi__comparaison\">" + esc(C.format(p, { decimales: 0, unite: "%" })) + " de l'objectif (" + esc(C.format(Number(b.objectif), f)) + ")</p>";
    }
    corps.innerHTML = "<div class=\"tb-kpi\">" + h + "</div>";
    // Petite courbe d'évolution.
    var sp = b.tendance || {};
    if (sp.colonne && t.colonnes[sp.colonne] && global.echarts) {
      var g = C.grouper(lignes, { axe: { colonne: sp.colonne, pas: sp.pas || "mois", moisDebut: ctx.moisDebut }, mesures: [m] }, t.colonnes, ctx);
      var z = el("div", "tb-tendance");
      z.setAttribute("aria-hidden", "true");
      corps.firstChild.appendChild(z);
      var ch = global.echarts.init(z, null, { renderer: "svg" });
      ch.setOption({ animation: false, grid: { left: 0, right: 0, top: 4, bottom: 0 }, xAxis: { type: "category", show: false, data: g.categories.map(function (c) { return c.libelle; }) }, yAxis: { type: "value", show: false }, series: [{ type: "line", data: g.series[0].valeurs, symbol: "none", smooth: true, lineStyle: { width: 2, color: (PALETTES[b.palette] || PALETTES.dsfr)[0] }, areaStyle: { opacity: 0.12, color: (PALETTES[b.palette] || PALETTES.dsfr)[0] } }] });
      return { graphique: ch, entetes: ["Mesure", "Valeur"], lignes: [[C.libelleMesure(m, t.colonnes), C.format(v, f)]] };
    }
    return { entetes: ["Mesure", "Valeur"], lignes: [[b.libelleValeur || C.libelleMesure(m, t.colonnes), C.format(v, f)]] };
  }

  function tableau(corps, b, lignes, t, ctx) {
    var f = fmt(b);
    if (b.mode === "liste") {
      var cols = (b.colonnesListe || []).filter(function (c) { return t.colonnes[c]; });
      if (!cols.length) { cols = Object.keys(t.colonnes).slice(0, 5); }
      var l = lignes.slice();
      if (b.triListe && t.colonnes[b.triListe]) {
        l.sort(function (a, c) { var x = a[b.triListe], y = c[b.triListe]; if (x === y) { return 0; } if (x === null || x === undefined) { return 1; } if (y === null || y === undefined) { return -1; } return (x < y ? -1 : 1) * (b.ordreListe === "asc" ? 1 : -1); });
      }
      var max = Number(b.limite) || 10;
      var rows = l.slice(0, max).map(function (r) {
        return cols.map(function (c) {
          var v = r[c], fam = C.famille(t.colonnes[c].type);
          if (fam === "date") { return C.formatDate(v); }
          if (fam === "nombre") { return C.format(v); }
          if (fam === "booleen") { return v ? "Oui" : "Non"; }
          if (Array.isArray(v)) { return (v[0] === "L" ? v.slice(1) : v).join(", "); }
          return v === null || v === undefined ? "" : String(v);
        });
      });
      corps.innerHTML = tableHtml(cols.map(function (c) { return libCol(t, c); }), rows, b.titre) + (l.length > max ? "<p class=\"fr-text--xs tb-note\">" + esc(max) + " lignes affichées sur " + esc(l.length) + ".</p>" : "");
      return { entetes: cols.map(function (c) { return libCol(t, c); }), lignes: rows };
    }
    var x = C.croiser(lignes, { lignes: Object.assign({ moisDebut: ctx.moisDebut }, b.axe || {}), colonnes: b.series && b.series.colonne ? Object.assign({ moisDebut: ctx.moisDebut }, b.series) : null, mesure: (b.mesures || [])[0] }, t.colonnes, ctx);
    var entetes = [libCol(t, (b.axe || {}).colonne)].concat(x.colonnes.map(function (c) { return c.libelle; }));
    var avecTotal = b.totaux !== false && x.colonnes.length > 1;
    if (avecTotal) { entetes.push("Total"); }
    var rows2 = x.lignes.map(function (lg, i) {
      var r = [lg.libelle].concat(x.valeurs[i].map(function (v) { return C.format(v, f); }));
      if (avecTotal) { r.push(C.format(x.totalLignes[i], f)); }
      return r;
    });
    var tot = b.totaux !== false ? ["Total"].concat(x.totalColonnes.map(function (v) { return C.format(v, f); })).concat(avecTotal ? [C.format(x.total, f)] : []) : null;
    corps.innerHTML = tableHtml(entetes, rows2, b.titre, tot);
    return { entetes: entetes, lignes: rows2.concat(tot ? [tot] : []) };
  }

  // Rend un bloc dans « carte » (élément vide). Renvoie { graphique, entetes, lignes, brutes }.
  function rendreBloc(carte, b, donnees, opts) {
    opts = opts || {};
    var ctx = { moisDebut: opts.moisDebut, maintenant: opts.maintenant };
    carte.innerHTML = "";
    carte.className = "tb-bloc tb-bloc--" + (b.type || "graphique") + (b.accent ? " tb-bloc--accent" : "");
    if (couleurSure(b.accent)) { carte.style.borderTopColor = b.accent; } else { carte.style.borderTopColor = ""; }
    var niveau = opts.titreNiveau || 2;
    var tete = el("div", "tb-bloc__tete");
    if (b.titre) { tete.appendChild(el("h" + niveau, "tb-bloc__titre", esc(b.titre))); }
    if (b.sousTitre) { tete.appendChild(el("p", "tb-bloc__sous-titre", esc(b.sousTitre))); }
    carte.appendChild(tete);
    var corps = el("div", "tb-bloc__corps");
    carte.appendChild(corps);

    if (b.type === "texte") { corps.innerHTML = "<div class=\"tb-texte\">" + texteRiche(b.contenu) + "</div>"; return {}; }

    var t = donnees[b.table];
    if (!t) {
      corps.innerHTML = "<p class=\"fr-text--sm tb-note\">" + (b.table ? "Table « " + esc(b.table) + " » introuvable ou illisible." : "Choisissez une table dans l'éditeur.") + "</p>";
      return {};
    }
    var toutes = C.filtrer(t.lignes, b.filtres, t.colonnes, ctx);
    var lignes = opts.etat ? filtresGlobaux(toutes, t.colonnes, opts.etat, ctx) : toutes;
    var res;
    if (b.type === "indicateur") { res = indicateur(corps, b, lignes, t, ctx, toutes); }
    else if (b.type === "tableau") { res = tableau(corps, b, lignes, t, ctx); }
    else {
      if (!lignes.length) { corps.innerHTML = "<p class=\"fr-text--sm tb-note\">Aucune donnée pour cette sélection.</p>"; return {}; }
      var g = calculerGraphique(b, lignes, t, ctx);
      var zone = el("div", "tb-graphique");
      zone.style.height = (Number(b.hauteur) || 320) + "px";
      zone.setAttribute("role", "img");
      zone.setAttribute("aria-label", (b.titre ? b.titre + ". " : "") + "Graphique ; les données sont disponibles dans le tableau qui suit.");
      corps.appendChild(zone);
      var ch = global.echarts ? global.echarts.init(zone, null, { renderer: "svg", locale: "FR" }) : null;
      if (ch) {
        ch.setOption(g.option);
        if (opts.surClic && b.axe && b.axe.colonne && ["nuage", "jauge", "carte-chaleur"].indexOf(b.forme) < 0) {
          ch.on("click", function (p) {
            var cat = g.groupes && g.groupes.categories[p.dataIndex];
            if (cat && cat.cle !== "__autres") { opts.surClic({ axe: Object.assign({ moisDebut: ctx.moisDebut }, b.axe), cle: cat.cle, libelle: cat.libelle, colonne: b.axe.colonne, nomColonne: libCol(t, b.axe.colonne) }); }
          });
          zone.classList.add("tb-cliquable");
        }
      }
      res = { graphique: ch, entetes: g.entetes, lignes: g.lignes, brutes: g.brutes };
    }
    if (b.source) { carte.appendChild(el("p", "tb-source fr-text--xs", "Source : " + esc(b.source))); }
    // Données sous forme de tableau (accessibilité) et exports.
    if (res && res.entetes && b.type === "graphique") {
      var det = el("details", "tb-donnees");
      det.innerHTML = "<summary class=\"fr-text--sm\">Voir les données</summary>" + tableHtml(res.entetes, res.lignes, b.titre);
      carte.appendChild(det);
    }
    if (res && opts.exports !== false && b.type !== "texte") {
      var outils = el("div", "tb-outils");
      if (res.graphique && b.type === "graphique") {
        var bi = el("button", "fr-btn fr-btn--tertiary-no-outline fr-btn--sm fr-icon-image-line fr-btn--icon-left", "Image");
        bi.type = "button"; bi.title = "Télécharger le graphique en image (PNG)";
        bi.addEventListener("click", function () { telecharger(nomFichier(b.titre) + ".png", res.graphique.getDataURL({ type: "png", pixelRatio: 2, backgroundColor: "#fff" })); });
        outils.appendChild(bi);
      }
      var bc = el("button", "fr-btn fr-btn--tertiary-no-outline fr-btn--sm fr-icon-download-line fr-btn--icon-left", "Données");
      bc.type = "button"; bc.title = "Télécharger les données (CSV)";
      bc.addEventListener("click", function () { telecharger(nomFichier(b.titre) + ".csv", csv([res.entetes].concat(res.brutes || res.lignes)), "text/csv;charset=utf-8"); });
      outils.appendChild(bc);
      tete.appendChild(outils);
    }
    return res || {};
  }

  /* ---------- Tableau de bord ---------- */

  function valeursFiltre(f, donnees) {
    var vus = {}, out = [], choix = null;
    Object.keys(donnees).forEach(function (n) {
      if (f.table && f.table !== n) { return; }
      var t = donnees[n], c = t.colonnes[f.colonne];
      if (!c) { return; }
      if (c.choix && !choix) { choix = c.choix; }
      t.lignes.forEach(function (r) { C.cles(r[f.colonne], c.type).forEach(function (k) { if (!vus[k]) { vus[k] = 1; out.push(k); } }); });
    });
    out.sort(function (a, b) {
      if (a === C.VIDE) { return 1; } if (b === C.VIDE) { return -1; }
      if (choix) { var ia = choix.indexOf(a), ib = choix.indexOf(b); if (ia >= 0 || ib >= 0) { return (ia < 0 ? 1e6 : ia) - (ib < 0 ? 1e6 : ib); } }
      return a.localeCompare(b, "fr", { numeric: true });
    });
    return out;
  }

  function familleFiltre(f, donnees) {
    var fam = "texte";
    Object.keys(donnees).some(function (n) { var c = donnees[n].colonnes[f.colonne]; if (c) { fam = C.famille(c.type); return true; } return false; });
    return fam;
  }

  function monter(conteneur, opts) {
    var tb = completerTableau(opts.tableau);
    var donnees = opts.donnees || {};
    var etat = { selections: {}, croises: [] };
    var graphiques = [];
    var ctx = { moisDebut: tb.moisDebut, maintenant: opts.maintenant };
    var n = opts.titreNiveau || 1;

    tb.filtres.forEach(function (f) {
      if (f.defaut) {
        etat.selections[f.id || f.colonne] = familleFiltre(f, donnees) === "date" ? { colonne: f.colonne, periode: f.defaut } : { colonne: f.colonne, valeurs: [f.defaut] };
      }
    });

    conteneur.innerHTML = "";
    var racine = el("div", "tb");
    conteneur.appendChild(racine);
    if (tb.titre || tb.introduction) {
      var tete = el("div", "tb-tete");
      if (tb.titre) { tete.appendChild(el("h" + n, "tb-titre", esc(tb.titre))); }
      if (tb.introduction) { tete.appendChild(el("div", "fr-text--lead tb-intro", texteRiche(tb.introduction))); }
      if (tb.miseAJour !== false && opts.dateDonnees) { tete.appendChild(el("p", "fr-text--xs tb-note", "Données au " + esc(opts.dateDonnees))); }
      racine.appendChild(tete);
    }
    var barre = el("div", "tb-filtres");
    racine.appendChild(barre);
    var actifs = el("div", "tb-actifs");
    actifs.setAttribute("aria-live", "polite");
    racine.appendChild(actifs);
    var grille = el("div", "fr-grid-row fr-grid-row--gutters tb-grille");
    racine.appendChild(grille);

    function construireFiltres() {
      barre.innerHTML = "";
      if (!tb.filtres.length) { barre.hidden = true; return; }
      barre.hidden = false;
      var form = el("div", "tb-filtres__ligne");
      tb.filtres.forEach(function (f) {
        var key = f.id || f.colonne;
        var fam = familleFiltre(f, donnees);
        var i = uid("filtre");
        var g = el("div", "fr-select-group tb-filtre");
        var opt;
        var s = etat.selections[key] || {};
        if (fam === "date") {
          opt = "<option value=\"\">Toutes les dates</option>" + C.PERIODES.map(function (p) { return "<option value=\"" + p[0] + "\"" + (s.periode === p[0] ? " selected" : "") + ">" + esc(p[1]) + "</option>"; }).join("");
        } else {
          opt = "<option value=\"\">" + esc(f.libelleTous || "Tout") + "</option>" + valeursFiltre(f, donnees).map(function (v) {
            return "<option value=\"" + esc(v) + "\"" + ((s.valeurs || []).indexOf(v) >= 0 ? " selected" : "") + ">" + esc(v) + "</option>";
          }).join("");
        }
        g.innerHTML = "<label class=\"fr-label\" for=\"" + i + "\">" + esc(f.libelle || f.colonne) + "</label><select class=\"fr-select\" id=\"" + i + "\">" + opt + "</select>";
        g.querySelector("select").addEventListener("change", function (ev) {
          var v = ev.target.value;
          if (!v) { delete etat.selections[key]; }
          else { etat.selections[key] = fam === "date" ? { colonne: f.colonne, periode: v } : { colonne: f.colonne, valeurs: [v] }; }
          rendreBlocs();
        });
        form.appendChild(g);
      });
      barre.appendChild(form);
    }

    function afficherActifs() {
      actifs.innerHTML = "";
      if (!etat.croises.length) { return; }
      var p = el("p", "fr-text--sm tb-actifs__titre", "Filtré en cliquant sur les graphiques :");
      actifs.appendChild(p);
      var ul = el("ul", "fr-tags-group");
      etat.croises.forEach(function (f, i) {
        var li = el("li");
        var b = el("button", "fr-tag fr-tag--sm fr-tag--dismiss", esc(f.nomColonne + " : " + f.libelle));
        b.type = "button";
        b.setAttribute("aria-label", "Retirer le filtre " + f.nomColonne + " : " + f.libelle);
        b.addEventListener("click", function () { etat.croises.splice(i, 1); rendreBlocs(); });
        li.appendChild(b); ul.appendChild(li);
      });
      var li2 = el("li");
      var tout = el("button", "fr-btn fr-btn--tertiary-no-outline fr-btn--sm", "Tout effacer");
      tout.type = "button";
      tout.addEventListener("click", function () { etat.croises = []; rendreBlocs(); });
      li2.appendChild(tout); ul.appendChild(li2);
      actifs.appendChild(ul);
    }

    function surClic(f) {
      var i = etat.croises.findIndex(function (x) { return x.colonne === f.colonne && String(x.cle) === String(f.cle); });
      if (i >= 0) { etat.croises.splice(i, 1); }
      else { etat.croises = etat.croises.filter(function (x) { return x.colonne !== f.colonne; }); etat.croises.push(f); }
      rendreBlocs();
    }

    function rendreBlocs() {
      graphiques.forEach(function (g) { try { g.dispose(); } catch (e) { /* déjà libéré */ } });
      graphiques = [];
      grille.innerHTML = "";
      afficherActifs();
      if (!tb.blocs.length) {
        grille.innerHTML = "<div class=\"fr-col-12\"><p class=\"tb-note\">Ce tableau de bord ne contient encore aucun bloc.</p></div>";
        return;
      }
      tb.blocs.forEach(function (b) {
        var col = el("div", "fr-col-12 fr-col-md-" + (b.largeur || (b.type === "indicateur" ? 3 : 6)));
        var carte = el("section");
        carte.setAttribute("aria-label", b.titre || "Bloc");
        col.appendChild(carte);
        grille.appendChild(col);
        try {
          var r = rendreBloc(carte, b, donnees, { etat: etat, moisDebut: tb.moisDebut, maintenant: opts.maintenant, titreNiveau: n + 1, surClic: opts.interactif === false ? null : surClic, exports: opts.exports });
          if (r.graphique) { graphiques.push(r.graphique); }
        } catch (e) {
          carte.innerHTML = "<p class=\"fr-text--sm tb-note\">Ce bloc n'a pas pu être calculé (" + esc(e.message) + ").</p>";
        }
      });
      if (opts.surChangement) { opts.surChangement(etat); }
    }

    function redimensionner() { graphiques.forEach(function (g) { g.resize(); }); }
    var minuterie = null;
    function surRedim() { clearTimeout(minuterie); minuterie = setTimeout(redimensionner, 120); }
    window.addEventListener("resize", surRedim);
    window.addEventListener("beforeprint", redimensionner);

    construireFiltres();
    rendreBlocs();

    return {
      etat: etat,
      rendre: function () { construireFiltres(); rendreBlocs(); },
      redimensionner: redimensionner,
      detruire: function () {
        window.removeEventListener("resize", surRedim);
        window.removeEventListener("beforeprint", redimensionner);
        graphiques.forEach(function (g) { try { g.dispose(); } catch (e) { /* déjà libéré */ } });
        conteneur.innerHTML = "";
      }
    };
  }

  // Tables utilisées par un tableau de bord.
  function tablesUtilisees(tb) {
    var out = [];
    (tb.blocs || []).forEach(function (b) { if (b.table && out.indexOf(b.table) < 0) { out.push(b.table); } });
    (tb.filtres || []).forEach(function (f) { if (f.table && out.indexOf(f.table) < 0) { out.push(f.table); } });
    return out;
  }

  global.Tableau = {
    PALETTES: PALETTES, PALETTES_LIBELLES: PALETTES_LIBELLES, FORMES: FORMES,
    completerTableau: completerTableau, monter: monter, rendreBloc: rendreBloc,
    tablesUtilisees: tablesUtilisees, texteRiche: texteRiche, calculerGraphique: calculerGraphique
  };
})(typeof window !== "undefined" ? window : globalThis);
