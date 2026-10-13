const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { renderFile } = require("ejs");

const viewsDirectory = path.join(__dirname, "..", "views");

test("renders the admin dashboard with its required view data", async () => {
    const html = await renderFile(path.join(viewsDirectory, "Admin", "Dashboard.ejs"), {
        complaints: [],
        workers: [],
        feedbacks: [],
        stats: { total: 0, pending: 0, inProgress: 0, collected: 0, resolved: 0 },
        averageRating: 0,
        dateLabel: () => "",
        flash: {},
        csrfToken: "test-token"
    });

    assert.match(html, /Admin Dashboard/);
    assert.match(html, /No waste complaints have been reported yet/);
    assert.match(html, /No feedback has been submitted yet/);
});

test("renders the worker dashboard with its required view data", async () => {
    const html = await renderFile(path.join(viewsDirectory, "Worker", "Dashboard.ejs"), {
        complaints: [],
        stats: { total: 0, pending: 0, inProgress: 0, collected: 0 },
        dateLabel: () => "",
        flash: {},
        session: { workerName: "Test Worker" },
        csrfToken: "test-token"
    });

    assert.match(html, /Worker Dashboard/);
    assert.match(html, /Test Worker/);
    assert.match(html, /No complaints have been assigned to you yet/);
});
