import {
  DynamoDB,
  ProvisionedThroughput,
  LocalSecondaryIndex,
  GlobalSecondaryIndex,
  BillingMode,
  OnDemandThroughput,
  ResourceInUseException,
} from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocument,
  NumberValue,
  NativeAttributeBinary,
} from "@aws-sdk/lib-dynamodb"; // ES6 import

type Key = {
  hashKey: string;
  rangeKey?: string;
};

type TableConfig = {
  tableName: string;
  hashKey: string;
  rangeKey?: string;
  provisionedThroughput: ProvisionedThroughput;
  onDemandThroughput?: OnDemandThroughput;
  localSecondaryIndexes?: LocalSecondaryIndex[];
  globalSecondaryIndexes?: GlobalSecondaryIndex[];
  billineMode?: BillingMode;
};

export class Table {
  private readonly client: DynamoDBDocument;
  constructor(
    private readonly ddb: DynamoDB,
    private readonly config: TableConfig
  ) {
    this.ddb = ddb;
    this.client = DynamoDBDocument.from(ddb);

    this.config = config;
  }

  async createTable() {
    const {
      hashKey,
      rangeKey,
      provisionedThroughput,
      localSecondaryIndexes,
      globalSecondaryIndexes,
      onDemandThroughput,
      tableName,
    } = this.config;

    try {
      const table = await this.ddb.createTable({
        TableName: tableName,
        KeySchema: [
          {
            AttributeName: hashKey,
            KeyType: "HASH",
          },
          ...(rangeKey
            ? [{ AttributeName: rangeKey, KeyType: "RANGE" } as const]
            : []),
        ],
        AttributeDefinitions: [
          {
            AttributeName: hashKey,
            AttributeType: "S",
          },
          ...(rangeKey
            ? [{ AttributeName: rangeKey, AttributeType: "S" } as const]
            : []),
        ],
        ProvisionedThroughput: provisionedThroughput,
        LocalSecondaryIndexes: localSecondaryIndexes,
        GlobalSecondaryIndexes: globalSecondaryIndexes,
        OnDemandThroughput: onDemandThroughput,
      });
      return table.TableDescription;
    } catch (err) {
      if (err instanceof ResourceInUseException) {
        console.warn(`Table ${tableName} already exists`);
      }
    } finally {
      return undefined;
    }
  }

  async deleteTable() {
    const table = await this.ddb.deleteTable({
      TableName: this.config.tableName,
    });
    return table.TableDescription;
  }

  async updateTable(
    config: Omit<
      TableConfig,
      "tableName" | "hashKey" | "rangeKey" | "provisionedThroughput"
    >
  ) {
    const table = await this.ddb.updateTable({
      TableName: this.config.tableName,
      ...config,
    });
    return table.TableDescription;
  }

  async get(key: Key) {
    const { hashKey, rangeKey } = key;
    const item = await this.client.get({
      TableName: this.config.tableName,
      Key: {
        [this.config.hashKey]: hashKey,
        // add range key if it exists
        ...(this.config.rangeKey && { [this.config.rangeKey]: rangeKey }),
      },
    });
    return item.Item;
  }

  async put(key: Key, value: object) {
    const { hashKey, rangeKey } = key;

    const item = await this.client.put({
      TableName: this.config.tableName,
      Item: {
        [this.config.hashKey]: hashKey,
        // add range key if it exists
        ...(this.config.rangeKey && { [this.config.rangeKey]: rangeKey }),
        ...value,
      },
      // ReturnValues: "ALL_OLD", // since put item command replace the entire item, we don't need to return the old item
    });
    // return the new item
    return this.get(key);
  }

  async update(key: Key, attributes: Record<string, any>) {
    const { hashKey, rangeKey } = key;

    // generate update expression
    const expression = Object.keys(attributes).reduce(
      (acc, key, index) => {
        acc.UpdateExpressions.push(`#key${index} = :value${index}`);
        acc.ExpressionAttributeNames[`#key${index}`] = key;
        acc.ExpressionAttributeValues[`:value${index}`] = attributes[key];
        return acc;
      },
      {
        UpdateExpressions: [] as string[],
        ExpressionAttributeNames: {} as Record<string, string>,
        ExpressionAttributeValues: {} as Record<string, any>,
      }
    );

    const item = await this.client.update({
      TableName: this.config.tableName,
      Key: {
        [this.config.hashKey]: hashKey,
        // add range key if it exists
        ...(this.config.rangeKey && { [this.config.rangeKey]: rangeKey }),
      },
      UpdateExpression: `SET ` + expression.UpdateExpressions.join(", "),
      ExpressionAttributeNames: expression.ExpressionAttributeNames,
      ExpressionAttributeValues: expression.ExpressionAttributeValues,
      ReturnValues: "ALL_NEW",
    });

    return item.Attributes;
  }

  async delete(key: Key) {
    const { hashKey, rangeKey } = key;
    const item = await this.client.delete({
      TableName: this.config.tableName,
      Key: {
        [this.config.hashKey]: hashKey,
        ...(this.config.rangeKey && { [this.config.rangeKey]: rangeKey }),
      },
      ReturnValues: "ALL_OLD",
    });
    return item.Attributes;
  }

  // TODO: add more conditions
  async scan() {
    const items = await this.client.scan({
      TableName: this.config.tableName,
    });
    return items.Items;
  }

  // TODO: add more conditions
  async query(key: Key & { indexName?: string }, conditions?: object) {
    const { hashKey, rangeKey, indexName } = key;

    const items = await this.client.query({
      TableName: this.config.tableName,
      IndexName: indexName,
      KeyConditionExpression:
        `#hashKey = :hashKey ` + (rangeKey ? `AND #rangeKey = :rangeKey` : ""),
      ExpressionAttributeNames: {
        "#hashKey": this.config.hashKey,
        ...(rangeKey && { "#rangeKey": this.config.rangeKey }),
      },
      ExpressionAttributeValues: {
        ":hashKey": hashKey,
        ...(rangeKey && { ":rangeKey": rangeKey }),
      },
    });
    return items.Items;
  }
}
