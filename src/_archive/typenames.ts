import { z } from "zod";

// Test different Zod types to see their typeNames
const stringSchema = z.string();
const stringArraySchema = z.array(z.string());
const numberSchema = z.number();
const numberArraySchema = z.array(z.number());
const enumSchema = z.enum(["a", "b", "c"]);

console.log("String typeName:", (stringSchema as any)._def.typeName);
console.log("String Array typeName:", (stringArraySchema as any)._def.typeName);
console.log("Number typeName:", (numberSchema as any)._def.typeName);
console.log("Number Array typeName:", (numberArraySchema as any)._def.typeName);
console.log("Enum typeName:", (enumSchema as any)._def.typeName);

// Test the inner type of the array
console.log("String Array inner type:", (stringArraySchema as any)._def.type._def.typeName);