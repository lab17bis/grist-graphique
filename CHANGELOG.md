# Journal des modifications

Les adresses `/v1/` ne changent pas : chaque version ajoute ou corrige, sans retirer ce qui existe.

## 2026-11-27 (adresse refusée)
- Publication : une adresse de page contenant l'identifiant long du document est refusée avec un message qui explique quoi copier (Grist ignore la page dans ce cas).

## 2026-11-27 (publication réservée)

### Ajouté

- Onglet Publication : section « Lien réservé aux personnes invitées » (collez l'adresse de la page Grist, le lien en consultation plein écran se construit) et rappel de la différence entre page publique et lien réservé.

## 2026-11-27 (parts et pourcentages)

### Corrigé
- Secteurs, anneau, entonnoir et treemap avec « Étiquettes en pourcentage » : le tableau « Voir les données » affichait les effectifs suivis d'un « % » (19 devenait « 19 % » au lieu de 70 %). Il montre maintenant l'effectif et, dans une colonne « Part », sa part du total, avec les décimales du réglage. L'infobulle, l'entonnoir, le treemap et le total au centre de l'anneau affichent l'effectif sans « % » collé ; seules les parts portent le « % ». Les tables et réglages ne changent pas.

## 2026-11-25 (mention de conception)

### Ajouté
- Mention discrète en pied de page, sur l'outil comme sur ses pages publiques : « Widget conçu par le Lab 17 bis, le laboratoire d'innovation publique de l'académie de Reims ».

## 2026-11-25 (audit de sécurité)

### Sécurité
- Les liens venant des données ou des réglages sont vérifiés par le navigateur lui-même : une adresse déguisée (« java⇥script: » avec tabulation, retour à la ligne ou caractère de contrôle) n'est plus acceptée. Elle permettait, sur le portail, d'exécuter du script au clic depuis une adresse fabriquée.
- Politique de sécurité de contenu stricte : seuls les scripts du site, l'API Grist et les scripts de la page connus par leur empreinte peuvent s'exécuter. L'évaluation de texte (« unsafe-eval ») reste permise : l'API officielle de Grist en a besoin (sans elle, les widgets restaient bloqués sur « Chargement… » dans Grist le 25/11 au matin). Un script injecté (lien javascript:, attribut onerror…) est bloqué même si un filtre le laissait passer.
- Feuilles de style du DSFR chargées depuis le CDN : empreinte d'intégrité (SRI), le navigateur refuse un fichier modifié.
- Code d'intégration (iframe) : le titre est échappé, un guillemet ne casse plus le code collé sur un autre site.

## 2026-11-24 (durcissement)

### Sécurité
- Les pages ajoutent une politique de sécurité de contenu minimale (pas d'objets embarqués, pas de balise base).

## 2026-11-24 (documentation)

### Modifié
- Documentation : l'outil de consultation s'appelle désormais `grist-consultation` (ancien nom `grist-decision`).

## 2026-11-24

### Ajouté
- Page de lecture (`index.html`) dans Grist : bouton « Configurer » qui ouvre l'éditeur, à côté de « Actualiser les données ».
- Éditeur (`editeur.html`) : bouton « Voir le tableau de bord » dans la barre du haut.

### Modifié
- Quand le document n'a pas encore de tableau de bord, la page de lecture ne montre plus seulement un message : elle propose le bouton « Configurer le tableau de bord ». Un seul widget suffit pour commencer.
- L'éditeur garde ses cinq onglets (Blocs, Filtres, En-tête et pied, Aperçu, Publication) et les adresses `editeur.html` et `index.html` restent valables.

## Versions antérieures

Voir l'historique des commits.
