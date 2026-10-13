const test = require("node:test");
const assert = require("node:assert/strict");
const { distanceInMeters, parseCoordinate, sha256 } = require("../server");

test("validates GPS coordinates and permits missing optional coordinates", () => {
    assert.equal(parseCoordinate("", -90, 90), null);
    assert.equal(parseCoordinate("45.5", -90, 90), 45.5);
    assert.equal(parseCoordinate("91", -90, 90), undefined);
    assert.equal(parseCoordinate("not-a-number", -180, 180), undefined);
});

test("calculates worker distance in metres", () => {
    assert.equal(distanceInMeters(19, 72, 19, 72), 0);
    const distance = distanceInMeters(19, 72, 19, 72.001);
    assert.ok(distance > 100 && distance < 120);
    assert.ok(distanceInMeters(19, 72, 19, 72.0001) <= 50);
});

test("keeps password hashes compatible with existing SHA-256 accounts", () => {
    assert.equal(
        sha256("WastePassword1"),
        "dc7c5fbc7d292cc1cbff5a9a21e89ca6a12db2d83ec1440d5c6e007ec3603981"
    );
});
