/*
 * Éditeur de tableaux de bord : widget personnalisé Grist (accès complet au document).
 * Les réglages sont enregistrés en JSON dans la description de la colonne technique
 * « Config_graphique » de la table où le widget est placé. La page de lecture (index.html) les lit.
 */
(function () {
  "use strict";

  var C = window.Calcul, T = window.Tableau, D = window.Donnees;
  var E = { source: null, schema: { tables: {} }, hote: null, colConfig: false, config: null, it: 0, ouvert: null, vue: "blocs", modifie: false, donnees: {}, base: null, apercu: null };

  var LARGEURS = [[3, "Un quart"], [4, "Un tiers"], [6, "La moitié"], [8, "Deux tiers"], [9, "Trois quarts"], [12, "Toute la largeur"]];
  var MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
  var TYPES = { indicateur: "Indicateur chiffré", graphique: "Graphique", tableau: "Tableau", texte: "Texte" };
  var OPS_PAR_FAMILLE = {
    texte: ["parmi", "hors", "contient", "egal", "different", "vide", "rempli"],
    liste: ["parmi", "hors", "contient", "vide", "rempli"],
    nombre: ["egal", "different", "sup", "supEgal", "inf", "infEgal", "vide", "rempli"],
    date: ["periode", "sup", "supEgal", "inf", "infEgal", "vide", "rempli"],
    booleen: ["vrai", "faux"]
  };
  var LIB_OPS_DATE = { sup: "est après le", supEgal: "est le ou après le", inf: "est avant le", infEgal: "est le ou avant le" };

  /* ---------- Utilitaires ---------- */

  function $(s) { return document.querySelector(s); }
  function esc(s) {
    return String(s === null || s === undefined ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c];
    });
  }
  function P(ch) { return esc(JSON.stringify(ch)); }
  function lire(ch) { return ch.reduce(function (o, k) { return o === undefined || o === null ? undefined : o[k]; }, E.config); }
  function ecrire(ch, v) {
    var o = E.config;
    for (var i = 0; i < ch.length - 1; i++) {
      if (o[ch[i]] === undefined || o[ch[i]] === null || typeof o[ch[i]] !== "object") { o[ch[i]] = typeof ch[i + 1] === "number" ? [] : {}; }
      o = o[ch[i]];
    }
    if (v === undefined) { delete o[ch[ch.length - 1]]; } else { o[ch[ch.length - 1]] = v; }
  }
  var nId = 0;
  function id() { return "c" + (++nId); }
  function nouvelId(p) { return (p || "b") + Math.random().toString(36).slice(2, 8); }
  function tb() { return E.config.tableaux[E.it]; }
  function chTb() { return ["tableaux", E.it]; }

  function message(type, texte) {
    var z = $("#message");
    if (!texte) { z.innerHTML = ""; return; }
    z.innerHTML = "<div class=\"fr-alert fr-alert--" + type + " fr-alert--sm\"><p>" + esc(texte) + "</p></div>";
    if (type === "success") { setTimeout(function () { if (z.textContent.indexOf(texte) >= 0) { z.innerHTML = ""; } }, 4000); }
  }
  function modifie(v) {
    E.modifie = v !== false;
    var e = $("#etat");
    e.className = "fr-badge fr-badge--sm " + (E.modifie ? "fr-badge--warning" : "fr-badge--success");
    e.textContent = E.modifie ? "Non enregistré" : "Enregistré";
  }

  function colonnesDe(table) { return ((E.schema.tables[table] || {}).colonnes) || {}; }
  function libCol(table, c) { var x = colonnesDe(table)[c]; return x ? (x.libelle || c) : c; }
  function familleCol(table, c) { var x = colonnesDe(table)[c]; return x ? C.famille(x.type) : "texte"; }
  function nomsTables() { return Object.keys(E.schema.tables).sort(function (a, b) { return a.localeCompare(b, "fr"); }); }

  function valeursDe(table, colonne) {
    var t = E.donnees[table];
    if (!t || !t.colonnes[colonne]) { return []; }
    var vus = {}, out = [], choix = t.colonnes[colonne].choix || [];
    t.lignes.forEach(function (r) { C.cles(r[colonne], t.colonnes[colonne].type).forEach(function (k) { if (!vus[k]) { vus[k] = 1; out.push(k); } }); });
    out.sort(function (a, b) {
      var ia = choix.indexOf(a), ib = choix.indexOf(b);
      if (ia >= 0 || ib >= 0) { return (ia < 0 ? 1e6 : ia) - (ib < 0 ? 1e6 : ib); }
      return a.localeCompare(b, "fr", { numeric: true });
    });
    return out.slice(0, 150);
  }

  async function charger(noms) {
    var manquantes = noms.filter(function (n) { return n && !E.donnees[n] && E.schema.tables[n]; });
    if (!manquantes.length) { return; }
    var d = await E.source.charger(manquantes);
    Object.keys(d).forEach(function (n) { E.donnees[n] = d[n]; });
  }

  /* ---------- Champs ---------- */

  function aide(t) { return t ? "<span class=\"fr-hint-text\">" + esc(t) + "</span>" : ""; }
  function texte(ch, lib, o) {
    o = o || {}; var i = id(); var v = lire(ch);
    var ctrl = o.multiligne ?
      "<textarea class=\"fr-input\" id=\"" + i + "\" rows=\"" + (o.lignes || 3) + "\" data-c=\"" + P(ch) + "\">" + esc(v) + "</textarea>" :
      "<input class=\"fr-input\" id=\"" + i + "\" type=\"" + (o.type || (o.nombre ? "number" : "text")) + "\"" + (o.pas ? " step=\"" + o.pas + "\"" : "") + " data-c=\"" + P(ch) + "\"" + (o.nombre ? " data-t=\"nombre\"" : "") + (o.r ? " data-r=\"1\"" : "") + " value=\"" + esc(v) + "\"" + (o.placeholder ? " placeholder=\"" + esc(o.placeholder) + "\"" : "") + ">";
    return "<div class=\"fr-input-group\"><label class=\"fr-label\" for=\"" + i + "\">" + esc(lib) + aide(o.aide) + "</label>" + ctrl + "</div>";
  }
  function caseC(ch, lib, a, r) {
    var i = id(), v = lire(ch);
    return "<div class=\"fr-checkbox-group fr-checkbox-group--sm fr-mb-1w\"><input type=\"checkbox\" id=\"" + i + "\" data-c=\"" + P(ch) + "\" data-t=\"case\"" + (r ? " data-r=\"1\"" : "") + (v ? " checked" : "") + ">" +
      "<label class=\"fr-label\" for=\"" + i + "\">" + esc(lib) + aide(a) + "</label></div>";
  }
  // Case cochée par défaut (valeur false quand décochée).
  function caseInverse(ch, lib, a) {
    var i = id(), v = lire(ch);
    return "<div class=\"fr-checkbox-group fr-checkbox-group--sm fr-mb-1w\"><input type=\"checkbox\" id=\"" + i + "\" data-c=\"" + P(ch) + "\" data-t=\"case-inverse\"" + (v !== false ? " checked" : "") + ">" +
      "<label class=\"fr-label\" for=\"" + i + "\">" + esc(lib) + aide(a) + "</label></div>";
  }
  function choix(ch, lib, options, o) {
    o = o || {}; var i = id(); var v = lire(ch);
    if (v === undefined || v === null) { v = o.defaut !== undefined ? o.defaut : ""; }
    return "<div class=\"fr-select-group\"><label class=\"fr-label\" for=\"" + i + "\">" + esc(lib) + aide(o.aide) + "</label>" +
      "<select class=\"fr-select\" id=\"" + i + "\" data-c=\"" + P(ch) + "\"" + (o.nombre ? " data-t=\"nombre\"" : "") + (o.r === false ? "" : " data-r=\"1\"") + ">" +
      options.map(function (x) { return "<option value=\"" + esc(x[0]) + "\"" + (String(x[0]) === String(v) ? " selected" : "") + ">" + esc(x[1]) + "</option>"; }).join("") + "</select></div>";
  }
  function colonne(ch, lib, table, o) {
    o = o || {};
    var cols = colonnesDe(table);
    var opts = [["", o.vide || "— Aucune —"]].concat(Object.keys(cols).filter(function (c) {
      return !o.familles || o.familles.indexOf(C.famille(cols[c].type)) >= 0;
    }).map(function (c) { return [c, cols[c].libelle + (cols[c].libelle !== c ? " (" + c + ")" : "")]; }));
    return choix(ch, lib, opts, o);
  }
  function couleur(ch, lib) {
    var i = id(), v = lire(ch);
    return "<div class=\"fr-input-group\"><label class=\"fr-label\" for=\"" + i + "\">" + esc(lib) + "</label>" +
      "<div class=\"pe-couleur\"><input type=\"color\" id=\"" + i + "\" data-c=\"" + P(ch) + "\" data-r=\"1\" value=\"" + esc(v || "#000091") + "\">" +
      (v && T.contrasteBlanc && T.contrasteBlanc(v) < 3 ? "<span class=\"fr-badge fr-badge--sm fr-badge--warning\">Trop clair : remplacé par la palette DSFR</span>" : "") +
      (v ? "<span class=\"fr-text--sm\">" + esc(v) + "</span><button type=\"button\" class=\"fr-btn fr-btn--sm fr-btn--tertiary-no-outline\" data-effacer=\"" + P(ch) + "\">Par défaut</button>" : "<span class=\"fr-text--sm\">Par défaut</span>") +
      "</div></div>";
  }
  function cocheValeurs(ch, lib, valeurs, a) {
    var sel = lire(ch) || [];
    if (!Array.isArray(sel)) { sel = [String(sel)]; }
    if (!valeurs.length) { return "<p class=\"fr-text--sm\">" + esc(lib) + " : aucune valeur dans la table.</p>"; }
    return "<fieldset class=\"fr-fieldset ed-cases\"><legend class=\"fr-fieldset__legend fr-fieldset__legend--regular fr-text--sm\">" + esc(lib) + aide(a) + "</legend><div class=\"ed-cases__liste\">" +
      valeurs.map(function (v) {
        var i = id();
        return "<div class=\"fr-checkbox-group fr-checkbox-group--sm\"><input type=\"checkbox\" id=\"" + i + "\" data-cv=\"" + P(ch) + "\" data-v=\"" + esc(v) + "\"" + (sel.indexOf(v) >= 0 ? " checked" : "") + ">" +
          "<label class=\"fr-label\" for=\"" + i + "\">" + esc(v) + "</label></div>";
      }).join("") + "</div></fieldset>";
  }
  function liste(ch, titre, rendreItem, modele, ajout) {
    var items = lire(ch) || [];
    var h = "<div class=\"ed-sous-liste\">" + (titre ? "<p class=\"fr-text--sm fr-text--bold fr-mb-1w\">" + esc(titre) + "</p>" : "");
    items.forEach(function (_, i) {
      h += "<div class=\"pe-ligne\">" + rendreItem(ch.concat([i]), i) +
        "<ul class=\"fr-btns-group fr-btns-group--inline fr-btns-group--sm\">" +
        (i > 0 ? "<li><button type=\"button\" class=\"fr-btn fr-btn--tertiary\" data-l=\"" + P(ch) + "\" data-i=\"" + i + "\" data-a=\"monter\">Monter</button></li>" : "") +
        "<li><button type=\"button\" class=\"fr-btn fr-btn--tertiary\" data-l=\"" + P(ch) + "\" data-i=\"" + i + "\" data-a=\"supprimer\">Retirer</button></li></ul></div>";
    });
    h += "<button type=\"button\" class=\"fr-btn fr-btn--sm fr-btn--secondary\" data-l=\"" + P(ch) + "\" data-a=\"ajouter\" data-modele=\"" + esc(JSON.stringify(modele)) + "\">" + esc(ajout) + "</button></div>";
    return h;
  }

  // Filtre sur une colonne : colonne, opérateur, valeur(s).
  function filtre(ch, table) {
    var f = lire(ch) || {};
    var h = colonne(ch.concat(["colonne"]), "Colonne", table, { vide: "— Choisir —" });
    if (!f.colonne) { return h; }
    var fam = familleCol(table, f.colonne);
    var ops = OPS_PAR_FAMILLE[fam] || OPS_PAR_FAMILLE.texte;
    if (ops.indexOf(f.operateur) < 0) { f.operateur = ops[0]; ecrire(ch.concat(["operateur"]), ops[0]); }
    h += choix(ch.concat(["operateur"]), "Condition", ops.map(function (o) {
      return [o, (fam === "date" && LIB_OPS_DATE[o]) || (C.OPERATEURS.find(function (x) { return x[0] === o; }) || [o, o])[1]];
    }));
    var op = f.operateur;
    if (op === "parmi" || op === "hors") { h += cocheValeurs(ch.concat(["valeur"]), "Valeurs", valeursDe(table, f.colonne)); }
    else if (op === "periode") { h += choix(ch.concat(["valeur"]), "Période", C.PERIODES); }
    else if (["vide", "rempli", "vrai", "faux"].indexOf(op) < 0) { h += texte(ch.concat(["valeur"]), "Valeur", { type: fam === "date" ? "date" : fam === "nombre" ? "number" : "text" }); }
    return h;
  }

  // Mesure : fonction et colonne (et condition pour une part).
  function mesure(ch, table, o) {
    o = o || {};
    var m = lire(ch) || {};
    var h = choix(ch.concat(["fonction"]), o.libelle || "Calcul", C.FONCTIONS, { defaut: "nombre" });
    var fn = m.fonction || "nombre";
    if (["somme", "moyenne", "mediane", "min", "max"].indexOf(fn) >= 0) { h += colonne(ch.concat(["colonne"]), "Colonne (nombres)", table, { familles: ["nombre", "booleen"], vide: "— Choisir —" }); }
    else if (fn === "distinct" || fn === "remplis") { h += colonne(ch.concat(["colonne"]), "Colonne", table, { vide: "— Choisir —" }); }
    else if (fn === "taux") { h += "<div class=\"ed-encart\"><p class=\"fr-text--sm fr-mb-1w\">Part des lignes dont…</p>" + filtre(ch.concat(["condition"]), table) + "</div>"; }
    if (o.complet) {
      h += texte(ch.concat(["libelle"]), "Libellé dans la légende", { placeholder: C.libelleMesure(m, colonnesDe(table)) });
      if (o.combine) {
        h += choix(ch.concat(["forme"]), "Dessiner en", [["barres", "Barres"], ["lignes", "Courbe"]]);
        h += caseC(ch.concat(["axeDroit"]), "Sur un second axe, à droite", "Utile quand les unités diffèrent (par exemple nombre et moyenne).");
      }
    }
    return h;
  }

  /* ---------- Formulaires des blocs ---------- */

  function champsCommuns(ch, b) {
    var h = texte(ch.concat(["titre"]), "Titre du bloc");
    h += texte(ch.concat(["sousTitre"]), "Sous-titre", { aide: "Facultatif : précise ce qui est compté ou la période." });
    h += choix(ch.concat(["largeur"]), "Largeur", LARGEURS, { nombre: true, defaut: b.type === "indicateur" ? 3 : 6 });
    if (b.type !== "texte") {
      h += choix(ch.concat(["table"]), "Table de données", [["", "— Choisir une table —"]].concat(nomsTables().map(function (n) { return [n, n + (E.schema.tables[n].resume ? " (table de synthèse)" : "")]; })));
    }
    return h;
  }

  function formIndicateur(ch, b) {
    var h = "<h4 class=\"fr-h6 ed-titre\">Valeur affichée</h4>" + mesure(ch.concat(["mesures", 0]), b.table);
    h += texte(ch.concat(["libelleValeur"]), "Texte sous la valeur", { aide: "Par exemple « demandes cette année »." });
    h += formatChamps(ch);
    h += "<h4 class=\"fr-h6 ed-titre\">Comparaison et objectif</h4>";
    h += colonne(ch.concat(["comparaison", "colonne"]), "Comparer avec la période précédente selon la date", b.table, { familles: ["date"], vide: "— Pas de comparaison —" });
    if (b.comparaison && b.comparaison.colonne) {
      h += choix(ch.concat(["comparaison", "periode"]), "Période comparée", [["annee", "Année en cours / année précédente"], ["mois", "Mois en cours / mois précédent"]], { defaut: "annee" });
      if (!b.comparaison.periode) { ecrire(ch.concat(["comparaison", "periode"]), "annee"); }
      h += choix(ch.concat(["sensFavorable"]), "Une hausse est", [["hausse", "favorable (vert)"], ["baisse", "défavorable (rouge)"]], { defaut: "hausse" });
    }
    h += texte(ch.concat(["objectif"]), "Objectif (facultatif)", { nombre: true, aide: "Affiche une barre de progression vers cette valeur." });
    h += "<h4 class=\"fr-h6 ed-titre\">Seuils d'alerte (management visuel)</h4>";
    h += choix(ch.concat(["seuils", "sens"]), "Une valeur élevée est", [["hausse", "bonne (ex. taux de satisfaction)"], ["baisse", "mauvaise (ex. délai, nombre de retards)"]], { defaut: "hausse" });
    h += "<div class=\"ed-deux\">" + texte(ch.concat(["seuils", "alerte"]), "Seuil « À surveiller »", { nombre: true, aide: "Orange au-delà de ce seuil, dans le mauvais sens." }) +
      texte(ch.concat(["seuils", "critique"]), "Seuil « Critique »", { nombre: true, aide: "Rouge au-delà de ce seuil." }) + "</div>";
    h += colonne(ch.concat(["tendance", "colonne"]), "Petite courbe d'évolution selon la date", b.table, { familles: ["date"], vide: "— Pas de courbe —" });
    if (b.tendance && b.tendance.colonne) { h += choix(ch.concat(["tendance", "pas"]), "Pas de la courbe", C.PAS_DATE.slice(0, 5), { defaut: "mois" }); }
    h += couleur(ch.concat(["accent"]), "Couleur du filet supérieur");
    return h;
  }

  function formatChamps(ch) {
    return "<div class=\"ed-deux\">" + texte(ch.concat(["format", "unite"]), "Unité", { placeholder: "€, %, jours…" }) +
      texte(ch.concat(["format", "decimales"]), "Décimales", { nombre: true, placeholder: "auto" }) + "</div>";
  }

  function axeChamps(ch, b, lib) {
    var h = colonne(ch.concat(["axe", "colonne"]), lib || "Regrouper selon", b.table, { vide: "— Aucun regroupement (total) —", familles: ["texte", "liste", "date", "nombre", "booleen"] });
    var a = b.axe || {};
    if (!a.colonne) { return h; }
    var fam = familleCol(b.table, a.colonne);
    if (fam === "date") { h += choix(ch.concat(["axe", "pas"]), "Regrouper par", C.PAS_DATE, { defaut: "mois" }); }
    if (fam === "nombre") { h += texte(ch.concat(["axe", "tranche"]), "Par tranches de", { nombre: true, aide: "Laisser vide pour une catégorie par valeur." }); }
    var tris = [["", "Automatique"], ["valeur-desc", "Plus grandes valeurs d'abord"], ["valeur-asc", "Plus petites valeurs d'abord"], ["libelle", "Ordre alphabétique"], ["cle", "Ordre chronologique ou numérique"]];
    if ((colonnesDe(b.table)[a.colonne] || {}).choix) { tris.push(["choix", "Ordre des choix dans Grist"]); }
    h += "<div class=\"ed-deux\">" + choix(ch.concat(["axe", "tri"]), "Ordre", tris) + texte(ch.concat(["axe", "limite"]), "Garder les N premiers", { nombre: true, aide: "Le reste devient « Autres »." }) + "</div>";
    return h;
  }

  function formGraphique(ch, b) {
    var forme = b.forme || "barres";
    var h = "<h4 class=\"fr-h6 ed-titre\">Type de graphique</h4><div class=\"ed-formes\" role=\"radiogroup\" aria-label=\"Type de graphique\">" +
      T.FORMES.map(function (f) {
        var i = id();
        return "<div class=\"ed-forme\"><input type=\"radio\" name=\"forme-" + esc(b.id) + "\" id=\"" + i + "\" data-c=\"" + P(ch.concat(["forme"])) + "\" data-r=\"1\" value=\"" + f[0] + "\"" + (forme === f[0] ? " checked" : "") + "><label for=\"" + i + "\"><span class=\"ed-forme__icone ed-forme--" + f[0] + "\" aria-hidden=\"true\"></span>" + esc(f[1]) + "</label></div>";
      }).join("") + "</div>";
    var parts = ["secteurs", "anneau", "entonnoir", "treemap"].indexOf(forme) >= 0;
    if (forme === "nuage") {
      h += "<h4 class=\"fr-h6 ed-titre\">Points</h4>";
      h += colonne(ch.concat(["nuage", "x"]), "Axe horizontal (nombre)", b.table, { familles: ["nombre"], vide: "— Choisir —" });
      h += colonne(ch.concat(["nuage", "y"]), "Axe vertical (nombre)", b.table, { familles: ["nombre"], vide: "— Choisir —" });
      h += colonne(ch.concat(["nuage", "taille"]), "Taille des points (facultatif)", b.table, { familles: ["nombre"] });
      h += colonne(ch.concat(["nuage", "couleur"]), "Couleur selon (facultatif)", b.table, { familles: ["texte", "booleen"] });
      h += colonne(ch.concat(["nuage", "libelle"]), "Nom affiché au survol", b.table);
    } else if (forme === "jauge") {
      h += "<h4 class=\"fr-h6 ed-titre\">Valeur</h4>" + mesure(ch.concat(["mesures", 0]), b.table);
      h += texte(ch.concat(["max"]), "Valeur maximale de la jauge", { nombre: true, placeholder: "100" });
    } else {
      h += "<h4 class=\"fr-h6 ed-titre\">Ce qui est comparé</h4>" + axeChamps(ch, b, parts ? "Une part par valeur de" : forme === "radar" ? "Une branche par valeur de" : forme === "carte-chaleur" ? "Colonnes selon" : "Axe des catégories");
      if (!parts) {
        h += colonne(ch.concat(["series", "colonne"]), forme === "carte-chaleur" ? "Lignes selon" : "Croiser avec (une couleur par valeur)", b.table, { familles: ["texte", "liste", "booleen", "date"], vide: "— Pas de croisement —" });
        if (b.series && b.series.colonne) {
          if (familleCol(b.table, b.series.colonne) === "date") { h += choix(ch.concat(["series", "pas"]), "Regrouper les dates par", C.PAS_DATE, { defaut: "annee" }); }
          h += texte(ch.concat(["series", "limite"]), "Garder les N principales valeurs", { nombre: true });
        }
      }
      h += "<h4 class=\"fr-h6 ed-titre\">Ce qui est calculé</h4>";
      if (parts || (b.series && b.series.colonne)) { h += mesure(ch.concat(["mesures", 0]), b.table); }
      else {
        h += liste(ch.concat(["mesures"]), "", function (c2) { return mesure(c2, b.table, { complet: true, combine: forme === "combine" }); }, { fonction: "nombre" }, "Ajouter une mesure");
      }
    }
    h += formatChamps(ch);
    h += "<h4 class=\"fr-h6 ed-titre\">Présentation</h4>";
    if (["barres", "barres-h", "aires", "radar"].indexOf(forme) >= 0) {
      h += choix(ch.concat(["empile"]), "Valeurs croisées", [["non", "Côte à côte"], ["oui", "Empilées"], ["100", "Empilées à 100 %"]], { defaut: "non" });
    }
    if (["barres", "barres-h", "lignes", "aires", "combine"].indexOf(forme) >= 0) {
      h += caseC(ch.concat(["cumul"]), "Cumuler les valeurs (total progressif)");
      h += caseC(ch.concat(["pourcentage"]), "Afficher en pourcentage du total");
      h += texte(ch.concat(["objectif"]), "Ligne d'objectif (facultatif)", { nombre: true });
    }
    if (forme === "lignes" || forme === "aires" || forme === "combine") { h += caseC(ch.concat(["lisse"]), "Courbes lissées"); }
    if (parts) { h += caseC(ch.concat(["pourcentage"]), "Étiquettes en pourcentage"); }
    if (forme !== "jauge") {
      h += forme === "secteurs" || forme === "anneau" || forme === "carte-chaleur" ? caseInverse(ch.concat(["etiquettes"]), "Afficher les valeurs sur le graphique") : caseC(ch.concat(["etiquettes"]), "Afficher les valeurs sur le graphique");
      h += choix(ch.concat(["legende"]), "Légende", [["", "Automatique"], ["bas", "En bas"], ["haut", "En haut"], ["aucune", "Aucune"]]);
    }
    h += choix(ch.concat(["palette"]), "Couleurs", T.PALETTES_LIBELLES, { defaut: "dsfr" });
    h += caseInverse(ch.concat(["couleursGrist"]), "Reprendre les couleurs des choix définies dans Grist");
    if (["barres", "barres-h"].indexOf(forme) >= 0) { h += caseC(ch.concat(["couleurParCategorie"]), "Une couleur par barre"); }
    h += choix(ch.concat(["motifs"]), "Motifs sur les couleurs", [["", "Automatique (au-delà de 4 couleurs)"], ["true", "Toujours"], ["false", "Jamais"]], { aide: "Aident à distinguer les valeurs sans la couleur (accessibilité, impression en noir et blanc)." });
    h += texte(ch.concat(["hauteur"]), "Hauteur (pixels)", { nombre: true, placeholder: "320" });
    h += texte(ch.concat(["source"]), "Source affichée sous le graphique", { placeholder: "Par exemple : base des demandes, extraction automatique" });
    return h;
  }

  function formTableau(ch, b) {
    var h = choix(ch.concat(["mode"]), "Type de tableau", [["croise", "Tableau croisé (calculs)"], ["liste", "Liste de lignes"]], { defaut: "croise" });
    if (b.mode === "liste") {
      var cols = colonnesDe(b.table);
      h += cocheValeurs(ch.concat(["colonnesListe"]), "Colonnes affichées", Object.keys(cols));
      h += colonne(ch.concat(["triListe"]), "Trier selon", b.table);
      h += choix(ch.concat(["ordreListe"]), "Ordre", [["desc", "Décroissant (plus récents, plus grands)"], ["asc", "Croissant"]], { defaut: "desc" });
      h += texte(ch.concat(["limite"]), "Nombre de lignes affichées", { nombre: true, placeholder: "10" });
      return h;
    }
    h += axeChamps(ch, b, "Une ligne par valeur de");
    h += colonne(ch.concat(["series", "colonne"]), "Une colonne par valeur de", b.table, { familles: ["texte", "liste", "booleen", "date"], vide: "— Une seule colonne —" });
    if (b.series && b.series.colonne && familleCol(b.table, b.series.colonne) === "date") { h += choix(ch.concat(["series", "pas"]), "Regrouper les dates par", C.PAS_DATE, { defaut: "annee" }); }
    h += "<h4 class=\"fr-h6 ed-titre\">Valeur des cases</h4>" + mesure(ch.concat(["mesures", 0]), b.table);
    h += formatChamps(ch);
    h += caseInverse(ch.concat(["totaux"]), "Afficher les totaux");
    return h;
  }

  function formBloc(ch, b) {
    var h = champsCommuns(ch, b);
    if (b.type === "texte") {
      return h + texte(ch.concat(["contenu"]), "Texte", { multiligne: true, lignes: 8, aide: "Une ligne vide sépare les paragraphes. **gras**, *italique*, « - » en début de ligne pour une liste, « ### » pour un intertitre, [texte](https://…) pour un lien." });
    }
    if (!b.table) { return h + "<p class=\"fr-text--sm\">Choisissez la table où se trouvent les données.</p>"; }
    if (b.type === "indicateur") { h += formIndicateur(ch, b); }
    else if (b.type === "tableau") { h += formTableau(ch, b); }
    else { h += formGraphique(ch, b); }
    h += "<h4 class=\"fr-h6 ed-titre\">Lignes prises en compte</h4>";
    h += liste(ch.concat(["filtres"]), "", function (c2) { return filtre(c2, b.table); }, {}, "Ajouter une condition");
    return h;
  }

  /* ---------- Vues ---------- */

  function vueBlocs() {
    var t = tb();
    var h = "<div class=\"ed-panneau\"><div class=\"ed-tableaux\">";
    h += "<div class=\"fr-select-group\"><label class=\"fr-label\" for=\"choix-tableau\">Tableau de bord</label><select class=\"fr-select\" id=\"choix-tableau\">" +
      E.config.tableaux.map(function (x, i) { return "<option value=\"" + i + "\"" + (i === E.it ? " selected" : "") + ">" + esc(x.titre || x.id) + "</option>"; }).join("") + "</select></div>";
    h += "<ul class=\"fr-btns-group fr-btns-group--inline fr-btns-group--sm\"><li><button type=\"button\" class=\"fr-btn fr-btn--secondary\" data-action=\"nouveau-tableau\">Nouveau tableau de bord</button></li>" +
      "<li><button type=\"button\" class=\"fr-btn fr-btn--tertiary\" data-action=\"dupliquer-tableau\">Dupliquer</button></li>" +
      (E.config.tableaux.length > 1 ? "<li><button type=\"button\" class=\"fr-btn fr-btn--tertiary\" data-action=\"supprimer-tableau\">Supprimer</button></li>" : "") + "</ul></div>";
    h += "<div class=\"ed-deux\">" + texte(chTb().concat(["titre"]), "Titre du tableau de bord") +
      choix(chTb().concat(["moisDebut"]), "L'année commence en", MOIS.map(function (m, i) { return [i + 1, m]; }), { nombre: true, defaut: 1, aide: "Septembre pour une année scolaire, par exemple." }) + "</div>";
    h += texte(chTb().concat(["introduction"]), "Introduction", { multiligne: true, lignes: 2 });
    h += "</div>";

    h += "<div class=\"ed-panneau ed-ajout\"><p class=\"fr-text--bold fr-mb-1w\">Ajouter un bloc</p><ul class=\"fr-btns-group fr-btns-group--inline fr-btns-group--sm\">" +
      ["indicateur", "graphique", "tableau", "texte"].map(function (k) { return "<li><button type=\"button\" class=\"fr-btn fr-btn--secondary\" data-action=\"ajouter-bloc\" data-type=\"" + k + "\">" + TYPES[k] + "</button></li>"; }).join("") + "</ul>" +
      "<details class=\"ed-proposer\"" + (t.blocs.length ? "" : " open") + "><summary class=\"fr-text--sm\">Proposer automatiquement des blocs à partir d'une table</summary>" +
      "<div class=\"ed-ligne-form\"><div class=\"fr-select-group\"><label class=\"fr-label\" for=\"table-proposee\">Table</label><select class=\"fr-select\" id=\"table-proposee\">" +
      nomsTables().map(function (n) { return "<option" + (n === E.hote ? " selected" : "") + ">" + esc(n) + "</option>"; }).join("") + "</select></div>" +
      "<button type=\"button\" class=\"fr-btn fr-btn--sm\" data-action=\"proposer\">Proposer</button></div>" +
      "<p class=\"fr-text--xs\">Indicateurs, évolution dans le temps et répartitions sont créés selon les colonnes de la table. Vous pouvez ensuite tout modifier.</p></details></div>";

    if (!t.blocs.length) { h += "<p class=\"fr-text--sm\">Ce tableau de bord ne contient encore aucun bloc.</p>"; }
    t.blocs.forEach(function (b, i) {
      var ch = chTb().concat(["blocs", i]);
      var ouvert = E.ouvert === b.id;
      h += "<section class=\"ed-bloc" + (ouvert ? " est-ouvert" : "") + "\" aria-label=\"" + esc(b.titre || TYPES[b.type]) + "\"><div class=\"ed-bloc__entete\">" +
        "<button type=\"button\" class=\"ed-choisir\" data-action=\"ouvrir\" data-id=\"" + esc(b.id) + "\" aria-expanded=\"" + ouvert + "\">" +
        "<span class=\"fr-badge fr-badge--sm fr-badge--no-icon fr-badge--blue-ecume\">" + esc(TYPES[b.type] || b.type) + "</span> <span class=\"ed-bloc__titre\">" + esc(b.titre || "Sans titre") + "</span>" +
        " <span class=\"fr-text--xs ed-gris\">" + esc((LARGEURS.find(function (l) { return l[0] === (b.largeur || (b.type === "indicateur" ? 3 : 6)); }) || [0, ""])[1].toLowerCase()) + (b.table ? " · " + esc(b.table) : "") + "</span></button>" +
        "<button type=\"button\" class=\"fr-btn fr-btn--sm fr-btn--tertiary-no-outline fr-icon-arrow-up-line\" title=\"Monter\" data-action=\"monter\" data-i=\"" + i + "\"" + (i === 0 ? " disabled" : "") + ">Monter</button>" +
        "<button type=\"button\" class=\"fr-btn fr-btn--sm fr-btn--tertiary-no-outline fr-icon-arrow-down-line\" title=\"Descendre\" data-action=\"descendre\" data-i=\"" + i + "\"" + (i === t.blocs.length - 1 ? " disabled" : "") + ">Descendre</button>" +
        "<button type=\"button\" class=\"fr-btn fr-btn--sm fr-btn--tertiary-no-outline fr-icon-file-copy-line\" title=\"Dupliquer\" data-action=\"dupliquer\" data-i=\"" + i + "\">Dupliquer</button>" +
        "<button type=\"button\" class=\"fr-btn fr-btn--sm fr-btn--tertiary-no-outline fr-icon-delete-line\" title=\"Supprimer\" data-action=\"supprimer\" data-i=\"" + i + "\">Supprimer</button></div>";
      if (ouvert) {
        h += "<div class=\"ed-bloc__corps\"><div class=\"ed-bloc__form\">" + formBloc(ch, b) + "</div>" +
          "<div class=\"ed-bloc__apercu\"><p class=\"fr-text--xs ed-gris fr-mb-1w\">Aperçu avec vos données</p><div id=\"apercu-bloc\"></div></div></div>";
      }
      h += "</section>";
    });
    return h;
  }

  function colonnesDesTables() {
    var noms = T.tablesUtilisees(tb());
    var out = {};
    noms.forEach(function (n) {
      var cols = colonnesDe(n);
      Object.keys(cols).forEach(function (c) {
        if (C.famille(cols[c].type) === "pj") { return; }
        if (!out[c]) { out[c] = { libelle: cols[c].libelle, tables: [] }; }
        out[c].tables.push(n);
      });
    });
    return out;
  }

  function vueFiltres() {
    var t = tb();
    var cols = colonnesDesTables();
    var h = "<div class=\"ed-panneau\"><h2 class=\"fr-h5\">Filtres du tableau de bord</h2>" +
      "<p class=\"fr-text--sm\">Les filtres s'affichent en haut du tableau de bord. Ils s'appliquent à tous les blocs dont la table contient la colonne choisie (même nom de colonne). Un clic sur une barre ou une part de graphique filtre aussi tout le tableau de bord.</p>";
    if (!Object.keys(cols).length) { return h + "<p class=\"fr-text--sm\">Ajoutez d'abord des blocs qui utilisent une table.</p></div>"; }
    h += liste(chTb().concat(["filtres"]), "", function (ch) {
      var f = lire(ch) || {};
      if (!f.id) { f.id = nouvelId("f"); }
      var x = choix(ch.concat(["colonne"]), "Colonne", [["", "— Choisir —"]].concat(Object.keys(cols).map(function (c) { return [c, cols[c].libelle + " (" + c + ") — " + cols[c].tables.join(", ")]; })));
      if (f.colonne && cols[f.colonne]) {
        var table = cols[f.colonne].tables[0];
        var fam = familleCol(table, f.colonne);
        x += "<div class=\"ed-deux\">" + texte(ch.concat(["libelle"]), "Libellé", { placeholder: cols[f.colonne].libelle }) +
          (fam === "date" ? "" : texte(ch.concat(["libelleTous"]), "Libellé de « tout »", { placeholder: "Tout" })) + "</div>";
        x += fam === "date" ? choix(ch.concat(["defaut"]), "Période sélectionnée à l'ouverture", [["", "Toutes les dates"]].concat(C.PERIODES)) :
          choix(ch.concat(["defaut"]), "Valeur sélectionnée à l'ouverture", [["", "Tout"]].concat(valeursDe(table, f.colonne).map(function (v) { return [v, v]; })));
      }
      return x;
    }, { colonne: "" }, "Ajouter un filtre");
    return h + "</div>";
  }

  function lienPublic() {
    if (!E.base) { return ""; }
    var doc = E.base.replace("/api/docs/", "/");
    var u = new URL("index.html", location.href);
    u.searchParams.set("grist", doc);
    u.searchParams.set("table", E.hote);
    if (E.config.tableaux.length > 1) { u.searchParams.set("tableau", tb().id); }
    return u.href;
  }

  function vuePublication() {
    var lien = lienPublic();
    var h = "<div class=\"ed-panneau\"><h2 class=\"fr-h5\">Diffuser le tableau de bord</h2>";
    h += "<h3 class=\"fr-h6\">Dans Grist</h3><p class=\"fr-text--sm\">Pour consulter le tableau de bord sans l'éditeur, ajoutez une vue <strong>Personnalisée</strong> sur la table <code>" + esc(E.hote) + "</code> avec l'adresse <code>" + esc(new URL("index.html", location.href).href) + "</code> et l'<strong>accès complet</strong>. Chaque personne y voit les données selon ses droits.</p>";
    h += "<h3 class=\"fr-h6\">Lien réservé aux personnes invitées</h3><p class=\"fr-text--sm\">Alternative à la page publique : la page de Grist s'affiche en plein écran, sans menus, mais <strong>seules les personnes invitées dans le document</strong> peuvent l'ouvrir (les autres voient une demande de connexion, aucune donnée). Dans Grist, cliquez sur <strong>Partager</strong> et invitez les personnes avec le rôle <strong>Lecteur</strong>, sans activer l'accès public. Ouvrez la page qui contient le tableau de bord, copiez son adresse et collez-la ci-dessous. Ce n'est pas un verrou : seules les invitations protègent les données.</p>" +
      "<div class=\"fr-input-group\"><label class=\"fr-label\" for=\"page-grist\">Adresse de la page Grist" + aide("Exemple : https://grist.exemple.fr/o/equipe/xxxx/Mon-document/p/3") + "</label><input class=\"fr-input\" id=\"page-grist\" type=\"url\"></div>" +
      "<div class=\"fr-input-group\"><label class=\"fr-label\" for=\"lien-reserve\">Lien à envoyer aux personnes invitées</label><input class=\"fr-input\" id=\"lien-reserve\" readonly></div>" +
      "<ul class=\"fr-btns-group fr-btns-group--inline fr-btns-group--sm\"><li><button type=\"button\" class=\"fr-btn fr-btn--tertiary\" data-action=\"copier\" data-cible=\"lien-reserve\">Copier le lien réservé</button></li></ul>" +
      "<div class=\"fr-callout fr-mb-3w\"><p class=\"fr-callout__text fr-text--sm\"><strong>Page publique ou lien réservé ?</strong> Publique : toute personne qui a le lien voit les données des tables exposées, sans compte. Réservée : il faut être invité et connecté. Pour des données internes ou personnelles, choisissez le lien réservé.</p></div>";
    h += "<h3 class=\"fr-h6\">Page publique</h3><p class=\"fr-text--sm\">Le document doit être partagé en lecture publique. <strong>Attention :</strong> toutes les lignes et colonnes lisibles des tables utilisées deviennent consultables par toute personne qui a le lien, pas seulement les chiffres affichés. Restreignez-les avec les règles d'accès, ou faites calculer le tableau de bord sur des tables de synthèse.</p>";
    h += "<button type=\"button\" class=\"fr-btn fr-btn--sm fr-btn--secondary fr-mb-2w\" data-action=\"verifier\">Vérifier l'accès public</button><div id=\"verification\" aria-live=\"polite\"></div>";
    h += "<div class=\"fr-input-group\"><label class=\"fr-label\" for=\"lien-public\">Lien de la page" + aide("Pour le tableau de bord « " + (tb().titre || "") + " ». Enregistrez avant de diffuser.") + "</label><input class=\"fr-input\" id=\"lien-public\" readonly value=\"" + esc(lien) + "\"></div>" +
      "<ul class=\"fr-btns-group fr-btns-group--inline fr-btns-group--sm\"><li><button type=\"button\" class=\"fr-btn fr-btn--tertiary\" data-action=\"copier\" data-cible=\"lien-public\">Copier le lien</button></li><li><a class=\"fr-btn fr-btn--tertiary\" href=\"" + esc(lien) + "\" target=\"_blank\" rel=\"noopener\">Ouvrir la page</a></li></ul>";
    var integre = lien ? "<iframe src=\"" + lien + "&integre=1\" title=\"" + esc(tb().titre || "Tableau de bord") + "\" style=\"width:100%;height:900px;border:0\"></iframe>" : "";
    h += "<div class=\"fr-input-group\"><label class=\"fr-label\" for=\"code-iframe\">Code d'intégration dans un autre site" + aide("Sans en-tête ni pied de page.") + "</label><textarea class=\"fr-input\" id=\"code-iframe\" rows=\"3\" readonly>" + esc(integre) + "</textarea></div>";
    h += "<h3 class=\"fr-h6\">Réutiliser les réglages</h3><p class=\"fr-text--sm\">Copiez ce texte pour reprendre les tableaux de bord dans un autre document (les données ne sont pas copiées).</p>" +
      "<div class=\"fr-input-group\"><label class=\"fr-label\" for=\"config-json\">Réglages (JSON)</label><textarea class=\"fr-input ed-json\" id=\"config-json\" rows=\"8\">" + esc(JSON.stringify(E.config, null, 2)) + "</textarea></div>" +
      "<ul class=\"fr-btns-group fr-btns-group--inline fr-btns-group--sm\"><li><button type=\"button\" class=\"fr-btn fr-btn--tertiary\" data-action=\"copier\" data-cible=\"config-json\">Copier</button></li><li><button type=\"button\" class=\"fr-btn fr-btn--secondary\" data-action=\"importer\">Importer le texte collé</button></li></ul>";
    return h + "</div>";
  }

  async function verifier() {
    var z = $("#verification");
    z.innerHTML = "<p class=\"fr-text--sm\">Vérification…</p>";
    var base = E.base;
    var res = [];
    try {
      var r = await fetch(base + "/tables", { credentials: "omit" });
      if (!r.ok) { throw new Error("le document n'est pas lisible sans connexion (" + r.status + ")"); }
      var noms = T.tablesUtilisees(tb()).concat([E.hote]).filter(function (x, i, a) { return a.indexOf(x) === i; });
      for (var i = 0; i < noms.length; i++) {
        var n = noms[i];
        try {
          var rec = await fetch(base + "/tables/" + encodeURIComponent(n) + "/records", { credentials: "omit" });
          if (!rec.ok) { res.push(["error", "Table « " + n + " » : illisible sans connexion. Les blocs qui l'utilisent resteront vides."]); continue; }
          var j = await rec.json();
          var cols = j.records[0] ? Object.keys(j.records[0].fields).length : 0;
          res.push(["warning", "Table « " + n + " » : " + j.records.length + " lignes et " + cols + " colonnes lisibles publiquement."]);
        } catch (e) { res.push(["error", "Table « " + n + " » : " + e.message]); }
      }
      res.unshift(["success", "Le document est lisible publiquement : la page fonctionnera."]);
    } catch (e) {
      res = [["error", "Accès public impossible : " + e.message + ". Partagez le document en lecture publique (Partager › accès public : Lecteur)."]];
    }
    z.innerHTML = res.map(function (x) { return "<div class=\"fr-alert fr-alert--" + x[0] + " fr-alert--sm fr-mb-1w\"><p>" + esc(x[1]) + "</p></div>"; }).join("");
  }

  async function vueApercu() {
    var z = $("#vue");
    z.innerHTML = "<div class=\"ed-panneau ed-apercu-page\"><div id=\"ap-entete\"></div><div class=\"fr-container fr-py-3w\" id=\"ap-tableau\"><p class=\"fr-text--sm\">Calcul…</p></div><div id=\"ap-pied\"></div></div>";
    await charger(T.tablesUtilisees(tb()));
    if (E.vue !== "apercu") { return; }
    window.PageDSFR.appliquer(E.config.page, { entete: $("#ap-entete"), pied: $("#ap-pied") });
    if (E.apercu) { E.apercu.detruire(); }
    E.apercu = T.monter($("#ap-tableau"), { tableau: tb(), donnees: E.donnees, titreNiveau: 1 });
  }

  var minuteur = null;
  function apercuBloc() {
    clearTimeout(minuteur);
    minuteur = setTimeout(async function () {
      var z = $("#apercu-bloc");
      if (!z) { return; }
      var b = tb().blocs.find(function (x) { return x.id === E.ouvert; });
      if (!b) { return; }
      try {
        if (b.table) { await charger([b.table]); }
        if (E.blocApercu && E.blocApercu.graphique) { E.blocApercu.graphique.dispose(); }
        var carte = document.createElement("div");
        z.innerHTML = "";
        z.appendChild(carte);
        E.blocApercu = T.rendreBloc(carte, b, E.donnees, { moisDebut: tb().moisDebut, titreNiveau: 3, exports: false });
      } catch (e) {
        z.innerHTML = "<p class=\"fr-text--sm\">Aperçu impossible : " + esc(e.message) + "</p>";
      }
    }, 150);
  }

  function afficher() {
    var y = window.scrollY;
    if (E.apercu && E.vue !== "apercu") { E.apercu.detruire(); E.apercu = null; }
    Array.prototype.forEach.call(document.querySelectorAll("input[name=onglet]"), function (r) { r.checked = r.value === E.vue; });
    var z = $("#vue");
    if (E.vue === "page") {
      z.innerHTML = "";
      var p = document.createElement("div");
      p.className = "ed-panneau ed-textes";
      z.appendChild(p);
      E.config.page = E.config.page || {};
      window.PageEditeur.monter(p, E.config.page, function () { modifie(true); });
      return;
    }
    if (E.vue === "apercu") { vueApercu(); return; }
    z.innerHTML = E.vue === "filtres" ? vueFiltres() : E.vue === "publication" ? vuePublication() : vueBlocs();
    window.scrollTo(0, y);
    if (E.vue === "blocs") { apercuBloc(); }
    if (E.vue === "publication") {
      var pg = $("#page-grist");
      if (pg) { pg.addEventListener("input", function () {
        var r = $("#lien-reserve"), v = pg.value.trim();
        if (!v) { r.value = ""; return; }
        try { var u = new URL(v); var sg = u.pathname.split("/"), ip = sg.lastIndexOf("p"); if (ip > 1 && /^[A-Za-z0-9]{20,}$/.test(sg[ip - 1])) { r.value = "Cette adresse contient l'identifiant long du document : Grist ignorerait la page. Ouvrez la page dans Grist et copiez l'adresse affichée dans la barre du navigateur (elle contient le nom du document)."; return; } u.search = ""; u.searchParams.set("embed", "true"); r.value = u.href; } catch (e) { r.value = "Adresse non reconnue : collez l'adresse complète de la page Grist."; }
      }); }
    }
    if (E.vue === "filtres") {
      // Les valeurs proposées viennent des tables utilisées.
      var manquantes = T.tablesUtilisees(tb()).filter(function (n) { return !E.donnees[n]; });
      if (manquantes.length) { charger(manquantes).then(function () { if (E.vue === "filtres") { afficher(); } }); }
    }
  }

  /* ---------- Proposition automatique ---------- */

  function proposer(table) {
    var cols = colonnesDe(table);
    var ids = Object.keys(cols).filter(function (c) { return !cols[c].reference || true; });
    var dates = ids.filter(function (c) { return C.famille(cols[c].type) === "date"; });
    var choixC = ids.filter(function (c) { var f = C.famille(cols[c].type); return (f === "texte" && cols[c].choix && cols[c].choix.length <= 15) || (cols[c].reference && f === "texte"); });
    var listes = ids.filter(function (c) { return C.famille(cols[c].type) === "liste"; });
    var nombres = ids.filter(function (c) { return C.famille(cols[c].type) === "nombre" && !/^(id|n°|num|numero)$/i.test(c); });
    var blocs = [];
    var d = dates[0];
    blocs.push({ type: "indicateur", titre: "Nombre de lignes", table: table, largeur: 3, mesures: [{ fonction: "nombre" }], libelleValeur: "au total", comparaison: d ? { colonne: d, periode: "annee" } : undefined, tendance: d ? { colonne: d, pas: "mois" } : undefined });
    if (d) { blocs[0].libelleValeur = "cette année"; }
    nombres.slice(0, 2).forEach(function (n, i) {
      blocs.push({ type: "indicateur", titre: (i === 0 ? "Total " : "Moyenne ") + cols[n].libelle, table: table, largeur: 3, mesures: [{ fonction: i === 0 ? "somme" : "moyenne", colonne: n }], format: cols[n].unite ? { unite: cols[n].unite } : undefined });
    });
    if (choixC[0]) {
      blocs.push({ type: "indicateur", titre: "Valeurs de « " + cols[choixC[0]].libelle + " »", libelleValeur: "valeurs différentes", table: table, largeur: 3, mesures: [{ fonction: "distinct", colonne: choixC[0] }] });
    }
    if (d) {
      blocs.push({ type: "graphique", forme: "barres", titre: "Évolution par mois", table: table, largeur: choixC[0] ? 8 : 12, axe: { colonne: d, pas: "mois" }, series: choixC[1] ? { colonne: choixC[1], limite: 6 } : undefined, empile: choixC[1] ? "oui" : "non", mesures: [{ fonction: "nombre" }] });
    }
    if (choixC[0]) {
      var nb = (cols[choixC[0]].choix || []).length;
      blocs.push({ type: "graphique", forme: nb && nb <= 6 ? "anneau" : "barres-h", titre: "Répartition par " + cols[choixC[0]].libelle.toLowerCase(), table: table, largeur: 4, axe: { colonne: choixC[0], limite: 10 }, mesures: [{ fonction: "nombre" }], etiquettes: nb > 6 });
    }
    choixC.slice(1, 3).concat(listes.slice(0, 1)).forEach(function (c) {
      blocs.push({ type: "graphique", forme: "barres-h", titre: "Répartition par " + cols[c].libelle.toLowerCase(), table: table, largeur: 6, axe: { colonne: c, limite: 8 }, mesures: [{ fonction: "nombre" }], etiquettes: true });
    });
    if (choixC.length >= 2) {
      blocs.push({ type: "tableau", titre: cols[choixC[0]].libelle + " et " + cols[choixC[1]].libelle.toLowerCase(), table: table, largeur: 12, axe: { colonne: choixC[0] }, series: { colonne: choixC[1] }, mesures: [{ fonction: "nombre" }] });
    }
    blocs.forEach(function (b) { b.id = nouvelId(); Object.keys(b).forEach(function (k) { if (b[k] === undefined) { delete b[k]; } }); });
    var filtres = [];
    if (d) { filtres.push({ id: nouvelId("f"), colonne: d, libelle: "Période" }); }
    if (choixC[0]) { filtres.push({ id: nouvelId("f"), colonne: choixC[0], libelle: cols[choixC[0]].libelle }); }
    return { blocs: blocs, filtres: filtres };
  }

  /* ---------- Enregistrement ---------- */

  async function enregistrer() {
    var b = $("#enregistrer");
    b.disabled = true;
    try {
      E.config.version = 1;
      E.config.majLe = new Date().toISOString();
      var actions = [];
      if (!E.colConfig) { actions.push(["AddColumn", E.hote, D.NOM_COLONNE_CONFIG, { type: "Text", label: D.NOM_COLONNE_CONFIG }]); }
      actions.push(["ModifyColumn", E.hote, D.NOM_COLONNE_CONFIG, { description: JSON.stringify(E.config) }]);
      await grist.docApi.applyUserActions(actions);
      E.colConfig = true;
      modifie(false);
      message("success", "Réglages enregistrés.");
    } catch (e) {
      message("error", "Échec de l'enregistrement : " + (e.message || e));
    } finally { b.disabled = false; }
  }

  /* ---------- Événements ---------- */

  function convertir(el) {
    var t = el.getAttribute("data-t");
    if (t === "case") { return el.checked || undefined; }
    if (t === "case-inverse") { return el.checked ? undefined : false; }
    if (t === "nombre") { return el.value === "" ? undefined : Number(el.value); }
    return el.value === "" ? undefined : el.value;
  }

  // Après changement de table d'un bloc : on vide les réglages de colonnes devenus invalides.
  function nettoyerBloc(b) {
    var cols = colonnesDe(b.table);
    if (b.axe && b.axe.colonne && !cols[b.axe.colonne]) { delete b.axe; }
    if (b.series && b.series.colonne && !cols[b.series.colonne]) { delete b.series; }
    (b.mesures || []).forEach(function (m) { if (m.colonne && !cols[m.colonne]) { delete m.colonne; } });
    if (b.filtres) { b.filtres = b.filtres.filter(function (f) { return !f.colonne || cols[f.colonne]; }); }
  }

  function surSaisie(ev, finale) {
    var t = ev.target;
    if (t.name === "onglet") { if (finale) { E.vue = t.value; afficher(); } return; }
    if (t.id === "choix-tableau") { if (finale) { E.it = Number(t.value); E.ouvert = null; afficher(); } return; }
    if (t.closest(".pe-ligne, .pe-image") && t.closest(".ed-textes")) { return; }
    if (t.hasAttribute("data-c")) {
      var ch = JSON.parse(t.getAttribute("data-c"));
      ecrire(ch, convertir(t));
      if (ch[ch.length - 1] === "table" && finale) { nettoyerBloc(lire(ch.slice(0, -1))); }
      modifie(true);
      if (finale && t.hasAttribute("data-r")) { afficher(); } else { apercuBloc(); }
      return;
    }
    if (t.hasAttribute("data-cv") && finale) {
      var c2 = JSON.parse(t.getAttribute("data-cv"));
      var l = lire(c2); l = Array.isArray(l) ? l.slice() : (l ? [String(l)] : []);
      var v = t.getAttribute("data-v");
      if (t.checked && l.indexOf(v) < 0) { l.push(v); }
      if (!t.checked) { l = l.filter(function (x) { return x !== v; }); }
      ecrire(c2, l.length ? l : undefined);
      modifie(true);
      apercuBloc();
    }
  }

  document.addEventListener("input", function (ev) { surSaisie(ev, false); });
  document.addEventListener("change", function (ev) { surSaisie(ev, true); });
  document.addEventListener("click", function (ev) {
    var b = ev.target.closest("button");
    if (!b || b.closest(".ed-textes") && !b.id) { return; }
    if (b.id === "enregistrer") { enregistrer(); return; }
    var blocs = tb() && tb().blocs;
    if (b.hasAttribute("data-l")) {
      var ch = JSON.parse(b.getAttribute("data-l"));
      var l = (lire(ch) || []).slice();
      var i = Number(b.getAttribute("data-i"));
      var a = b.getAttribute("data-a");
      if (a === "ajouter") { l.push(JSON.parse(b.getAttribute("data-modele"))); }
      if (a === "supprimer") { l.splice(i, 1); }
      if (a === "monter") { l.splice(i - 1, 0, l.splice(i, 1)[0]); }
      ecrire(ch, l);
      modifie(true); afficher();
      return;
    }
    if (b.hasAttribute("data-effacer")) { ecrire(JSON.parse(b.getAttribute("data-effacer")), undefined); modifie(true); afficher(); return; }
    var act = b.getAttribute("data-action");
    if (!act) { return; }
    var k = Number(b.getAttribute("data-i"));
    switch (act) {
      case "ouvrir": E.ouvert = E.ouvert === b.getAttribute("data-id") ? null : b.getAttribute("data-id"); afficher(); return;
      case "ajouter-bloc":
        var type = b.getAttribute("data-type");
        var nb = { id: nouvelId(), type: type, titre: type === "texte" ? "À savoir" : "", largeur: type === "indicateur" ? 3 : type === "texte" ? 12 : 6 };
        if (type !== "texte") { nb.table = blocs.length && blocs[blocs.length - 1].table ? blocs[blocs.length - 1].table : (E.schema.tables[E.hote] ? E.hote : ""); nb.mesures = [{ fonction: "nombre" }]; }
        if (type === "graphique") { nb.forme = "barres"; }
        blocs.push(nb); E.ouvert = nb.id; modifie(true); afficher();
        setTimeout(function () { var s = document.querySelector(".ed-bloc.est-ouvert"); if (s) { s.scrollIntoView({ block: "start" }); } }, 50);
        return;
      case "monter": if (k > 0) { blocs.splice(k - 1, 0, blocs.splice(k, 1)[0]); modifie(true); afficher(); } return;
      case "descendre": if (k < blocs.length - 1) { blocs.splice(k + 1, 0, blocs.splice(k, 1)[0]); modifie(true); afficher(); } return;
      case "dupliquer": var cp = JSON.parse(JSON.stringify(blocs[k])); cp.id = nouvelId(); cp.titre = (cp.titre || "") + " (copie)"; blocs.splice(k + 1, 0, cp); E.ouvert = cp.id; modifie(true); afficher(); return;
      case "supprimer": blocs.splice(k, 1); modifie(true); afficher(); return;
      case "nouveau-tableau":
        E.config.tableaux.push({ id: nouvelId("t"), titre: "Nouveau tableau de bord", filtres: [], blocs: [] });
        E.it = E.config.tableaux.length - 1; E.ouvert = null; modifie(true); afficher(); return;
      case "dupliquer-tableau":
        var ct = JSON.parse(JSON.stringify(tb())); ct.id = nouvelId("t"); ct.titre = (ct.titre || "") + " (copie)";
        E.config.tableaux.push(ct); E.it = E.config.tableaux.length - 1; modifie(true); afficher(); return;
      case "supprimer-tableau":
        if (E.config.tableaux.length > 1) { E.config.tableaux.splice(E.it, 1); E.it = 0; modifie(true); afficher(); } return;
      case "proposer":
        var tn = $("#table-proposee").value;
        charger([tn]).then(function () {
          var p = proposer(tn);
          tb().blocs = tb().blocs.concat(p.blocs);
          if (!tb().filtres || !tb().filtres.length) { tb().filtres = p.filtres; }
          modifie(true);
          message("success", p.blocs.length + " blocs proposés à partir de « " + tn + " ». Vérifiez-les dans l'aperçu, puis enregistrez.");
          afficher();
        });
        return;
      case "verifier": verifier(); return;
      case "copier":
        var champ = document.getElementById(b.getAttribute("data-cible"));
        champ.select();
        (navigator.clipboard ? navigator.clipboard.writeText(champ.value) : Promise.reject()).then(function () { message("success", "Copié."); }, function () { document.execCommand("copy"); message("success", "Copié."); });
        return;
      case "importer":
        try {
          var c = JSON.parse($("#config-json").value);
          if (!c || typeof c !== "object") { throw new Error("objet attendu"); }
          if (!c.tableaux) { c = { page: c.page || {}, tableaux: [c] }; }
          E.config = c; E.it = 0; E.ouvert = null;
          modifie(true); message("success", "Réglages importés. Vérifiez puis enregistrez."); afficher();
        } catch (e) { message("error", "Texte invalide : " + e.message); }
        return;
    }
  });
  window.addEventListener("beforeunload", function (ev) { if (E.modifie) { ev.preventDefault(); ev.returnValue = ""; } });

  /* ---------- Démarrage ---------- */

  async function demarrer() {
    E.source = D.sourceWidget();
    E.schema = await E.source.schema();
    var lu = await E.source.config();
    E.hote = lu.hote;
    E.colConfig = lu.existe;
    var tok = await grist.docApi.getAccessToken({ readOnly: true });
    E.base = tok.baseUrl;
    var c = lu.config;
    if (c && !c.tableaux) { c = { page: c.page || {}, tableaux: [c] }; }
    if (!c || !c.tableaux || !c.tableaux.length) {
      c = { version: 1, page: { marque: "République\nfrançaise", titre: "", sousTitre: "", boutons: [], pied: { accessibilite: "non conforme" } }, tableaux: [{ id: nouvelId("t"), titre: "Tableau de bord", moisDebut: 1, filtres: [], blocs: [] }] };
      E.config = c;
      var hoteCols = Object.keys(colonnesDe(E.hote));
      if (hoteCols.length) {
        await charger([E.hote]);
        if ((E.donnees[E.hote] || { lignes: [] }).lignes.length) {
          var p = proposer(E.hote);
          c.tableaux[0].blocs = p.blocs; c.tableaux[0].filtres = p.filtres;
          message("info", "Premier tableau de bord proposé à partir de la table « " + E.hote + " ». Modifiez-le, puis enregistrez.");
        }
      }
      modifie(true);
    } else {
      c.tableaux.forEach(function (t, i) { t.id = t.id || "t" + (i + 1); (t.blocs || []).forEach(function (b) { b.id = b.id || nouvelId(); }); t.blocs = t.blocs || []; t.filtres = t.filtres || []; });
      E.config = c;
      modifie(false);
    }
    afficher();
  }

  if (typeof grist === "undefined") {
    $("#etat").textContent = "Hors de Grist";
    $("#vue").innerHTML = "<div class=\"fr-alert fr-alert--info\"><h1 class=\"fr-alert__title\">Ce widget s'utilise dans Grist</h1><p>Ajoutez une vue « Personnalisée » avec l'adresse de cette page et l'accès complet au document. Pour voir le résultat sans Grist, ouvrez la <a href=\"index.html?demo\">démonstration</a>.</p></div>";
    return;
  }
  grist.ready({ requiredAccess: "full" });
  var lance = false;
  function lancer() {
    if (lance) { return; }
    lance = true;
    demarrer().catch(function (e) { lance = false; message("error", "Lecture impossible. Si vous gérez ce document : accordez l'accès complet au document à ce widget (panneau de droite de Grist, rubrique Accès). Sinon, votre compte n'a pas le droit de lire ces données : demandez un accès à la personne qui gère le document. (" + (e.message || e) + ")"); });
  }
  grist.onRecords(lancer);
  setTimeout(lancer, 800);
})();
