# grist-graphique

> **Widget de mise en page pour Grist, clé en main.** Il transforme les tables d'un document Grist en tableaux de bord au Système de design de l'État (DSFR) : indicateurs chiffrés, graphiques, tableaux croisés, filtres et données croisées d'un clic.

Tout se règle dans Grist, sans toucher au code. Le dépôt ne contient que le code : aucune donnée, aucun contenu propre à un usage.

## À quoi ça sert

Les graphiques intégrés à Grist offrent peu de types, peu de calculs et se règlent difficilement. Ce widget répond à un besoin plus large : **suivre une activité avec des indicateurs**, présenter des statistiques et les diffuser, en interne ou au public.

| Vous avez | Vous obtenez |
| --- | --- |
| Une ou plusieurs tables Grist (demandes, actions, inscriptions, dépenses, projets…) | Un ou plusieurs tableaux de bord, dans Grist ou en page web publique |
| Des dates | Des évolutions par jour, semaine, mois, trimestre ou année (année civile ou scolaire) |
| Des choix, des listes, des références | Des répartitions, des classements, des croisements |
| Des nombres | Des sommes, moyennes, médianes, minimums, maximums, parts en pourcentage |

Un graphique seul est un tableau de bord d'un seul bloc : un même outil couvre les deux usages.

Démonstration avec des données fictives : <https://lab17bis.github.io/grist-graphique/v1/?demo>

## Ce que le widget sait faire

- **Quatre types de blocs** :
  - **indicateur chiffré**, avec comparaison à la période précédente, objectif et barre de progression, petite courbe d'évolution ;
  - **graphique** ;
  - **tableau** croisé avec totaux, ou liste de lignes ;
  - **texte** de présentation ou de lecture.
- **13 graphiques** : barres verticales ou horizontales (côte à côte, empilées, à 100 %), courbes, aires, barres et courbe combinées sur deux axes, secteurs, anneau avec total, entonnoir, carte proportionnelle, radar, carte de chaleur, nuage de points, jauge.
- **Calculs** : nombre de lignes, valeurs différentes, somme, moyenne, médiane, minimum, maximum, cellules remplies, part des lignes qui vérifient une condition. Cumul, pourcentage, N premiers et « Autres ».
- **Croisement des données** :
  - une deuxième colonne pour croiser (une couleur par valeur) ;
  - des conditions par bloc ;
  - des filtres communs au tableau de bord (période, valeurs) ;
  - un **clic sur une barre ou une part filtre tout le tableau de bord**.
- **Plusieurs tables** dans un même tableau de bord. Les filtres s'appliquent à toutes les tables qui ont la colonne. Les références sont affichées par leur libellé, et une liste de choix compte pour chacune de ses valeurs.
- **Proposition automatique** : à partir d'une table, l'éditeur propose des indicateurs, une évolution dans le temps et des répartitions, à ajuster ensuite.
- **Plusieurs tableaux de bord** par document, avec une navigation entre eux.
- **Charte de l'État** :
  - en-tête et pied de page configurables (bloc-marque, logo, titre, boutons, liens), communs aux autres outils de la famille ;
  - couleurs illustratives du DSFR, police Marianne ;
  - reprise des couleurs des choix définies dans Grist.
- **Couleurs du DSFR, contrastes vérifiés** : les palettes n'utilisent que des tokens du DSFR et chaque couleur atteint au moins 3:1 sur fond blanc (RGAA, éléments graphiques). Les teintes claires du DSFR (moutarde, tournesol, macaron, terre battue…) sont remplacées par leurs variantes foncées. Contrôle automatique : `node tests/contrastes.js`. Les couleurs libres (sélecteur de couleur, couleurs des choix reprises de Grist, filet supérieur) sont contrôlées à l’affichage : sous 3:1, la teinte est remplacée par la palette DSFR.
- **Seuils d'alerte** : un indicateur peut porter deux seuils (« À surveiller », « Critique ») et le sens favorable. Il affiche alors un statut vert, orange ou rouge, en texte et en couleur. Utile pour le management visuel ([grist-management](https://github.com/lab17bis/grist-management)).
- **Accessibilité** : chaque graphique a sa table de données (« Voir les données »), une description pour les lecteurs d'écran, et des motifs pour distinguer les couleurs sans se fier à la teinte (automatiques au-delà de 4 couleurs, réglables : automatique, toujours, jamais).
- **Exports** : image PNG de chaque graphique, données CSV de chaque bloc, impression du tableau de bord.

## Le brancher en 5 minutes

