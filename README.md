# Perfo

Gestion de tâches par priorité 1 / 2 / 3, avec calendrier. PWA en HTML/CSS/JS vanilla et IndexedDB, sans dépendance.

## Mise en ligne (GitHub Pages)
1. Crée un dépôt (ex. `perfo`) et dépose tout le contenu de ce dossier à la racine.
2. Settings → Pages → Branch `main`, dossier `/ (root)`.
3. Ouvre `https://<compte>.github.io/perfo/` sur le téléphone → « Ajouter à l'écran d'accueil », ou passe l'URL dans PWABuilder pour l'APK.

## Mise à jour
Change `VERSION` dans `sw.js` à chaque publication, sinon le téléphone garde l'ancienne version en cache.

## Règles
- Accueil : uniquement les tâches à priorité, blocs 1 → 2 → 3, ordre réglé par glisser-déposer (poignée ⋮⋮, y compris d'un bloc à l'autre).
- Sablier (à chaque tâche terminée ou supprimée) : bloc 1 vide → les 2 montent en 1 dans le même ordre, les 3 montent en 2 ; bloc 2 vide → les 3 montent en 2.
- Une tâche a une priorité, une date, ou les deux. Date + heure optionnelle.
- Badge de l'icône calendrier = nombre de tâches datées du jour.
- À partir de 20 h (ou dès l'ouverture si la date est passée), chaque tâche datée encore présente déclenche la question : passer en 1/2/3 sans date, redater, supprimer, ou plus tard (1 h).
- Tâche cochée = supprimée, avec « Annuler » pendant 5 s.
- Menu ⋮ : export / import de sauvegarde JSON.
