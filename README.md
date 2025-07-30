# Site de Bios

Ce projet propose une petite application sans dépendances externes permettant :

- la création d'un compte (un seul compte par adresse IP)
- la connexion/déconnexion
- la modification d'une page de biographie
- la personnalisation des couleurs de sa page
- l'ajout d'une bannière en téléversant une image

## Utilisation

1. Lancez le serveur :
   ```bash
   node server.js
   ```
2. Ouvrez votre navigateur à l'adresse [http://localhost:3000](http://localhost:3000)
Toutes les données sont enregistrées dans `db.json` à la racine du projet.

Les pages principales sont : /login, /register, /dashboard, /customise et /<nom_utilisateur>
La page `/customise` permet maintenant de choisir les couleurs et de téléverser une bannière qui s'affichera en haut de votre bio.
