// type TableType = z.infer<typeof tableSchema>;

import { DynamoDB } from "@aws-sdk/client-dynamodb";
import { Table } from "./table.js";

async function main() {
  const client = new DynamoDB({
    endpoint: "http://localhost:8000",
  });

  const table = new Table(client, {
    tableName: "Test",
    hashKey: "id",
    provisionedThroughput: {
      ReadCapacityUnits: 5,
      WriteCapacityUnits: 5,
    },
  });

  const createTable = await table.createTable();
  console.log(createTable);
}

main();

// const table = await client.createTable({
//   TableName: "Test",
//   KeySchema: [
//     {
//       AttributeName: "id",
//       KeyType: "HASH",
//     },
//   ],
//   AttributeDefinitions: [
//     {
//       AttributeName: "id",
//       AttributeType: "S",
//     },
//   ],
//   ProvisionedThroughput: {
//     ReadCapacityUnits: 5,
//     WriteCapacityUnits: 5,
//   },
// });

// const updateResult = await ddb.update({
//   TableName: "Test",
//   Key: {
//     id: "1",
//   },
//   UpdateExpression: "SET #sSet = :sSet",
//   ExpressionAttributeNames: {
//     "#sSet": "sSet",
//   },
//   ExpressionAttributeValues: {
//     ":sSet": new Set(["my", "set", "of", "strings"]),
//   },
// });
