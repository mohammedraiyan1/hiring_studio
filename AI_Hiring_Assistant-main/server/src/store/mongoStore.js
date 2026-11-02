import { MongoClient } from 'mongodb';
import { newId } from '../lib/ids.js';

/**
 * MongoDB driver behind the same interface as the file store. String `_id`s are
 * used throughout so documents are portable between the two backends.
 */
export async function createMongoStore({ uri, dbName }) {
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 8000 });
  await client.connect();
  const db = client.db(dbName);

  await db.collection('users').createIndex({ email: 1 }, { unique: true });
  await db.collection('candidates').createIndex({ roleId: 1 });
  await db.collection('interviews').createIndex({ candidateId: 1, userId: 1 }, { unique: true });
  await db.collection('roles').createIndex({ ownerId: 1, createdAt: -1 });
  await db.collection('auditEvents').createIndex({ organizationId: 1, createdAt: -1 });

  return {
    kind: 'mongodb',
    collection(name) {
      const col = db.collection(name);
      return {
        async insert(doc) {
          const record = { _id: doc._id ?? newId(), ...doc };
          await col.insertOne(record);
          return record;
        },
        find: (filter = {}, { sort } = {}) => col.find(filter).sort(sort ?? {}).toArray(),
        findOne: (filter = {}) => col.findOne(filter),
        findById: (id) => col.findOne({ _id: id }),
        async updateById(id, patch) {
          const result = await col.findOneAndUpdate(
            { _id: id },
            { $set: patch },
            { returnDocument: 'after' },
          );
          return result?.value ?? result ?? null;
        },
        async deleteById(id) {
          const { deletedCount } = await col.deleteOne({ _id: id });
          return deletedCount > 0;
        },
        async deleteMany(filter = {}) {
          const { deletedCount } = await col.deleteMany(filter);
          return deletedCount;
        },
      };
    },
    close: () => client.close(),
  };
}
