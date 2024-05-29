require('dotenv').config();
const axios = require('axios');
const fs = require('fs');
const { exec } = require('child_process');
const mysql = require('mysql2');
const csvParser = require('csv-parser');

// URL du fichier ZIP à télécharger
const zipUrls = {
    etablissement: 'https://files.data.gouv.fr/insee-sirene/StockEtablissement_utf8.zip',
    uniteLegale: 'https://files.data.gouv.fr/insee-sirene/StockUniteLegale_utf8.zip'
};
const zipPaths = {
    etablissement: './files/StockEtablissement_utf8.zip',
    uniteLegale: './files/StockUniteLegale_utf8.zip'
};
const csvPaths = {
    etablissement: './files/StockEtablissement_utf8.csv',
    uniteLegale: './files/StockUniteLegale_utf8.csv'
};

let db;
const dbCredentials = {
    host: process.env.DB_HOST || '127.0.0.1',
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
};

async function main() {
    try {
        db = await connectToDatabase(dbCredentials);

        // Traitement du fichier StockEtablissement
        await downloadAndExtract(zipUrls.etablissement, zipPaths.etablissement, './files/');
        await updateDatabaseWithEtablissement(csvPaths.etablissement);

        // Traitement du fichier StockUniteLegale
        await downloadAndExtract(zipUrls.uniteLegale, zipPaths.uniteLegale, './files/');
        await updateDatabaseWithUniteLegale(csvPaths.uniteLegale);

        console.log('Mise à jour de la base de données terminée avec les deux fichiers');
    } catch (error) {
        console.error(`Erreur: ${error.message}`);
    } finally {
        if (db) {
            db.end();
        }
    }
}

main();

async function downloadAndExtract(url, zipPath, outputPath) {
    await downloadFile(url, zipPath);
    console.log('Fichier ZIP téléchargé');
    await extractZip(zipPath, outputPath);
    console.log('Fichier CSV extrait');
}

async function downloadFile(url, dest) {
    if (fs.existsSync(dest)) {
        console.log('Le fichier existe déjà, téléchargement ignoré.');
        return;
    }

    const writer = fs.createWriteStream(dest);
    const response = await axios({ url, method: 'GET', responseType: 'stream' });

    const totalLength = response.headers['content-length'];
    let downloadedLength = 0;
    response.data.on('data', (chunk) => {
        downloadedLength += chunk.length;
        let percent = (downloadedLength / totalLength * 100).toFixed(2);
        process.stdout.clearLine(0);
        process.stdout.cursorTo(0);
        process.stdout.write(`Téléchargement en cours : ${percent}%`);
    });

    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
        writer.on('finish', () => {
            console.log('\nFichier ZIP téléchargé');
            resolve();
        });
        writer.on('error', (error) => {
            reject(`Erreur lors du téléchargement du fichier: ${error.message}`);
        });
    });
}

async function extractZip(zipPath, outputPath) {
    return new Promise((resolve, reject) => {
        const command = `unzip -o "${zipPath}" -d "${outputPath}"`;

        exec(command, (error, stdout, stderr) => {
            if (error) {
                reject(`Erreur lors de l'extraction: ${error.message}`);
                return;
            }
            if (stderr) {
                reject(`Erreur lors de l'extraction: ${stderr}`);
                return;
            }
            resolve();
        });
    });
}

