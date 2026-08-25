import assert from "node:assert/strict";
import test from "node:test";
import { LicenseClient } from "../dist/index.js";

test("entitlement snapshot exposes authoritative license and client information", () => {
  const client = new LicenseClient({
    host: "localhost",
    licenseKey: "x".repeat(64),
    clientId: "33333333-3333-4333-8333-333333333333",
    tenantId: "11111111-1111-4111-8111-111111111111",
    applicationId: "22222222-2222-4222-8222-222222222222",
    caPath: "unused",
    publicLicenseKeyPath: "unused",
    onStateChange() {},
  });
  client.applySnapshot(
    "license-id",
    ["CHANNELS", "RECORDING_DEVICES"],
    { CHANNELS: true, RECORDING_DEVICES: 5 },
    3,
    {
      licenseSerial: "LIC-TEST",
      customerName: "Example Client",
      customerEmail: "client@example.com",
      validFrom: "2026-08-01T00:00:00.000Z",
      expiresAt: "2026-09-01T00:00:00.000Z",
      maxActivations: 2,
      appVersion: "4.2.0",
      platform: "win32-x64",
    },
  );
  client.state = "LICENSED";
  const snapshot = client.getEntitlements();
  assert.equal(snapshot.licenseSerial, "LIC-TEST");
  assert.equal(snapshot.clientId, "33333333-3333-4333-8333-333333333333");
  assert.equal(snapshot.customerName, "Example Client");
  assert.equal(snapshot.customerEmail, "client@example.com");
  assert.equal(snapshot.expiresAt.toISOString(), "2026-09-01T00:00:00.000Z");
  assert.equal(snapshot.maxActivations, 2);
  assert.equal(snapshot.platform, "win32-x64");
  assert.equal(snapshot.entitlements.RECORDING_DEVICES, 5);
  assert.equal(client.getLimit("recording_devices"), 5);
});