1. **Partir du modèle** (recommandé) : téléchargez [`modele/modele-grist-graphique.grist`](modele/modele-grist-graphique.grist), puis importez-le dans Grist (*Ajouter › Importer un document*). Il contient une table d'exemple vide et les pages de l'éditeur et de la lecture. Vous pouvez aussi partir de votre propre document.
2. **Ajouter l'éditeur** : ajoutez une vue *Personnalisée* (sur n'importe quelle table : ses réglages y seront enregistrés), avec l'adresse `https://lab17bis.github.io/grist-graphique/v1/editeur.html`, et accordez l'**accès complet**.
3. **Composer** : cliquez sur *Proposer* pour partir d'une table, ou ajoutez vos blocs un à un. Chaque bloc ouvert montre son aperçu avec vos données. Cliquez sur *Enregistrer*.
4. **Consulter dans Grist** : ajoutez une seconde vue *Personnalisée* sur la même table, avec l'adresse `https://lab17bis.github.io/grist-graphique/v1/index.html` (accès complet). Chaque personne voit les données selon ses droits.
5. **Diffuser** (facultatif) : partagez le document en lecture publique. L'onglet *Publication* vérifie l'accès et donne le lien de la page :
   `https://lab17bis.github.io/grist-graphique/v1/?grist=<lien du document>&table=<table des réglages>`

## Le régler