async function updateDatabaseWithEtablissement(csvFilePath) {
    const insertBatchSize = 5000; // Taille du lot d'insertion
    let batch = [];
    let count = 0;

    const processBatch = async (data) => {
        const query = `
            INSERT INTO ${process.env.DB_TABLE}
            (siren, siret, numeroVoieEtablissement, typeVoieEtablissement, libelleVoieEtablissement, codePostalEtablissement, libelleCommuneEtablissement) 
            VALUES ?
            ON DUPLICATE KEY UPDATE
            siret = VALUES(siret),
            numeroVoieEtablissement = VALUES(numeroVoieEtablissement),
            typeVoieEtablissement = VALUES(typeVoieEtablissement),
            libelleVoieEtablissement = VALUES(libelleVoieEtablissement),
            codePostalEtablissement = VALUES(codePostalEtablissement),
            libelleCommuneEtablissement = VALUES(libelleCommuneEtablissement)
        `;

        try {
            await db.query(query, [data]);
            count += data.length;
            process.stdout.clearLine(0);
            process.stdout.cursorTo(0);
            process.stdout.write(`Nombre de lignes insérées : ${count} lignes`);
        } catch (err) {
            console.error("Erreur lors de l'insertion du lot en base de données:", err);
        }
    };

    return new Promise((resolve, reject) => {
        const stream = fs.createReadStream(csvFilePath)
            .pipe(csvParser({ mapHeaders: ({ header }) => header }))
            .on('data', async (row) => {
                if (row.siret && row.etatAdministratifEtablissement == 'A') {
                    batch.push([
                        row.siren, 
                        row.siret, 
                        row.numeroVoieEtablissement, 
                        row.typeVoieEtablissement, 
                        row.libelleVoieEtablissement, 
                        row.codePostalEtablissement, 
                        row.libelleCommuneEtablissement
                    ]);

                    if (batch.length >= insertBatchSize) {
                        stream.pause();
                        await processBatch(batch);
                        batch = [];
                        stream.resume();
                    }
                }
            })
            .on('end', async () => {
                if (batch.length > 0) {
                    await processBatch(batch);
                }
                console.log('Mise à jour de la base de données avec StockEtablissement terminée');
                console.log(`Nombre d'enregistrements insérés: ${count}`);
                resolve();
            })
            .on('error', (err) => {
                console.error('Erreur lors du traitement du fichier CSV:', err);
                reject(err);
            });
    });
}

async function updateDatabaseWithUniteLegale(csvFilePath) {
    const updateBatchSize = 1000; // Taille du lot de mise à jour
    let batch = [];
    let count = 0;

    const processBatch = async (currentBatch) => {
        try {
            await db.beginTransaction();
            for (const row of currentBatch) {
                const query = `
                    UPDATE ${process.env.DB_TABLE} 
                    SET nomUniteLegale = ?, prenomUsuelUniteLegale = ?, denominationUniteLegale = ?
                    WHERE siren = ?`;
                const values = [
                    row.nomUniteLegale, 
                    row.prenomUsuelUniteLegale, 
                    row.denominationUniteLegale, 
                    row.siren
                ];
                await db.query(query, values);
            }
            await db.commit();
            count += currentBatch.length;
            process.stdout.clearLine(0);
            process.stdout.cursorTo(0);
            process.stdout.write(`Nombre de lignes mises à jour : ${count} lignes`);
        } catch (err) {
            await db.rollback();
            console.error('Erreur lors de la mise à jour du lot en base de données:', err);
        }
    };

    return new Promise((resolve, reject) => {
        const stream = fs.createReadStream(csvFilePath)
            .pipe(csvParser({ mapHeaders: ({ header }) => header }))
            .on('data', async (row) => {
                if (row.siren && row.etatAdministratifUniteLegale == 'A' && (row.prenomUsuelUniteLegale || row.nomUniteLegale || row.denominationUniteLegale)) {
                    batch.push({ 
                        siren: row.siren, 
                        denominationUniteLegale: row.denominationUniteLegale, 
                        nomUniteLegale: row.nomUniteLegale, 
                        prenomUsuelUniteLegale: row.prenomUsuelUniteLegale 
                    });

                    if (batch.length >= updateBatchSize) {
                        stream.pause();
                        await processBatch(batch);
                        batch = [];
                        stream.resume();
                    }
                }
            })
            .on('end', async () => {
                if (batch.length > 0) {
                    await processBatch(batch);
                }
                console.log('Mise à jour de la base de données avec StockUniteLegale terminée');
                resolve();
            })
            .on('error', (err) => {
                console.error('Erreur lors du traitement du fichier CSV:', err);
                reject(err);
            });
    });
}

function connectToDatabase(credentials) {
    return new Promise((resolve, reject) => {
        const db = mysql.createConnection(credentials).promise();
        db.connect()
            .then(() => resolve(db))
            .catch((error) => reject(error));
    });
}
