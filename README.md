# 🎬 CrowdBunkerPlayer

> Transformez CrowdBunker en une véritable plateforme avec lecture automatique, playlists et mode aléatoire.

CrowdBunkerPlayer est un **userscript** compatible **Violentmonkey** et **Tampermonkey** qui ajoute des fonctionnalités avancées de gestion de playlists directement dans CrowdBunker, sans modifier le site ni nécessiter de serveur.

Toutes les données restent stockées localement dans votre navigateur.

---

## ✨ Fonctionnalités

### 🎥 Lecture

* Lecture automatique de la vidéo suivante
* Lecture continue des listes CrowdBunker (`?list=...`)
* Lecture automatique après la fin de la vidéo
* Lecture/Pause
* Vidéo précédente
* Vidéo suivante
* Reprise automatique après rechargement

---

### 📋 Playlists

* Ajouter une vidéo à une playlist
* Supprimer une vidéo
* Réorganiser les vidéos
* Créer plusieurs playlists
* Sauvegarde automatique
* Import/Export JSON
* Duplication d'une playlist
* Renommage

---

### 🔀 Modes de lecture

* Lecture normale
* Shuffle (ordre aléatoire)
* Répéter la playlist
* Répéter une seule vidéo
* Lecture continue

---

### 💾 Sauvegarde

Toutes les informations sont enregistrées localement :

* playlists
* préférences
* mode shuffle
* mode boucle
* dernière vidéo lue
* position dans la playlist

Aucune donnée n'est envoyée à un serveur.

---

### 🎛 Interface

Le script ajoute une barre latérale intégrée comprenant :

* Playlist actuelle
* Boutons Lecture/Pause
* Suivant
* Précédent
* Shuffle
* Boucle
* Import
* Export
* Paramètres

---

## 🚀 Installation

### 1. Installer Violentmonkey

Navigateurs compatibles :

* Brave
* LibreWolf
* Firefox
* Chrome
* Edge

Installer l'extension :

https://violentmonkey.github.io/

ou

https://www.tampermonkey.net/

---

### 2. Installer le script

Créer un nouveau script.

Coller le contenu du fichier :

```
PlaylistController.js
```

Enregistrer.

Actualiser CrowdBunker.

---

## 🖥 Compatibilité

| Navigateur | Compatible |
| ---------- | ---------- |
| Brave      | ✅          |
| LibreWolf  | ✅          |
| Firefox    | ✅          |
| Chrome     | ✅          |
| Edge       | ✅          |

---

## ⚙ Fonctionnement

Le script détecte automatiquement :

* le lecteur vidéo
* la playlist CrowdBunker
* la vidéo actuellement ouverte

Lorsqu'une vidéo est terminée :

* la suivante est sélectionnée automatiquement ;
* si le mode **Shuffle** est activé, une vidéo aléatoire est choisie ;
* si le mode **Boucle** est activé, la playlist recommence une fois terminée.

---

## 📦 Stockage

Le script utilise uniquement :

* `localStorage`

Aucune connexion réseau supplémentaire n'est effectuée.

---

## 📁 Structure du projet

```
CrowdBunkerPlayer/

├── README.md
├── LICENSE
├── CHANGELOG.md
├── PlaylistController.js
├── icons/
│   ├── icon32.png
│   ├── icon64.png
│   └── icon128.png
├── screenshots/
│   ├── player.png
│   ├── playlist.png
│   └── shuffle.png
└── docs/
    └── architecture.md
```

---

## 📸 Captures d'écran

À venir.

---

## 🗺 Feuille de route

### Version 1.0

* [ ] Lecture automatique
* [ ] Bouton Suivant
* [ ] Bouton Précédent
* [ ] Shuffle
* [ ] Boucle
* [ ] Sauvegarde locale
* [ ] Import/Ex
* [ ] Import/Export

---

## 🤝 Contribuer

Les contributions sont les bienvenues.

Vous pouvez :

* signaler un bug ;
* proposer une amélioration ;
* ouvrir une Pull Request ;
* suggérer une nouvelle fonctionnalité.

---

## 📄 Licence

Distribué sous licence **MIT**.

Voir le fichier `LICENSE`.

---

## ⚠ Avertissement

Ce projet est indépendant de CrowdBunker.

Il ne modifie pas les vidéos, ne contourne pas les restrictions du site et n'interagit avec aucun service externe. Il améliore uniquement l'expérience utilisateur côté navigateur à l'aide d'un userscript.

---

## ⭐ Soutenir le projet

Si ce projet vous est utile :

⭐ Ajoutez une étoile sur GitHub.

Les suggestions et retours sont toujours appréciés.
