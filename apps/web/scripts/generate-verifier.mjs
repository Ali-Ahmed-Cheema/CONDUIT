import { pbkdf2Sync, randomBytes } from "node:crypto";

const password = process.env.CONDUIT_PW;
if (!password) {
  console.error("Set CONDUIT_PW before running this setup script.");
  process.exit(1);
}

const saltVerify = randomBytes(16);
const verifier = pbkdf2Sync(password, saltVerify, 210000, 32, "sha256").toString("hex");
const saltData = randomBytes(16).toString("hex");

console.log(JSON.stringify({ saltVerify: saltVerify.toString("hex"), verifier, saltData }, null, 2));