| Onglet de l'éditeur | Ce qu'on y règle |
| --- | --- |
| Blocs | Tableaux de bord (titre, introduction, début de l'année), ajout, ordre, largeur et réglages de chaque bloc, avec aperçu immédiat |
| Filtres | Filtres affichés en haut du tableau de bord et valeur sélectionnée à l'ouverture |
| En-tête et pied | Logo, bloc-marque, titre, sous-titre, boutons, pied de page, mention d'accessibilité |
| Aperçu | Le tableau de bord complet, filtres et clics compris |
| Publication | Vue de lecture dans Grist, lien public, vérification de ce qui est lisible, code d'intégration, export et import des réglages |

Les réglages sont enregistrés en JSON dans la **description de la colonne `Config_graphique`** de la table où l'éditeur est placé. Ne supprimez pas cette colonne.

## Le reprendre et l'adapter

- **L'utiliser tel quel** : pointez vos documents Grist vers les adresses ci-dessus. Aucune installation n'est nécessaire.
- **L'héberger chez vous** : copiez le dépôt (*Fork*), activez GitHub Pages ou déposez les fichiers sur n'importe quel serveur web statique. Aucune compilation n'est nécessaire.
- **Réutiliser des tableaux de bord** : l'onglet *Publication* exporte et importe les réglages en JSON. Ils ne contiennent aucune donnée.
- **Modifier le code** :

| Fichier | Rôle |
| --- | --- |
| `index.html`, `js/lecture.js` | Page de lecture : publique, démonstration ou vue dans Grist |
| `editeur.html`, `js/editeur.js`, `css/editeur.css` | Éditeur (widget Grist) |
| `js/calcul.js` | Filtres, regroupements, agrégations, tableaux croisés, formats (sans accès réseau ni affichage) |
| `js/donnees.js` | Lecture des tables Grist : widget, API publique, démonstration |
| `js/tableau.js`, `css/tableau.css` | Rendu des tableaux de bord et des graphiques |
| `js/page-dsfr.js`, `js/page-editeur.js`, `css/page.css` | En-tête et pied de page configurables, communs aux outils `grist-*` |
| `exemples/demo.json` | Réglages et données fictives de la démonstration |
| `modele/` | Modèle de document Grist sans données, à importer |
| `vendor/` | DSFR 1.15.4 et [Apache ECharts](https://echarts.apache.org/) 6.1, embarqués |

## Fonctionnement et sécurité

```
Visiteur ──> page DSFR (ce dépôt, GitHub Pages)
         ──> Grist : tables lues avec les droits de la personne (widget) ou sans identifiant (page publique)
         ──> calculs et graphiques dans le navigateur
```

- Les calculs se font dans le navigateur, à partir des lignes que la personne a le droit de lire. Rien ne transite par GitHub.
- **Page publique** : la page lit le document comme un visiteur anonyme. Toutes les lignes et colonnes lisibles des tables utilisées sont donc consultables par l'API, pas seulement les chiffres affichés. Pour ne diffuser que des chiffres agrégés, faites calculer le tableau de bord sur des **tables de synthèse** Grist et réservez la lecture publique à celles-ci avec les règles d'accès. L'onglet *Publication* indique ce qui est lisible.
- Paramètres d'adresse : `?demo` pour la démonstration, `&tableau=<id>` pour ouvrir un tableau de bord précis, `&integre=1` pour masquer l'en-tête et le pied de page (intégration dans un autre site).

## Limites

- Les données sont recalculées dans le navigateur : au-delà de quelques dizaines de milliers de lignes, préférez des tables de synthèse.
- Dans Grist, le tableau de bord se recalcule quand la table des réglages change, ou avec le bouton *Actualiser les données*.
- Les filtres communs relient les tables par le **nom** de la colonne.
- Aucun audit RGAA n'a été mené.

## Version stable et version en cours

Dans Grist, utilisez l'adresse de la **version stable** : `https://lab17bis.github.io/grist-graphique/v1/`. Elle ne change que pour corriger un défaut, sans toucher aux tables ni aux réglages. Une évolution qui les modifie paraît sous une nouvelle adresse (`v2/`) : les documents déjà en service restent sur `v1/` tant que vous ne changez pas l'adresse du widget.

L'adresse sans numéro (`https://lab17bis.github.io/grist-graphique/`) suit la version en cours de développement. Elle sert à essayer les nouveautés ; ne l'utilisez pas pour un document en service.

Pour figer une nouvelle version stable après des tests réussis : `sh outils/figer-version.sh 1` (ou `2` pour une version qui change les tables), puis publiez le dépôt.

## Données partagées avec les autres outils

Plusieurs outils de la même famille peuvent travailler dans un même document Grist. Ils suivent une règle commune pour ne pas dupliquer les données :

- **Une seule table `Personnes`** par document. Colonne commune : `Nom`. Colonnes facultatives reconnues par tous : `Email` et `Structure` (référence à `Structures`). Un outil lit cette table si elle existe et la crée seulement si elle manque. Il n'y ajoute que ses propres colonnes.
- **Une seule table `Structures`** pour les équipes, services ou établissements : `Nom`, `Sigle`, `Type`, `Parent` (structure de rattachement).
- **Aucun outil ne supprime ni ne renomme** une table ou une colonne qu'il n'a pas créée.
- **Les autres tables portent des noms propres à chaque outil**, pour éviter les collisions (par exemple `Actions` pour grist-projet, `Actions_reunion` pour grist-reunion). Les réglages sont rangés dans la description d'une colonne technique propre à l'outil (`Config_…`).
- **Identifier la personne connectée** : un widget ne connaît pas l'adresse de la personne connectée. Les colonnes « créé par » utilisent une formule `user.Email` calculée à la création. Seul un outil qui doit relier la personne connectée à sa fiche crée la table `Comptes`.

Ce que fait cet outil : Il ne crée aucune table : il lit celles du document, `Personnes` et `Structures` comprises, ce qui permet par exemple de compter des personnes par structure.

## Espaces clés en main

Ce widget est déjà assemblé, avec d'autres, dans des **espaces** : des documents Grist complets à importer en une fois, vides ou avec un exemple fictif.

- [espace-pilotage](https://github.com/lab17bis/espace-pilotage) : piloter une équipe : management visuel, réunions, projets et indicateurs.
- [espace-accompagnement](https://github.com/lab17bis/espace-accompagnement) : suivre les sollicitations : offre de service, fiches contact, satisfaction et indicateurs.
- [espace-sondage](https://github.com/lab17bis/espace-sondage) : mener une enquête : questionnaire, suivi des répondants et indicateurs.

## Autres outils de la même famille

- [grist-catalogue](https://github.com/lab17bis/grist-catalogue) : widget de mise en page pour Grist, catalogue public de fiches au DSFR.
- [grist-questionnaire](https://github.com/lab17bis/grist-questionnaire) : widget de mise en page pour Grist, questionnaires au DSFR avec logique conditionnelle.
- [grist-projet](https://github.com/lab17bis/grist-projet) : widget-outil pour Grist, espace d'équipe pour gérer des projets au DSFR.
- [grist-reunion](https://github.com/lab17bis/grist-reunion) : widget-outil pour Grist, ordre du jour, notes, décisions, actions et compte rendu de réunion.
- [grist-management](https://github.com/lab17bis/grist-management) : widget-outil pour Grist, écran de management visuel d'équipe (météo, signalements, escalade), qui affiche aussi les données des autres widgets.

Ils partagent les mêmes réglages d'en-tête et de pied de page.

## Écosystème

- **[Grist](https://grist.numerique.gouv.fr)** : tableur-base de données libre ([gristlabs/grist-core](https://github.com/gristlabs/grist-core)), proposé aux agents publics par la [DINUM](https://www.numerique.gouv.fr/) dans [La Suite numérique](https://lasuite.numerique.gouv.fr/).
- **[Système de design de l'État (DSFR)](https://www.systeme-de-design.gouv.fr/)** ([GouvernementFR/dsfr](https://github.com/GouvernementFR/dsfr)). Son usage est réservé aux sites des services de l'État.
- **[Apache ECharts](https://echarts.apache.org/)** : bibliothèque de graphiques libre (licence Apache 2.0).
- **[Communauté Grist francophone](https://forum.grist.libre.sh/)**.

## Mots-clés

Grist, widget Grist, widget de mise en page, tableau de bord, indicateurs, KPI, graphiques, statistiques, data visualisation, dataviz, tableau croisé, suivi d'activité, pilotage, DSFR, Système de design de l'État, La Suite numérique, DINUM, service public, administration, clé en main, logiciel libre.

## Licence

Code sous licence MIT (voir `LICENSE`). Le DSFR (`vendor/dsfr/`) et Apache ECharts (`vendor/echarts/`, licence Apache 2.0) conservent leurs licences.

Conçu par le Lab 17 bis, laboratoire d'innovation publique de l'académie de Reims. Contact : <lab17bis@ac-reims.fr>
