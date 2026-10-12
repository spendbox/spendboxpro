// Makes the keys web push needs (once). Run: node scripts/vapid-keys.mjs
// Then put the three lines it prints into Vercel's environment variables and redeploy.
import { generateKeyPairSync } from "node:crypto";

const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
const pub = publicKey.export({ format: "jwk" });
const priv = privateKey.export({ format: "jwk" });
const b = (s) => Buffer.from(s, "base64url");
const raw = Buffer.concat([Buffer.from([4]), b(pub.x), b(pub.y)]).toString("base64url");
console.log(`NEXT_PUBLIC_VAPID_PUBLIC_KEY=${raw}`);
console.log(`VAPID_PRIVATE_KEY=${priv.d}`);
console.log("VAPID_SUBJECT=mailto:hello@newtown.world");
