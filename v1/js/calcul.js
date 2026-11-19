/*
 * Moteur de calcul des tableaux de bord : filtres, regroupements, agrégations.
 * Fonctions pures, sans accès réseau ni au DOM (testables hors navigateur).
 *
 * Une « table » est décrite par { lignes: [{id, col: valeur…}], colonnes: {colId: {type, libelle, choix}} }.
 * Les références (Ref, RefList) sont déjà remplacées par leur libellé au chargement.
 * Les dates sont des secondes depuis le 1er janvier 1970 (UTC), comme dans Grist.
 */
(function (global) {
  "use strict";

  var VIDE = "(non renseigné)";
  var MOIS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
  var MOIS_LONGS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

  var FONCTIONS = [
    ["nombre", "Nombre de lignes"],
    ["distinct", "Nombre de valeurs différentes"],
    ["somme", "Somme"],
    ["moyenne", "Moyenne"],
    ["mediane", "Médiane"],
    ["min", "Minimum"],
    ["max", "Maximum"],
    ["remplis", "Nombre de cellules remplies"],
    ["taux", "Part des lignes (%) qui vérifient une condition"]
  ];

  var OPERATEURS = [
    ["parmi", "est l'une des valeurs"],
    ["hors", "n'est aucune des valeurs"],
    ["contient", "contient le texte"],
    ["egal", "est égal à"],
    ["different", "est différent de"],
    ["sup", "est supérieur à"],
    ["supEgal", "est supérieur ou égal à"],
    ["inf", "est inférieur à"],
    ["infEgal", "est inférieur ou égal à"],
    ["periode", "est dans la période"],
    ["vide", "est vide"],
    ["rempli", "est rempli"],
    ["vrai", "est coché (Oui)"],
    ["faux", "n'est pas coché (Non)"]
  ];

  var PERIODES = [
    ["annee", "Année en cours"],
    ["annee-precedente", "Année précédente"],
    ["12-mois", "12 derniers mois"],
    ["trimestre", "Trimestre en cours"],
    ["mois", "Mois en cours"],
    ["mois-precedent", "Mois précédent"],
    ["30-jours", "30 derniers jours"],
    ["7-jours", "7 derniers jours"],
    ["avenir", "À venir (après aujourd'hui)"],
    ["passe", "Passé (avant aujourd'hui)"]
  ];

  var PAS_DATE = [
    ["jour", "Jour"], ["semaine", "Semaine"], ["mois", "Mois"], ["trimestre", "Trimestre"], ["annee", "Année"], ["mois-annee", "Mois de l'année (tous les ans cumulés)"], ["jour-semaine", "Jour de la semaine"]
  ];

  /* ---------- Types ---------- */

  function famille(type) {
    type = String(type || "Any");
    if (type === "Date" || type.indexOf("DateTime") === 0) { return "date"; }
    if (type === "Numeric" || type === "Int") { return "nombre"; }
    if (type === "Bool") { return "booleen"; }
    if (type === "ChoiceList" || type.indexOf("RefList") === 0) { return "liste"; }
    if (type === "Attachments") { return "pj"; }
    return "texte";
  }

  function estVide(v) {
    return v === null || v === undefined || v === "" || (Array.isArray(v) && (v.length === 0 || (v[0] === "L" && v.length === 1)));
  }

  // Valeurs d'une cellule pour un regroupement (une liste de choix compte pour chacune de ses valeurs).
  function cles(v, type) {
    var f = famille(type);
    if (estVide(v)) { return f === "booleen" ? ["Non"] : [VIDE]; }
    if (Array.isArray(v)) {
      var l = v[0] === "L" ? v.slice(1) : v;
      l = l.filter(function (x) { return !estVide(x); }).map(String);
      return l.length ? l : [VIDE];
    }
    if (f === "booleen") { return [v ? "Oui" : "Non"]; }
    return [String(v)];
  }

  function nombre(v) {
    if (typeof v === "number" && isFinite(v)) { return v; }
    if (typeof v === "boolean") { return v ? 1 : 0; }
    if (typeof v === "string" && v.trim() !== "") {
      var n = Number(v.replace(/\s/g, "").replace(",", "."));
      return isFinite(n) ? n : null;
    }
    return null;
  }

  /* ---------- Dates ---------- */

  function jourUTC(s) { var d = new Date(s * 1000); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 1000; }

  // Bornes [début, fin[ d'une période relative, en secondes UTC.
  function bornes(periode, maintenant, moisDebut) {
    var n = new Date((maintenant || Date.now()));
    var a = n.getUTCFullYear(), m = n.getUTCMonth(), j = n.getUTCDate();
    var md = Math.max(0, Math.min(11, (moisDebut || 1) - 1));
    function t(an, mo, jo) { return Date.UTC(an, mo, jo || 1) / 1000; }
    var debutAnnee = m >= md ? t(a, md) : t(a - 1, md);
    var aujourdhui = t(a, m, j);
    switch (periode) {
      case "annee": return [debutAnnee, t(new Date(debutAnnee * 1000).getUTCFullYear() + 1, md)];
      case "annee-precedente": var dp = new Date(debutAnnee * 1000).getUTCFullYear() - 1; return [t(dp, md), debutAnnee];
      case "12-mois": return [t(a - 1, m + 1), t(a, m + 1)];
      case "trimestre": var q = Math.floor(m / 3) * 3; return [t(a, q), t(a, q + 3)];
      case "mois": return [t(a, m), t(a, m + 1)];
      case "mois-precedent": return [t(a, m - 1), t(a, m)];
      case "30-jours": return [aujourdhui - 29 * 86400, aujourdhui + 86400];
      case "7-jours": return [aujourdhui - 6 * 86400, aujourdhui + 86400];
      case "avenir": return [aujourdhui + 86400, Infinity];
      case "passe": return [-Infinity, aujourdhui];
      default: return [-Infinity, Infinity];
    }
  }

  // Clé triable et libellé d'une date regroupée.
  function regrouperDate(s, pas, moisDebut) {
    if (typeof s !== "number") { return { cle: "~", libelle: VIDE }; }
    var d = new Date(s * 1000);
    var a = d.getUTCFullYear(), m = d.getUTCMonth(), j = d.getUTCDate();
    function p2(x) { return (x < 10 ? "0" : "") + x; }
    switch (pas) {
      case "jour": return { cle: a + "-" + p2(m + 1) + "-" + p2(j), libelle: j + " " + MOIS[m] + " " + a };
      case "semaine":
        var lundi = new Date(Date.UTC(a, m, j - ((d.getUTCDay() + 6) % 7)));
        return { cle: lundi.toISOString().slice(0, 10), libelle: "sem. du " + lundi.getUTCDate() + " " + MOIS[lundi.getUTCMonth()] + " " + lundi.getUTCFullYear() };
      case "trimestre": var q = Math.floor(m / 3) + 1; return { cle: a + "-T" + q, libelle: "T" + q + " " + a };
      case "annee":
        var md = Math.max(0, Math.min(11, (moisDebut || 1) - 1));
        if (md === 0) { return { cle: String(a), libelle: String(a) }; }
        var a0 = m >= md ? a : a - 1;
        return { cle: String(a0), libelle: a0 + "-" + (a0 + 1) };
      case "mois-annee": return { cle: p2(m + 1), libelle: MOIS_LONGS[m] };
      case "jour-semaine": var js = (d.getUTCDay() + 6) % 7; return { cle: String(js), libelle: ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"][js] };
      default: return { cle: a + "-" + p2(m + 1), libelle: MOIS[m] + " " + a };
    }
  }

  function formatDate(s) {
    if (typeof s !== "number") { return ""; }
    return new Date(s * 1000).toLocaleDateString("fr-FR", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" });
  }

  /* ---------- Filtres ---------- */

  function texteDe(v) {
    if (Array.isArray(v)) { return (v[0] === "L" ? v.slice(1) : v).join(" "); }
    return v === null || v === undefined ? "" : String(v);
  }
  function norm(s) { return String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""); }

  function verifier(ligne, f, colonnes, ctx) {
    if (!f || !f.colonne) { return true; }
    var v = ligne[f.colonne];
    var type = (colonnes[f.colonne] || {}).type;
    var fam = famille(type);
    var op = f.operateur || "parmi";
    var valeurs = Array.isArray(f.valeur) ? f.valeur.map(String) : (f.valeur === undefined || f.valeur === null || f.valeur === "" ? [] : [String(f.valeur)]);
    switch (op) {
      case "vide": return estVide(v) || v === false;
      case "rempli": return !(estVide(v) || v === false);
      case "vrai": return v === true;
      case "faux": return v !== true;
      case "parmi": if (!valeurs.length) { return true; } return cles(v, type).some(function (k) { return valeurs.indexOf(k) >= 0; });
      case "hors": if (!valeurs.length) { return true; } return !cles(v, type).some(function (k) { return valeurs.indexOf(k) >= 0; });
      case "contient": return !valeurs.length || norm(texteDe(v)).indexOf(norm(valeurs[0])) >= 0;
      case "periode":
        if (typeof v !== "number") { return false; }
        if (f.du || f.au) {
          var du = f.du ? Date.parse(f.du) / 1000 : -Infinity, au = f.au ? Date.parse(f.au) / 1000 + 86400 : Infinity;
          return v >= du && v < au;
        }
        var b = bornes(valeurs[0], ctx.maintenant, ctx.moisDebut);
        return v >= b[0] && v < b[1];
    }
    // Comparaisons : nombres, dates (valeur saisie AAAA-MM-JJ) ou texte.
    var a, c;
    if (fam === "date") { a = typeof v === "number" ? jourUTC(v) : null; c = Date.parse(valeurs[0]) / 1000; }
    else if (fam === "nombre" || fam === "booleen") { a = nombre(v); c = nombre(valeurs[0]); }
    else { a = norm(texteDe(v)); c = norm(valeurs[0] || ""); }
    if (op === "egal") { return fam === "liste" ? cles(v, type).indexOf(valeurs[0]) >= 0 : a === c; }
    if (op === "different") { return fam === "liste" ? cles(v, type).indexOf(valeurs[0]) < 0 : a !== c; }
    if (a === null || c === null || (typeof c === "number" && isNaN(c))) { return false; }
    if (op === "sup") { return a > c; }
    if (op === "supEgal") { return a >= c; }
    if (op === "inf") { return a < c; }
    if (op === "infEgal") { return a <= c; }
    return true;
  }

  function filtrer(lignes, filtres, colonnes, ctx) {
    var fs = (filtres || []).filter(function (f) { return f && f.colonne && colonnes[f.colonne]; });
    if (!fs.length) { return lignes; }
    ctx = ctx || {};
    return lignes.filter(function (r) {
      return fs.every(function (f) { return verifier(r, f, colonnes, ctx); });
    });
  }

  /* ---------- Agrégations ---------- */

  function agreger(lignes, mesure, colonnes, ctx) {
    mesure = mesure || { fonction: "nombre" };
    var fn = mesure.fonction || "nombre";
    if (fn === "nombre") { return lignes.length; }
    if (fn === "taux") {
      if (!lignes.length) { return null; }
      var ok = filtrer(lignes, [mesure.condition], colonnes, ctx || {}).length;
      return 100 * ok / lignes.length;
    }
    var col = mesure.colonne;
    if (!col) { return null; }
    if (fn === "remplis") { return lignes.filter(function (r) { return !estVide(r[col]) && r[col] !== false; }).length; }
    if (fn === "distinct") {
      var vus = {};
      lignes.forEach(function (r) { if (!estVide(r[col])) { cles(r[col], (colonnes[col] || {}).type).forEach(function (k) { vus[k] = 1; }); } });
      return Object.keys(vus).length;
    }
    var xs = [];
    lignes.forEach(function (r) { var n = nombre(r[col]); if (n !== null) { xs.push(n); } });
    if (!xs.length) { return fn === "somme" ? 0 : null; }
    switch (fn) {
      case "somme": return xs.reduce(function (s, x) { return s + x; }, 0);
      case "moyenne": return xs.reduce(function (s, x) { return s + x; }, 0) / xs.length;
      case "min": return Math.min.apply(null, xs);
      case "max": return Math.max.apply(null, xs);
      case "mediane":
        xs.sort(function (a, b) { return a - b; });
        var mi = Math.floor(xs.length / 2);
        return xs.length % 2 ? xs[mi] : (xs[mi - 1] + xs[mi]) / 2;
    }
    return null;
  }

  /* ---------- Regroupements ---------- */

  // Clés de regroupement d'une ligne selon un axe ({colonne, pas, moisDebut}).
  function clesAxe(r, axe, colonnes) {
    var type = (colonnes[axe.colonne] || {}).type;
    if (famille(type) === "date") { return [regrouperDate(r[axe.colonne], axe.pas || "mois", axe.moisDebut)]; }
    if (famille(type) === "nombre" && axe.tranche > 0) {
      var n = nombre(r[axe.colonne]);
      if (n === null) { return [{ cle: "~", libelle: VIDE }]; }
      var bas = Math.floor(n / axe.tranche) * axe.tranche;
      return [{ cle: bas, libelle: format(bas) + " – " + format(bas + axe.tranche) }];
    }
    return cles(r[axe.colonne], type).map(function (k) { return { cle: k, libelle: k }; });
  }

  function ordreChoix(colonnes, col) {
    var c = colonnes[col] || {};
    return c.choix || [];
  }

  // Regroupe les lignes selon un axe (et éventuellement une colonne de séries), pour une ou plusieurs mesures.
  // Renvoie { categories: [{cle, libelle}], series: [{nom, mesure, valeurs: [n…]}], lignesParCategorie }.
  function grouper(lignes, opts, colonnes, ctx) {
    var axe = opts.axe || {};
    var mesures = (opts.mesures && opts.mesures.length) ? opts.mesures : [{ fonction: "nombre" }];
    var serieCol = opts.series && opts.series.colonne && colonnes[opts.series.colonne] ? opts.series.colonne : null;
    var groupes = {}, ordre = [], seriesVues = {}, seriesOrdre = [];
    lignes.forEach(function (r) {
      var ks = axe.colonne && colonnes[axe.colonne] ? clesAxe(r, axe, colonnes) : [{ cle: "Total", libelle: opts.libelleTotal || "Total" }];
      var ss = serieCol ? clesAxe(r, { colonne: serieCol, pas: (opts.series || {}).pas }, colonnes) : [{ cle: "", libelle: "" }];
      ks.forEach(function (k) {
        if (!groupes[k.cle]) { groupes[k.cle] = { cle: k.cle, libelle: k.libelle, parSerie: {} }; ordre.push(k.cle); }
        ss.forEach(function (s) {
          if (!seriesVues[s.cle]) { seriesVues[s.cle] = s.libelle; seriesOrdre.push(s.cle); }
          (groupes[k.cle].parSerie[s.cle] = groupes[k.cle].parSerie[s.cle] || []).push(r);
        });
      });
    });

    // Axe de dates : ajoute les périodes sans donnée entre la première et la dernière.
    var famA = famille((colonnes[axe.colonne] || {}).type);
    var pasA = axe.pas || "mois";
    if (famA === "date" && axe.combler !== false && ["jour", "semaine", "mois", "trimestre", "annee"].indexOf(pasA) >= 0) {
      var ts = lignes.map(function (r) { return r[axe.colonne]; }).filter(function (x) { return typeof x === "number"; });
      if (ts.length) {
        var t = Math.min.apply(null, ts), fin = Math.max.apply(null, ts), n = 0;
        while (t <= fin && n++ < 6000) {
          var k = regrouperDate(t, pasA, axe.moisDebut);
          if (!groupes[k.cle]) { groupes[k.cle] = { cle: k.cle, libelle: k.libelle, parSerie: {} }; ordre.push(k.cle); }
          if (pasA === "jour" || pasA === "semaine") { t += 86400; }
          else { var dd = new Date(t * 1000); t = Date.UTC(dd.getUTCFullYear(), dd.getUTCMonth() + 1, 1) / 1000; }
        }
      }
    }

    var cats = ordre.map(function (k) { return groupes[k]; });
    // Valeur de tri d'une catégorie : première mesure, toutes séries confondues.
    function total(g) {
      var toutes = [];
      Object.keys(g.parSerie).forEach(function (s) { toutes = toutes.concat(g.parSerie[s]); });
      var vus = {}; toutes = toutes.filter(function (r) { if (vus[r.id]) { return false; } vus[r.id] = 1; return true; });
      return agreger(toutes, mesures[0], colonnes, ctx) || 0;
    }
    var famAxe = famille((colonnes[axe.colonne] || {}).type);
    var tri = axe.tri || (famAxe === "date" || (famAxe === "nombre" && axe.tranche > 0) ? "cle" : "valeur-desc");
    var choix = ordreChoix(colonnes, axe.colonne);
    cats.forEach(function (g) { g.total = total(g); });
    cats.sort(function (a, b) {
      if (a.libelle === VIDE && b.libelle !== VIDE) { return 1; }
      if (b.libelle === VIDE && a.libelle !== VIDE) { return -1; }
      if (tri === "valeur-desc") { return b.total - a.total || String(a.libelle).localeCompare(b.libelle, "fr"); }
      if (tri === "valeur-asc") { return a.total - b.total || String(a.libelle).localeCompare(b.libelle, "fr"); }
      if (tri === "choix" && choix.length) {
        var ia = choix.indexOf(a.cle), ib = choix.indexOf(b.cle);
        return (ia < 0 ? 1e6 : ia) - (ib < 0 ? 1e6 : ib);
      }
      if (tri === "libelle") { return String(a.libelle).localeCompare(b.libelle, "fr", { numeric: true }); }
      return a.cle < b.cle ? -1 : a.cle > b.cle ? 1 : 0;
    });

    // Limite : les N premières catégories, le reste regroupé dans « Autres ».
    if (axe.limite > 0 && cats.length > axe.limite) {
      var garde = cats.slice(0, axe.limite);
      if (axe.autres !== false) {
        var autres = { cle: "__autres", libelle: "Autres", parSerie: {} };
        cats.slice(axe.limite).forEach(function (g) {
          Object.keys(g.parSerie).forEach(function (s) { autres.parSerie[s] = (autres.parSerie[s] || []).concat(g.parSerie[s]); });
        });
        autres.total = total(autres);
        garde.push(autres);
      }
      cats = garde;
    }

    var serieCles = seriesOrdre;
    if (serieCol) {
      var choixS = ordreChoix(colonnes, serieCol);
      serieCles = seriesOrdre.slice().sort(function (a, b) {
        if (seriesVues[a] === VIDE) { return 1; }
        if (seriesVues[b] === VIDE) { return -1; }
        if (choixS.length) {
          var ia = choixS.indexOf(a), ib = choixS.indexOf(b);
          if (ia >= 0 || ib >= 0) { return (ia < 0 ? 1e6 : ia) - (ib < 0 ? 1e6 : ib); }
        }
        return String(a).localeCompare(String(b), "fr", { numeric: true });
      });
      if (opts.series.limite > 0 && serieCles.length > opts.series.limite) {
        // Garde les séries les plus importantes, regroupe les autres.
        var poids = {};
        serieCles.forEach(function (s) {
          var t = []; cats.forEach(function (g) { t = t.concat(g.parSerie[s] || []); });
          poids[s] = agreger(t, mesures[0], colonnes, ctx) || 0;
        });
        var tries = serieCles.slice().sort(function (a, b) { return poids[b] - poids[a]; });
        var gardees = tries.slice(0, opts.series.limite), reste = tries.slice(opts.series.limite);
        cats.forEach(function (g) {
          var r = []; reste.forEach(function (s) { r = r.concat(g.parSerie[s] || []); delete g.parSerie[s]; });
          if (r.length) { g.parSerie.__autres = r; }
        });
        serieCles = serieCles.filter(function (s) { return gardees.indexOf(s) >= 0; }).concat(["__autres"]);
        seriesVues.__autres = "Autres";
      }
    }

    var series = [];
    if (serieCol) {
      var m0 = mesures[0];
      serieCles.forEach(function (s) {
        series.push({ nom: seriesVues[s], cle: s, mesure: m0, valeurs: cats.map(function (g) { var l = g.parSerie[s] || []; return l.length ? agreger(l, m0, colonnes, ctx) : (m0.fonction === "nombre" || m0.fonction === "somme" ? 0 : null); }) });
      });
    } else {
      mesures.forEach(function (m, i) {
        series.push({
          nom: m.libelle || libelleMesure(m, colonnes), cle: "m" + i, mesure: m,
          valeurs: cats.map(function (g) { return agreger(g.parSerie[""] || [], m, colonnes, ctx); })
        });
      });
    }

    if (opts.cumul) {
      series.forEach(function (s) { var t = 0; s.valeurs = s.valeurs.map(function (v) { t += v || 0; return t; }); });
    }
    if (opts.pourcentage === "categorie" && series.length > 1) {
      cats.forEach(function (_, i) {
        var t = series.reduce(function (a, s) { return a + (s.valeurs[i] || 0); }, 0);
        series.forEach(function (s) { s.valeurs[i] = t ? 100 * (s.valeurs[i] || 0) / t : 0; });
      });
    } else if (opts.pourcentage) {
      series.forEach(function (s) {
        var t = s.valeurs.reduce(function (a, v) { return a + (v || 0); }, 0);
        s.valeurs = s.valeurs.map(function (v) { return t ? 100 * (v || 0) / t : 0; });
      });
    }

    return {
      categories: cats.map(function (g) { return { cle: g.cle, libelle: g.libelle }; }),
      series: series,
      lignes: cats.map(function (g) { var t = []; Object.keys(g.parSerie).forEach(function (s) { t = t.concat(g.parSerie[s]); }); return t; })
    };
  }

  function libelleMesure(m, colonnes) {
    m = m || {};
    var col = m.colonne && colonnes && colonnes[m.colonne] ? (colonnes[m.colonne].libelle || m.colonne) : (m.colonne || "");
    switch (m.fonction || "nombre") {
      case "nombre": return "Nombre";
      case "distinct": return "Valeurs différentes de " + col;
      case "somme": return col ? "Total " + col : "Total";
      case "moyenne": return "Moyenne " + col;
      case "mediane": return "Médiane " + col;
      case "min": return "Minimum " + col;
      case "max": return "Maximum " + col;
      case "remplis": return col + " renseigné";
      case "taux": return "Part (%)";
    }
    return col;
  }

  /* ---------- Tableau croisé ---------- */

  function croiser(lignes, opts, colonnes, ctx) {
    var mesure = opts.mesure || { fonction: "nombre" };
    var gL = grouper(lignes, { axe: opts.lignes, mesures: [mesure] }, colonnes, ctx);
    var res = { lignes: gL.categories, colonnes: [{ cle: "", libelle: libelleMesure(mesure, colonnes) }], valeurs: [] };
    if (opts.colonnes && opts.colonnes.colonne) {
      var g = grouper(lignes, { axe: opts.lignes, series: { colonne: opts.colonnes.colonne, pas: opts.colonnes.pas }, mesures: [mesure] }, colonnes, ctx);
      res.colonnes = g.series.map(function (s) { return { cle: s.cle, libelle: s.nom }; });
      res.valeurs = gL.categories.map(function (c) {
        var i = g.categories.map(function (x) { return x.cle; }).indexOf(c.cle);
        return g.series.map(function (s) { return i >= 0 ? s.valeurs[i] : null; });
      });
    } else {
      res.valeurs = gL.series[0].valeurs.map(function (v) { return [v]; });
    }
    res.totalLignes = gL.lignes.map(function (l) { return agreger(l, mesure, colonnes, ctx); });
    res.totalColonnes = res.colonnes.map(function (_, j) {
      if (!opts.colonnes || !opts.colonnes.colonne) { return agreger(lignes, mesure, colonnes, ctx); }
      var sous = lignes.filter(function (r) { return clesAxe(r, opts.colonnes, colonnes).some(function (k) { return String(k.cle) === String(res.colonnes[j].cle); }); });
      return agreger(sous, mesure, colonnes, ctx);
    });
    res.total = agreger(lignes, mesure, colonnes, ctx);
    return res;
  }

  /* ---------- Format ---------- */

  function format(v, f) {
    f = f || {};
    if (v === null || v === undefined || (typeof v === "number" && isNaN(v))) { return "–"; }
    if (typeof v !== "number") { return String(v); }
    var dec = f.decimales !== undefined && f.decimales !== null && f.decimales !== "" ? Number(f.decimales) : (Math.abs(v) >= 100 || Number.isInteger(v) ? 0 : 1);
    var n = v, suffixe = "";
    if (f.compact && Math.abs(v) >= 1e6) { n = v / 1e6; suffixe = " M"; dec = 1; }
    else if (f.compact && Math.abs(v) >= 1e4) { n = v / 1e3; suffixe = " k"; dec = 1; }
    var s = n.toLocaleString("fr-FR", { minimumFractionDigits: dec, maximumFractionDigits: dec });
    return (f.prefixe || "") + s + suffixe + (f.unite ? (/^[%€$]/.test(f.unite) ? " " : " ") + f.unite : "");
  }

  global.Calcul = {
    VIDE: VIDE, FONCTIONS: FONCTIONS, OPERATEURS: OPERATEURS, PERIODES: PERIODES, PAS_DATE: PAS_DATE,
    famille: famille, estVide: estVide, cles: cles, nombre: nombre, bornes: bornes, regrouperDate: regrouperDate,
    formatDate: formatDate, verifier: verifier, filtrer: filtrer, agreger: agreger, grouper: grouper,
    croiser: croiser, libelleMesure: libelleMesure, format: format, clesAxe: clesAxe
  };
})(typeof window !== "undefined" ? window : globalThis);
