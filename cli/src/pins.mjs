/** SPDX-License-Identifier: MIT
 * Compatibility floor: the runtime bytes of EIN.LLC's selected continuation
 * archive (v0.1.6, served at https://ein.llc/downloads/ and committed under
 * artifacts/ein-llc/public/downloads/ at ein-llc-lean@bb8be310), which vendors
 * ein-formation-http-client 0.1.1 (reviewed runtime 7f5165b5). The repo
 * siblings tools/activation-continuation and tools/public-ein-http-client at
 * bb8be310 have identical runtime bytes. The CLI still runs on a
 * mismatch: `ein-llc version` reports it, tests fail and the pack refuses to build.
 */

export const SELECTED_ARCHIVE = Object.freeze({
  name: "ein-activation-continuation",
  version: "0.1.6",
  file: "ein-activation-continuation-v0.1.6.tgz",
  repoPath: "artifacts/ein-llc/public/downloads/ein-activation-continuation-v0.1.6.tgz",
  url: "https://ein.llc/downloads/ein-activation-continuation-v0.1.6.tgz",
  sha256: "ef842a518fb8ecd7ac43e23c6a384fe495363250db530025ace077b404b9d1de",
  bytes: 51163,
  prefix: "ein-activation-continuation/",
});

export const PUBLIC_CLIENT = Object.freeze({ name: "ein-formation-http-client", version: "0.1.1", reviewedRuntime: "7f5165b5f8e6ec3b5c8c86d1e48b16dfb12ca0e9" });

/** sha256 of archive members, relative to the continuation root. */
export const ARCHIVE_FILE_SHA256 = Object.freeze({
  "package.json": "b9a9a525d2ba009ca99c0790218e11ea7e68aba544555ff06a434dbb40fd7e90",
  "LICENSE": "bf4623255db76888a7b6919c4011ee054b19bb6b089491ec2106772ecc4e375b",
  "PROVENANCE.md": "574a996a309294e336849460b8c29eb635cd9ba2989a7907cec27da31a2707c7",
  "src/adapters.mjs": "f4bd544cd3881de1fa2f208c7990fdb18936a16674ed66bb93569921145913be",
  "src/catalog.mjs": "8c5a351d5845212f7a07a30d5be5f944d036c5768be265d5e697e6e80171364b",
  "src/cli.mjs": "5263ed8749bc5c298b5f181e639146faa0dcfa736eacdc2854150337a6bfdf16",
  "src/context.mjs": "2e7a84ba731d293e5712cb6f157440215255475f5a1ff2ac6d72e7f50496ba3a",
  "src/deadline.mjs": "aabd8020d1da6a07045509848d9db0b52f7a28616459e6b98f8a0fcef763feca",
  "src/errors.mjs": "5ad43916558df63a85c6e0381c67d9dffa2de7948db0fbef56aa05c63ffb3ea4",
  "src/index.mjs": "60225b4a7f98984ee70dae123d038892c0e2d80d2674ba0b07adc961fab8d438",
  "src/journey.mjs": "a6247203802ac4b4eb91186181bd5d117cf43d8dd285aacd8d6cb53c729f42b6",
  "src/locate.mjs": "dbbb5a1368eec65050b4075a87140c12ff3c699e8bdbdcb62d9352d3411ff9e3",
  "src/store.mjs": "8674271dcd521c5a1a57faf2c1b8f9999cbd5244ace2b452291f103929d03b02",
  "src/transport.mjs": "27ded75bf1cdf0ea3b0ce9f5cc323242aa4d41fca1ef5d29d4d1f02fe4d44b0e",
  "src/view.mjs": "93455354f61df7475ca8532e3f62ac783cd0abc188ba21d567b38fcd237a6846",
  "vendor/ein-formation-http-client/LICENSE": "bf4623255db76888a7b6919c4011ee054b19bb6b089491ec2106772ecc4e375b",
  "vendor/ein-formation-http-client/PROVENANCE.md": "7528f0964cbef0019d065331ae6ea40d5c9e6e995da0a64b79c7f873f31e90b9",
  "vendor/ein-formation-http-client/README.md": "9a5c03be33a377555617b602ac3da9828a12295a8bb78535159bd49a5704ba6e",
  "vendor/ein-formation-http-client/cli.mjs": "8a0339d5dba255c2ebca0e4eecf8892a8f5411a228dcf058c01b925508723e18",
  "vendor/ein-formation-http-client/client.mjs": "0eafe6996753d9e16e3f055b944f1b53842af56d3d9e977eb8e808218bd6a391",
  "vendor/ein-formation-http-client/examples/assess-positive.json": "20cd4525267afd4cf628df14867ea7ba2b344bcb1a7c2096fe4a4a58cfae23e0",
  "vendor/ein-formation-http-client/examples/assess-satisfied.json": "6c6f8aefeae17cbfd4e34e64286d8f6df7341c7993a69b115c66697bd25fd8f5",
  "vendor/ein-formation-http-client/examples/prepare.json": "f4a66f66cce0ea3d9a3d997249d540f8c2c7140d30ae1d40e7a46476f2e68a6d",
  "vendor/ein-formation-http-client/lib/grant.mjs": "1c912a06bab6f79d80527bbf091e8c61150465cdaa78bedae62852e0dfa931de",
  "vendor/ein-formation-http-client/lib/http.mjs": "ccc837a306d037006f86098d4ad3d738a3a2587b968357d73de5a7be0f9fd181",
  "vendor/ein-formation-http-client/lib/redact.mjs": "777fa3f082b9ad9c4dbbcb0c55e44fd75bda74ac94b52a206582e5981c3ab830",
  "vendor/ein-formation-http-client/package.json": "7342fd0eefbb345ac2b6c6379f23d3eef56a3609374e6a61d2d46d73bcad8a90",
});

/** Runtime files the CLI loads, by component, relative to that component's root. */
export const RUNTIME_FILES = Object.freeze({
  continuation: Object.keys(ARCHIVE_FILE_SHA256).filter((p) => p.startsWith("src/")),
  publicClient: ["cli.mjs", "client.mjs", "lib/grant.mjs", "lib/http.mjs", "lib/redact.mjs"],
});

export function expectedSha256(component, rel) {
  return component === "continuation"
    ? ARCHIVE_FILE_SHA256[rel]
    : ARCHIVE_FILE_SHA256[`vendor/ein-formation-http-client/${rel}`];
}

/**
 * License ruling (Root, via lead, 2026-11-12): MIT, "Copyright (c) 2026
 * EIN.LLC / Epistemedeus", the notice of tools/activation-continuation/LICENSE
 * at bb8be310, byte for byte. It ships as this package's LICENSE and as the
 * LICENSE next to each vendored member set. No repo-wide LICENSE.
 */
export const LICENSE_NOTICE = Object.freeze({
  spdx: "MIT",
  holder: "EIN.LLC / Epistemedeus",
  source: "tools/activation-continuation/LICENSE",
  sourceCommit: "bb8be3107d6c4f8da264a33185c1ff2c6aed3cbe",
  sha256: "bf4623255db76888a7b6919c4011ee054b19bb6b089491ec2106772ecc4e375b",
  shipped: ["LICENSE", "vendor/ein-activation-continuation/LICENSE", "vendor/ein-activation-continuation/vendor/ein-formation-http-client/LICENSE"],
});
