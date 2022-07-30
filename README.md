# feathers-mongo

An adapter for [FeathersJS](http://feathersjs.com) that uses [mongo](https://deno.land/x/mongo) as its backend for Deno.

## Feathers

This is a [FeathersJS database adapter](https://docs.feathersjs.com/api/databases/adapters.html) so it supports the existing Common API and Querying syntax. Visit the feathers docs to view the API.

## Usage

```ts
import {
  MongoClient,
} from "https://deno.land/x/mongo/mod.ts";

import {
  MongoService
} from "https://deno.land/x/feathers-mongo/mod.ts";

const client = new MongoClient();

await client.connect("mongodb://127.0.0.1:27017");

interface UserSchema {
  _id: ObjectId;
  username: string;
  password: string;
  age: number;
}

const db = client.database("test");
const users = db.collection<UserSchema>("users");

const Users = new MongoService<UserSchema>({
  // set the collection
  Model: users,
  // default pagination options
  paginate: {
    default: 10,
    max: 50
  },
  // allow creating multiple items at once
  multi: true,
})
```

## Create

```ts
Users.create({
  username: "user",
  password: "notsecure",
  age: 20,
});

// create multiple items (requires the `multi` option to be true)
Users.create([
  {
    username: "many",
    password: "notsecure",
    age: 21,
  },
  {
    username: "users",
    password: "notsecure",
    age: 22,
  }
]);
```

## Find

```ts
// find one item
Users.get("62e5362d75e5bef94ed2edc4");

// run a query
Users.find({
  query: {
    username: {
      $ne: null
    }
  }
});

// find by query
Users.find({
  query: {
    _id: new ObjectId("62e5362d75e5bef94ed2edc4")
  }
});

// override pagination
Users.find({}, {
  paginate: {
    max: 5,
    default: 5,
  }
})

// Querying
Users.find({
  query: {
    // equality
    username: "johndoe",
    // limit
    $limit: 5,
    // skip
    $skip: 2,
    // sort
    $sort: {
      username: 1,
    },
    // projections (_id will always be selected)
    $select: [
      "username",
      "password"
    ],
    password: {
      // arrays (in and not in)
      $in: ["a","b"],
      $nin: ["c", "d"],
    },
    age: {
      // less than & greater than
      $lt: 30,
      $gt: 10,
      // not equal
      $ne: 10,
      // or
      $or: [
        21,
        22
      ]
    }
  }
})
```

> Notes:
>
> - You can use any supported mongo [`Filter`](https://doc.deno.land/https://deno.land/x/mongo/mod.ts/~/Filter) in `query`
> - Search is not yet supported

## Update

```ts
// patch only sets the provided attributes
Users.patch("62e5362d75e5bef94ed2edc4", {
  username: "modified"
})

// update replaces the item entirely
Users.update("62e5362d75e5bef94ed2edc4", {
  username: "full",
  password: "modified",
  age: 23,
})
```

## Delete

```ts
Users.remove("62e5362d75e5bef94ed2edc4")
```
