// Contrôle des contrastes des palettes (sans dépendance) : node tests/contrastes.js
// Seuils RGAA / WCAG : 3:1 pour un élément graphique, 4,5:1 pour du texte, sur fond blanc.
var fs = require("fs"), path = require("path");
var src = fs.readFileSync(path.join(__dirname, "..", "js", "tableau.js"), "utf8");
function lum(h) {
  var c = [1, 3, 5].map(function (i) { var x = parseInt(h.substr(i, 2), 16) / 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function ratio(h) { return 1.05 / (lum(h) + 0.05); }
var bloc = src.match(/var PALETTES = \{([\s\S]*?)\n  \};/)[1];
var erreurs = 0;
bloc.split("\n").forEach(function (l) {
  var m = l.match(/^\s*(\w+):/); if (!m) { return; }
  (l.match(/#[0-9A-Fa-f]{6}/g) || []).forEach(function (c) {
    var r = ratio(c);
    if (r < 3) { erreurs++; console.log("ÉCHEC  " + m[1] + " " + c + " " + r.toFixed(2) + ":1 (< 3:1)"); }
  });
});
var texte = { GRIS: (src.match(/GRIS = "(#[0-9a-fA-F]{6})"/) || [])[1], GRIS_CLAIR: (src.match(/GRIS_CLAIR = "(#[0-9a-fA-F]{6})"/) || [])[1] };
Object.keys(texte).forEach(function (k) { var r = ratio(texte[k]); if (r < 4.5) { erreurs++; console.log("ÉCHEC  texte " + k + " " + texte[k] + " " + r.toFixed(2) + ":1 (< 4,5:1)"); } });
console.log(erreurs ? erreurs + " échec(s)" : "Contrastes OK : palettes ≥ 3:1, textes ≥ 4,5:1");
process.exit(erreurs ? 1 : 0);
