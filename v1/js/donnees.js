/*
 * Lecture des données Grist pour les tableaux de bord.
 *
 * Trois sources, même interface :
 *   Donnees.sourceWidget()          : widget dans Grist, droits de la personne connectée
 *   Donnees.sourceRest(lien, table) : page publique, document partagé en lecture publique
 *   Donnees.sourceDemo(url)         : démonstration, fichier JSON de données fictives
 *
 * source.schema()        -> { tables: { T: { colonnes: { c: {type, libelle, choix, couleurs, ref, refCol} } } } }
 * source.config()        -> réglages (JSON de la description de la colonne Config_graphique de la table hôte)
 * source.charger([T…])   -> { T: { lignes: […], colonnes: {…} } }, références remplacées par leur libellé
 */
(function (global) {
  "use strict";

  var NOM_COLONNE_CONFIG = "Config_graphique";
  var CACHEES = /^(manualSort|gristHelper_|Config_)/;

  function enLignes(t) {
    var cles = Object.keys(t);
    return (t.id || []).map(function (_, i) { var o = {}; cles.forEach(function (k) { o[k] = t[k][i]; }); return o; });
  }
  function lireJSON(s) { try { return s ? JSON.parse(s) : null; } catch (e) { return null; } }
  async function json(r) { if (!r.ok) { throw new Error("Erreur " + r.status); } return r.json(); }

  function decrireColonne(c) {
    var o = lireJSON(c.widgetOptions) || {};
    var type = c.type || "Any";
    var d = { type: type, libelle: c.label || c.colId, formule: !!c.isFormula && !!c.formula };
    if (o.choices) { d.choix = o.choices.slice(); }
    if (o.choiceOptions) {
      d.couleurs = {};
      Object.keys(o.choiceOptions).forEach(function (k) { if (o.choiceOptions[k].fillColor) { d.couleurs[k] = o.choiceOptions[k].fillColor; } });
    }
    if (o.currency || o.numMode === "currency") { d.unite = "€"; }
    if (o.numMode === "percent") { d.pourcent = true; }
    var m = /^Ref(List)?:(.+)$/.exec(type);
    if (m) { d.ref = m[2]; d.refListe = !!m[1]; }
    return d;
  }

  // Construit le schéma à partir des métadonnées (_grist_Tables, _grist_Tables_column).
  function schemaDepuisMeta(tables, cols) {
    var parRef = {}, colParRef = {};
    tables.forEach(function (t) { parRef[t.id] = t.tableId; });
    cols.forEach(function (c) { colParRef[c.id] = c.colId; });
    var s = { tables: {} };
    tables.forEach(function (t) {
      if (!t.tableId || /^_grist/.test(t.tableId)) { return; }
      s.tables[t.tableId] = { colonnes: {}, resume: !!t.summarySourceTable };
    });
    cols.forEach(function (c) {
      var tid = parRef[c.parentId];
      if (!s.tables[tid] || CACHEES.test(c.colId) || c.colId === "id") { return; }
      var d = decrireColonne(c);
      if (d.ref && c.visibleCol) { d.refCol = colParRef[c.visibleCol]; }
      s.tables[tid].colonnes[c.colId] = d;
    });
    return s;
  }

  // Remplace les identifiants de références par le libellé de la ligne visée.
  function resoudre(t, schema, chargees) {
    Object.keys(t.colonnes).forEach(function (c) {
      var d = t.colonnes[c];
      if (!d.ref) { return; }
      var cible = chargees[d.ref];
      var champ = d.refCol;
      var index = {};
      if (cible && champ) { cible.lignes.forEach(function (r) { index[r.id] = r[champ]; }); }
      function lib(id) {
        if (!id) { return null; }
        var v = index[id];
        if (v === undefined || v === null || v === "") { return cible && champ ? null : "#" + id; }
        if (typeof v === "number" && /^Date/.test(((schema.tables[d.ref] || {}).colonnes[champ] || {}).type || "")) {
          return new Date(v * 1000).toLocaleDateString("fr-FR", { timeZone: "UTC" });
        }
        return Array.isArray(v) ? v.slice(v[0] === "L" ? 1 : 0).join(", ") : String(v);
      }
      t.lignes.forEach(function (r) {
        var v = r[c];
        if (Array.isArray(v)) { r[c] = ["L"].concat((v[0] === "L" ? v.slice(1) : v).map(lib).filter(function (x) { return x !== null; })); }
        else { r[c] = lib(v); }
      });
      d.type = d.refListe ? "ChoiceList" : "Text";
      d.reference = true;
    });
  }

  function tablesAvecReferences(noms, schema) {
    var out = [];
    noms.forEach(function (n) {
      if (!schema.tables[n] || out.indexOf(n) >= 0) { return; }
      out.push(n);
    });
    noms.forEach(function (n) {
      var t = schema.tables[n]; if (!t) { return; }
      Object.keys(t.colonnes).forEach(function (c) { var r = t.colonnes[c].ref; if (r && schema.tables[r] && out.indexOf(r) < 0) { out.push(r); } });
    });
    return out;
  }

  function assembler(noms, brutes, schema) {
    var res = {};
    Object.keys(brutes).forEach(function (n) {
      res[n] = { lignes: brutes[n], colonnes: JSON.parse(JSON.stringify(schema.tables[n].colonnes)) };
    });
    var finales = {};
    noms.forEach(function (n) {
      if (!res[n]) { return; }
      var copie = { lignes: res[n].lignes.map(function (r) { return Object.assign({}, r); }), colonnes: res[n].colonnes };
      resoudre(copie, schema, res);
      finales[n] = copie;
    });
    return finales;
  }

  /* ---------- Widget dans Grist ---------- */

  function sourceWidget() {
    var meta = null;
    async function lireMeta() {
      var t = enLignes(await grist.docApi.fetchTable("_grist_Tables"));
      var c = enLignes(await grist.docApi.fetchTable("_grist_Tables_column"));
      meta = { tables: t, colonnes: c, schema: schemaDepuisMeta(t, c) };
      return meta;
    }
    return {
      mode: "widget",
      schema: async function () { return (await lireMeta()).schema; },
      tableHote: function () { return grist.selectedTable.getTableId(); },
      config: async function () {
        var hote = await grist.selectedTable.getTableId();
        var m = meta || await lireMeta();
        var ref = (m.tables.find(function (t) { return t.tableId === hote; }) || {}).id;
        var col = m.colonnes.find(function (c) { return c.parentId === ref && c.colId === NOM_COLONNE_CONFIG; });
        return { hote: hote, existe: !!col, config: col ? lireJSON(col.description) : null };
      },
      charger: async function (noms) {
        var schema = (meta || await lireMeta()).schema;
        var a = tablesAvecReferences(noms, schema), brutes = {};
        await Promise.all(a.map(async function (n) { brutes[n] = enLignes(await grist.docApi.fetchTable(n)); }));
        return assembler(noms, brutes, schema);
      },
      rafraichirMeta: lireMeta
    };
  }

  /* ---------- Page publique ---------- */

  function analyserLienDocument(lien) {
    try {
      var u = new URL(String(lien).trim());
      var seg = u.pathname.split("/").filter(Boolean);
      var org = "";
      if (seg[0] === "o") { org = seg[1]; seg = seg.slice(2); }
      var doc = seg[0] === "doc" ? seg[1] : (seg[0] === "api" && seg[1] === "docs" ? seg[2] : seg[0]);
      if (!doc || doc === "api" || doc === "forms") { return null; }
      return { origine: u.origin, organisation: org, doc: doc, base: u.origin + (org ? "/o/" + org : "") + "/api/docs/" + doc };
    } catch (e) { return null; }
  }

  function sourceRest(lien, hote) {
    var cible = analyserLienDocument(lien);
    if (!cible || !hote) { return null; }
    var base = cible.base, schema = null, colsBrutes = {};
    async function colonnes(t) {
      if (!colsBrutes[t]) { colsBrutes[t] = fetch(base + "/tables/" + encodeURIComponent(t) + "/columns?hidden=true").then(json).then(function (r) { return r.columns; }); }
      return colsBrutes[t];
    }
    return {
      mode: "public",
      base: base,
      schema: async function () {
        if (schema) { return schema; }
        var liste = await fetch(base + "/tables").then(json);
        var tables = [], cols = [];
        await Promise.all(liste.tables.map(async function (t, i) {
          tables.push({ id: i + 1, tableId: t.id });
          try {
            (await colonnes(t.id)).forEach(function (c) {
              cols.push(Object.assign({}, c.fields, { colId: c.id, parentId: i + 1, id: c.fields.colRef }));
            });
          } catch (e) { /* table illisible : ignorée */ }
        }));
        schema = schemaDepuisMeta(tables, cols);
        return schema;
      },
      tableHote: function () { return Promise.resolve(hote); },
      config: async function () {
        var cols = await colonnes(hote);
        var c = cols.find(function (x) { return x.id === NOM_COLONNE_CONFIG; });
        return { hote: hote, existe: !!c, config: c ? lireJSON(c.fields.description) : null };
      },
      charger: async function (noms) {
        var s = await this.schema();
        var a = tablesAvecReferences(noms, s), brutes = {};
        await Promise.all(a.map(async function (n) {
          try {
            var r = await fetch(base + "/tables/" + encodeURIComponent(n) + "/records").then(json);
            brutes[n] = r.records.map(function (x) { return Object.assign({ id: x.id }, x.fields); });
          } catch (e) { if (noms.indexOf(n) >= 0) { throw new Error("Table « " + n + " » illisible (" + e.message + ")"); } }
        }));
        return assembler(noms, brutes, s);
      }
    };
  }

  /* ---------- Démonstration ---------- */

  function sourceDemo(url) {
    var d = null;
    async function lire() { if (!d) { d = await fetch(url).then(json); } return d; }
    return {
      mode: "demo",
      schema: async function () {
        var x = await lire(), s = { tables: {} };
        Object.keys(x.tables).forEach(function (t) { s.tables[t] = { colonnes: x.tables[t].colonnes }; });
        return s;
      },
      tableHote: function () { return Promise.resolve(Object.keys(d ? d.tables : {})[0] || ""); },
      config: async function () { var x = await lire(); return { hote: "", existe: true, config: x.config }; },
      charger: async function (noms) {
        var x = await lire(), out = {};
        noms.forEach(function (n) { if (x.tables[n]) { out[n] = { lignes: x.tables[n].lignes.map(function (r) { return Object.assign({}, r); }), colonnes: x.tables[n].colonnes }; } });
        return out;
      }
    };
  }

  global.Donnees = {
    NOM_COLONNE_CONFIG: NOM_COLONNE_CONFIG,
    sourceWidget: sourceWidget, sourceRest: sourceRest, sourceDemo: sourceDemo,
    analyserLienDocument: analyserLienDocument, schemaDepuisMeta: schemaDepuisMeta, enLignes: enLignes
  };
})(typeof window !== "undefined" ? window : globalThis);
