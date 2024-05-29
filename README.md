# Création d'une base de donnée interne des société Française

Ce script Node.js permet de créer ou mettre à jour une base de données MySQL avec les informations des établissements et des unités légales françaises à partir des fichiers publiés sur [files.data.gouv.fr](https://files.data.gouv.fr).

## Fonctionnalités

- Téléchargement des fichiers ZIP contenant les données des établissements et des unités légales
- Extraction des fichiers CSV depuis les ZIP téléchargés
- Mise à jour de la base de données MySQL avec les informations des fichiers CSV

## Prérequis

- Node.js
- MySQL

## Installation

1. Clonez le dépôt :
    ```bash
    git clone <url-du-dépôt>
    cd <nom-du-répertoire>
    ```

2. Installez les dépendances :
    ```bash
    npm install
    ```

3. Créez un fichier `.env` à la racine du projet et configurez vos identifiants de base de données :
    ```dotenv
    DB_HOST=127.0.0.1
    DB_USER=<votre-utilisateur>
    DB_PASSWORD=<votre-mot-de-passe>
    DB_DATABASE=<votre-base-de-données>
    DB_TABLE=<votre-table>
    ```

## Utilisation

Lancez le script avec la commande suivante :
```bash
node main.js
```

Le script va :
1. Télécharger les fichiers ZIP depuis les URLs spécifiées
2. Extraire les fichiers CSV contenus dans les ZIP
3. Insérer les données des établissements et des unités légales dans la base de données MySQL

## Dépendances

- [axios](https://www.npmjs.com/package/axios)
- [dotenv](https://www.npmjs.com/package/dotenv)
- [fs](https://nodejs.org/api/fs.html)
- [child_process](https://nodejs.org/api/child_process.html)
- [mysql2](https://www.npmjs.com/package/mysql2)
- [csv-parser](https://www.npmjs.com/package/csv-parser)

## Auteurs

- [Lucas S](https://github.com/lucassab31)

## Licence

Ce projet est sous licence MIT. Voir le fichier [LICENSE](LICENSE) pour plus de détails.
