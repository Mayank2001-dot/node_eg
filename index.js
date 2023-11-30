import fetch from 'node-fetch';
import sqlite3 from 'sqlite3';

async function fetchDataFromApi(startDate, numberOfMonths) {
  const headers = new Headers();
  headers.append("x-api-key", "8ab5ec5a9a8e0b7cf7132dc1b891c7c5");

  const endDate = new Date(startDate);
  endDate.setMonth(endDate.getMonth() + numberOfMonths);

  const delayBetweenRequests = 2000; 

  const fetchedData = [];

  for (let currentDate = new Date(startDate); currentDate <= endDate; currentDate.setDate(currentDate.getDate() + 1)) {
    const formattedDate = formatDate(currentDate);
    const url = `https://leap-api.tickete.co/api/v1/inventory/14?date=${formattedDate}`;
    console.log(startDate);

    try {
      const myPost = await fetch(url, {
        method: "GET",
        headers: headers,
      });

      const response = await myPost.json();
      console.log(`Data for ${formattedDate}:`, response);

      fetchedData.push(response);
    } catch (error) {
      console.error(`Error fetching data for ${formattedDate}:`, error.message);
    }

    await new Promise(resolve => setTimeout(resolve, delayBetweenRequests));
  }

  return fetchedData;
}

function connectToDatabase(databaseName) {
  return new sqlite3.Database(databaseName);
}


async function createTables(db) {

  await db.run(`
    CREATE TABLE inventory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      startDate TEXT,
      startTime TEXT,
      endTime TEXT,
      providerSlotId TEXT,
      remaining INTEGER,
      currencyCode TEXT,
      variantId INTEGER
    )
  `);


  await db.run(`
    CREATE TABLE paxAvailability (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      inventoryId INTEGER,
      max INTEGER,
      min INTEGER,
      remaining INTEGER,
      type TEXT,
      isPrimary INTEGER,
      description TEXT,
      name TEXT
    )
  `);

  await db.run(`
    CREATE TABLE price (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      paxAvailabilityId INTEGER,
      discount REAL,
      finalPrice REAL,
      originalPrice REAL,
      currencyCode TEXT
    )
  `);
}


async function insertDataIntoTables(db, data) {

  await db.run("BEGIN TRANSACTION");

  const insertInventoryStatement = db.prepare(`
    INSERT INTO inventory (startDate, startTime, endTime, providerSlotId, remaining, currencyCode, variantId)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const insertPaxAvailabilityStatement = db.prepare(`
    INSERT INTO paxAvailability (inventoryId, max, min, remaining, type, isPrimary, description, name)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertPriceStatement = db.prepare(`
    INSERT INTO price (paxAvailabilityId, discount, finalPrice, originalPrice, currencyCode)
    VALUES (?, ?, ?, ?, ?)
  `);

  for (const inventoryItem of data) {

    insertInventoryStatement.run(
      inventoryItem.startDate,
      inventoryItem.startTime,
      inventoryItem.endTime,
      inventoryItem.providerSlotId,
      inventoryItem.remaining,
      inventoryItem.currencyCode,
      inventoryItem.variantId
    );

    const inventoryId = insertInventoryStatement.lastID;

    for (const paxAvailability of inventoryItem.paxAvailability) {

      insertPaxAvailabilityStatement.run(
        inventoryId,
        paxAvailability.max,
        paxAvailability.min,
        paxAvailability.remaining,
        paxAvailability.type,
        paxAvailability.isPrimary,
        paxAvailability.description,
        paxAvailability.name
      );

      const paxAvailabilityId = insertPaxAvailabilityStatement.lastID;


      insertPriceStatement.run(
        paxAvailabilityId,
        paxAvailability.price.discount,
        paxAvailability.price.finalPrice,
        paxAvailability.price.originalPrice,
        paxAvailability.price.currencyCode
      );
    }
  }

  await db.run("COMMIT");
  insertInventoryStatement.finalize();
  insertPaxAvailabilityStatement.finalize();
  insertPriceStatement.finalize();
}

function closeDatabase(db) {
  db.close();
}


async function main() {
  const databaseName = 'test.db';
  const startDate = '2023-11-25';
  const numberOfMonths = 2;

  const db = connectToDatabase(databaseName);

  try {

    await createTables(db);

    const fetchedData = await fetchDataFromApi(startDate, numberOfMonths);

    await insertDataIntoTables(db, fetchedData);
  } catch (error) {
    console.error('An error occurred:', error.message);
  } finally {
    closeDatabase(db);
  }
}


function formatDate(date) {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
}


main();
