import assert from "node:assert/strict";
import test from "node:test";
import {
  assertPublicHttpUrl,
  isPrivateAddress,
  UnsafeUrlError,
} from "@/lib/closet/url-safety";

test("isPrivateAddress blocks RFC1918 + loopback + link-local", () => {
  for (const addr of [
    "10.0.0.1",
    "127.0.0.1",
    "169.254.169.254",
    "172.16.0.1",
    "172.31.255.254",
    "192.168.1.1",
    "0.0.0.0",
    "224.0.0.1",
    "::1",
    "fe80::1",
    "fc00::1",
    "fd12:3456::1",
    "::ffff:10.0.0.1",
  ]) {
    assert.equal(isPrivateAddress(addr), true, `${addr} should be private`);
  }
});

test("isPrivateAddress allows real public addresses", () => {
  for (const addr of ["8.8.8.8", "1.1.1.1", "151.101.1.69", "2606:4700::1111"]) {
    assert.equal(isPrivateAddress(addr), false, `${addr} should be public`);
  }
});

test("assertPublicHttpUrl rejects non-http schemes", async () => {
  await assert.rejects(
    () => assertPublicHttpUrl("file:///etc/passwd"),
    UnsafeUrlError,
  );
  await assert.rejects(
    () => assertPublicHttpUrl("ftp://example.com/"),
    UnsafeUrlError,
  );
});

test("assertPublicHttpUrl rejects literal metadata + loopback hosts", async () => {
  await assert.rejects(
    () => assertPublicHttpUrl("http://169.254.169.254/latest/meta-data/"),
    UnsafeUrlError,
  );
  await assert.rejects(
    () => assertPublicHttpUrl("http://127.0.0.1:3000/admin"),
    UnsafeUrlError,
  );
  await assert.rejects(
    () => assertPublicHttpUrl("http://[::1]/"),
    UnsafeUrlError,
  );
});

test("assertPublicHttpUrl rejects overly long urls", async () => {
  const long = "https://example.com/" + "a".repeat(3000);
  await assert.rejects(() => assertPublicHttpUrl(long), UnsafeUrlError);
});

test("assertPublicHttpUrl rejects malformed input", async () => {
  await assert.rejects(
    () => assertPublicHttpUrl("not a url"),
    UnsafeUrlError,
  );
});
