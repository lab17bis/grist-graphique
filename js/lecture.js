/*
 * Page de lecture d'un tableau de bord (index.html).
 *   ?grist=<lien du document>&table=<table hôte>[&tableau=<id>] : page publique (document en lecture publique)
 *   ?demo                                                          : démonstration (données fictives)
 *   sans paramètre, dans Grist                                     : vue de lecture (widget, droits de la personne connectée)
 *   &integre=1                                                     : sans en-tête ni pied de page (intégration dans un autre site)
 */
(function () {
  "use strict";

  var app = document.getElementById("contenu");
  var params = new URLSearchParams(location.search);
  var dansGrist = window.self !== window.top && params.get("grist") === null && params.get("demo") === null;
  var instance = null;

  function esc(s) {
    return String(s === null || s === undefined ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c];
    });
  }
  function erreur(titre, texte) {
    if (instance) { instance.detruire(); instance = null; }
    app.innerHTML = "<div class=\"fr-alert fr-alert--error\"><h1 class=\"fr-alert__title\">" + esc(titre) + "</h1><p>" + esc(texte) + "</p></div>";
    document.title = titre;
  }

  // Réglages : { page, tableaux: [ {id, titre, …, blocs} ] } (un ancien format à un seul tableau est accepté).
  function normaliser(c) {
    if (!c) { return null; }
    if (!c.tableaux) { c = { page: c.page, tableaux: [c] }; }
    c.tableaux = c.tableaux.map(function (t, i) { t.id = t.id || "t" + (i + 1); return t; });
    return c;
  }

  async function afficher(source, choix) {
    var lu = await source.config();
    var config = normaliser(lu.config);
    if (!config || !config.tableaux.length) {
      erreur("Tableau de bord non configuré", "Ce document ne contient pas encore de tableau de bord. Créez-le avec l'éditeur (editeur.html) dans Grist.");
      if (source.mode === "widget" || source.mode === "demo") {
        var vide = document.createElement("p");
        vide.className = "fr-mt-2w";
        vide.innerHTML = "<a class=\"fr-btn\" href=\"editeur.html" + esc(location.search) + "\">Configurer le tableau de bord</a>";
        app.appendChild(vide);
      }
      return;
    }
    var tb = config.tableaux.find(function (t) { return t.id === choix; }) || config.tableaux[0];
    var integre = params.get("integre") === "1";
    if (!integre && source.mode !== "widget") {
      window.PageDSFR.appliquer(config.page, {
        entete: document.getElementById("entete"),
        pied: document.getElementById("pied"),
        accueil: location.pathname + location.search,
        contexte: { titre: tb.titre || "" }
      });
    }
    document.title = (tb.titre || "Tableau de bord") + ((config.page && config.page.titre) ? " – " + config.page.titre : "");
    var donnees = await source.charger(window.Tableau.tablesUtilisees(tb));

    if (instance) { instance.detruire(); }
    app.innerHTML = "";
    // Plusieurs tableaux de bord : navigation entre eux.
    if (config.tableaux.length > 1 && !integre) {
      var nav = document.createElement("nav");
      nav.className = "fr-mb-3w";
      nav.setAttribute("aria-label", "Tableaux de bord");
      nav.innerHTML = "<ul class=\"fr-btns-group fr-btns-group--inline fr-btns-group--sm\">" + config.tableaux.map(function (t) {
        var actif = t.id === tb.id;
        var lien = new URL(location.href); lien.searchParams.set("tableau", t.id);
        return "<li><a class=\"fr-btn " + (actif ? "" : "fr-btn--secondary") + "\" href=\"" + esc(lien.pathname + lien.search) + "\" data-tableau=\"" + esc(t.id) + "\"" + (actif ? " aria-current=\"page\"" : "") + ">" + esc(t.titre || t.id) + "</a></li>";
      }).join("") + "</ul>";
      nav.addEventListener("click", function (ev) {
        var a = ev.target.closest("[data-tableau]");
        if (!a || source.mode !== "widget") { return; }
        ev.preventDefault();
        choixWidget = a.getAttribute("data-tableau");
        recharger();
      });
      app.appendChild(nav);
    }
    var zone = document.createElement("div");
    app.appendChild(zone);
    instance = window.Tableau.monter(zone, {
      tableau: tb, donnees: donnees, titreNiveau: 1,
      dateDonnees: new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })
    });
    if (source.mode === "widget") {
      var p = document.createElement("p");
      p.className = "fr-mt-2w";
      p.innerHTML = "<button type=\"button\" class=\"fr-btn fr-btn--sm fr-btn--tertiary fr-icon-refresh-line fr-btn--icon-left\">Actualiser les données</button> <a class=\"fr-btn fr-btn--sm fr-btn--tertiary\" href=\"editeur.html" + esc(location.search) + "\">Configurer</a>";
      p.querySelector("button").addEventListener("click", recharger);
      app.appendChild(p);
    }
  }

  var source = null, choixWidget = null, enCours = false;
  if (params.get("demo") !== null) {
    source = window.Donnees.sourceDemo("exemples/demo.json");
  } else if (params.get("grist")) {
    source = window.Donnees.sourceRest(params.get("grist"), params.get("table"));
    if (!source) { erreur("Lien incomplet", "Le lien doit indiquer le document Grist (?grist=…) et la table qui porte les réglages (&table=…)."); return; }
  } else if (dansGrist && window.grist) {
    source = window.Donnees.sourceWidget();
  }
  if (!source) {
    erreur("Aucun tableau de bord indiqué", "Ajoutez à l'adresse le lien d'un document Grist public (?grist=…&table=…), ou ?demo pour une démonstration.");
    return;
  }

  function recharger() {
    if (enCours) { return; }
    enCours = true;
    afficher(source, source.mode === "widget" ? choixWidget : params.get("tableau")).catch(function (e) {
      if (source.mode === "widget") { erreur("Lecture impossible", "Accordez l'accès complet au document à ce widget. (" + e.message + ")"); }
      else { erreur("Tableau de bord momentanément indisponible", "Les données n'ont pas pu être chargées. Vérifiez que le document Grist est partagé en lecture publique. (" + e.message + ")"); }
    }).then(function () { enCours = false; });
  }

  if (source.mode === "widget") {
    grist.ready({ requiredAccess: "full" });
    grist.onOptions(function (o) { if (o && o.tableau && o.tableau !== choixWidget) { choixWidget = o.tableau; recharger(); } });
    grist.onRecords(function () { recharger(); });
    setTimeout(recharger, 600);
  } else {
    recharger();
  }
})();
