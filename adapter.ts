// deno-lint-ignore-file no-explicit-any
import {
  _,
  commons,
  AdapterParams,
  AdapterQuery,
  AdapterServiceOptions,
  CountOptions,
  DeleteOptions,
  FindOptions,
  Id,
  InsertOptions,
  NotFound,
  NullableId,
  ObjectId,
  PaginationOptions,
  UpdateOptions,
  Filter
} from "./deps.ts";
import type { Collection } from "./deps.ts";

import { errorHandler } from "./errorHandler.ts";

const {
  AdapterBase,
  select
} = commons;

export interface Paginated<T> {
  total: number;
  limit: number;
  skip: number;
  data: T[];
}

interface MongoAdapterOptions<Item = any> extends AdapterServiceOptions {
  Model: Collection<Item> | Promise<Collection<Item>>;
  disableObjectify?: boolean;
  useEstimatedDocumentCount?: boolean;
}

export interface MongoAdapterParams<Item = any, Query = AdapterQuery>
  extends Omit<AdapterParams<Query, Partial<MongoAdapterOptions>>, "query"> {
  mongo?:
  | FindOptions
  | InsertOptions
  | DeleteOptions
  | CountOptions
  | UpdateOptions;
  query?: Filter<Item> & AdapterQuery
}

export class MongoAdapter<
  Item,
  Body = Partial<Item>,
  Params extends MongoAdapterParams<any> = MongoAdapterParams<Item>,
  > extends AdapterBase<Item, Body, Params, MongoAdapterOptions> {
  constructor(options: MongoAdapterOptions) {
    if (!options) {
      throw new Error("Mongo options have to be provided");
    }

    super({
      id: "_id",
      ...options,
    });
  }

  getObjectId(id: Id | ObjectId) {
    if (this.options.disableObjectify) {
      return id;
    }

    if (this.id === "_id" && ObjectId.isValid(id)) {
      id = new ObjectId(id.toString());
    }

    return id;
  }

  optionsFilter(id: NullableId, params: Params) {
    const { $select, $sort, $limit, $skip, ...query } =
      (params.query || {}) as AdapterQuery;

    if (id !== null) {
      query.$and = (query.$and || []).concat({
        [this.id]: this.getObjectId(id),
      });
    }

    if (query[this.id]) {
      query[this.id] = this.getObjectId(query[this.id]);
    }

    return {
      options: {
        select: $select,
        sort: $sort,
        limit: $limit,
        skip: $skip,
      },
      filter: query,
    };
  }

  getSelect(select: string[] | Record<string, number>) {
    if (Array.isArray(select)) {
      return select.reduce<Record<string, number>>(
        (value, name) => ({
          ...value,
          [name]: 1,
        }),
        {},
      );
    }
  }

  async $findOrGet(
    id: NullableId,
    params: Params,
  ): Promise<Item | Item[] | Paginated<Item>> {
    return id === null ? await this.$find(params) : await this.$get(id, params);
  }

  normalizeId(id: NullableId, data: Partial<Body>): Partial<Body> {
    if (this.id === "_id") {
      // Default Mongo IDs cannot be updated. The Mongo library handles
      // this automatically.
      return _.omit(data, this.id);
    } else if (id !== null) {
      // If not using the default Mongo _id field set the ID to its
      // previous value. This prevents orphaned documents.
      return {
        ...data,
        [this.id]: id,
      };
    } else {
      return data;
    }
  }

  $get(id: Id, params: Params = {} as Params): Promise<Item> {
    const { Model } = this.getOptions(params);
    const {
      filter,
      options: { select },
    } = this.optionsFilter(id, params);

    const projection = select
      ? {
        projection: {
          ...this.getSelect(select),
          [this.id]: 1,
        },
      }
      : {};
    const findOptions: FindOptions = {
      ...params.mongo,
      ...projection,
    };

    return Promise.resolve(Model)
      .then((model) => model.findOne(filter, findOptions))
      .then((data) => {
        if (data == null) {
          throw new NotFound(`No record found for id '${id}`);
        }

        return data;
      })
      .catch(errorHandler);
  }

  async $find(
    params?: Params & { paginate?: PaginationOptions },
  ): Promise<Paginated<Item>>;
  async $find(params?: Params & { paginate: false }): Promise<Item[]>;
  async $find(params?: Params): Promise<Paginated<Item> | Item[]>;
  async $find(
    params: Params = {} as Params,
  ): Promise<Paginated<Item> | Item[]> {
    const { options, filter } = this.optionsFilter(null, params);
    const { paginate, Model, useEstimatedDocumentCount } = this.getOptions(
      params,
    );
    const findOptions = { ...params.mongo } as FindOptions;
    const model = await Promise.resolve(Model);

    if (options.select !== undefined) {
      // findOptions.projection = this.getSelect(options.select);
    }

    const cursor = model.find(filter, findOptions);

    if (options.sort !== undefined) {
      cursor.sort(options.sort);
    }

    if (options.limit !== undefined) {
      cursor.limit(options.limit);
    }

    if (options.skip !== undefined) {
      cursor.skip(options.skip);
    }

    const runQuery = async (total: number) => ({
      total,
      limit: options.limit as number,
      skip: options.skip || 0,
      data: options.limit === 0 ? [] : ((await cursor.toArray()) as Item[]),
    });

    if (paginate && paginate.default) {
      if (!options.limit) options.limit = paginate.default;
      if (paginate.max && options.limit > paginate.max) {
        options.limit = paginate.max;
      }

      if (useEstimatedDocumentCount) {
        return model.estimatedDocumentCount().then(runQuery);
      }

      return model.countDocuments(filter, findOptions).then(runQuery);
    }

    return runQuery(0).then((page) => page.data);
  }

  async $create(data: Partial<Body>, params?: Params): Promise<Item>;
  async $create(data: Partial<Body>[], params?: Params): Promise<Item[]>;
  async $create(
    data: Partial<Body> | Partial<Body>[],
    _params?: Params,
  ): Promise<Item | Item[]>;
  async $create(
    data: Partial<Body> | Partial<Body>[],
    params: Params = {} as Params,
  ): Promise<Item | Item[]> {
    const writeOptions = { ...params.mongo };
    const { Model } = this.getOptions(params);
    const model = await Promise.resolve(Model);

    const setId = (item: any) => {
      const entry = Object.assign({}, item);

      // Generate an ObjectId if we use a custom id
      if (this.id !== "_id" && typeof entry[this.id] === "undefined") {
        return {
          ...entry,
          [this.id]: new ObjectId().toHexString(),
        };
      }

      return entry;
    };

    const promise = Array.isArray(data)
      ? model
        .insertMany(data.map(setId), writeOptions as InsertOptions)
        .then((result) => {
          return model
            .find({
              _id: {
                $in: result.insertedIds
              }
            }, params.mongo as FindOptions)
            .toArray()

        })
      : model
        .insertOne(setId(data), writeOptions as InsertOptions)
        .then(id => model.findOne({ _id: id }, params.mongo as FindOptions))

    return promise
      .then(select(params, this.id))
      .catch(errorHandler);
  }

  async $patch(id: null, data: Partial<Body>, params?: Params): Promise<Item[]>;
  async $patch(id: Id, data: Partial<Body>, params?: Params): Promise<Item>;
  async $patch(
    id: NullableId,
    data: Partial<Body>,
    _params?: Params,
  ): Promise<Item | Item[]>;
  async $patch(
    id: NullableId,
    _data: Partial<Body>,
    params: Params = {} as Params,
  ): Promise<Item | Item[]> {
    const data = this.normalizeId(id, _data);
    const { Model } = this.getOptions(params);
    const model = await Promise.resolve(Model);
    const {
      filter,
      options: { select },
    } = this.optionsFilter(id, params);
    const updateOptions = { ...params.mongo } as UpdateOptions;

    const modifier = Object.keys(data).reduce((current, key) => {
      const value = data[key as keyof typeof data];

      if (key.charAt(0) !== "$") {
        current.$set = {
          ...current.$set,
          [key]: value,
        };
      } else {
        current[key] = value;
      }

      return current;
    }, {} as any);
    const originalIds = await this.$findOrGet(id, {
      ...params,
      filter: {
        ...filter,
        $select: [this.id],
      },
      paginate: false,
    }) as Item;

    const items = Array.isArray(originalIds) ? originalIds : [originalIds];
    const idList = items.map((item: any) => item[this.id]) as ObjectId[];
    const findParams: Params = {
      ...params,
      paginate: false,
      filter: {
        [this.id]: {
          $in: idList,
        },
        $select: select,
      },
    };

    await model.updateMany(filter, modifier, updateOptions);

    return (this.$findOrGet(id, findParams) as Promise<Item | Item[]>)
      .catch(errorHandler);
  }

  async $update(
    id: Id,
    data: Body,
    params: Params = {} as Params,
  ): Promise<Item> {
    const { Model } = this.getOptions(params);
    const model = await Promise.resolve(Model);
    const { filter } = this.optionsFilter(id, params);
    const replaceOptions = { ...params.mongo } as UpdateOptions;

    await model.replaceOne(filter, this.normalizeId(id, data), replaceOptions);

    return (this.$findOrGet(id, params) as Promise<Item>)
      .catch(errorHandler);
  }

  async $remove(id: null, params?: Params): Promise<Item[]>;
  async $remove(id: Id, params?: Params): Promise<Item>;
  async $remove(id: NullableId, _params?: Params): Promise<Item | Item[]>;
  async $remove(
    id: NullableId,
    params: Params = {} as Params,
  ): Promise<Item | Item[]> {
    const { Model } = this.getOptions(params);
    const model = await Promise.resolve(Model);
    const {
      filter,
      options: { select },
    } = this.optionsFilter(id, params);
    const deleteOptions = { ...params.mongo } as DeleteOptions;
    const findParams = {
      ...params,
      paginate: false,
      filter: {
        ...filter,
        $select: select,
      },
    } as Params;

    return (this.$findOrGet(id, findParams) as Promise<Item>)
      .then(async (items) => {
        await model.deleteMany(filter, deleteOptions);
        return items;
      })
      .catch(errorHandler);
  }
}
