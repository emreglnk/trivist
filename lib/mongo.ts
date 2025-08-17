import { MongoClient, Db } from "mongodb";

let client: MongoClient | null = null;
let db: Db | null = null;

const uri = process.env.MONGODB_URI || "mongodb://admin:hugeMongo2024!@dev.iyi.im:27017/quizdb";
const dbName = process.env.MONGODB_DB || "quizdb";

export async function getDb(): Promise<Db> {
  if (db && client) return db;
  if (!uri) throw new Error("MONGODB_URI not set");
  client = new MongoClient(uri);
  await client.connect();
  db = client.db(dbName);
  return db;
}

export async function closeDb(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
    db = null;
  }
}


