import {
  MongoClient,
  ObjectId,
} from "https://deno.land/x/mongo@v0.31.0/mod.ts";

import { MongoService } from "../mod.ts";

const client = new MongoClient();

// Connecting to a Local Database
await client.connect("mongodb://127.0.0.1:27017");

// Defining schema interface
interface EmployeeSchema {
  _id: ObjectId;
  names: string;
  email: string;
}

const db = client.database("rwarrims");
const employees = db.collection<EmployeeSchema>("employees");

const Employees = new MongoService<EmployeeSchema>({
  Model: employees,
  paginate: {
    default: 10,
    max: 50,
  },
});

Employees
  .find()
  .then(console.log);
